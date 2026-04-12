import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../mqtt/mqtt.service';
import { Message } from './message.entity';
import { User } from '../users/user.entity';

const HISTORY_CACHE_TTL = 60;

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);
  private redis: Redis;

  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly mqttService: MqttService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
    });
    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));

    this.mqttService.subscribe('chat/+', (topic, payload) => {
      let data: { id: string; senderId: string; receiverId: string; content: string };
      try {
        data = JSON.parse(payload.toString());
      } catch {
        return;
      }
      this.persistMessage(data).catch((err) =>
        this.logger.error(`Failed to persist message: ${err.message}`),
      );
    });
  }

  private async persistMessage(data: {
    id: string;
    senderId: string;
    receiverId: string;
    content: string;
  }) {
    const exists = await this.messageRepository.findOne({ where: { id: data.id } });
    if (exists) return;

    const message = this.messageRepository.create({
      id: data.id,
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content,
    });

    await this.messageRepository.save(message);
  }

  async sendMessage(sender: User, receiverId: string, content: string) {
    const message = this.messageRepository.create({
      senderId: sender.id,
      receiverId,
      content,
    });

    const saved = await this.messageRepository.save(message);

    this.mqttService.publish(`chat/${saved.id}`, {
      id: saved.id,
      senderId: sender.id,
      receiverId,
      content,
      createdAt: saved.createdAt,
    });

    await this.invalidateHistoryCache(sender.id, receiverId);

    return saved;
  }

  async getHistory(userIdA: string, userIdB: string, limit = 50, cursor?: string) {
    const cacheKey = `history:${[userIdA, userIdB].sort().join(':')}:${cursor ?? 'first'}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .where(
        '(message.senderId = :a AND message.receiverId = :b) OR (message.senderId = :b AND message.receiverId = :a)',
        { a: userIdA, b: userIdB },
      )
      .orderBy('message.createdAt', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) throw new Error('Invalid cursor: must be a valid ISO8601 date');
      qb.andWhere('message.createdAt < :cursor', { cursor: cursorDate });
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > limit;
    const nextCursor = hasMore ? messages[limit - 1].createdAt.toISOString() : null;
    if (hasMore) messages.pop();

    const result = {
      data: messages,
      hasMore,
      nextCursor,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', HISTORY_CACHE_TTL);

    return result;
  }

  private async invalidateHistoryCache(userIdA: string, userIdB: string) {
    const keys = await this.redis.keys(`history:${[userIdA, userIdB].sort().join(':')}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}

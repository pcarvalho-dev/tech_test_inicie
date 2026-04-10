import { Injectable, OnModuleInit } from '@nestjs/common';
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

    this.mqttService.subscribe('chat/+', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      this.persistMessage(data);
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

  async getHistory(userIdA: string, userIdB: string, limit = 50) {
    const cacheKey = `history:${[userIdA, userIdB].sort().join(':')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const messages = await this.messageRepository
      .createQueryBuilder('message')
      .where(
        '(message.senderId = :a AND message.receiverId = :b) OR (message.senderId = :b AND message.receiverId = :a)',
        { a: userIdA, b: userIdB },
      )
      .orderBy('message.createdAt', 'DESC')
      .take(limit)
      .getMany();

    await this.redis.set(cacheKey, JSON.stringify(messages), 'EX', HISTORY_CACHE_TTL);

    return messages;
  }

  private async invalidateHistoryCache(userIdA: string, userIdB: string) {
    const cacheKey = `history:${[userIdA, userIdB].sort().join(':')}`;
    await this.redis.del(cacheKey);
  }
}

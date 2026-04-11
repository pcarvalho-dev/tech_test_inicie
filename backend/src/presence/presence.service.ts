import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../mqtt/mqtt.service';
import Redis from 'ioredis';

const PRESENCE_TTL = 30;
const PRESENCE_PREFIX = 'presence:';

@Injectable()
export class PresenceService implements OnModuleInit {
  private redis: Redis;

  constructor(
    private readonly mqttService: MqttService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
    });

    this.mqttService.subscribe('presence/+', (topic, payload) => {
      const userId = topic.split('/')[1];
      let data: { name: string; role: string };
      try {
        data = JSON.parse(payload.toString());
      } catch {
        return;
      }
      this.updatePresence(userId, data.name, data.role);
    });
  }

  private async updatePresence(userId: string, name: string, role: string) {
    const key = `${PRESENCE_PREFIX}${userId}`;
    await this.redis.set(key, JSON.stringify({ userId, name, role }), 'EX', PRESENCE_TTL);
  }

  async getOnlineStudents(): Promise<{ userId: string; name: string }[]> {
    const keys = await this.redis.keys(`${PRESENCE_PREFIX}*`);
    if (!keys.length) return [];

    const values = await this.redis.mget(...keys);

    return values
      .filter(Boolean)
      .map((v) => JSON.parse(v!))
      .filter((u) => u.role === 'aluno');
  }

  async isOnline(userId: string): Promise<boolean> {
    const key = `${PRESENCE_PREFIX}${userId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }
}

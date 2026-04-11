import { Injectable, Logger, MessageEvent, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { MqttService } from '../mqtt/mqtt.service';
import { Screenshot } from './screenshot.entity';

const PENDING_PREFIX = 'screenshot_pending:';
const PENDING_TTL = 60;

@Injectable()
export class ScreenshotService implements OnModuleInit {
  private readonly logger = new Logger(ScreenshotService.name);
  private readonly storageDir: string;
  private redis: Redis;
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  constructor(
    @InjectRepository(Screenshot)
    private readonly screenshotRepository: Repository<Screenshot>,
    private readonly mqttService: MqttService,
    private readonly config: ConfigService,
  ) {
    this.storageDir = this.config.get<string>('SCREENSHOT_STORAGE_DIR') ?? './screenshots';
    this.redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
    });
  }

  onModuleInit() {
    if (!fsSync.existsSync(this.storageDir)) {
      fsSync.mkdirSync(this.storageDir, { recursive: true });
    }

    this.mqttService.subscribe('screenshot/response/+', (topic, payload) => {
      const alunoId = topic.split('/')[2];

      let data: { professorId: string; imageBase64: string; requestId: string };
      try {
        data = JSON.parse(payload.toString());
      } catch {
        this.logger.error(`Invalid JSON in screenshot/response from aluno ${alunoId}`);
        return;
      }

      this.handleResponse(alunoId, data).catch((err) =>
        this.logger.error(`Error handling screenshot response: ${err.message}`),
      );
    });
  }

  getStream(alunoId: string): Observable<MessageEvent> {
    this.streams.get(alunoId)?.complete();

    const subject = new Subject<MessageEvent>();
    this.streams.set(alunoId, subject);

    const heartbeat = setInterval(() => {
      if (!subject.closed) {
        subject.next({ data: 'ping' });
      } else {
        clearInterval(heartbeat);
      }
    }, 20_000);

    return new Observable((subscriber) => {
      const sub = subject.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        clearInterval(heartbeat);
        this.streams.delete(alunoId);
      };
    });
  }

  async requestScreenshot(professorId: string, alunoId: string): Promise<{ requestId: string }> {
    const requestId = randomUUID();

    const stream = this.streams.get(alunoId);
    if (stream && !stream.closed) {
      stream.next({
        type: 'screenshot_request',
        data: JSON.stringify({ requestId, professorId, alunoId }),
      });
    }

    this.mqttService.publish(`screenshot/request/${alunoId}`, { requestId, professorId }, 1);

    await this.redis.set(
      `${PENDING_PREFIX}${alunoId}`,
      JSON.stringify({ requestId, professorId }),
      'EX',
      PENDING_TTL,
    );

    return { requestId };
  }

  async getPendingRequest(alunoId: string): Promise<{ requestId: string; professorId: string } | null> {
    const raw = await this.redis.get(`${PENDING_PREFIX}${alunoId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async uploadFromHttp(
    alunoId: string,
    data: { requestId: string; professorId: string; imageBase64: string },
  ) {
    await this.redis.del(`${PENDING_PREFIX}${alunoId}`);
    return this.handleResponse(alunoId, data);
  }

  private async handleResponse(
    alunoId: string,
    data: { professorId: string; imageBase64: string; requestId: string },
  ) {
    const filename = `${Date.now()}_${alunoId}.png`;
    const filePath = path.join(this.storageDir, filename);

    const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));

    const record = this.screenshotRepository.create({
      professorId: data.professorId,
      alunoId,
      filePath: filename,
    });

    await this.screenshotRepository.save(record);

    this.mqttService.publish(
      `screenshot/ready/${data.professorId}`,
      {
        screenshotId: record.id,
        alunoId,
        requestId: data.requestId,
        createdAt: record.createdAt,
      },
      1,
    );

    this.logger.log(`Screenshot saved: ${filename}`);
  }

  notifyCaptureFailed(professorId: string, requestId: string) {
    this.mqttService.publish(
      `screenshot/ready/${professorId}`,
      { error: 'capture_failed', requestId },
      1,
    );
  }

  async getHistory(professorId: string, alunoId?: string): Promise<Screenshot[]> {
    const qb = this.screenshotRepository
      .createQueryBuilder('s')
      .where('s.professorId = :professorId', { professorId })
      .orderBy('s.createdAt', 'DESC')
      .take(50);

    if (alunoId) {
      qb.andWhere('s.alunoId = :alunoId', { alunoId });
    }

    return qb.getMany();
  }

  getImagePath(screenshotId: string): Promise<Screenshot | null> {
    return this.screenshotRepository.findOne({ where: { id: screenshotId } });
  }
}

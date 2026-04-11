import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { MqttService } from '../mqtt/mqtt.service';
import { Screenshot } from './screenshot.entity';

@Injectable()
export class ScreenshotService implements OnModuleInit {
  private readonly logger = new Logger(ScreenshotService.name);
  private readonly storageDir: string;

  constructor(
    @InjectRepository(Screenshot)
    private readonly screenshotRepository: Repository<Screenshot>,
    private readonly mqttService: MqttService,
    private readonly config: ConfigService,
  ) {
    this.storageDir = this.config.get<string>('SCREENSHOT_STORAGE_DIR') ?? './screenshots';
  }

  onModuleInit() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Backend escuta as respostas dos alunos
    this.mqttService.subscribe('screenshot/response/+', (topic, payload) => {
      const alunoId = topic.split('/')[2];
      const data = JSON.parse(payload.toString()) as {
        professorId: string;
        imageBase64: string;
        requestId: string;
      };
      this.handleResponse(alunoId, data).catch((err) =>
        this.logger.error(`Error handling screenshot response: ${err.message}`),
      );
    });
  }

  async requestScreenshot(professorId: string, alunoId: string): Promise<{ requestId: string }> {
    const requestId = crypto.randomUUID();

    this.mqttService.publish(
      `screenshot/request/${alunoId}`,
      { requestId, professorId },
      1,
    );

    return { requestId };
  }

  private async handleResponse(
    alunoId: string,
    data: { professorId: string; imageBase64: string; requestId: string },
  ) {
    const filename = `${Date.now()}_${alunoId}.png`;
    const filePath = path.join(this.storageDir, filename);

    const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const record = this.screenshotRepository.create({
      professorId: data.professorId,
      alunoId,
      filePath,
    });

    await this.screenshotRepository.save(record);

    // Notifica o professor que o screenshot está pronto
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

    this.logger.log(`Screenshot saved: ${filePath}`);
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

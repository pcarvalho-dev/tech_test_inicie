import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotService } from './screenshot.service';
import { Screenshot } from './screenshot.entity';
import { MqttService } from '../mqtt/mqtt.service';

vi.mock('fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

const makeQb = (items: any[]) => ({
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
  getMany: vi.fn().mockResolvedValue(items),
});

const mockRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn(),
};

const mockMqttService = { subscribe: vi.fn(), publish: vi.fn() };
const mockConfig = {
  get: vi.fn().mockReturnValue('./screenshots'),
};

describe('ScreenshotService', () => {
  let service: ScreenshotService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ScreenshotService,
        { provide: getRepositoryToken(Screenshot), useValue: mockRepo },
        { provide: MqttService, useValue: mockMqttService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(ScreenshotService);
    service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('subscreve no tópico screenshot/response/+', () => {
      expect(mockMqttService.subscribe).toHaveBeenCalledWith('screenshot/response/+', expect.any(Function));
    });

    it('ignora JSON inválido sem lançar exceção', () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      expect(() => handler('screenshot/response/aluno-1', Buffer.from('invalid-json'))).not.toThrow();
    });
  });

  describe('requestScreenshot', () => {
    it('publica no tópico correto e retorna requestId', async () => {
      const result = await service.requestScreenshot('prof-uuid', 'aluno-uuid');

      expect(result.requestId).toBeDefined();
      expect(mockMqttService.publish).toHaveBeenCalledWith(
        'screenshot/request/aluno-uuid',
        expect.objectContaining({ professorId: 'prof-uuid' }),
        1,
      );
    });
  });

  describe('handleResponse (via MQTT handler)', () => {
    it('salva arquivo, persiste metadados e publica screenshot/ready', async () => {
      const record = { id: 'ss-uuid', professorId: 'prof-uuid', alunoId: 'aluno-uuid', filePath: 'file.png', createdAt: new Date() };
      mockRepo.create.mockReturnValue(record);
      mockRepo.save.mockResolvedValue(record);

      const handler = mockMqttService.subscribe.mock.calls[0][1];
      const payload = JSON.stringify({
        professorId: 'prof-uuid',
        imageBase64: 'data:image/png;base64,abc123',
        requestId: 'req-uuid',
      });

      handler('screenshot/response/aluno-uuid', Buffer.from(payload));
      await new Promise((r) => setTimeout(r, 20));

      expect(mockRepo.save).toHaveBeenCalled();
      expect(mockMqttService.publish).toHaveBeenCalledWith(
        'screenshot/ready/prof-uuid',
        expect.objectContaining({ screenshotId: 'ss-uuid' }),
        1,
      );
    });

    it('salva apenas o filename no banco, não o path completo', async () => {
      const record = { id: 'ss-uuid', professorId: 'prof-uuid', alunoId: 'aluno-uuid', filePath: 'file.png', createdAt: new Date() };
      mockRepo.create.mockReturnValue(record);
      mockRepo.save.mockResolvedValue(record);

      const handler = mockMqttService.subscribe.mock.calls[0][1];
      const payload = JSON.stringify({
        professorId: 'prof-uuid',
        imageBase64: 'abc',
        requestId: 'req-uuid',
      });

      handler('screenshot/response/aluno-uuid', Buffer.from(payload));
      await new Promise((r) => setTimeout(r, 20));

      const createCall = mockRepo.create.mock.calls[0]?.[0];
      if (createCall) {
        expect(createCall.filePath).not.toContain('/');
        expect(createCall.filePath).not.toContain('\\');
      }
    });
  });

  describe('getHistory', () => {
    it('busca screenshots do professor', async () => {
      const items = [{ id: 'ss-1' }];
      mockRepo.createQueryBuilder.mockReturnValue(makeQb(items));

      const result = await service.getHistory('prof-uuid');
      expect(result).toEqual(items);
    });

    it('filtra por alunoId quando fornecido', async () => {
      const qb = makeQb([]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getHistory('prof-uuid', 'aluno-uuid');
      expect(qb.andWhere).toHaveBeenCalledWith('s.alunoId = :alunoId', { alunoId: 'aluno-uuid' });
    });
  });

  describe('getImagePath', () => {
    it('retorna screenshot pelo id', async () => {
      const ss = { id: 'ss-1', filePath: 'file.png' };
      mockRepo.findOne.mockResolvedValue(ss);

      const result = await service.getImagePath('ss-1');
      expect(result).toEqual(ss);
    });

    it('retorna null se não encontrado', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.getImagePath('nao-existe');
      expect(result).toBeNull();
    });
  });
});

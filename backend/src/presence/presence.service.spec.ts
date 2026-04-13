import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresenceService } from './presence.service';
import { MqttService } from '../mqtt/mqtt.service';

const mockRedis = {
  set: vi.fn(),
  keys: vi.fn(),
  mget: vi.fn(),
  exists: vi.fn(),
  on: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: class { constructor() { return mockRedis; } },
}));

const mockMqttService = { subscribe: vi.fn(), publish: vi.fn() };
const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('redis'),
  get: vi.fn().mockReturnValue(undefined),
};

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: MqttService, useValue: mockMqttService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).setLogger(false).compile();

    service = module.get(PresenceService);
    service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('faz subscribe no tópico presence/+', () => {
      expect(mockMqttService.subscribe).toHaveBeenCalledWith('presence/+', expect.any(Function));
    });

    it('trata erro do Redis sem lançar exceção', () => {
      const errorHandler = mockRedis.on.mock.calls.find(([evt]: [string]) => evt === 'error')?.[1];
      expect(() => errorHandler?.(new Error('redis down'))).not.toThrow();
    });

    it('ignora payload MQTT com JSON inválido', () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      expect(() => handler('presence/uuid-1', Buffer.from('invalid-json'))).not.toThrow();
    });

    it('atualiza presença com payload válido', () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      const payload = JSON.stringify({ name: 'Aluno', role: 'aluno' });
      handler('presence/uuid-1', Buffer.from(payload));
      expect(mockRedis.set).toHaveBeenCalledWith(
        'presence:uuid-1',
        expect.any(String),
        'EX',
        30,
      );
    });
  });

  describe('getOnlineUsers', () => {
    it('retorna todos os usuários quando role não fornecido', async () => {
      mockRedis.keys.mockResolvedValue(['presence:a', 'presence:b']);
      mockRedis.mget.mockResolvedValue([
        JSON.stringify({ userId: 'a', name: 'Aluno', role: 'aluno' }),
        JSON.stringify({ userId: 'b', name: 'Prof', role: 'professor' }),
      ]);

      const result = await service.getOnlineUsers();
      expect(result).toHaveLength(2);
    });
  });

  describe('getOnlineStudents', () => {
    it('retorna apenas alunos', async () => {
      mockRedis.keys.mockResolvedValue(['presence:a', 'presence:b']);
      mockRedis.mget.mockResolvedValue([
        JSON.stringify({ userId: 'a', name: 'Aluno', role: 'aluno' }),
        JSON.stringify({ userId: 'b', name: 'Prof', role: 'professor' }),
      ]);

      const result = await service.getOnlineStudents();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Aluno');
    });

    it('retorna array vazio se nenhuma chave', async () => {
      mockRedis.keys.mockResolvedValue([]);
      const result = await service.getOnlineStudents();
      expect(result).toEqual([]);
    });
  });

  describe('pingFromHttp', () => {
    it('atualiza Redis e publica no MQTT', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.pingFromHttp('uuid-1', 'Aluno', 'aluno');
      expect(mockRedis.set).toHaveBeenCalledWith('presence:uuid-1', expect.any(String), 'EX', 30);
      expect(mockMqttService.publish).toHaveBeenCalledWith('presence/uuid-1', { name: 'Aluno', role: 'aluno' }, 0);
    });
  });

  describe('isOnline', () => {
    it('retorna true se chave existe', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.isOnline('uuid-1')).toBe(true);
    });

    it('retorna false se chave não existe', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.isOnline('uuid-1')).toBe(false);
    });
  });
});

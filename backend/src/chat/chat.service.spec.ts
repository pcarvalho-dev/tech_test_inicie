import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from './chat.service';
import { Message } from './message.entity';
import { MqttService } from '../mqtt/mqtt.service';
import { UserRole } from '../users/user.entity';

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: class { constructor() { return mockRedis; } },
}));

const makeQb = (messages: any[]) => ({
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
  getMany: vi.fn().mockResolvedValue(messages),
});

const mockRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn(),
};

const mockMqttService = { subscribe: vi.fn(), publish: vi.fn() };
const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('redis'),
  get: vi.fn().mockReturnValue(6379),
};

const mockSender = {
  id: 'sender-uuid',
  email: 'sender@test.com',
  name: 'Sender',
  password: 'hashed',
  role: UserRole.PROFESSOR,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Message), useValue: mockRepo },
        { provide: MqttService, useValue: mockMqttService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(ChatService);
    service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('subscreve no tópico chat/+', () => {
      expect(mockMqttService.subscribe).toHaveBeenCalledWith('chat/+', expect.any(Function));
    });

    it('ignora JSON inválido no handler MQTT', () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      expect(() => handler('chat/1', Buffer.from('invalid'))).not.toThrow();
    });

    it('não persiste mensagem duplicada', async () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      const msg = { id: 'msg-1', senderId: 'a', receiverId: 'b', content: 'hi' };
      mockRepo.findOne.mockResolvedValue(msg);

      handler('chat/msg-1', Buffer.from(JSON.stringify(msg)));
      await new Promise((r) => setTimeout(r, 10));

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('persiste mensagem nova recebida via MQTT', async () => {
      const handler = mockMqttService.subscribe.mock.calls[0][1];
      const msg = { id: 'msg-2', senderId: 'a', receiverId: 'b', content: 'nova' };
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(msg);
      mockRepo.save.mockResolvedValue(msg);

      handler('chat/msg-2', Buffer.from(JSON.stringify(msg)));
      await new Promise((r) => setTimeout(r, 10));

      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('persiste, publica MQTT e invalida cache', async () => {
      const saved = { id: 'msg-uuid', senderId: 'sender-uuid', receiverId: 'recv-uuid', content: 'oi', createdAt: new Date() };
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      mockRedis.keys.mockResolvedValue([]);

      const result = await service.sendMessage(mockSender, 'recv-uuid', 'oi');

      expect(mockRepo.save).toHaveBeenCalled();
      expect(mockMqttService.publish).toHaveBeenCalledWith(`chat/${saved.id}`, expect.objectContaining({ content: 'oi' }));
      expect(result).toEqual(saved);
    });
  });

  describe('getHistory', () => {
    it('retorna do cache se existir', async () => {
      const cached = { data: [], hasMore: false, nextCursor: null };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getHistory('a', 'b');
      expect(result).toEqual(cached);
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('busca no banco e cacheia se não houver cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      const msgs = [{ id: '1', createdAt: new Date('2026-01-01') }];
      mockRepo.createQueryBuilder.mockReturnValue(makeQb(msgs));

      const result = await service.getHistory('a', 'b', 50);

      expect(result.data).toEqual(msgs);
      expect(result.hasMore).toBe(false);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('hasMore=true e nextCursor correto quando há mais itens', async () => {
      mockRedis.get.mockResolvedValue(null);
      const msgs = Array.from({ length: 51 }, (_, i) => ({
        id: `msg-${i}`,
        createdAt: new Date(2026, 0, i + 1),
      }));
      mockRepo.createQueryBuilder.mockReturnValue(makeQb(msgs));

      const result = await service.getHistory('a', 'b', 50);

      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(50);
      expect(result.nextCursor).toBe(msgs[49].createdAt.toISOString());
    });
  });
});

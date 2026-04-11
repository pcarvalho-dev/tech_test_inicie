import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MqttService } from './mqtt.service';

const mockClient = {
  on: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  end: vi.fn(),
};

vi.mock('mqtt', () => ({
  connect: vi.fn(() => mockClient),
}));

const mockConfig = {
  getOrThrow: vi.fn((key: string) => {
    const map: Record<string, string> = {
      MQTT_HOST: 'localhost',
      MQTT_PORT: '1883',
    };
    return map[key];
  }),
};

describe('MqttService', () => {
  let service: MqttService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.on.mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        MqttService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(MqttService);
    service.onModuleInit();
  });

  describe('topicMatches', () => {
    it('match exato', () => {
      expect((service as any).topicMatches('chat/123', 'chat/123')).toBe(true);
    });

    it('wildcard +', () => {
      expect((service as any).topicMatches('chat/+', 'chat/abc')).toBe(true);
      expect((service as any).topicMatches('chat/+', 'chat/abc/extra')).toBe(false);
    });

    it('wildcard #', () => {
      expect((service as any).topicMatches('chat/#', 'chat/abc/def')).toBe(true);
    });

    it('não faz match em tópicos diferentes', () => {
      expect((service as any).topicMatches('chat/123', 'presence/123')).toBe(false);
    });
  });

  describe('publish', () => {
    it('publica string com QoS padrão 1', () => {
      service.publish('chat/1', 'hello');
      expect(mockClient.publish).toHaveBeenCalledWith('chat/1', 'hello', { qos: 1 });
    });

    it('serializa objeto para JSON', () => {
      service.publish('chat/1', { text: 'hi' });
      expect(mockClient.publish).toHaveBeenCalledWith('chat/1', '{"text":"hi"}', { qos: 1 });
    });

    it('publica com QoS 0', () => {
      service.publish('presence/1', 'ping', 0);
      expect(mockClient.publish).toHaveBeenCalledWith('presence/1', 'ping', { qos: 0 });
    });
  });

  describe('subscribe', () => {
    it('registra handler e faz subscribe no client', () => {
      const handler = vi.fn();
      service.subscribe('chat/+', handler);
      expect(mockClient.subscribe).toHaveBeenCalledWith('chat/+', { qos: 1 });
    });
  });

  describe('unsubscribe', () => {
    it('remove handler e faz unsubscribe no client', () => {
      service.subscribe('chat/+', vi.fn());
      service.unsubscribe('chat/+');
      expect(mockClient.unsubscribe).toHaveBeenCalledWith('chat/+');
    });
  });

  describe('onModuleDestroy', () => {
    it('encerra o client', () => {
      service.onModuleDestroy();
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('dispara handler registrado ao receber mensagem no tópico correto', () => {
      const handler = vi.fn();
      service.subscribe('chat/+', handler);

      const onMessage = mockClient.on.mock.calls.find(([event]) => event === 'message')?.[1];
      onMessage?.('chat/123', Buffer.from('payload'));

      expect(handler).toHaveBeenCalledWith('chat/123', expect.any(Buffer));
    });

    it('não dispara handler para tópico diferente', () => {
      const handler = vi.fn();
      service.subscribe('chat/+', handler);

      const onMessage = mockClient.on.mock.calls.find(([event]) => event === 'message')?.[1];
      onMessage?.('presence/123', Buffer.from('payload'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('callback de connect loga sem lançar exceção', () => {
      const onConnect = mockClient.on.mock.calls.find(([event]) => event === 'connect')?.[1];
      expect(() => onConnect?.()).not.toThrow();
    });

    it('callback de reconnect loga sem lançar exceção', () => {
      const onReconnect = mockClient.on.mock.calls.find(([event]) => event === 'reconnect')?.[1];
      expect(() => onReconnect?.()).not.toThrow();
    });

    it('callback de error loga sem lançar exceção', () => {
      const onError = mockClient.on.mock.calls.find(([event]) => event === 'error')?.[1];
      expect(() => onError?.(new Error('test error'))).not.toThrow();
    });
  });
});

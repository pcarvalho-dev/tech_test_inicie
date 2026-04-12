import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient, mockConnect } = vi.hoisted(() => {
  const client = { on: vi.fn(), subscribe: vi.fn(), publish: vi.fn(), end: vi.fn() };
  const connect = vi.fn().mockReturnValue(client);
  return { mockClient: client, mockConnect: connect };
});

vi.mock('mqtt', () => ({ default: { connect: mockConnect } }));

import { createMqttClient } from './mqtt-client';

describe('createMqttClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama mqtt.connect com URL correta', () => {
    createMqttClient('user-1', 'tok');
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockConnect.mock.calls[0][0]).toBe('ws://localhost:8083/mqtt');
  });

  it('passa username, password e flags corretos', () => {
    createMqttClient('user-1', 'my-token');
    const opts = mockConnect.mock.calls[0][1];
    expect(opts.username).toBe('user-1');
    expect(opts.password).toBe('my-token');
    expect(opts.clean).toBe(true);
    expect(opts.reconnectPeriod).toBe(0);
  });

  it('clientId tem prefixo aluno-popup-{userId}', () => {
    createMqttClient('abc', 'tok');
    const { clientId } = mockConnect.mock.calls[0][1];
    expect(clientId).toMatch(/^aluno-popup-abc-\d+$/);
  });

  it('retorna o cliente criado por mqtt.connect', () => {
    const result = createMqttClient('u', 't');
    expect(result).toBe(mockClient);
  });
});

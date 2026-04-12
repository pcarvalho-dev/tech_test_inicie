import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const alarmListeners: Array<(alarm: { name: string }) => void> = [];
const messageListeners: Array<(msg: any, sender: any, sendResponse: (r: any) => void) => void> = [];
const installedListeners: Array<() => Promise<void>> = [];
const startupListeners: Array<() => Promise<void>> = [];

const mockStorage = { get: vi.fn() };
const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
  clearAll: vi.fn().mockResolvedValue(undefined),
  onAlarm: { addListener: (cb: any) => alarmListeners.push(cb) },
};
const mockRuntime = {
  onMessage: { addListener: (cb: any) => messageListeners.push(cb) },
  onInstalled: { addListener: (cb: any) => installedListeners.push(cb) },
  onStartup: { addListener: (cb: any) => startupListeners.push(cb) },
};

global.chrome = {
  storage: { local: mockStorage },
  alarms: mockAlarms,
  runtime: mockRuntime,
} as any;

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe('background/index (extension-professor)', () => {
  beforeAll(async () => {
    await import('./index');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockAlarms.clearAll.mockResolvedValue(undefined);
  });

  function setAuth(authenticated: boolean) {
    mockStorage.get.mockResolvedValue(
      authenticated
        ? { token: 'tok', user: { id: 'prof-1', name: 'Professor', role: 'professor' } }
        : {},
    );
  }

  describe('alarm: presence-ping → sendPresencePing', () => {
    it('sem auth limpa alarme e não chama fetch', async () => {
      setAuth(false);
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockAlarms.clear).toHaveBeenCalledWith('presence-ping');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('com auth faz POST presence/ping', async () => {
      setAuth(true);
      mockFetch.mockResolvedValue({ ok: true });
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/presence/ping',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        }),
      );
    });

    it('erro no fetch não lança exceção', async () => {
      setAuth(true);
      mockFetch.mockRejectedValue(new Error('network'));
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
    });

    it('ignora alarme com nome desconhecido', async () => {
      alarmListeners[0]({ name: 'outro-alarme' });
      await tick();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('message: start-presence', () => {
    it('cria alarme e responde ok', () => {
      setAuth(false);
      const sendResponse = vi.fn();
      messageListeners[0]({ type: 'start-presence' }, {}, sendResponse);
      expect(mockAlarms.create).toHaveBeenCalledWith('presence-ping', { periodInMinutes: 0.25 });
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('message: stop-presence', () => {
    it('limpa alarme e responde ok', () => {
      const sendResponse = vi.fn();
      mockAlarms.clear.mockReturnValue(Promise.resolve());
      messageListeners[0]({ type: 'stop-presence' }, {}, sendResponse);
      expect(mockAlarms.clear).toHaveBeenCalledWith('presence-ping');
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('onInstalled', () => {
    it('sem auth limpa alarmes e não cria', async () => {
      setAuth(false);
      await installedListeners[0]();
      expect(mockAlarms.clearAll).toHaveBeenCalled();
      expect(mockAlarms.create).not.toHaveBeenCalled();
    });

    it('com auth cria alarme', async () => {
      setAuth(true);
      await installedListeners[0]();
      expect(mockAlarms.create).toHaveBeenCalledWith('presence-ping', { periodInMinutes: 0.25 });
    });
  });

  describe('onStartup', () => {
    it('sem auth não cria alarme', async () => {
      setAuth(false);
      await startupListeners[0]();
      expect(mockAlarms.create).not.toHaveBeenCalled();
    });

    it('com auth cria alarme', async () => {
      setAuth(true);
      await startupListeners[0]();
      expect(mockAlarms.create).toHaveBeenCalledWith('presence-ping', { periodInMinutes: 0.25 });
    });
  });
});

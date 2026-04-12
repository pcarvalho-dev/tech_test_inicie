import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const alarmListeners: Array<(alarm: { name: string }) => void> = [];
const messageListeners: Array<(msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void> = [];
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
const mockWindows = { getLastFocused: vi.fn() };
const mockTabs = { query: vi.fn(), captureVisibleTab: vi.fn() };

global.chrome = {
  storage: { local: mockStorage },
  alarms: mockAlarms,
  runtime: mockRuntime,
  windows: mockWindows,
  tabs: mockTabs,
} as any;

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe('background/index (extension-aluno)', () => {
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
        ? { token: 'tok', user: { id: 'aluno-1', name: 'Aluno', role: 'aluno' } }
        : {},
    );
  }

  function makeStream(content: string) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(content));
        ctrl.close();
      },
    });
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
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/presence/ping',
        expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      );
    });

    it('erro no fetch não lança exceção', async () => {
      setAuth(true);
      mockFetch.mockRejectedValue(new Error('network'));
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
    });
  });

  describe('checkPendingScreenshot (via presence-ping)', () => {
    it('não captura se pending retorna !ok', async () => {
      setAuth(true);
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockTabs.captureVisibleTab).not.toHaveBeenCalled();
    });

    it('não captura se pending não tem requestId', async () => {
      setAuth(true);
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({}) });
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockTabs.captureVisibleTab).not.toHaveBeenCalled();
    });

    it('chama captureAndUpload se pending tem requestId', async () => {
      setAuth(true);
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ requestId: 'r1', professorId: 'p1' }) })
        .mockResolvedValue({ ok: true });
      mockWindows.getLastFocused.mockRejectedValue(new Error('no window'));
      mockTabs.query.mockResolvedValue([]);
      alarmListeners[0]({ name: 'presence-ping' });
      await tick();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/capture-failed',
        expect.anything(),
      );
    });
  });

  describe('alarm: sse-reconnect → connectSseStream', () => {
    it('sem auth retorna sem chamar fetch', async () => {
      setAuth(false);
      alarmListeners[0]({ name: 'sse-reconnect' });
      await tick();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('com auth conecta SSE e agenda reconexão após falha (!ok)', async () => {
      setAuth(true);
      mockFetch.mockResolvedValue({ ok: false });
      alarmListeners[0]({ name: 'sse-reconnect' });
      await tick();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/stream',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      );
      expect(mockAlarms.create).toHaveBeenCalledWith('sse-reconnect', { delayInMinutes: 0.05 });
    });

    it('agenda reconexão quando body é null', async () => {
      setAuth(true);
      mockFetch.mockResolvedValue({ ok: true, body: null });
      alarmListeners[0]({ name: 'sse-reconnect' });
      await tick();
      expect(mockAlarms.create).toHaveBeenCalledWith('sse-reconnect', { delayInMinutes: 0.05 });
    });

    it('parseia evento screenshot_request do SSE e chama captureAndUpload', async () => {
      setAuth(true);
      const stream = makeStream(
        'event: screenshot_request\ndata: {"requestId":"r1","professorId":"p1"}\n\n',
      );
      mockFetch
        .mockResolvedValueOnce({ ok: true, body: stream })
        .mockResolvedValue({ ok: true });
      mockWindows.getLastFocused.mockRejectedValue(new Error('no window'));
      mockTabs.query.mockResolvedValue([]);
      alarmListeners[0]({ name: 'sse-reconnect' });
      await tick();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/capture-failed',
        expect.anything(),
      );
      expect(mockAlarms.create).toHaveBeenCalledWith('sse-reconnect', { delayInMinutes: 0.05 });
    });

    it('ignora evento screenshot_request com JSON inválido', async () => {
      setAuth(true);
      const stream = makeStream('event: screenshot_request\ndata: invalid-json\n\n');
      mockFetch.mockResolvedValueOnce({ ok: true, body: stream });
      alarmListeners[0]({ name: 'sse-reconnect' });
      await tick();
      expect(mockAlarms.create).toHaveBeenCalledWith('sse-reconnect', { delayInMinutes: 0.05 });
    });
  });

  describe('captureAndUpload (via message capture)', () => {
    it('sem auth não faz nada', async () => {
      setAuth(false);
      messageListeners[0]({ type: 'capture', data: { requestId: 'r', professorId: 'p', alunoId: 'a' } }, {}, vi.fn());
      await tick();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('captura aba HTTP e faz upload com sucesso', async () => {
      setAuth(true);
      mockWindows.getLastFocused.mockResolvedValue({ id: 10 });
      mockTabs.query.mockResolvedValue([{ url: 'http://example.com', windowId: 10 }]);
      mockTabs.captureVisibleTab.mockResolvedValue('data:image/png;base64,abc123');
      mockFetch.mockResolvedValue({ ok: true });

      messageListeners[0]({ type: 'capture', data: { requestId: 'r1', professorId: 'p1', alunoId: 'a1' } }, {}, vi.fn());
      await tick();

      expect(mockTabs.captureVisibleTab).toHaveBeenCalledWith(10, { format: 'png' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/upload',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('fallback tabs.query quando getLastFocused lança', async () => {
      setAuth(true);
      mockWindows.getLastFocused.mockRejectedValue(new Error('no window'));
      mockTabs.query.mockResolvedValue([{ windowId: 7 }]);
      mockTabs.captureVisibleTab.mockResolvedValue('data:image/png;base64,abc');
      mockFetch.mockResolvedValue({ ok: true });

      messageListeners[0]({ type: 'capture', data: { requestId: 'r2', professorId: 'p1', alunoId: 'a1' } }, {}, vi.fn());
      await tick();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/upload',
        expect.anything(),
      );
    });

    it('sem aba capturável chama capture-failed', async () => {
      setAuth(true);
      mockWindows.getLastFocused.mockRejectedValue(new Error('no window'));
      mockTabs.query.mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: true });

      messageListeners[0]({ type: 'capture', data: { requestId: 'r3', professorId: 'p1', alunoId: 'a1' } }, {}, vi.fn());
      await tick();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/capture-failed',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('upload !ok chama capture-failed', async () => {
      setAuth(true);
      mockWindows.getLastFocused.mockResolvedValue({ id: 1 });
      mockTabs.query.mockResolvedValue([{ url: 'http://example.com', windowId: 1 }]);
      mockTabs.captureVisibleTab.mockResolvedValue('data:image/png;base64,abc');
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true });

      messageListeners[0]({ type: 'capture', data: { requestId: 'r4', professorId: 'p1', alunoId: 'a1' } }, {}, vi.fn());
      await tick();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/screenshots/capture-failed',
        expect.anything(),
      );
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

    it('com auth cria alarme e inicia SSE', async () => {
      setAuth(true);
      mockFetch.mockResolvedValue({ ok: false });
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

    it('com auth cria alarme e inicia SSE', async () => {
      setAuth(true);
      mockFetch.mockResolvedValue({ ok: false });
      await startupListeners[0]();
      expect(mockAlarms.create).toHaveBeenCalledWith('presence-ping', { periodInMinutes: 0.25 });
    });
  });
});

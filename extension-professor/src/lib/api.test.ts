import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./storage', () => ({
  getStorage: vi.fn(),
}));

import { getStorage } from './storage';
import {
  apiFetch,
  login,
  getOnlineStudents,
  sendMessage,
  getChatHistory,
  requestScreenshot,
  getScreenshotHistory,
  fetchScreenshotBlobUrl,
} from './api';

const mockGetStorage = vi.mocked(getStorage);
const mockFetch = vi.fn();
global.fetch = mockFetch as any;
global.URL = { createObjectURL: vi.fn().mockReturnValue('blob:mock') } as any;

function ok(data: unknown) {
  return { ok: true, json: vi.fn().mockResolvedValue(data), blob: vi.fn().mockResolvedValue(new Blob(['img'])) };
}

function fail(data: unknown = {}) {
  return { ok: false, json: vi.fn().mockResolvedValue(data) };
}

describe('api (extension-professor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorage.mockResolvedValue({ token: 'test-token' });
  });

  describe('apiFetch', () => {
    it('injeta Authorization com token do storage', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await apiFetch('/test');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-token');
    });

    it('omite Authorization quando não há token', async () => {
      mockGetStorage.mockResolvedValue({});
      mockFetch.mockResolvedValue({ ok: true });
      await apiFetch('/test');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('repassa method e body adicionais', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await apiFetch('/test', { method: 'DELETE' });
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('login', () => {
    it('retorna user e token em sucesso', async () => {
      const data = { access_token: 'tok', user: { id: '1', email: 'p@p.com', name: 'P', role: 'professor' } };
      mockFetch.mockResolvedValue(ok(data));
      expect(await login('p@p.com', '123')).toEqual(data);
    });

    it('lança erro com mensagem da API', async () => {
      mockFetch.mockResolvedValue(fail({ message: 'Credenciais inválidas' }));
      await expect(login('x@x.com', 'w')).rejects.toThrow('Credenciais inválidas');
    });

    it('usa mensagem padrão se API não retorna message', async () => {
      mockFetch.mockResolvedValue(fail({}));
      await expect(login('x@x.com', 'w')).rejects.toThrow('Credenciais inválidas');
    });
  });

  describe('getOnlineStudents', () => {
    it('retorna lista de alunos online', async () => {
      const data = [{ userId: '1', name: 'A', role: 'aluno' }];
      mockFetch.mockResolvedValue(ok(data));
      expect(await getOnlineStudents()).toEqual(data);
    });

    it('retorna [] se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      expect(await getOnlineStudents()).toEqual([]);
    });
  });

  describe('sendMessage', () => {
    it('retorna mensagem criada', async () => {
      const msg = { id: 'm1', senderId: 'p', receiverId: 'a', content: 'oi', createdAt: '2026-01-01' };
      mockFetch.mockResolvedValue(ok(msg));
      expect(await sendMessage('a', 'oi')).toEqual(msg);
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(sendMessage('a', 'oi')).rejects.toThrow('Erro ao enviar mensagem');
    });
  });

  describe('getChatHistory', () => {
    it('retorna histórico sem cursor', async () => {
      const data = { data: [], hasMore: false, nextCursor: null };
      mockFetch.mockResolvedValue(ok(data));
      expect(await getChatHistory('user-1')).toEqual(data);
    });

    it('inclui cursor na URL se fornecido', async () => {
      mockFetch.mockResolvedValue(ok({ data: [], hasMore: false, nextCursor: null }));
      await getChatHistory('user-1', '2026-01-01T00:00:00Z');
      expect(mockFetch.mock.calls[0][0]).toContain('cursor=');
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(getChatHistory('user-1')).rejects.toThrow('Erro ao carregar histórico');
    });
  });

  describe('requestScreenshot', () => {
    it('retorna requestId em sucesso', async () => {
      mockFetch.mockResolvedValue(ok({ requestId: 'r1' }));
      expect(await requestScreenshot('aluno-1')).toEqual({ requestId: 'r1' });
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(requestScreenshot('aluno-1')).rejects.toThrow('Erro ao solicitar screenshot');
    });
  });

  describe('getScreenshotHistory', () => {
    it('retorna histórico sem filtro', async () => {
      const data = [{ id: 's1', alunoId: 'a1', filePath: 'p.png', createdAt: '2026-01-01' }];
      mockFetch.mockResolvedValue(ok(data));
      const result = await getScreenshotHistory();
      expect(result).toEqual(data);
      expect(mockFetch.mock.calls[0][0]).toContain('/screenshots/history');
      expect(mockFetch.mock.calls[0][0]).not.toContain('alunoId');
    });

    it('inclui alunoId na URL quando fornecido', async () => {
      mockFetch.mockResolvedValue(ok([]));
      await getScreenshotHistory('aluno-1');
      expect(mockFetch.mock.calls[0][0]).toContain('alunoId=aluno-1');
    });

    it('retorna [] se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      expect(await getScreenshotHistory()).toEqual([]);
    });
  });

  describe('fetchScreenshotBlobUrl', () => {
    it('retorna blob URL em sucesso', async () => {
      const mockBlob = new Blob(['img']);
      mockFetch.mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(mockBlob) });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

      const result = await fetchScreenshotBlobUrl('ss-1');
      expect(result).toBe('blob:mock-url');
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(fetchScreenshotBlobUrl('ss-1')).rejects.toThrow('Erro ao carregar imagem');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./storage', () => ({
  getStorage: vi.fn(),
}));

import { getStorage } from './storage';
import {
  apiFetch,
  login,
  register,
  getProfessors,
  getOnlineUsers,
  sendMessage,
  getChatHistory,
  searchUsers,
} from './api';

const mockGetStorage = vi.mocked(getStorage);
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function ok(data: unknown) {
  return { ok: true, json: vi.fn().mockResolvedValue(data) };
}

function fail(data: unknown = {}) {
  return { ok: false, json: vi.fn().mockResolvedValue(data) };
}

describe('api (extension-aluno)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorage.mockResolvedValue({ token: 'test-token' });
  });

  describe('apiFetch', () => {
    it('injeta header Authorization com o token do storage', async () => {
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

    it('passa opts adicionais (method, body)', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await apiFetch('/test', { method: 'POST', body: '{}' });
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
  });

  describe('login', () => {
    it('retorna user e token em sucesso', async () => {
      const data = { access_token: 'tok', user: { id: '1', email: 'a@b.com', name: 'A', role: 'aluno' } };
      mockFetch.mockResolvedValue(ok(data));
      expect(await login('a@b.com', '123')).toEqual(data);
    });

    it('lança erro com mensagem da API', async () => {
      mockFetch.mockResolvedValue(fail({ message: 'Credenciais inválidas' }));
      await expect(login('x@x.com', 'wrong')).rejects.toThrow('Credenciais inválidas');
    });

    it('usa mensagem padrão se API não retorna message', async () => {
      mockFetch.mockResolvedValue(fail({}));
      await expect(login('x@x.com', 'wrong')).rejects.toThrow('Credenciais inválidas');
    });
  });

  describe('register', () => {
    it('retorna user e token em sucesso', async () => {
      const data = { access_token: 'tok', user: { id: '2', email: 'b@b.com', name: 'B', role: 'aluno' } };
      mockFetch.mockResolvedValue(ok(data));
      expect(await register('b@b.com', 'B', '123')).toEqual(data);
    });

    it('lança erro com mensagem da API', async () => {
      mockFetch.mockResolvedValue(fail({ message: 'Email já cadastrado' }));
      await expect(register('x@x.com', 'X', '123')).rejects.toThrow('Email já cadastrado');
    });

    it('usa mensagem padrão se API não retorna message', async () => {
      mockFetch.mockResolvedValue(fail({}));
      await expect(register('x@x.com', 'X', '123')).rejects.toThrow('Erro ao registrar');
    });
  });

  describe('getProfessors', () => {
    it('retorna lista em sucesso', async () => {
      const data = [{ id: '1', name: 'Prof', email: 'p@p.com', role: 'professor' }];
      mockFetch.mockResolvedValue(ok(data));
      expect(await getProfessors()).toEqual(data);
    });

    it('retorna [] se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      expect(await getProfessors()).toEqual([]);
    });
  });

  describe('getOnlineUsers', () => {
    it('retorna lista de usuários online', async () => {
      const data = [{ userId: '1', name: 'A', role: 'aluno' }];
      mockFetch.mockResolvedValue(ok(data));
      expect(await getOnlineUsers()).toEqual(data);
    });

    it('retorna [] se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      expect(await getOnlineUsers()).toEqual([]);
    });
  });

  describe('sendMessage', () => {
    it('retorna mensagem criada', async () => {
      const msg = { id: 'm1', senderId: 'a', receiverId: 'b', content: 'oi', createdAt: '2026-01-01' };
      mockFetch.mockResolvedValue(ok(msg));
      expect(await sendMessage('b', 'oi')).toEqual(msg);
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(sendMessage('b', 'oi')).rejects.toThrow('Erro ao enviar mensagem');
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
      expect(mockFetch.mock.calls[0][0]).toContain('cursor=2026-01-01');
    });

    it('lança erro se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      await expect(getChatHistory('user-1')).rejects.toThrow('Erro ao carregar histórico');
    });
  });

  describe('searchUsers', () => {
    it('retorna [] para query com menos de 2 chars', async () => {
      expect(await searchUsers('a')).toEqual([]);
      expect(await searchUsers('')).toEqual([]);
      expect(await searchUsers('  ')).toEqual([]);
    });

    it('retorna resultados para query válida', async () => {
      const data = [{ id: '1', name: 'Aluno', email: 'a@a.com', role: 'aluno' }];
      mockFetch.mockResolvedValue(ok(data));
      expect(await searchUsers('al')).toEqual(data);
    });

    it('retorna [] se !ok', async () => {
      mockFetch.mockResolvedValue(fail());
      expect(await searchUsers('aluno teste')).toEqual([]);
    });
  });
});

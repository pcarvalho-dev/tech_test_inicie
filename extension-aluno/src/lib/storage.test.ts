import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStorage, setStorage, clearStorage } from './storage';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockClear = vi.fn();

global.chrome = {
  storage: { local: { get: mockGet, set: mockSet, clear: mockClear } },
} as any;

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStorage', () => {
    it('chama chrome.storage.local.get com as keys', async () => {
      mockGet.mockResolvedValue({ token: 'abc' });
      const result = await getStorage(['token']);
      expect(mockGet).toHaveBeenCalledWith(['token']);
      expect(result).toEqual({ token: 'abc' });
    });

    it('retorna objeto vazio quando não há dados', async () => {
      mockGet.mockResolvedValue({});
      const result = await getStorage(['token', 'user']);
      expect(result).toEqual({});
    });
  });

  describe('setStorage', () => {
    it('chama chrome.storage.local.set com os dados fornecidos', async () => {
      mockSet.mockResolvedValue(undefined);
      await setStorage({ token: 'xyz' });
      expect(mockSet).toHaveBeenCalledWith({ token: 'xyz' });
    });

    it('persiste user junto com token', async () => {
      mockSet.mockResolvedValue(undefined);
      const user = { id: '1', email: 'a@a.com', name: 'A', role: 'aluno' as const };
      await setStorage({ token: 'tok', user });
      expect(mockSet).toHaveBeenCalledWith({ token: 'tok', user });
    });
  });

  describe('clearStorage', () => {
    it('chama chrome.storage.local.clear', async () => {
      mockClear.mockResolvedValue(undefined);
      await clearStorage();
      expect(mockClear).toHaveBeenCalledOnce();
    });
  });
});

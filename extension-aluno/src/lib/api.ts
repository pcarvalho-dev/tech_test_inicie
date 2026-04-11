import { getStorage } from './storage';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const { token } = await getStorage(['token']);
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Credenciais inválidas');
  return res.json() as Promise<{ access_token: string; user: { id: string; email: string; name: string; role: string } }>;
}

export async function register(email: string, name: string, password: string) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password, role: 'aluno' }),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erro ao registrar');
  return res.json() as Promise<{ access_token: string; user: { id: string; email: string; name: string; role: string } }>;
}

export interface UserResult {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getProfessors(): Promise<UserResult[]> {
  const res = await apiFetch('/users/professors');
  if (!res.ok) return [];
  return res.json();
}

export async function getOnlineUsers(): Promise<{ userId: string; name: string; role: string }[]> {
  const res = await apiFetch('/presence/online');
  if (!res.ok) return [];
  return res.json();
}

export async function searchUsers(q: string): Promise<UserResult[]> {
  if (q.trim().length < 2) return [];
  const res = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function sendMessage(receiverId: string, content: string) {
  const res = await apiFetch('/chat/send', {
    method: 'POST',
    body: JSON.stringify({ receiverId, content }),
  });
  if (!res.ok) throw new Error('Erro ao enviar mensagem');
  return res.json();
}

export async function getChatHistory(userId: string, cursor?: string) {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const res = await apiFetch(`/chat/history/${userId}?${params}`);
  if (!res.ok) throw new Error('Erro ao carregar histórico');
  return res.json() as Promise<{ data: ChatMessage[]; hasMore: boolean; nextCursor: string | null }>;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
}

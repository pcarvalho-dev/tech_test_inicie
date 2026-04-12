import { getStorage } from './storage';

const BASE = 'http://localhost:3000/api';

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

export interface OnlineStudent {
  userId: string;
  name: string;
  role: string;
}

export async function getOnlineStudents(): Promise<OnlineStudent[]> {
  const res = await apiFetch('/presence/online?role=aluno');
  if (!res.ok) return [];
  return res.json();
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
}

export async function sendMessage(receiverId: string, content: string): Promise<ChatMessage> {
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

export interface Screenshot {
  id: string;
  alunoId: string;
  filePath: string;
  createdAt: string;
}

export async function requestScreenshot(alunoId: string): Promise<{ requestId: string }> {
  const res = await apiFetch(`/screenshots/request/${alunoId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao solicitar screenshot');
  return res.json();
}

export async function getScreenshotHistory(alunoId?: string): Promise<Screenshot[]> {
  const path = alunoId ? `/screenshots/history?alunoId=${alunoId}` : '/screenshots/history';
  const res = await apiFetch(path);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchScreenshotBlobUrl(screenshotId: string): Promise<string> {
  const res = await apiFetch(`/screenshots/${screenshotId}/image`);
  if (!res.ok) throw new Error('Erro ao carregar imagem');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

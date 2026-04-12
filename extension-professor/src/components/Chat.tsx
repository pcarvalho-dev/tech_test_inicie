import { useEffect, useRef, useState } from 'react';
import { getStorage, clearStorage } from '@/lib/storage';
import { createMqttClient } from '@/lib/mqtt-client';
import {
  sendMessage,
  getChatHistory,
  requestScreenshot,
  getScreenshotHistory,
  fetchScreenshotBlobUrl,
  type ChatMessage,
  type Screenshot,
  type OnlineStudent,
} from '@/lib/api';
import type { MqttClient } from 'mqtt';

type Tab = 'chat' | 'screenshots';

interface Props {
  student: OnlineStudent;
  onBack: () => void;
  onLogout: () => void;
}

export default function ChatPage({ student, onBack, onLogout }: Props) {
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [screenshotRequesting, setScreenshotRequesting] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newScreenshotId, setNewScreenshotId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScreenshotId, setPreviewScreenshotId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mqttRef = useRef<MqttClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStorage(['token', 'user']).then(({ token, user }) => {
      if (!token || !user) { onLogout(); return; }
      setUserId(user.id);

      getChatHistory(student.userId).then(({ data }) =>
        setMessages(data.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
      ).catch(() => {});

      getScreenshotHistory(student.userId).then(setScreenshots).catch(() => {});

      const client = createMqttClient(user.id, token);
      mqttRef.current = client;

      client.on('connect', () => {
        client.subscribe('chat/+', { qos: 1 });
        client.subscribe(`screenshot/ready/${user.id}`, { qos: 1 });
      });

      client.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());

          if (topic.startsWith('chat/') && data.receiverId === user.id && data.senderId === student.userId) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === data.id)) return prev;
              return [...prev, data].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
          }

          if (topic === `screenshot/ready/${user.id}`) {
            if (screenshotTimeoutRef.current) clearTimeout(screenshotTimeoutRef.current);
            setScreenshotRequesting(false);

            if (data.error === 'capture_failed') {
              setScreenshotError('Captura falhou. Certifique-se de que o aluno tem uma aba HTTP aberta.');
              setTimeout(() => setScreenshotError(null), 5000);
              return;
            }

            if (data.alunoId === student.userId) {
              setNewScreenshotId(data.screenshotId);
              setScreenshots((prev) => [{
                id: data.screenshotId,
                alunoId: data.alunoId,
                filePath: '',
                createdAt: data.createdAt ?? new Date().toISOString(),
              }, ...prev]);
            }
          }
        } catch {
          // ignore
        }
      });
    });

    return () => { mqttRef.current?.end(); };
  }, [student.userId, onLogout]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setSending(true);
    try {
      const msg = await sendMessage(student.userId, input.trim());
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setInput('');
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  async function handleRequestScreenshot() {
    setScreenshotError(null);
    setScreenshotRequesting(true);

    screenshotTimeoutRef.current = setTimeout(() => {
      setScreenshotRequesting(false);
      setScreenshotError('Sem resposta do aluno. Verifique se a extensão do aluno está aberta.');
      setTimeout(() => setScreenshotError(null), 5000);
    }, 15_000);

    try {
      await requestScreenshot(student.userId);
    } catch {
      if (screenshotTimeoutRef.current) clearTimeout(screenshotTimeoutRef.current);
      setScreenshotRequesting(false);
      setScreenshotError('Erro ao solicitar screenshot.');
      setTimeout(() => setScreenshotError(null), 4000);
    }
  }

  async function openPreview(screenshotId: string) {
    setPreviewUrl(null);
    setPreviewScreenshotId(screenshotId);
    setPreviewOpen(true);
    try {
      const url = await fetchScreenshotBlobUrl(screenshotId);
      setPreviewUrl(url);
    } catch {
      setPreviewOpen(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewScreenshotId(null);
    setPreviewOpen(false);
  }

  function handleLogout() {
    clearStorage();
    chrome.runtime.sendMessage({ type: 'stop-presence' });
    mqttRef.current?.end();
    onLogout();
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col w-[400px] h-[600px] bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 text-white shrink-0">
        <button onClick={onBack} className="text-indigo-200 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <p className="font-semibold text-sm truncate">{student.name}</p>
          </div>
          <p className="text-xs text-indigo-200">Aluno · Online</p>
        </div>
        <button
          onClick={handleRequestScreenshot}
          disabled={screenshotRequesting}
          title="Solicitar screenshot"
          className="flex items-center gap-1 text-xs bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white px-2 py-1.5 rounded-lg transition-colors shrink-0"
        >
          {screenshotRequesting ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b border-white" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          <span>Print</span>
        </button>
        <button onClick={handleLogout} className="text-xs text-indigo-200 hover:text-white ml-1">
          Sair
        </button>
      </div>

      {screenshotError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {screenshotError}
        </div>
      )}

      {newScreenshotId && tab === 'chat' && (
        <button
          onClick={() => { setTab('screenshots'); setNewScreenshotId(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-green-50 border-b border-green-200 text-green-800 text-xs hover:bg-green-100 transition-colors shrink-0"
        >
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Screenshot recebido! Clique para ver
        </button>
      )}

      <div className="flex border-b bg-white shrink-0">
        <button
          onClick={() => setTab('chat')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === 'chat' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Chat
        </button>
        <button
          onClick={() => { setTab('screenshots'); setNewScreenshotId(null); }}
          className={`flex-1 py-2 text-xs font-medium transition-colors relative ${tab === 'screenshots' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Screenshots
          {newScreenshotId && tab !== 'screenshots' && (
            <span className="absolute top-1.5 right-6 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
      </div>

      {tab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-400 mt-8">Nenhuma mensagem ainda</p>
            )}
            {messages.map((msg) => {
              const isMine = msg.senderId === userId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMine ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-800'}`}>
                    <p>{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 bg-white border-t shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Mensagem..."
              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-full w-9 h-9 flex items-center justify-center shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto bg-white">
          {screenshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              <p className="text-xs text-gray-400">Nenhum screenshot ainda</p>
              <p className="text-[10px] text-gray-300">Use o botão "Print" para solicitar</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {screenshots.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition-colors">
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">Screenshot</p>
                    <p className="text-[10px] text-gray-400">{formatDate(s.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => openPreview(s.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                  >
                    Ver
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {previewOpen && (
        <div
          className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50"
          onClick={closePreview}
        >
          <div className="relative w-full h-full flex flex-col items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closePreview}
              className="absolute top-3 right-3 text-white bg-black/40 hover:bg-black/60 rounded-full w-7 h-7 flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt="Screenshot"
                  className="max-w-full max-h-full rounded-lg shadow-xl object-contain"
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(`fullscreen.html?id=${previewScreenshotId}`) })}
                    className="flex items-center gap-1.5 text-xs bg-white/90 hover:bg-white text-gray-800 font-medium px-3 py-1.5 rounded-lg shadow transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Tela cheia
                  </button>
                  <a
                    href={previewUrl}
                    download={`screenshot-${student.name}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`}
                    className="flex items-center gap-1.5 text-xs bg-white/90 hover:bg-white text-gray-800 font-medium px-3 py-1.5 rounded-lg shadow transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Baixar
                  </a>
                </div>
              </>
            ) : (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

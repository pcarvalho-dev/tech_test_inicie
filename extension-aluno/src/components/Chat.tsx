import { useEffect, useRef, useState, useCallback } from 'react';
import { getStorage, clearStorage } from '@/lib/storage';
import { createMqttClient } from '@/lib/mqtt-client';
import { sendMessage, getChatHistory, getProfessors, getOnlineUsers, type ChatMessage, type UserResult } from '@/lib/api';
import type { MqttClient } from 'mqtt';

interface Props {
  onLogout: () => void;
}

interface ScreenshotStatus {
  active: boolean;
}

export default function ChatPage({ onLogout }: Props) {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [professors, setProfessors] = useState<UserResult[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotStatus>({ active: false });
  const [sending, setSending] = useState(false);
  const mqttRef = useRef<MqttClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const presencePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPresence = useCallback(async () => {
    const online = await getOnlineUsers();
    setOnlineIds(new Set(online.map((u) => u.userId)));
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    getProfessors().then(setProfessors);
    refreshPresence();
    presencePollRef.current = setInterval(refreshPresence, 10_000);
    return () => {
      if (presencePollRef.current) clearInterval(presencePollRef.current);
    };
  }, [refreshPresence]);

  useEffect(() => {
    getStorage(['token', 'user']).then(({ token, user }) => {
      if (!token || !user) {
        onLogout();
        return;
      }
      setUserId(user.id);
      setUserName(user.name);

      const client = createMqttClient(user.id, token);
      mqttRef.current = client;

      client.on('connect', () => {
        client.subscribe(`screenshot/request/${user.id}`, { qos: 1 });
        client.subscribe('chat/+', { qos: 1 });
        client.subscribe('presence/+', { qos: 0 });
      });

      client.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());

          if (topic === `screenshot/request/${user.id}`) {
            setScreenshot({ active: true });
            chrome.runtime.sendMessage(
              { type: 'capture', data: { requestId: data.requestId, professorId: data.professorId, alunoId: user.id } },
              () => setScreenshot({ active: false }),
            );
          }

          if (topic.startsWith('chat/') && data.receiverId === user.id) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === data.id)) return prev;
              return [...prev, data].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
          }

          if (topic.startsWith('presence/')) {
            const presenceUserId = topic.split('/')[1];
            setOnlineIds((prev) => new Set([...prev, presenceUserId]));
            setLastUpdated(new Date());
          }
        } catch {
          // ignore
        }
      });
    });

    return () => { mqttRef.current?.end(); };
  }, [onLogout]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory(id: string) {
    if (!id || !userId) return;
    try {
      const { data } = await getChatHistory(id);
      setMessages(data.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch { /* ignore */ }
  }

  function selectReceiver(user: UserResult) {
    setReceiverId(user.id);
    setReceiverName(user.name);
    loadHistory(user.id);
  }

  function formatLastUpdated() {
    if (!lastUpdated) return '';
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 5) return 'agora mesmo';
    if (diffSec < 60) return `há ${diffSec}s`;
    return `há ${Math.floor(diffSec / 60)}min`;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !receiverId) return;
    setSending(true);
    try {
      const msg = await sendMessage(receiverId, input.trim());
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setInput('');
    } catch { /* ignore */ }
    finally { setSending(false); }
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

  return (
    <div className="flex flex-col w-[400px] h-[600px] bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white shrink-0">
        <div>
          <p className="font-semibold text-sm">{userName}</p>
          <p className="text-xs text-blue-200">Aluno</p>
        </div>
        <button onClick={handleLogout} className="text-xs text-blue-200 hover:text-white">
          Sair
        </button>
      </div>

      {screenshot.active && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800 flex items-center gap-2 shrink-0">
          <div className="animate-pulse w-2 h-2 rounded-full bg-yellow-500" />
          Capturando screenshot...
        </div>
      )}

      {!receiverId ? (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Professores</span>
            <button
              onClick={refreshPresence}
              className="text-gray-400 hover:text-blue-600 transition-colors"
              title="Atualizar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {professors.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-gray-400">Nenhum professor cadastrado</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {professors.map((prof) => {
                const isOnline = onlineIds.has(prof.id);
                return (
                  <li key={prof.id} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{prof.name}</p>
                      <p className="text-xs text-gray-400 truncate">{prof.email}</p>
                    </div>
                    <button
                      onClick={() => selectReceiver(prof)}
                      className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Conversar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {lastUpdated && (
            <p className="text-center text-[10px] text-gray-300 py-2">
              Atualizado {formatLastUpdated()}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 py-2 bg-white border-b shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${onlineIds.has(receiverId) ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-700 font-medium">{receiverName}</span>
            </div>
            <button onClick={() => { setReceiverId(''); setReceiverName(''); setMessages([]); }} className="text-xs text-gray-400 hover:text-red-500">
              voltar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-400 mt-8">
                Nenhuma mensagem ainda
              </p>
            )}
            {messages.map((msg) => {
              const isMine = msg.senderId === userId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMine ? 'bg-blue-600 text-white' : 'bg-white border text-gray-800'}`}>
                    <p>{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-blue-200' : 'text-gray-400'}`}>
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
              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full w-9 h-9 flex items-center justify-center shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}

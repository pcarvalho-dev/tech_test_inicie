import { useEffect, useRef, useState } from 'react';
import { getStorage, clearStorage } from '@/lib/storage';
import { createMqttClient } from '@/lib/mqtt-client';
import { sendMessage, getChatHistory, searchUsers, type ChatMessage, type UserResult } from '@/lib/api';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [screenshot, setScreenshot] = useState<ScreenshotStatus>({ active: false });
  const [sending, setSending] = useState(false);
  const mqttRef = useRef<MqttClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStorage(['token', 'user']).then(({ token, user }) => {
      if (!token || !user) {
        onLogout();
        return;
      }
      setUserId(user.id);
      setUserName(user.name);

      const client = createMqttClient(user.id);
      mqttRef.current = client;

      client.on('connect', () => {
        client.subscribe(`screenshot/request/${user.id}`, { qos: 1 });
        client.subscribe('chat/+', { qos: 1 });
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

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const results = await searchUsers(q);
    setSearchResults(results);
  }

  function selectReceiver(user: UserResult) {
    setReceiverId(user.id);
    setReceiverName(user.name);
    setSearchQuery('');
    setSearchResults([]);
    loadHistory(user.id);
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white shrink-0">
        <div>
          <p className="font-semibold text-sm">{userName}</p>
          <p className="text-xs text-blue-200">Aluno</p>
        </div>
        <button onClick={handleLogout} className="text-xs text-blue-200 hover:text-white">
          Sair
        </button>
      </div>

      {/* Screenshot indicator */}
      {screenshot.active && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800 flex items-center gap-2 shrink-0">
          <div className="animate-pulse w-2 h-2 rounded-full bg-yellow-500" />
          Capturando screenshot...
        </div>
      )}

      {/* Receiver selector */}
      <div className="px-4 py-2 bg-white border-b shrink-0 relative">
        {receiverId ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-700 font-medium">Conversa com: <span className="text-blue-600">{receiverName}</span></span>
            <button onClick={() => { setReceiverId(''); setReceiverName(''); setMessages([]); }} className="text-xs text-gray-400 hover:text-red-500">trocar</button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar professor por nome ou email..."
              className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            {searchResults.length > 0 && (
              <ul className="absolute left-0 right-0 top-full bg-white border border-t-0 rounded-b shadow-lg z-10 max-h-40 overflow-y-auto">
                {searchResults.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => selectReceiver(u)}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-blue-50 flex justify-between items-center"
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-gray-400">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-8">
            {receiverId ? 'Nenhuma mensagem ainda' : 'Informe o ID do professor para começar'}
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

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 bg-white border-t shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={receiverId ? 'Mensagem...' : 'Informe o ID do professor'}
          disabled={!receiverId}
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !receiverId || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full w-9 h-9 flex items-center justify-center shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

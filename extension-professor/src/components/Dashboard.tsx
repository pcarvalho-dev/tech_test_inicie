import { useEffect, useRef, useState, useCallback } from 'react';
import { getStorage, clearStorage } from '@/lib/storage';
import { createMqttClient } from '@/lib/mqtt-client';
import { getAllStudents, getOnlineStudents, type OnlineStudent, type Student } from '@/lib/api';
import type { MqttClient } from 'mqtt';

interface Props {
  onStartChat: (student: OnlineStudent) => void;
  onLogout: () => void;
}

interface StudentWithStatus extends Student {
  online: boolean;
}

export default function DashboardPage({ onStartChat, onLogout }: Props) {
  const [userName, setUserName] = useState('');
  const [students, setStudents] = useState<StudentWithStatus[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const mqttRef = useRef<MqttClient | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [all, online] = await Promise.all([getAllStudents(), getOnlineStudents()]);
      const onlineIds = new Set(online.map((s) => s.userId));
      const merged: StudentWithStatus[] = all.map((s) => ({ ...s, online: onlineIds.has(s.id) }));
      merged.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
      setStudents(merged);
    } catch {
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    getStorage(['user']).then(({ user }) => {
      if (user) setUserName(user.name);
    });

    refresh();
    pollRef.current = setInterval(refresh, 10_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    getStorage(['token', 'user']).then(({ token, user }) => {
      if (!token || !user) return;

      const client = createMqttClient(user.id, token);
      mqttRef.current = client;

      client.on('connect', () => {
        client.subscribe('presence/+', { qos: 0 });
        refresh();
      });

      client.on('message', (topic, payload) => {
        if (!topic.startsWith('presence/')) return;
        try {
          const data = JSON.parse(payload.toString());
          if (data.role !== 'aluno') return;
          const userId = topic.split('/')[1];
          setStudents((prev) =>
            prev.map((s) => (s.id === userId ? { ...s, online: true } : s)),
          );
          setLastUpdated(new Date());
        } catch {
        }
      });
    });

    return () => { mqttRef.current?.end(); };
  }, []);

  function handleLogout() {
    clearStorage();
    chrome.runtime.sendMessage({ type: 'stop-presence' });
    mqttRef.current?.end();
    onLogout();
  }

  function formatLastUpdated() {
    if (!lastUpdated) return '';
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 5) return 'agora mesmo';
    if (diffSec < 60) return `há ${diffSec}s`;
    return `há ${Math.floor(diffSec / 60)}min`;
  }

  const onlineCount = students.filter((s) => s.online).length;

  return (
    <div className="flex flex-col w-[400px] h-[560px] bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
        <div>
          <p className="font-semibold text-sm">{userName}</p>
          <p className="text-xs text-indigo-200">Professor</p>
        </div>
        <button onClick={handleLogout} className="text-xs text-indigo-200 hover:text-white">
          Sair
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-white border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Alunos</span>
          <span className="text-xs bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">
            {onlineCount} online
          </span>
          {students.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-1.5 py-0.5 rounded-full">
              {students.length} total
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-gray-400 hover:text-indigo-600 transition-colors"
          title="Atualizar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-xs text-gray-400">Nenhum aluno cadastrado</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {students.map((student) => (
              <li key={student.id} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-indigo-600">
                    {student.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${student.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <p className="text-sm font-medium text-gray-800 truncate">{student.name}</p>
                  </div>
                  <p className="text-xs text-gray-400">{student.online ? 'Online' : 'Offline'}</p>
                </div>
                <button
                  onClick={() => onStartChat({ userId: student.id, name: student.name, role: 'aluno' })}
                  className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Conversar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lastUpdated && (
        <div className="px-4 py-2 bg-white border-t shrink-0">
          <p className="text-[10px] text-gray-300 text-center">
            Atualizado {formatLastUpdated()}
          </p>
        </div>
      )}
    </div>
  );
}

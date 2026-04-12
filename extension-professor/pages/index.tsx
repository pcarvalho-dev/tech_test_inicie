import { useState, useEffect } from 'react';
import LoginPage from '@/components/Login';
import DashboardPage from '@/components/Dashboard';
import ChatPage from '@/components/Chat';
import type { OnlineStudent } from '@/lib/api';

type Page = 'loading' | 'login' | 'dashboard' | 'chat';

export default function IndexPage() {
  const [page, setPage] = useState<Page>('loading');
  const [selectedStudent, setSelectedStudent] = useState<OnlineStudent | null>(null);

  useEffect(() => {
    chrome.storage.local.get(['token'], ({ token }) => {
      setPage(token ? 'dashboard' : 'login');
    });
  }, []);

  if (page === 'loading') {
    return (
      <div className="flex items-center justify-center w-[400px] h-[560px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (page === 'login') {
    return <LoginPage onLogin={() => setPage('dashboard')} />;
  }

  if (page === 'chat' && selectedStudent) {
    return (
      <ChatPage
        student={selectedStudent}
        onBack={() => setPage('dashboard')}
        onLogout={() => setPage('login')}
      />
    );
  }

  return (
    <DashboardPage
      onStartChat={(student) => { setSelectedStudent(student); setPage('chat'); }}
      onLogout={() => setPage('login')}
    />
  );
}

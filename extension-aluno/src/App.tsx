import { useState, useEffect } from 'react';
import LoginPage from './pages/Login';
import ChatPage from './pages/Chat';

type Page = 'loading' | 'login' | 'chat';

export default function App() {
  const [page, setPage] = useState<Page>('loading');

  useEffect(() => {
    chrome.storage.local.get(['token'], ({ token }) => {
      setPage(token ? 'chat' : 'login');
    });
  }, []);

  if (page === 'loading') {
    return (
      <div className="flex items-center justify-center w-[400px] h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (page === 'login') {
    return <LoginPage onLogin={() => setPage('chat')} />;
  }

  return <ChatPage onLogout={() => setPage('login')} />;
}

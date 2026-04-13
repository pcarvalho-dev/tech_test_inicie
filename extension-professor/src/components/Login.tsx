import { useState } from 'react';
import { login, register } from '@/lib/api';
import { setStorage } from '@/lib/storage';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = mode === 'login'
        ? await login(email, password)
        : await register(name, email, password);

      if (data.user.role !== 'professor') {
        throw new Error('Acesso restrito a professores');
      }

      await setStorage({
        token: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: 'professor',
        },
      });

      chrome.runtime.sendMessage({ type: 'start-presence' });
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-[400px] min-h-[500px] p-6 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2 text-indigo-700">OctoClass</h1>
        <p className="text-center text-sm text-gray-500 mb-6">Extensão do Professor</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Seu nome completo"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="professor@escola.com"
              autoFocus={mode === 'login'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === 'login' ? (
            <>
              Não tem conta?{' '}
              <button
                onClick={() => switchMode('register')}
                className="text-indigo-600 hover:underline font-medium"
              >
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já tem conta?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-indigo-600 hover:underline font-medium"
              >
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

'use client';

/** Login — POST /auth/login, stash JWT + user, go to dashboard. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gem } from 'lucide-react';
import { api, session, type SessionUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { email, password });
      session.save(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-gold-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-md">
            <Gem size={22} strokeWidth={2.2} />
          </span>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Jewellery ERP</h1>
            <p className="mt-0.5 text-sm text-stone-500">Sign in to your organisation</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Email</label>
            <input className="input" type="email" placeholder="you@shop.in" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Password</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="space-y-1 border-t border-stone-100 pt-3 text-center">
            <p className="hint">demo: owner@demo.in / demo1234</p>
            <p className="hint">
              new shop?{' '}
              <a href="/register" className="font-medium text-gold-700 hover:text-gold-800">
                create an organisation
              </a>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

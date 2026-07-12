'use client';

/**
 * Create a new ORGANISATION (tenant) — the SaaS signup.
 *
 * Each registration provisions an isolated tenant: the organisation, its
 * first branch, and the OWNER account, all in one transaction. Data never
 * crosses organisations (tenant-scoped query layer, see ARCHITECTURE.md).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gem } from 'lucide-react';
import { api, session, type SessionUser } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({
    tenantName: '',
    stateCode: '27',
    branchName: 'Main Branch',
    ownerName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('POST', '/auth/register', {
        tenantName: f.tenantName,
        stateCode: f.stateCode,
        branchName: f.branchName,
        owner: { email: f.email, name: f.ownerName, password: f.password },
      });
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', {
        email: f.email,
        password: f.password,
      });
      session.save(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'registration failed');
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-600">{label}</label>
      {node}
    </div>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-gold-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-md">
            <Gem size={22} strokeWidth={2.2} />
          </span>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Create your organisation</h1>
            <p className="mt-0.5 max-w-xs text-sm text-stone-500">
              Fully isolated — your own branches, staff, stock, rates and billing.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-3.5">
          {field('Organisation / shop name', <input className="input" value={f.tenantName} onChange={(e) => setF({ ...f, tenantName: e.target.value })} />)}
          <div className="grid grid-cols-2 gap-3">
            {field('GST state code', <input className="input" placeholder="27" value={f.stateCode} onChange={(e) => setF({ ...f, stateCode: e.target.value })} />)}
            {field('First branch', <input className="input" value={f.branchName} onChange={(e) => setF({ ...f, branchName: e.target.value })} />)}
          </div>
          {field('Owner name', <input className="input" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />)}
          {field('Owner email', <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />)}
          {field('Password (min 8 chars)', <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />)}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create organisation'}
          </button>
          <p className="hint border-t border-stone-100 pt-3 text-center">
            already have one?{' '}
            <Link href="/login" className="font-medium text-gold-700 hover:text-gold-800">
              sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

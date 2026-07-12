'use client';

/**
 * Create a new ORGANISATION (tenant) — the SaaS signup.
 *
 * Each registration provisions an isolated tenant: the organisation, its
 * first branch, and the OWNER account, all in one transaction. Data never
 * crosses organisations (tenant-scoped query layer, see ARCHITECTURE.md).
 * Any number of organisations can be created this way.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
      // auto-login as the new owner
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

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="card w-96 space-y-3">
        <h1 className="text-lg font-semibold">Create your organisation</h1>
        <p className="text-xs text-neutral-500">
          Each organisation is fully isolated — its own branches, staff, stock, rates and billing.
        </p>
        <input className="input" placeholder="organisation / shop name" value={f.tenantName} onChange={(e) => setF({ ...f, tenantName: e.target.value })} />
        <div className="flex gap-2">
          <input className="input" placeholder="GST state code (e.g. 27)" value={f.stateCode} onChange={(e) => setF({ ...f, stateCode: e.target.value })} />
          <input className="input" placeholder="first branch name" value={f.branchName} onChange={(e) => setF({ ...f, branchName: e.target.value })} />
        </div>
        <input className="input" placeholder="owner name" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
        <input className="input" type="email" placeholder="owner email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className="input" type="password" placeholder="password (min 8 chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create organisation'}
        </button>
        <p className="text-xs text-neutral-400">
          already have one? <Link href="/login" className="text-amber-700">sign in</Link>
        </p>
      </form>
    </main>
  );
}

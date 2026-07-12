'use client';

/**
 * Customers — the recurring-customer view.
 *
 * One customer accumulates MANY things over time; selecting a customer
 * shows their full history side by side:
 * - system documents (tax invoices / estimates / challans issued here)
 * - uploaded PAPER bills (photographed/scanned old bills), with an
 *   upload form (JPEG/PNG/WebP/PDF ≤ 10 MB + note + bill date)
 * Files are JWT-protected, so viewing fetches a blob and opens it.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, apiBlob, API_URL, inr, session } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stateCode: string;
  gstin: string | null;
  pan: string | null;
  kycDocs: { docType: string; docNumber: string }[];
  createdAt: string;
}
interface Doc {
  id: string;
  docNumber: string;
  docType: string;
  status: string;
  issuedAt: string;
  grandTotalPaise: number;
}
interface PaperBill {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  billDate: string | null;
  uploadedAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [bills, setBills] = useState<PaperBill[]>([]);
  const [msg, setMsg] = useState('');

  // upload form
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [billDate, setBillDate] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useCallback(() => {
    void api<Customer[]>('GET', `/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setCustomers);
  }, [q]);
  useEffect(search, [search]);

  async function select(c: Customer) {
    setSelected(c);
    setMsg('');
    const [d, b] = await Promise.all([
      api<Doc[]>('GET', `/documents?customerId=${c.id}`),
      api<PaperBill[]>('GET', `/customers/${c.id}/paper-bills`),
    ]);
    setDocs(d);
    setBills(b);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selected) return;
    setBusy(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (note) form.append('note', note);
      if (billDate) form.append('billDate', billDate);
      const res = await fetch(`${API_URL}/customers/${selected.id}/paper-bills`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.token()}` },
        body: form, // multipart — browser sets the boundary
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && (body.message?.message ?? body.message)) || res.statusText);
      }
      setMsg('paper bill uploaded');
      setFile(null);
      setNote('');
      setBillDate('');
      setBills(await api<PaperBill[]>('GET', `/customers/${selected.id}/paper-bills`));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function view(bill: PaperBill) {
    const blob = await apiBlob(`/paper-bills/${bill.id}/file`);
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Customers</h1>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <section className="card">
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="search name / phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-[32rem] space-y-1 overflow-auto">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                    selected?.id === c.id ? 'bg-amber-50 font-medium text-amber-800' : ''
                  }`}
                  onClick={() => void select(c)}
                >
                  {c.name}
                  <span className="block text-xs text-neutral-400">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <div className="space-y-6">
            <section className="card">
              <h2 className="font-medium">{selected.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {selected.phone} · state {selected.stateCode}
                {selected.gstin ? ` · GSTIN ${selected.gstin}` : ''}
                {selected.pan ? ` · PAN ${selected.pan}` : ''}
              </p>
              {selected.kycDocs.length > 0 && (
                <p className="mt-1 text-xs text-neutral-400">
                  KYC: {selected.kycDocs.map((k) => `${k.docType} ${k.docNumber}`).join(', ')}
                </p>
              )}
            </section>

            <section className="card">
              <h3 className="mb-2 font-medium">Documents issued here ({docs.length})</h3>
              {docs.length === 0 && <p className="text-sm text-neutral-400">none yet</p>}
              <table className="w-full">
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="td font-mono text-xs">{d.docNumber}</td>
                      <td className="td">{d.docType}</td>
                      <td className="td">{d.status}</td>
                      <td className="td">{new Date(d.issuedAt).toLocaleDateString()}</td>
                      <td className="td text-right">{inr(d.grandTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3 className="mb-2 font-medium">Paper bills ({bills.length})</h3>
              <form onSubmit={upload} className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <input className="input w-56" placeholder="note (e.g. old bill 2019)" value={note} onChange={(e) => setNote(e.target.value)} />
                <input className="input w-40" type="date" title="date on the bill" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                <button className="btn" disabled={!file || busy}>
                  {busy ? 'Uploading…' : 'Upload'}
                </button>
              </form>
              {bills.length === 0 && <p className="text-sm text-neutral-400">no paper bills uploaded yet</p>}
              <table className="w-full">
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <td className="td">{b.fileName}</td>
                      <td className="td text-neutral-500">{b.note ?? '—'}</td>
                      <td className="td">{b.billDate ? new Date(b.billDate).toLocaleDateString() : '—'}</td>
                      <td className="td text-xs text-neutral-400">
                        {(b.sizeBytes / 1024).toFixed(0)} KB · {new Date(b.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="td">
                        <button className="btn-secondary" onClick={() => void view(b)}>view</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">select a customer to see all their documents and paper bills</p>
        )}
      </div>
    </div>
  );
}

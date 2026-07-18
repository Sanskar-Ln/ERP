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
import { Badge, EmptyState, MobileListCard, PageHeader, SkeletonRows } from '@/components/ui';

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
interface ExtractedFields {
  billNo?: string;
  billDate?: string;
  totalPaise?: number;
  amountsPaise: number[];
  weightsG: string[];
  ratePaisePer10g?: number;
  phones: string[];
}
interface PaperBill {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  billDate: string | null;
  uploadedAt: string;
  extracted: { text: string; fields: ExtractedFields } | null;
  extractedAt: string | null;
}

export default function CustomersPage() {
  // null = still loading (skeleton shown), [] = loaded and empty
  const [customers, setCustomers] = useState<Customer[] | null>(null);
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

  /**
   * OCR the paper bill server-side and show the recognized fields.
   * The result is a DRAFT for the human to copy into the online bill —
   * old bills are often handwritten, so nothing is auto-committed.
   */
  const [reading, setReading] = useState<string | null>(null);
  const [showExtract, setShowExtract] = useState<PaperBill | null>(null);
  async function readBill(bill: PaperBill) {
    setReading(bill.id);
    setMsg('');
    try {
      const updated = await api<PaperBill>('POST', `/paper-bills/${bill.id}/extract`);
      setShowExtract(updated);
      if (selected) setBills(await api<PaperBill[]>('GET', `/customers/${selected.id}/paper-bills`));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setReading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="One customer, their whole history — system documents and uploaded paper bills" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <section className="card">
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="search name / phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {customers === null ? (
            <SkeletonRows rows={6} />
          ) : customers.length === 0 ? (
            <EmptyState>no customers match</EmptyState>
          ) : (
            <ul className="max-h-[32rem] space-y-1 overflow-auto">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    className={`min-h-11 w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-stone-100 sm:min-h-0 ${
                      selected?.id === c.id ? 'bg-gold-50 font-medium text-gold-800 ring-1 ring-gold-200/70' : ''
                    }`}
                    onClick={() => void select(c)}
                  >
                    {c.name}
                    <span className="block text-xs text-neutral-400">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected ? (
          <div className="space-y-6">
            <section className="card">
              <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
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
              <h3 className="section-title mb-3">Documents issued here ({docs.length})</h3>
              {docs.length === 0 && <EmptyState>no documents issued to this customer yet</EmptyState>}
              {/* phone: cards */}
              <div className="space-y-2.5 sm:hidden">
                {docs.map((d) => (
                  <MobileListCard
                    key={d.id}
                    title={<span className="font-mono text-xs">{d.docNumber}</span>}
                    badges={<><Badge status={d.docType} /><Badge status={d.status} /></>}
                    right={inr(d.grandTotalPaise)}
                    meta={new Date(d.issuedAt).toLocaleDateString()}
                  />
                ))}
              </div>
              {/* desktop: dense table */}
              <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[480px]">
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="td font-mono text-xs">{d.docNumber}</td>
                      <td className="td"><Badge status={d.docType} /></td>
                      <td className="td"><Badge status={d.status} /></td>
                      <td className="td">{new Date(d.issuedAt).toLocaleDateString()}</td>
                      <td className="td num font-medium">{inr(d.grandTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>

            <section className="card">
              <h3 className="section-title mb-3">Paper bills ({bills.length})</h3>
              <form onSubmit={upload} className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <input className="input w-full sm:w-56" placeholder="note (e.g. old bill 2019)" value={note} onChange={(e) => setNote(e.target.value)} />
                <input className="input w-full sm:w-40" type="date" title="date on the bill" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                <button className="btn" disabled={!file || busy}>
                  {busy ? 'Uploading…' : 'Upload'}
                </button>
              </form>
              {bills.length === 0 && <EmptyState>no paper bills uploaded yet — photograph an old bill and upload it here</EmptyState>}
              {/* phone: cards with the same actions */}
              <div className="space-y-2.5 sm:hidden">
                {bills.map((b) => (
                  <MobileListCard
                    key={b.id}
                    title={b.fileName}
                    meta={
                      <>
                        {b.note ? `${b.note} · ` : ''}
                        {b.billDate ? `bill ${new Date(b.billDate).toLocaleDateString()} · ` : ''}
                        {(b.sizeBytes / 1024).toFixed(0)} KB · uploaded {new Date(b.uploadedAt).toLocaleDateString()}
                      </>
                    }
                    actions={
                      <>
                        <button className="btn-secondary btn-xs" onClick={() => void view(b)}>view</button>
                        {b.mimeType.startsWith('image/') && (
                          <button className="btn-secondary btn-xs" disabled={reading === b.id} onClick={() => void readBill(b)}>
                            {reading === b.id ? 'reading…' : b.extracted ? 're-read' : 'read (OCR)'}
                          </button>
                        )}
                        {b.extracted && (
                          <button className="btn-secondary btn-xs" onClick={() => setShowExtract(b)}>fields</button>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
              {/* desktop: dense table */}
              <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[480px]">
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
                        <div className="flex gap-1">
                          <button className="btn-secondary btn-xs" onClick={() => void view(b)}>view</button>
                          {b.mimeType.startsWith('image/') && (
                            <button className="btn-secondary btn-xs" disabled={reading === b.id} onClick={() => void readBill(b)}>
                              {reading === b.id ? 'reading…' : b.extracted ? 're-read' : 'read (OCR)'}
                            </button>
                          )}
                          {b.extracted && (
                            <button className="btn-secondary btn-xs" onClick={() => setShowExtract(b)}>fields</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>

              {showExtract?.extracted && (
                <div className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-4 text-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">Read from “{showExtract.fileName}” — review before using</span>
                    <button className="text-xs text-neutral-500" onClick={() => setShowExtract(null)}>close</button>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
                    <div><dt className="text-xs text-neutral-500">Bill no</dt><dd>{showExtract.extracted.fields.billNo ?? '—'}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Bill date</dt><dd>{showExtract.extracted.fields.billDate ?? '—'}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Total</dt><dd>{showExtract.extracted.fields.totalPaise != null ? inr(showExtract.extracted.fields.totalPaise) : '—'}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Rate / 10 g</dt><dd>{showExtract.extracted.fields.ratePaisePer10g != null ? inr(showExtract.extracted.fields.ratePaisePer10g) : '—'}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Weights (g)</dt><dd>{showExtract.extracted.fields.weightsG.join(', ') || '—'}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Phones</dt><dd>{showExtract.extracted.fields.phones.join(', ') || '—'}</dd></div>
                  </dl>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-500">full recognized text</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-neutral-600">{showExtract.extracted.text}</pre>
                  </details>
                  <p className="mt-2 text-xs text-neutral-500">
                    OCR of old bills is best-effort — copy what's correct into the new bill on the Billing page.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">select a customer to see all their documents and paper bills</p>
        )}
      </div>
    </div>
  );
}

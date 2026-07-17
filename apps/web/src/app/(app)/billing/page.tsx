'use client';

/**
 * Billing: build a cart (customer + in-stock items + optional old-gold
 * exchange), issue any of the three document types from it, list issued
 * documents, and drill into one (tax lines, convert, cancel).
 */
import { useEffect, useState } from 'react';
import { api, apiBlob, inr, isAdmin } from '@/lib/api';
import { Badge, PageHeader } from '@/components/ui';

interface Customer {
  id: string;
  name: string;
  phone: string;
}
interface Item {
  id: string;
  itemCode: string;
  name: string;
  status: string;
}
interface Metal {
  id: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface Doc {
  id: string;
  docType: string;
  docNumber: string;
  status: string;
  issuedAt: string;
  grandTotalPaise: number;
  totalTaxPaise: number;
  convertedFromId: string | null;
}
interface DocDetail extends Doc {
  subtotalPaise: number;
  discountPaise: number;
  exchangeValuePaise: number;
  taxableValuePaise: number;
  lines: { lineNo: number; description: string; hsnCode: string; grossPaise: number; taxablePaise: number }[];
  taxLines: { label: string; taxablePaise: number; taxPaise: number }[];
}

/**
 * CSV report downloads (ADMIN only): the period sales register and the
 * GST summary. Files are JWT-protected, so they are fetched as blobs and
 * saved via a temporary anchor. The API enforces the same RBAC.
 */
function ReportDownloads() {
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [err, setErr] = useState('');
  if (!isAdmin()) return null; // reports are ADMIN-only (API enforces too)

  async function download(kind: 'documents' | 'gst-summary') {
    setErr('');
    try {
      const blob = await apiBlob(`/reports/${kind}.csv?from=${from}&to=${to}T23:59:59Z`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${kind}-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'download failed');
    }
  }

  return (
    <section className="card">
      <h2 className="section-title mb-3">Reports (CSV)</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-sm text-neutral-400">to</span>
        <input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={() => void download('documents')}>Bills register</button>
        <button className="btn-secondary" onClick={() => void download('gst-summary')}>GST summary</button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Bills register: one row per document with taxes split CGST/SGST/IGST. GST summary: totals per rate
        bucket over issued tax invoices — the starting point for filing.
      </p>
    </section>
  );
}

export default function BillingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [metals, setMetals] = useState<Metal[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [msg, setMsg] = useState('');

  const [customerId, setCustomerId] = useState('');
  // Recurring-customer view: ALL previous bills of the selected customer,
  // shown right in the cart builder — same behaviour as the mobile app.
  const [history, setHistory] = useState<Doc[]>([]);
  const [cartItemIds, setCartItemIds] = useState<string[]>([]);
  const [pickItem, setPickItem] = useState('');
  // optional old-gold exchange
  const [exOn, setExOn] = useState(false);
  const [exPurityId, setExPurityId] = useState('');
  const [exNet, setExNet] = useState('');
  const [exRate, setExRate] = useState('');

  const load = () => {
    void api<Doc[]>('GET', '/documents').then(setDocs);
    void api<Item[]>('GET', '/items?status=IN_STOCK').then(setItems);
  };
  useEffect(() => {
    void api<Customer[]>('GET', '/customers').then(setCustomers);
    void api<Metal[]>('GET', '/metals').then(setMetals);
    load();
  }, []);

  // load the customer's bill history the moment they're picked
  useEffect(() => {
    if (!customerId) {
      setHistory([]);
      return;
    }
    void api<Doc[]>('GET', `/documents?customerId=${customerId}`).then(setHistory);
  }, [customerId]);

  async function issue(docType: 'TAX_INVOICE' | 'ESTIMATE' | 'DELIVERY_CHALLAN') {
    const user = JSON.parse(localStorage.getItem('erp.user') ?? '{}') as { branchId?: string };
    if (!user.branchId) return setMsg('user has no branch');
    const exchanges = [];
    if (exOn && exPurityId && exNet && exRate) {
      const metal = metals.find((m) => m.purities.some((p) => p.id === exPurityId));
      exchanges.push({
        metalId: metal!.id,
        purityId: exPurityId,
        grossWeightG: exNet,
        netWeightG: exNet,
        ratePaisePer10g: Math.round(Number(exRate) * 100),
      });
    }
    try {
      const doc = await api<DocDetail & { warnings: string[] }>('POST', '/documents', {
        docType,
        cart: {
          customerId,
          branchId: user.branchId,
          lines: cartItemIds.map((itemId) => ({ itemId })),
          oldGoldExchanges: exchanges,
          cartDiscountPaise: 0,
        },
      });
      setMsg(`${doc.docNumber} issued${doc.warnings?.length ? ` — ${doc.warnings.join('; ')}` : ''}`);
      setCartItemIds([]);
      load();
      setDetail(doc);
      void api<Doc[]>('GET', `/documents?customerId=${customerId}`).then(setHistory);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function open(id: string) {
    setDetail(await api<DocDetail>('GET', `/documents/${id}`));
  }

  async function convert(id: string) {
    try {
      const inv = await api<DocDetail>('POST', `/documents/${id}/convert`);
      setMsg(`converted → ${inv.docNumber}`);
      load();
      setDetail(inv);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function cancel(id: string) {
    const reason = prompt('cancellation reason?');
    if (!reason) return;
    try {
      await api('POST', `/documents/${id}/cancel`, { reason });
      setMsg('cancelled');
      load();
      setDetail(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="One cart — Tax Invoice, Estimate or Delivery Challan, with GST computed by the engine" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="section-title">New document</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-full sm:w-64" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
          <select className="input w-full sm:w-72" value={pickItem} onChange={(e) => setPickItem(e.target.value)}>
            <option value="">add item…</option>
            {items.filter((i) => !cartItemIds.includes(i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.itemCode} — {i.name}</option>
            ))}
          </select>
          <button
            className="btn-secondary"
            onClick={() => {
              if (pickItem) {
                setCartItemIds([...cartItemIds, pickItem]);
                setPickItem('');
              }
            }}
          >
            Add to cart
          </button>
        </div>
        {customerId && history.length > 0 && (
          <div className="rounded-lg border-l-2 border-gold-200 bg-gold-50/60 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-gold-800">
              Previous bills of this customer ({history.length})
            </p>
            <ul className="space-y-1">
              {history.slice(0, 6).map((h) => (
                <li key={h.id}>
                  <button
                    className="flex w-full flex-wrap items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-gold-700 hover:bg-gold-100/60"
                    onClick={() => void open(h.id)}
                  >
                    <span className="font-mono">{h.docNumber}</span>
                    <Badge status={h.status} />
                    <span className="ml-auto font-medium tabular-nums">{inr(h.grandTotalPaise)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {history.length > 6 && (
              <p className="mt-1 text-[11px] text-gold-700/70">…and {history.length - 6} more on the Customers page</p>
            )}
          </div>
        )}
        {customerId && history.length === 0 && (
          <p className="text-xs text-stone-400">first bill for this customer</p>
        )}
        {cartItemIds.length > 0 && (
          <p className="text-sm">
            cart: {cartItemIds.map((id) => items.find((i) => i.id === id)?.itemCode ?? id).join(', ')}{' '}
            <button className="text-xs text-red-600" onClick={() => setCartItemIds([])}>clear</button>
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exOn} onChange={(e) => setExOn(e.target.checked)} />
          old-gold exchange (GST charged on value addition only)
        </label>
        {exOn && (
          <div className="flex gap-2">
            <select className="input w-44" value={exPurityId} onChange={(e) => setExPurityId(e.target.value)}>
              <option value="">purity…</option>
              {metals.flatMap((m) => m.purities.map((p) => (
                <option key={p.id} value={p.id}>{m.name} {p.label}</option>
              )))}
            </select>
            <input className="input w-32" placeholder="net g" value={exNet} onChange={(e) => setExNet(e.target.value)} />
            <input className="input w-40" placeholder="rate ₹/10g" value={exRate} onChange={(e) => setExRate(e.target.value)} />
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn" disabled={!customerId || cartItemIds.length === 0} onClick={() => void issue('TAX_INVOICE')}>Tax Invoice</button>
          <button className="btn-secondary" disabled={!customerId || cartItemIds.length === 0} onClick={() => void issue('ESTIMATE')}>Estimate</button>
          <button className="btn-secondary" disabled={!customerId || cartItemIds.length === 0} onClick={() => void issue('DELIVERY_CHALLAN')}>Delivery Challan</button>
        </div>
      </section>

      <ReportDownloads />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">Documents</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
            <thead>
              <tr><th className="th">Number</th><th className="th">Type</th><th className="th">Status</th><th className="th">Total</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => void open(d.id)}>
                  <td className="td font-mono text-xs">{d.docNumber}</td>
                  <td className="td"><Badge status={d.docType} /></td>
                  <td className="td"><Badge status={d.status} /></td>
                  <td className="td num font-medium">{inr(d.grandTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        {detail && (
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title flex items-center gap-2">{detail.docNumber} <Badge status={detail.status} /></h2>
              <div className="flex gap-2">
                {detail.docType === 'ESTIMATE' && detail.status === 'ISSUED' && (
                  <button className="btn" onClick={() => void convert(detail.id)}>Convert → Invoice</button>
                )}
                {detail.status === 'ISSUED' && isAdmin() && (
                  <button className="btn-secondary" onClick={() => void cancel(detail.id)}>Cancel</button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
              <thead>
                <tr><th className="th">#</th><th className="th">Description</th><th className="th">HSN</th><th className="th">Value</th></tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td className="td">{l.lineNo}</td>
                    <td className="td">{l.description}</td>
                    <td className="td">{l.hsnCode}</td>
                    <td className="td">{inr(l.grossPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="mt-3 space-y-1 text-sm">
              <div>Subtotal: {inr(detail.subtotalPaise)}</div>
              {detail.discountPaise > 0 && <div>Discount: −{inr(detail.discountPaise)}</div>}
              {detail.exchangeValuePaise > 0 && <div>Old gold: −{inr(detail.exchangeValuePaise)}</div>}
              <div>Taxable: {inr(detail.taxableValuePaise)}</div>
              {detail.taxLines.map((t, i) => (
                <div key={i} className="text-neutral-600">{t.label}: {inr(t.taxPaise)}</div>
              ))}
              <div className="text-base font-semibold">Grand total: {inr(detail.grandTotalPaise)}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

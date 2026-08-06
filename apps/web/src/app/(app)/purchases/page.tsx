'use client';

/**
 * Purchases (ADMIN) — procurement: supplier → PO → mark ordered →
 * weight-verified goods receipt (creates the intake Lot) → record
 * supplier payments. Items are then created against the lot on the
 * Inventory page (intake posts the PURCHASE_IN ledger row).
 */
import { useCallback, useEffect, useState } from 'react';
import { api, inr } from '@/lib/api';
import { Badge, EmptyState, MobileListCard, PageHeader, SkeletonRows } from '@/components/ui';

interface Supplier {
  id: string;
  name: string;
}
interface PoLine {
  lineNo: number;
  description: string;
  pieces: number;
  expectedWeightG: string | null;
  receivedWeightG: string | null;
  valuePaise: number;
}
interface Po {
  id: string;
  poNumber: string;
  supplierId: string;
  status: string;
  note: string | null;
  totalValuePaise: number;
  expectedAt: string | null;
  lines?: PoLine[];
  settlement: { paidPaise: number; duePaise: number; settled: boolean };
}

const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;

export default function PurchasesPage() {
  const [pos, setPos] = useState<Po[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [msg, setMsg] = useState('');

  // create form: one or more lines built up in state
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<{ description: string; pieces: number; expectedWeightG?: string; valuePaise: number }[]>([]);
  const [lDesc, setLDesc] = useState('');
  const [lWeight, setLWeight] = useState('');
  const [lValue, setLValue] = useState('');

  // supplier payment form (per selected PO)
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payMode, setPayMode] = useState('BANK_TRANSFER');
  const [payAmount, setPayAmount] = useState('');

  const load = useCallback(() => void api<Po[]>('GET', '/purchase-orders').then(setPos), []);
  useEffect(() => {
    void api<Supplier[]>('GET', '/suppliers').then(setSuppliers);
    load();
  }, [load]);

  function addLine() {
    if (!lDesc || !lValue) return;
    setLines([...lines, { description: lDesc, pieces: 1, expectedWeightG: lWeight || undefined, valuePaise: Math.round(Number(lValue) * 100) }]);
    setLDesc('');
    setLWeight('');
    setLValue('');
  }

  async function create() {
    const user = JSON.parse(localStorage.getItem('erp.user') ?? '{}') as { branchId?: string };
    if (!user.branchId || !supplierId || lines.length === 0) return;
    setMsg('');
    try {
      const po = await api<Po>('POST', '/purchase-orders', { supplierId, branchId: user.branchId, lines });
      setMsg(`${po.poNumber} created`);
      setLines([]);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function act(po: Po, action: 'order' | 'cancel' | 'receive') {
    setMsg('');
    try {
      if (action === 'receive') {
        await api('POST', `/purchase-orders/${po.id}/receive`, { lines: [] });
        setMsg(`${po.poNumber} received — intake lot created; add items on Inventory`);
      } else {
        await api('POST', `/purchase-orders/${po.id}/${action}`);
      }
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function pay(po: Po) {
    if (!payAmount) return;
    setMsg('');
    try {
      await api('POST', `/purchase-orders/${po.id}/payments`, {
        mode: payMode,
        amountPaise: Math.round(Number(payAmount) * 100),
      });
      setPayAmount('');
      setPayFor(null);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '…';

  return (
    <div className="space-y-6">
      <PageHeader title="Purchases" description="Supplier → purchase order → verified goods receipt → intake lot → supplier payments" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="section-title">New purchase order</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-full sm:w-64" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="input w-full sm:w-72" placeholder="line description (e.g. 22K chain lot)" value={lDesc} onChange={(e) => setLDesc(e.target.value)} />
          <input className="input w-32" placeholder="weight g" value={lWeight} onChange={(e) => setLWeight(e.target.value)} />
          <input className="input w-36" placeholder="value ₹" value={lValue} onChange={(e) => setLValue(e.target.value)} />
          <button className="btn-secondary" onClick={addLine}>Add line</button>
        </div>
        {lines.length > 0 && (
          <ul className="space-y-1 text-sm text-stone-600">
            {lines.map((l, i) => (
              <li key={i}>
                {i + 1}. {l.description}{l.expectedWeightG ? ` · ${l.expectedWeightG} g` : ''} · {inr(l.valuePaise)}
              </li>
            ))}
          </ul>
        )}
        <button className="btn" disabled={!supplierId || lines.length === 0} onClick={() => void create()}>
          Create PO {lines.length > 0 && `(${inr(lines.reduce((s, l) => s + l.valuePaise, 0))})`}
        </button>
      </section>

      <section className="card">
        <h2 className="section-title mb-3">Purchase orders</h2>
        {pos === null ? (
          <SkeletonRows rows={4} />
        ) : pos.length === 0 ? (
          <EmptyState>No purchase orders yet.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {pos.map((po) => (
              <MobileListCard
                key={po.id}
                title={<span className="font-mono text-xs">{po.poNumber}</span>}
                badges={
                  <>
                    <Badge status={po.status} />
                    <span className="text-xs text-stone-500">{supplierName(po.supplierId)}</span>
                    {po.settlement.settled ? <Badge status="PAID" /> : po.settlement.paidPaise > 0 ? <Badge status="PARTIALLY_PAID" /> : null}
                  </>
                }
                right={inr(po.totalValuePaise)}
                meta={po.settlement.duePaise > 0 ? `due to supplier: ${inr(po.settlement.duePaise)}` : 'settled'}
                actions={
                  <>
                    {po.status === 'DRAFT' && <button className="btn btn-xs" onClick={() => void act(po, 'order')}>Mark ordered</button>}
                    {po.status === 'ORDERED' && <button className="btn btn-xs" onClick={() => void act(po, 'receive')}>Receive goods</button>}
                    {(po.status === 'DRAFT' || po.status === 'ORDERED') && (
                      <button className="btn-danger btn-xs" onClick={() => void act(po, 'cancel')}>Cancel</button>
                    )}
                    {po.status !== 'CANCELLED' && po.settlement.duePaise > 0 && (
                      payFor === po.id ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <select className="input w-28 py-1 text-xs" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>)}
                          </select>
                          <input className="input w-24 py-1 text-xs" placeholder="₹" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                          <button className="btn btn-xs" onClick={() => void pay(po)}>Pay</button>
                          <button className="btn-secondary btn-xs" onClick={() => setPayFor(null)}>×</button>
                        </span>
                      ) : (
                        <button className="btn-secondary btn-xs" onClick={() => setPayFor(po.id)}>Pay supplier</button>
                      )
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

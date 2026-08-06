'use client';

/**
 * Dashboard — board-rate stat tiles + dual-unit stock position.
 * Stat-tile values are sans semibold with proportional figures; the
 * tabular-nums treatment is reserved for table columns.
 */
import { useEffect, useState } from 'react';
import { api, inr } from '@/lib/api';
import { Badge, PageHeader, StatTile } from '@/components/ui';

/**
 * Daily board-rate fix — the shop's morning ritual, so it lives on the
 * dashboard where BOTH roles land (the API allows OPS rate writes; the
 * MANUAL_FIX is audited server-side). Moved here from the Masters page,
 * which is now ADMIN-only.
 */
function RateFix({ metals, onFixed }: { metals: Metal[]; onFixed: () => void }) {
  const [purityId, setPurityId] = useState('');
  const [rupees, setRupees] = useState('');
  const [msg, setMsg] = useState('');

  async function fix(e: React.FormEvent) {
    e.preventDefault();
    const metal = metals.find((m) => m.purities.some((p) => p.id === purityId));
    if (!metal) return;
    try {
      await api('POST', '/metal-rates', {
        metalId: metal.id,
        purityId,
        ratePaisePer10g: Math.round(Number(rupees) * 100),
        source: 'MANUAL_FIX',
        effectiveAt: new Date().toISOString(),
      });
      setMsg('rate fixed');
      setRupees('');
      onFixed();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  return (
    <form onSubmit={fix} className="flex flex-wrap items-center gap-2">
      <select className="input w-40 sm:w-44" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
        <option value="">purity…</option>
        {metals.flatMap((m) => m.purities.map((p) => (
          <option key={p.id} value={p.id}>{m.name} {p.label}</option>
        )))}
      </select>
      <input className="input w-28 sm:w-32" placeholder="₹ per 10 g" value={rupees} onChange={(e) => setRupees(e.target.value)} />
      <button className="btn" disabled={!purityId || !rupees}>Fix rate</button>
      {msg && <span className="text-sm text-amber-700">{msg}</span>}
    </form>
  );
}

interface Metal {
  id: string;
  code: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface RateRow {
  id: string;
  metalId: string;
  purityId: string;
  ratePaisePer10g: number;
  source: string;
  effectiveAt: string;
}
interface Summary {
  byStatus: { branchId: string; status: string; _sum: { pieces: number | null }; _count: { _all: number } }[];
  totalGrossWeightG: string;
  totalNetWeightG: string;
}
interface Metrics {
  sales: { todayPaise: number; todayCount: number; windowPaise: number; windowCount: number; windowTaxPaise: number };
  payments: { collectedTodayPaise: number; receivablePaise: number; unpaidInvoiceCount: number };
  stock: { byStatus: { status: string; items: number; pieces: number }[]; lowStock: { category: string; pieces: number }[] };
  orders: { open: number; byStatus: { status: string; count: number }[] };
  purchases: { windowPaise: number; supplierDuePaise: number };
}

export default function DashboardPage() {
  // null = still loading (skeleton tiles shown), [] = loaded and empty
  const [metals, setMetals] = useState<Metal[] | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    void api<Metal[]>('GET', '/metals').then(setMetals);
    void api<RateRow[]>('GET', '/metal-rates').then(setRates);
    void api<Summary>('GET', '/stock/summary').then(setSummary);
    void api<Metrics>('GET', '/dashboard/metrics').then(setMetrics);
  }, []);

  // newest rate per (metal, purity)
  const latest = new Map<string, RateRow>();
  for (const r of [...rates].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))) {
    latest.set(`${r.metalId}:${r.purityId}`, r);
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Today’s trade, board rates and the live stock position" />

      {/* ---- today's business: sales, collection, receivables, pipeline ---- */}
      <section className="mb-6">
        <h2 className="section-title mb-3">Today</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics === null ? (
            Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[104px] rounded-2xl" />)
          ) : (
            <>
              <StatTile
                label="Sales today"
                value={inr(metrics.sales.todayPaise)}
                foot={`${metrics.sales.todayCount} ${metrics.sales.todayCount === 1 ? 'invoice' : 'invoices'}`}
              />
              <StatTile
                label="Collected today"
                value={inr(metrics.payments.collectedTodayPaise)}
                foot="payments less refunds"
              />
              <StatTile
                label="Outstanding"
                value={inr(metrics.payments.receivablePaise)}
                foot={`${metrics.payments.unpaidInvoiceCount} unpaid ${metrics.payments.unpaidInvoiceCount === 1 ? 'bill' : 'bills'}`}
              />
              <StatTile
                label="Open orders"
                value={metrics.orders.open}
                foot={
                  metrics.orders.byStatus
                    .filter((o) => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status))
                    .map((o) => `${o.count} ${o.status.toLowerCase()}`)
                    .join(' · ') || 'nothing in the queue'
                }
              />
            </>
          )}
        </div>
        {metrics && metrics.purchases.supplierDuePaise > 0 && (
          <p className="hint mt-2">
            Supplier dues outstanding: {inr(metrics.purchases.supplierDuePaise)}
            {metrics.stock.lowStock.length > 0 &&
              ` · low stock: ${metrics.stock.lowStock.map((l) => `${l.category} (${l.pieces})`).join(', ')}`}
          </p>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Board rates (per 10 g)</h2>
          <RateFix metals={metals ?? []} onFixed={() => void api<RateRow[]>('GET', '/metal-rates').then(setRates)} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metals === null
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[104px] rounded-2xl" />)
            : metals.flatMap((m) =>
                m.purities.map((p) => {
                  const r = latest.get(`${m.id}:${p.id}`);
                  return (
                    <StatTile
                      key={p.id}
                      label={`${m.name} ${p.label}`}
                      value={r ? inr(r.ratePaisePer10g) : '—'}
                      foot={r ? <Badge status={r.source} /> : 'no rate fixed'}
                    />
                  );
                }),
              )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">Stock position</h2>
          {summary && summary.byStatus.length > 0 ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
              <thead>
                <tr>
                  <th className="th">Status</th>
                  <th className="th num">Items</th>
                  <th className="th num">Pieces</th>
                </tr>
              </thead>
              <tbody>
                {/* /stock/summary groups by (branch, status); this page has no
                    branch context, so fold the branches together — otherwise
                    the same status appears once per branch with no label. */}
                {Object.entries(
                  summary.byStatus.reduce<Record<string, { items: number; pieces: number }>>((acc, row) => {
                    const a = acc[row.status] ?? { items: 0, pieces: 0 };
                    a.items += row._count._all;
                    a.pieces += row._sum.pieces ?? 0;
                    acc[row.status] = a;
                    return acc;
                  }, {}),
                ).map(([status, t]) => (
                  <tr key={status}>
                    <td className="td">
                      <Badge status={status} />
                    </td>
                    <td className="td num">{t.items}</td>
                    <td className="td num">{t.pieces}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <p className="hint">no stock yet</p>
          )}
        </section>

        <section className="grid grid-cols-1 content-start gap-3">
          <h2 className="section-title -mb-1">Metal on hand</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Gross weight" value={summary ? `${summary.totalGrossWeightG} g` : '—'} />
            <StatTile label="Net metal weight" value={summary ? `${summary.totalNetWeightG} g` : '—'} />
          </div>
          <p className="hint">
            Dual-unit stock control: pieces reconcile the counting, grams reconcile the value.
          </p>
        </section>
      </div>
    </div>
  );
}

'use client';

/** Dashboard — live board rates + dual-unit stock position. */
import { useEffect, useState } from 'react';
import { api, inr } from '@/lib/api';

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

export default function DashboardPage() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void api<Metal[]>('GET', '/metals').then(setMetals);
    void api<RateRow[]>('GET', '/metal-rates').then(setRates);
    void api<Summary>('GET', '/stock/summary').then(setSummary);
  }, []);

  // newest rate per (metal, purity)
  const latest = new Map<string, RateRow>();
  for (const r of [...rates].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))) {
    latest.set(`${r.metalId}:${r.purityId}`, r);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <section className="card">
        <h2 className="mb-3 font-medium">Board rates (per 10 g)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metals.flatMap((m) =>
            m.purities.map((p) => {
              const r = latest.get(`${m.id}:${p.id}`);
              return (
                <div key={p.id} className="rounded border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">
                    {m.name} {p.label}
                  </div>
                  <div className="text-lg font-semibold">{r ? inr(r.ratePaisePer10g) : '—'}</div>
                  {r && <div className="text-[10px] text-neutral-400">{r.source}</div>}
                </div>
              );
            }),
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Stock position</h2>
        {summary && (
          <>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Status</th>
                  <th className="th">Items</th>
                  <th className="th">Pieces</th>
                </tr>
              </thead>
              <tbody>
                {summary.byStatus.map((row, i) => (
                  <tr key={i}>
                    <td className="td">{row.status}</td>
                    <td className="td">{row._count._all}</td>
                    <td className="td">{row._sum.pieces ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-neutral-500">
              Total gross {summary.totalGrossWeightG} g · net {summary.totalNetWeightG} g
            </p>
          </>
        )}
      </section>
    </div>
  );
}

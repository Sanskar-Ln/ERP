'use client';

/**
 * Inventory: item list with dual-unit columns, a create-item form
 * (single metal component + optional flags for the MVP), and the
 * movement ledger of a selected item.
 */
import { useEffect, useState } from 'react';
import { api, inr, isAdmin } from '@/lib/api';
import { Badge, EmptyState, MobileListCard, PageHeader, SkeletonRows } from '@/components/ui';

interface Metal {
  id: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface Hsn {
  id: string;
  code: string;
  description: string;
}
interface Item {
  id: string;
  itemCode: string;
  name: string;
  category: string | null;
  status: string;
  pieces: number;
  isStudded: boolean;
  metalComponents: { grossWeightG: string; netWeightG: string; wastageBps: number }[];
  stoneComponents: { weightCt: string; valuePaise: number }[];
}

/** Common jewellery categories offered as datalist suggestions (free text wins). */
const CATEGORY_SUGGESTIONS = ['Ring', 'Chain', 'Necklace', 'Bangle', 'Bracelet', 'Earring', 'Pendant', 'Mangalsutra', 'Nose Pin', 'Anklet', 'Coin'];
interface Movement {
  id: string;
  movementType: string;
  pieces: number;
  grossWeightG: string;
  at: string;
  note: string | null;
}

export default function InventoryPage() {
  // null = still loading (skeleton shown), [] = loaded and empty
  const [items, setItems] = useState<Item[] | null>(null);
  const [metals, setMetals] = useState<Metal[]>([]);
  const [hsns, setHsns] = useState<Hsn[]>([]);
  const [moves, setMoves] = useState<Movement[] | null>(null);
  const [msg, setMsg] = useState('');

  // form state (one metal component keeps the MVP form manageable)
  const [f, setF] = useState({ itemCode: '', name: '', category: '', purityId: '', hsnCodeId: '', gross: '', net: '', wastage: '0', makingPerGram: '450', hallmark: '45', packing: '0', studded: false });

  const load = () => void api<Item[]>('GET', '/items').then(setItems);

  /** Hold / release a piece for a customer — status flip, stock stays on hand. */
  async function toggleReserve(it: Item) {
    try {
      await api('POST', `/items/${it.id}/${it.status === 'RESERVED' ? 'release' : 'reserve'}`, {});
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }
  useEffect(() => {
    load();
    void api<Metal[]>('GET', '/metals').then(setMetals);
    void api<Hsn[]>('GET', '/hsn-codes').then(setHsns);
  }, []);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    const metal = metals.find((m) => m.purities.some((p) => p.id === f.purityId));
    const user = JSON.parse(localStorage.getItem('erp.user') ?? '{}') as { branchId?: string };
    if (!metal || !user.branchId) return setMsg('pick a purity; user needs a branch');
    try {
      await api('POST', '/items', {
        itemCode: f.itemCode.toUpperCase(),
        name: f.name,
        category: f.category || undefined,
        branchId: user.branchId,
        hsnCodeId: f.hsnCodeId,
        pieces: 1,
        metalComponents: [{ metalId: metal.id, purityId: f.purityId, grossWeightG: f.gross, netWeightG: f.net, wastageBps: Math.round(Number(f.wastage) * 100) }],
        stoneComponents: [],
        makingCharge: { type: 'PER_GRAM', value: Math.round(Number(f.makingPerGram) * 100) },
        hallmarkChargePaise: Math.round(Number(f.hallmark || '0') * 100),
        packingChargePaise: Math.round(Number(f.packing || '0') * 100),
        isStudded: f.studded,
        isPrecious: true,
      });
      setMsg(`item ${f.itemCode.toUpperCase()} created`);
      setF({ ...f, itemCode: '', name: '', gross: '', net: '' });
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Composite items, dual-unit stock and the append-only movement ledger" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      {isAdmin() && (
      <section className="card">
        <h2 className="section-title mb-3">New item (single metal component)</h2>
        <form onSubmit={createItem} className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <input className="input" placeholder="ITEM-CODE" value={f.itemCode} onChange={(e) => setF({ ...f, itemCode: e.target.value })} />
          <input className="input" placeholder="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="input" placeholder="category (Ring, Chain…)" list="cat-suggestions" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="cat-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
          <select className="input" value={f.purityId} onChange={(e) => setF({ ...f, purityId: e.target.value })}>
            <option value="">purity…</option>
            {metals.flatMap((m) => m.purities.map((p) => (
              <option key={p.id} value={p.id}>{m.name} {p.label}</option>
            )))}
          </select>
          <select className="input" value={f.hsnCodeId} onChange={(e) => setF({ ...f, hsnCodeId: e.target.value })}>
            <option value="">HSN…</option>
            {hsns.map((h) => (
              <option key={h.id} value={h.id}>{h.code}</option>
            ))}
          </select>
          <input className="input" placeholder="gross g (12.500)" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} />
          <input className="input" placeholder="net g" value={f.net} onChange={(e) => setF({ ...f, net: e.target.value })} />
          <input className="input" placeholder="wastage %" value={f.wastage} onChange={(e) => setF({ ...f, wastage: e.target.value })} />
          <input className="input" placeholder="making ₹/g" value={f.makingPerGram} onChange={(e) => setF({ ...f, makingPerGram: e.target.value })} />
          <input className="input" placeholder="hallmark ₹" title="flat hallmarking charge" value={f.hallmark} onChange={(e) => setF({ ...f, hallmark: e.target.value })} />
          <input className="input" placeholder="packing ₹" title="flat packing charge" value={f.packing} onChange={(e) => setF({ ...f, packing: e.target.value })} />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.studded} onChange={(e) => setF({ ...f, studded: e.target.checked })} />
            studded (composite 3% GST)
          </label>
          <button className="btn col-span-2 md:col-span-1">Create item</button>
        </form>
      </section>
      )}

      <section className="card">
        <h2 className="section-title mb-3">Items</h2>
        {items === null ? (
          <SkeletonRows rows={5} />
        ) : items.length === 0 ? (
          <EmptyState>No items yet{isAdmin() ? ' — create the first one above.' : '.'}</EmptyState>
        ) : (
          <>
            {/* phone: cards with the ledger action */}
            <div className="space-y-2.5 sm:hidden">
              {items.map((it) => (
                <MobileListCard
                  key={it.id}
                  title={it.name}
                  badges={<><span className="font-mono text-[11px] text-stone-500">{it.itemCode}</span><Badge status={it.status} /></>}
                  right={`${it.metalComponents.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3)} g`}
                  meta={
                    <>
                      {it.category ? `${it.category} · ` : ''}
                      {it.pieces} pc
                      {it.stoneComponents.length
                        ? ` · ${it.stoneComponents.length} stones (${inr(it.stoneComponents.reduce((s, c) => s + c.valuePaise, 0))})`
                        : ''}
                    </>
                  }
                  actions={
                    <>
                      <button className="btn-secondary btn-xs" onClick={() => void api<Movement[]>('GET', `/stock-movements?itemId=${it.id}`).then(setMoves)}>
                        ledger
                      </button>
                      {(it.status === 'IN_STOCK' || it.status === 'RESERVED') && (
                        <button className="btn-secondary btn-xs" onClick={() => void toggleReserve(it)}>
                          {it.status === 'RESERVED' ? 'release' : 'reserve'}
                        </button>
                      )}
                    </>
                  }
                />
              ))}
            </div>
            {/* desktop: dense table */}
            <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="th">Code</th><th className="th">Name</th><th className="th">Category</th><th className="th">Status</th>
                  <th className="th">Pieces</th><th className="th">Gross g</th><th className="th">Stones</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="td font-mono text-xs">{it.itemCode}</td>
                    <td className="td">{it.name}</td>
                    <td className="td text-neutral-500">{it.category ?? '—'}</td>
                    <td className="td"><Badge status={it.status} /></td>
                    <td className="td">{it.pieces}</td>
                    <td className="td">{it.metalComponents.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3)}</td>
                    <td className="td">{it.stoneComponents.length ? `${it.stoneComponents.length} (${inr(it.stoneComponents.reduce((s, c) => s + c.valuePaise, 0))})` : '—'}</td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button className="btn-secondary btn-xs" onClick={() => void api<Movement[]>('GET', `/stock-movements?itemId=${it.id}`).then(setMoves)}>
                          ledger
                        </button>
                        {(it.status === 'IN_STOCK' || it.status === 'RESERVED') && (
                          <button className="btn-secondary btn-xs" onClick={() => void toggleReserve(it)}>
                            {it.status === 'RESERVED' ? 'release' : 'reserve'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </section>

      {moves && (
        <section className="card">
          <h2 className="section-title mb-3">Movement ledger</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
            <thead>
              <tr><th className="th">At</th><th className="th">Type</th><th className="th">Pieces</th><th className="th">Gross g</th><th className="th">Note</th></tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="td">{new Date(m.at).toLocaleString()}</td>
                  <td className="td"><Badge status={m.movementType} /></td>
                  <td className="td">{m.pieces}</td>
                  <td className="td">{m.grossWeightG}</td>
                  <td className="td text-neutral-500">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

'use client';

/**
 * Orders — the counter/workshop pipeline (both roles).
 *
 * DRAFT → CONFIRMED → PROCESSING → READY → DELIVERED → COMPLETED,
 * CANCELLED (admin) from any pre-delivery state. Confirming reserves the
 * stock lines; delivering requires a linked billing document. Money stays
 * on the Billing page — an order is workflow, not a financial document.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, isAdmin } from '@/lib/api';
import { Badge, EmptyState, MobileListCard, PageHeader, SkeletonRows } from '@/components/ui';

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
interface OrderLine {
  lineNo: number;
  itemId: string | null;
  description: string;
  pieces: number;
  expectedWeightG: string | null;
}
interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  note: string | null;
  documentId: string | null;
  createdAt: string;
  lines: OrderLine[];
}

/** The forward action shown per status (cancel handled separately). */
const NEXT_ACTION: Record<string, { to: string; label: string } | undefined> = {
  DRAFT: { to: 'CONFIRMED', label: 'Confirm (reserve stock)' },
  CONFIRMED: { to: 'PROCESSING', label: 'Start processing' },
  PROCESSING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'DELIVERED', label: 'Deliver' },
  DELIVERED: { to: 'COMPLETED', label: 'Complete' },
};

const PIPELINE = ['DRAFT', 'CONFIRMED', 'PROCESSING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState('');

  // create form
  const [customerId, setCustomerId] = useState('');
  const [pickItem, setPickItem] = useState('');
  const [orderItemIds, setOrderItemIds] = useState<string[]>([]);
  const [madeToOrder, setMadeToOrder] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    void api<Order[]>('GET', '/orders').then(setOrders);
    void api<Item[]>('GET', '/items?status=IN_STOCK').then(setItems);
  }, []);
  useEffect(() => {
    void api<Customer[]>('GET', '/customers').then(setCustomers);
    load();
  }, [load]);

  async function create() {
    const user = JSON.parse(localStorage.getItem('erp.user') ?? '{}') as { branchId?: string };
    if (!user.branchId) return setMsg('user has no branch');
    const lines = [
      ...orderItemIds.map((itemId) => ({ itemId })),
      ...(madeToOrder ? [{ description: madeToOrder }] : []),
    ];
    if (!customerId || lines.length === 0) return;
    setMsg('');
    try {
      const o = await api<Order>('POST', '/orders', { customerId, branchId: user.branchId, note: note || undefined, lines });
      setMsg(`${o.orderNumber} created`);
      setOrderItemIds([]);
      setMadeToOrder('');
      setNote('');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function advance(o: Order, to: string) {
    setMsg('');
    try {
      let documentId: string | undefined;
      if (to === 'DELIVERED' && !o.documentId) {
        documentId = prompt('billing document id (issue the invoice on the Billing page first)') ?? undefined;
        if (!documentId) return;
      }
      const reason = to === 'CANCELLED' ? prompt('cancellation reason?') ?? undefined : undefined;
      if (to === 'CANCELLED' && !reason) return;
      await api('POST', `/orders/${o.id}/status`, { to, documentId, reason });
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '…';

  const Actions = ({ o }: { o: Order }) => {
    const next = NEXT_ACTION[o.status];
    const cancellable = isAdmin() && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status);
    return (
      <>
        {next && (
          <button className="btn btn-xs" onClick={() => void advance(o, next.to)}>{next.label}</button>
        )}
        {cancellable && (
          <button className="btn-danger btn-xs" onClick={() => void advance(o, 'CANCELLED')}>Cancel</button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Counter & workshop pipeline — confirm to hold stock, deliver against the bill" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="section-title">New order</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-full sm:w-64" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
          <select className="input w-full sm:w-72" value={pickItem} onChange={(e) => setPickItem(e.target.value)}>
            <option value="">add stock item…</option>
            {items.filter((i) => !orderItemIds.includes(i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.itemCode} — {i.name}</option>
            ))}
          </select>
          <button
            className="btn-secondary"
            onClick={() => {
              if (pickItem) {
                setOrderItemIds([...orderItemIds, pickItem]);
                setPickItem('');
              }
            }}
          >
            Add
          </button>
        </div>
        {orderItemIds.length > 0 && (
          <p className="text-sm">
            items: {orderItemIds.map((id) => items.find((i) => i.id === id)?.itemCode ?? id).join(', ')}{' '}
            <button className="text-xs text-red-600" onClick={() => setOrderItemIds([])}>clear</button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <input className="input w-full sm:w-96" placeholder="made-to-order line (e.g. 22K bangle pair, ~25 g)" value={madeToOrder} onChange={(e) => setMadeToOrder(e.target.value)} />
          <input className="input w-full sm:w-64" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn" disabled={!customerId || (orderItemIds.length === 0 && !madeToOrder)} onClick={() => void create()}>
            Create order
          </button>
        </div>
        <p className="hint">Confirming an order holds its stock items (RESERVED). Bill it on the Billing page, then deliver with that document.</p>
      </section>

      <section className="card">
        <h2 className="section-title mb-3">Pipeline</h2>
        {orders === null ? (
          <SkeletonRows rows={5} />
        ) : orders.length === 0 ? (
          <EmptyState>No orders yet — create the first one above.</EmptyState>
        ) : (
          <div className="space-y-5">
            {PIPELINE.filter((s) => orders.some((o) => o.status === s)).map((status) => (
              <div key={status}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge status={status} />
                  <span className="hint">{orders.filter((o) => o.status === status).length}</span>
                </div>
                <div className="space-y-2.5">
                  {orders.filter((o) => o.status === status).map((o) => (
                    <MobileListCard
                      key={o.id}
                      title={<span className="font-mono text-xs">{o.orderNumber}</span>}
                      badges={<span className="text-xs text-stone-500">{customerName(o.customerId)}</span>}
                      meta={
                        <>
                          {o.lines.map((l) => l.description).join(' · ')}
                          {o.note ? ` — ${o.note}` : ''}
                          {o.documentId ? ' · billed' : ''}
                        </>
                      }
                      actions={<Actions o={o} />}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

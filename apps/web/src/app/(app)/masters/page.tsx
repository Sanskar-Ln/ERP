'use client';

/**
 * Master data: metals & purities, tax-rule matrix (read), customers
 * (search + create), rate fix (manual board rate entry).
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';

interface Metal {
  id: string;
  code: string;
  name: string;
  purities: { id: string; label: string; finenessPpt: number }[];
}
interface TaxRule {
  id: string;
  componentType: string;
  form: string;
  isSetInJewellery: boolean;
  invoiceMode: string;
  rateBps: number;
  note: string | null;
  hsnCode: { code: string } | null;
}
interface Customer {
  id: string;
  name: string;
  phone: string;
  stateCode: string;
  gstin: string | null;
}

/**
 * OPS discount cap (% of the bill). Enforced by the document engine
 * server-side; this only configures the tenant knob. ADMIN page, so no
 * further gating needed here.
 */
function OpsDiscountCap() {
  const [pct, setPct] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void api<{ opsMaxDiscountBps: number }>('GET', '/settings').then((s) => setPct((s.opsMaxDiscountBps / 100).toString()));
  }, []);
  async function save() {
    setMsg('');
    try {
      const s = await api<{ opsMaxDiscountBps: number }>('PATCH', '/settings', {
        opsMaxDiscountBps: Math.round(Number(pct) * 100),
      });
      setPct((s.opsMaxDiscountBps / 100).toString());
      setMsg('saved');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }
  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <h3 className="mb-2 text-sm font-medium">OPS discount limit</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
        <span className="text-sm text-stone-500">% of the bill</span>
        <button className="btn-secondary btn-xs" onClick={() => void save()}>Save</button>
        {msg && <span className="text-xs text-amber-700">{msg}</span>}
      </div>
      <p className="hint mt-1">Counter staff (OPS) can discount up to this; admins are unrestricted.</p>
    </div>
  );
}

export default function MastersPage() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [msg, setMsg] = useState('');

  // new-customer form
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cState, setCState] = useState('27');

  const load = () => {
    void api<Metal[]>('GET', '/metals').then(setMetals);
    void api<TaxRule[]>('GET', '/tax-rules').then(setRules);
    void api<Customer[]>('GET', '/customers').then(setCustomers);
  };
  useEffect(load, []);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/customers', { name: cName, phone: cPhone, stateCode: cState, kycDocs: [] });
      setCName('');
      setCPhone('');
      setMsg('customer created');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Master data" description="Metals & purities, customers and the GST rule matrix (admin setup)" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title mb-3">Metals & purities</h2>
          {metals.map((m) => (
            <div key={m.id} className="mb-2 text-sm">
              <span className="font-medium">{m.name}</span>{' '}
              <span className="text-neutral-500">
                {m.purities.map((p) => `${p.label} (${p.finenessPpt}‰)`).join(' · ')}
              </span>
            </div>
          ))}

          <p className="hint mt-3">Daily board-rate fixing lives on the Dashboard (both roles).</p>

          <OpsDiscountCap />
        </section>

        <section className="card">
          <h2 className="section-title mb-3">New customer</h2>
          <form onSubmit={createCustomer} className="space-y-2">
            <input className="input" placeholder="name" value={cName} onChange={(e) => setCName(e.target.value)} />
            <input className="input" placeholder="phone (+91…)" value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
            <input className="input" placeholder="GST state code (e.g. 27)" value={cState} onChange={(e) => setCState(e.target.value)} />
            <button className="btn">Create</button>
          </form>
          <h3 className="mt-4 mb-2 text-sm font-medium">Customers</h3>
          <ul className="max-h-48 space-y-1 overflow-auto text-sm">
            {customers.map((c) => (
              <li key={c.id} className="text-neutral-700">
                {c.name} · {c.phone} · state {c.stateCode}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title mb-3">Tax-rule matrix</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className="th">Component</th>
              <th className="th">Form</th>
              <th className="th">Set in jewellery</th>
              <th className="th">Mode</th>
              <th className="th">HSN</th>
              <th className="th">Rate</th>
              <th className="th">Note</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="td">{r.componentType}</td>
                <td className="td">{r.form}</td>
                <td className="td">{r.isSetInJewellery ? 'yes' : 'no'}</td>
                <td className="td">{r.invoiceMode}</td>
                <td className="td">{r.hsnCode?.code ?? '—'}</td>
                <td className="td font-medium">{(r.rateBps / 100).toString()}%</td>
                <td className="td text-neutral-500">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}

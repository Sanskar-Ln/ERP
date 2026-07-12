/**
 * Manager billing — the full document engine from the phone, same as the
 * web admin: build a cart (customer + item codes), issue Tax Invoice /
 * Estimate / Delivery Challan, browse documents, convert an estimate,
 * cancel with stock reversal. All through the same RBAC'd endpoints —
 * the phone is a thin client, no billing logic lives here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, inr, session, ui } from '../../lib/api';
import BarcodeScanButton from '../../components/BarcodeScanButton';

interface Customer {
  id: string;
  name: string;
  phone: string;
}
interface Item {
  id: string;
  itemCode: string;
  name: string;
  branchId: string;
}
interface Doc {
  id: string;
  docNumber: string;
  docType: string;
  status: string;
  grandTotalPaise: number;
}
interface DocDetail extends Doc {
  taxableValuePaise: number;
  exchangeValuePaise: number;
  totalTaxPaise: number;
  taxLines: { label: string; taxPaise: number }[];
  lines: { lineNo: number; description: string; grossPaise: number }[];
}

export default function BillingScreen(): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Doc[]>([]);
  const [code, setCode] = useState('');
  const [cart, setCart] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setDocs(await api<Doc[]>('GET', '/documents'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Recurring-customer history: when a customer is picked, load ALL their
   * past documents so the manager sees the multi-bill history right here.
   */
  async function findCustomer(): Promise<void> {
    setMsg('');
    const found = await api<Customer[]>('GET', `/customers?q=${encodeURIComponent(phone)}`);
    if (found.length === 0) {
      setMsg('no customer found');
      return;
    }
    const c = found[0] ?? null;
    setCustomer(c);
    if (c) setHistory(await api<Doc[]>('GET', `/documents?customerId=${c.id}`));
  }

  async function addItem(raw?: string): Promise<void> {
    setMsg('');
    try {
      const itemCode = (raw ?? code).trim().toUpperCase().split('#')[0] ?? '';
      const item = await api<Item>('GET', `/items/by-code/${encodeURIComponent(itemCode)}`);
      if (!cart.some((i) => i.id === item.id)) setCart([...cart, item]);
      setCode('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'item not found');
    }
  }

  async function issue(docType: 'TAX_INVOICE' | 'ESTIMATE' | 'DELIVERY_CHALLAN'): Promise<void> {
    if (!customer || cart.length === 0) return;
    setMsg('');
    try {
      const out = await api<DocDetail & { warnings?: string[] }>('POST', '/documents', {
        docType,
        cart: {
          customerId: customer.id,
          branchId: cart[0]!.branchId,
          lines: cart.map((i) => ({ itemId: i.id })),
          oldGoldExchanges: [],
          cartDiscountPaise: 0,
        },
      });
      setMsg(`${out.docNumber} issued${out.warnings?.length ? ` — ${out.warnings.join('; ')}` : ''}`);
      setCart([]);
      setDetail(out);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  async function open(id: string): Promise<void> {
    setDetail(await api<DocDetail>('GET', `/documents/${id}`));
  }

  async function convert(id: string): Promise<void> {
    setMsg('');
    try {
      const inv = await api<DocDetail>('POST', `/documents/${id}/convert`);
      setMsg(`converted → ${inv.docNumber}`);
      setDetail(inv);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  async function cancel(id: string): Promise<void> {
    setMsg('');
    try {
      await api('POST', `/documents/${id}/cancel`, { reason: 'cancelled from mobile by manager' });
      setMsg('cancelled — stock reversed');
      setDetail(null);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  const canConvert = detail?.docType === 'ESTIMATE' && detail.status === 'ISSUED';
  const canCancel = detail?.status === 'ISSUED' && session.isManager();

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Text style={styles.h1}>Billing</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.h2}>New document</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} placeholder="customer phone / name" value={phone} onChangeText={setPhone} />
          <TouchableOpacity style={styles.btnSmall} onPress={() => void findCustomer()}>
            <Text style={styles.btnText}>Find</Text>
          </TouchableOpacity>
        </View>
        {customer && <Text style={styles.ok}>{customer.name} · {customer.phone}</Text>}
        {customer && history.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.meta}>previous bills of this customer ({history.length}):</Text>
            {history.slice(0, 5).map((h) => (
              <TouchableOpacity key={h.id} onPress={() => void open(h.id)}>
                <Text style={styles.historyLine}>
                  {h.docNumber} · {h.status} · {inr(h.grandTotalPaise)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="scan / enter item code"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void addItem()}
          />
          <BarcodeScanButton onScan={(scanned) => void addItem(scanned)} />
          <TouchableOpacity style={styles.btnSmall} onPress={() => void addItem()}>
            <Text style={styles.btnText}>Add</Text>
          </TouchableOpacity>
        </View>
        {cart.map((i) => (
          <Text key={i.id} style={styles.line}>• {i.itemCode} — {i.name}</Text>
        ))}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btnHalf, (!customer || cart.length === 0) && styles.disabled]}
            disabled={!customer || cart.length === 0}
            onPress={() => void issue('TAX_INVOICE')}
          >
            <Text style={styles.btnText}>Tax Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnHalf, (!customer || cart.length === 0) && styles.disabled]}
            disabled={!customer || cart.length === 0}
            onPress={() => void issue('ESTIMATE')}
          >
            <Text style={styles.btnText}>Estimate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnHalf, (!customer || cart.length === 0) && styles.disabled]}
            disabled={!customer || cart.length === 0}
            onPress={() => void issue('DELIVERY_CHALLAN')}
          >
            <Text style={styles.btnText}>Challan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {detail && (
        <View style={styles.card}>
          <Text style={styles.h2}>{detail.docNumber} · {detail.status}</Text>
          {detail.lines.map((l) => (
            <Text key={l.lineNo} style={styles.line}>{l.lineNo}. {l.description} — {inr(l.grossPaise)}</Text>
          ))}
          {detail.exchangeValuePaise > 0 && <Text style={styles.line}>Old gold: −{inr(detail.exchangeValuePaise)}</Text>}
          <Text style={styles.line}>Taxable: {inr(detail.taxableValuePaise)}</Text>
          {detail.taxLines.map((t, i) => (
            <Text key={i} style={styles.meta}>{t.label}: {inr(t.taxPaise)}</Text>
          ))}
          <Text style={styles.total}>{inr(detail.grandTotalPaise)}</Text>
          <View style={styles.row}>
            {canConvert && (
              <TouchableOpacity style={styles.btnHalf} onPress={() => void convert(detail.id)}>
                <Text style={styles.btnText}>Convert → Invoice</Text>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity style={[styles.btnHalf, styles.btnDanger]} onPress={() => void cancel(detail.id)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Text style={styles.h2}>Documents</Text>
      {docs.map((d) => (
        <TouchableOpacity key={d.id} style={styles.card} onPress={() => void open(d.id)}>
          <Text style={styles.line}>
            {d.docNumber} · {d.docType} · {d.status}
          </Text>
          <Text style={styles.total2}>{inr(d.grandTotalPaise)}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8 },
  h1: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 14, fontWeight: '600' },
  msg: { color: ui.amber, fontSize: 13 },
  ok: { color: ui.green, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 6, padding: 9, backgroundColor: '#fff', fontSize: 13 },
  btnSmall: { backgroundColor: ui.amber, borderRadius: 6, paddingHorizontal: 14, justifyContent: 'center' },
  btnHalf: { backgroundColor: ui.amber, borderRadius: 6, padding: 10, alignItems: 'center', flex: 1 },
  btnDanger: { backgroundColor: ui.red },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  disabled: { opacity: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: ui.border, gap: 6 },
  line: { fontSize: 13, color: ui.text },
  meta: { fontSize: 12, color: ui.muted },
  history: { gap: 2, paddingLeft: 4, borderLeftWidth: 2, borderLeftColor: ui.border },
  historyLine: { fontSize: 12, color: ui.amber },
  total: { fontSize: 20, fontWeight: '700', color: ui.amber },
  total2: { fontSize: 15, fontWeight: '600', color: ui.amber },
});

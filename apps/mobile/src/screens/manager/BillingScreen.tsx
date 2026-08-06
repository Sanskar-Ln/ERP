/**
 * Manager billing — the full document engine from the phone: build a
 * cart (customer + item scans), issue Tax Invoice / Estimate / Challan,
 * browse documents, convert an estimate, cancel with stock reversal.
 * The phone is a thin client — no billing logic lives here. When a
 * customer is picked, their previous bills load (recurring-customer
 * history).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, inr, session } from '../../lib/api';
import { color, font } from '../../lib/theme';
import { Badge, Btn, Card, Field, Hint, Notice, ScreenHeader, SectionTitle } from '../../components/kit';
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
interface PaymentSummary {
  netPaidPaise: number;
  duePaise: number;
  status: string;
}
interface DocDetail extends Doc {
  taxableValuePaise: number;
  exchangeValuePaise: number;
  totalTaxPaise: number;
  taxLines: { label: string; taxPaise: number }[];
  lines: { lineNo: number; description: string; grossPaise: number }[];
  paymentSummary?: PaymentSummary;
}

const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;

export default function BillingScreen(): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Doc[]>([]);
  const [code, setCode] = useState('');
  const [cart, setCart] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState<'success' | 'error'>('success');
  const [refreshing, setRefreshing] = useState(false);

  const note = (kind: 'success' | 'error', text: string) => {
    setMsgKind(kind);
    setMsg(text);
  };

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

  /** Recurring-customer history loads the moment a customer is picked. */
  async function findCustomer(): Promise<void> {
    setMsg('');
    const found = await api<Customer[]>('GET', `/customers?q=${encodeURIComponent(phone)}`);
    if (found.length === 0) {
      note('error', 'no customer found');
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
      note('error', e instanceof Error ? e.message : 'item not found');
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
      note('success', `${out.docNumber} issued${out.warnings?.length ? ` — ${out.warnings.join('; ')}` : ''}`);
      setCart([]);
      setDetail(out);
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  async function open(id: string): Promise<void> {
    setDetail(await api<DocDetail>('GET', `/documents/${id}`));
  }

  async function convert(id: string): Promise<void> {
    setMsg('');
    try {
      const inv = await api<DocDetail>('POST', `/documents/${id}/convert`);
      note('success', `converted → ${inv.docNumber}`);
      setDetail(inv);
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  async function cancel(id: string): Promise<void> {
    setMsg('');
    try {
      await api('POST', `/documents/${id}/cancel`, { reason: 'cancelled from mobile by manager' });
      note('success', 'cancelled — stock reversed');
      setDetail(null);
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  const canConvert = detail?.docType === 'ESTIMATE' && detail.status === 'ISSUED';
  const canCancel = detail?.status === 'ISSUED' && session.isAdmin();

  // ---- settlement (append-only ledger; status derived server-side) ----
  const [payMode, setPayMode] = useState<string>('CASH');
  const [payAmount, setPayAmount] = useState('');

  async function recordPayment(): Promise<void> {
    if (!detail || !payAmount) return;
    setMsg('');
    try {
      await api('POST', `/documents/${detail.id}/payments`, {
        kind: 'PAYMENT',
        mode: payMode,
        amountPaise: Math.round(Number(payAmount) * 100),
      });
      setPayAmount('');
      setDetail(await api<DocDetail>('GET', `/documents/${detail.id}`));
      note('success', 'payment recorded');
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={color.gold500} />}
    >
      <ScreenHeader title="Billing" description="One cart — Tax Invoice, Estimate or Delivery Challan" />
      {msg ? <Notice kind={msgKind}>{msg}</Notice> : null}

      <Card>
        <SectionTitle>New document</SectionTitle>
        <View style={styles.row}>
          <Field style={{ flex: 1 }} placeholder="customer phone / name" value={phone} onChangeText={setPhone} />
          <Btn title="Find" onPress={() => void findCustomer()} />
        </View>
        {customer && (
          <Text style={styles.ok}>
            {customer.name} · {customer.phone}
          </Text>
        )}
        {customer && history.length > 0 && (
          <View style={styles.history}>
            <Hint>previous bills of this customer ({history.length})</Hint>
            {history.slice(0, 5).map((h) => (
              <Pressable key={h.id} onPress={() => void open(h.id)}>
                <Text style={styles.historyLine}>
                  {h.docNumber} · {h.status.replaceAll('_', ' ')} · {inr(h.grandTotalPaise)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <Field
            style={{ flex: 1 }}
            placeholder="scan / enter item code"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void addItem()}
          />
          <BarcodeScanButton onScan={(scanned) => void addItem(scanned)} />
          <Btn title="Add" onPress={() => void addItem()} />
        </View>
        {cart.map((i) => (
          <Text key={i.id} style={styles.line}>
            • {i.itemCode} — {i.name}
          </Text>
        ))}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Btn title="Tax Invoice" onPress={() => void issue('TAX_INVOICE')} disabled={!customer || cart.length === 0} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="Estimate" variant="secondary" onPress={() => void issue('ESTIMATE')} disabled={!customer || cart.length === 0} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="Challan" variant="secondary" onPress={() => void issue('DELIVERY_CHALLAN')} disabled={!customer || cart.length === 0} />
          </View>
        </View>
      </Card>

      {detail && (
        <Card style={styles.detailCard}>
          <View style={styles.detailHead}>
            <Text style={styles.docNo}>{detail.docNumber}</Text>
            <Badge status={detail.status} />
          </View>
          {detail.lines.map((l) => (
            <Text key={l.lineNo} style={styles.line}>
              {l.lineNo}. {l.description} — {inr(l.grossPaise)}
            </Text>
          ))}
          {detail.exchangeValuePaise > 0 && <Text style={styles.line}>Old gold −{inr(detail.exchangeValuePaise)}</Text>}
          <Text style={styles.line}>Taxable {inr(detail.taxableValuePaise)}</Text>
          {detail.taxLines.map((t, i) => (
            <Text key={i} style={styles.meta}>
              {t.label}: {inr(t.taxPaise)}
            </Text>
          ))}
          <Text style={styles.total}>{inr(detail.grandTotalPaise)}</Text>
          {detail.paymentSummary && (
            <View style={styles.payBlock}>
              <View style={styles.detailHead}>
                <Badge status={detail.paymentSummary.status} />
                <Text style={styles.meta}>
                  paid {inr(detail.paymentSummary.netPaidPaise)} · due {inr(detail.paymentSummary.duePaise)}
                </Text>
              </View>
              {detail.status !== 'CANCELLED' && detail.paymentSummary.duePaise > 0 && (
                <>
                  <View style={styles.row}>
                    {PAYMENT_MODES.map((m) => (
                      <Pressable key={m} onPress={() => setPayMode(m)}>
                        <Text style={[styles.modeChip, payMode === m && styles.modeChipOn]}>{m.replaceAll('_', ' ')}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.row}>
                    <Field
                      style={{ flex: 1 }}
                      placeholder="₹ amount"
                      keyboardType="numeric"
                      value={payAmount}
                      onChangeText={setPayAmount}
                    />
                    <Btn title="Record payment" onPress={() => void recordPayment()} disabled={!payAmount} />
                  </View>
                </>
              )}
            </View>
          )}
          <View style={styles.row}>
            {canConvert && (
              <View style={{ flex: 1 }}>
                <Btn title="Convert → Invoice" onPress={() => void convert(detail.id)} />
              </View>
            )}
            {canCancel && (
              <View style={{ flex: 1 }}>
                <Btn title="Cancel" variant="danger" onPress={() => void cancel(detail.id)} />
              </View>
            )}
          </View>
        </Card>
      )}

      <SectionTitle>Documents</SectionTitle>
      {docs.map((d) => (
        <Pressable key={d.id} onPress={() => void open(d.id)}>
          <Card style={styles.docCard}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.docNo}>{d.docNumber}</Text>
              <View style={styles.row}>
                <Badge status={d.docType} />
                <Badge status={d.status} />
              </View>
            </View>
            <Text style={styles.docTotal}>{inr(d.grandTotalPaise)}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  ok: { fontFamily: font.medium, fontSize: 13, color: color.good },
  history: { gap: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: color.gold200 },
  historyLine: { fontFamily: font.medium, fontSize: 12.5, color: color.gold700 },
  line: { fontFamily: font.regular, fontSize: 13.5, color: color.inkSecondary },
  meta: { fontFamily: font.regular, fontSize: 12, color: color.inkMuted },
  detailCard: { borderColor: color.gold200, backgroundColor: color.gold50 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docNo: { fontFamily: font.semibold, fontSize: 14, color: color.ink, letterSpacing: 0.2 },
  total: { fontFamily: font.bold, fontSize: 26, color: color.gold900, letterSpacing: -0.5 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docTotal: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  payBlock: { gap: 8, borderTopWidth: 1, borderTopColor: color.gold200, paddingTop: 10 },
  modeChip: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: color.inkSecondary,
    backgroundColor: color.neutralBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  modeChipOn: { color: '#fff', backgroundColor: color.gold600 },
});

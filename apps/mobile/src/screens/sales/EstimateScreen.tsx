/**
 * Estimate at the counter: find the customer by phone, add items by
 * scan/code, issue a kaccha Estimate (no GST) through the same document
 * engine the web admin uses. Conversion happens later at the desk.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, inr } from '../../lib/api';
import { color, font } from '../../lib/theme';
import { Btn, Card, Field, Hint, Notice, ScreenHeader, SectionTitle } from '../../components/kit';
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
interface DocOut {
  id: string;
  docNumber: string;
  grandTotalPaise: number;
}

export default function EstimateScreen(): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [code, setCode] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [doc, setDoc] = useState<DocOut | null>(null);
  const [msg, setMsg] = useState('');

  async function findCustomer(): Promise<void> {
    setMsg('');
    const found = await api<Customer[]>('GET', `/customers?q=${encodeURIComponent(phone)}`);
    if (found.length === 0) setMsg('no customer found — register on the web admin');
    else setCustomer(found[0] ?? null);
  }

  async function addItem(raw?: string): Promise<void> {
    setMsg('');
    try {
      const itemCode = (raw ?? code).trim().toUpperCase().split('#')[0] ?? '';
      const item = await api<Item>('GET', `/items/by-code/${encodeURIComponent(itemCode)}`);
      if (!items.some((i) => i.id === item.id)) setItems([...items, item]);
      setCode('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'item not found');
    }
  }

  async function issue(): Promise<void> {
    if (!customer || items.length === 0) return;
    setMsg('');
    try {
      const out = await api<DocOut>('POST', '/documents', {
        docType: 'ESTIMATE',
        cart: {
          customerId: customer.id,
          branchId: items[0]!.branchId, // estimate at the items' branch
          lines: items.map((i) => ({ itemId: i.id })),
          oldGoldExchanges: [],
          cartDiscountPaise: 0,
        },
      });
      setDoc(out);
      setItems([]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <ScreenHeader title="New estimate" description="Kaccha quote at the counter — no GST until converted" />

      <Card>
        <SectionTitle>Customer</SectionTitle>
        <View style={styles.row}>
          <Field style={{ flex: 1 }} placeholder="phone / name" value={phone} onChangeText={setPhone} />
          <Btn title="Find" onPress={() => void findCustomer()} />
        </View>
        {customer && (
          <Text style={styles.ok}>
            {customer.name} · {customer.phone}
          </Text>
        )}
      </Card>

      <Card>
        <SectionTitle>Items</SectionTitle>
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
        {items.map((i) => (
          <Text key={i.id} style={styles.line}>
            • {i.itemCode} — {i.name}
          </Text>
        ))}
        {msg ? <Notice kind="error">{msg}</Notice> : null}
        <Btn title={`Issue estimate (${items.length})`} onPress={() => void issue()} disabled={!customer || items.length === 0} />
      </Card>

      {doc && (
        <Card style={styles.doneCard}>
          <Text style={styles.docNo}>{doc.docNumber}</Text>
          <Text style={styles.total}>{inr(doc.grandTotalPaise)}</Text>
          <Hint>kaccha estimate — no GST; convert to Tax Invoice at the desk</Hint>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  ok: { fontFamily: font.medium, fontSize: 13, color: color.good },
  line: { fontFamily: font.regular, fontSize: 13.5, color: color.inkSecondary },
  doneCard: { borderColor: color.gold200, backgroundColor: color.gold50 },
  docNo: { fontFamily: font.semibold, fontSize: 15, color: color.gold700, letterSpacing: 0.3 },
  total: { fontFamily: font.bold, fontSize: 28, color: color.gold900, letterSpacing: -0.5 },
});

/**
 * Estimate at the counter: find the customer by phone, add items by code,
 * issue an Estimate (kaccha — no GST) through the same document engine the
 * web admin uses. Conversion to a Tax Invoice happens later at the desk.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, inr } from '../../lib/api';
import BarcodeScanButton from '../../components/BarcodeScanButton';

interface Customer {
  id: string;
  name: string;
  phone: string;
  branchId?: string;
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
      <Text style={styles.h1}>New estimate</Text>

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="customer phone / name"
          value={phone}
          onChangeText={setPhone}
        />
        <TouchableOpacity style={styles.btn} onPress={() => void findCustomer()}>
          <Text style={styles.btnText}>Find</Text>
        </TouchableOpacity>
      </View>
      {customer && (
        <Text style={styles.ok}>
          {customer.name} · {customer.phone}
        </Text>
      )}

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="scan / enter item code"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          onSubmitEditing={() => void addItem()}
        />
        <BarcodeScanButton onScan={(scanned) => void addItem(scanned)} />
        <TouchableOpacity style={styles.btn} onPress={() => void addItem()}>
          <Text style={styles.btnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {items.map((i) => (
        <Text key={i.id} style={styles.line}>
          • {i.itemCode} — {i.name}
        </Text>
      ))}
      {msg ? <Text style={styles.error}>{msg}</Text> : null}

      <TouchableOpacity
        style={[styles.btn, styles.issue, (!customer || items.length === 0) && styles.disabled]}
        disabled={!customer || items.length === 0}
        onPress={() => void issue()}
      >
        <Text style={styles.btnText}>Issue estimate ({items.length})</Text>
      </TouchableOpacity>

      {doc && (
        <View style={styles.card}>
          <Text style={styles.title}>{doc.docNumber}</Text>
          <Text style={styles.total}>{inr(doc.grandTotalPaise)}</Text>
          <Text style={styles.meta}>kaccha estimate — no GST; convert to Tax Invoice at the desk</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  h1: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 6, padding: 10, backgroundColor: '#fff' },
  btn: { backgroundColor: '#b45309', borderRadius: 6, paddingHorizontal: 16, justifyContent: 'center', paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  issue: { marginTop: 6 },
  disabled: { opacity: 0.5 },
  ok: { color: '#15803d', fontSize: 13 },
  error: { color: '#dc2626', fontSize: 13 },
  line: { fontSize: 13, color: '#44403c' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#e7e5e4', gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  total: { fontSize: 22, fontWeight: '700', color: '#b45309' },
  meta: { fontSize: 11, color: '#a8a29e' },
});

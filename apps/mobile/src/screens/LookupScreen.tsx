/**
 * Stock lookup — the counter scan flow. A barcode scanner (or thumb)
 * enters the item code; the app resolves the item and shows the LIVE
 * price at today's board rate via /items/:id/price. This works because
 * tags never encode price — see the tagging module.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, inr } from '../api';

interface Item {
  id: string;
  itemCode: string;
  name: string;
  status: string;
  pieces: number;
  isStudded: boolean;
  metalComponents: { grossWeightG: string; netWeightG: string; wastageBps: number }[];
  stoneComponents: { weightCt: string; certLab: string | null; certNo: string | null }[];
}
interface Price {
  metalValuePaise: number;
  stoneValuePaise: number;
  makingPaise: number;
  grossPaise: number;
  pricedAt: string;
}

export default function LookupScreen(): React.JSX.Element {
  const [code, setCode] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [error, setError] = useState('');

  async function lookup(): Promise<void> {
    setError('');
    setItem(null);
    setPrice(null);
    try {
      // Accept either a raw item code or a scanned tag code (CODE#ordinal).
      const itemCode = code.trim().toUpperCase().split('#')[0] ?? '';
      const found = await api<Item>('GET', `/items/by-code/${encodeURIComponent(itemCode)}`);
      setItem(found);
      setPrice(await api<Price>('GET', `/items/${found.id}/price`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'not found');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Stock lookup</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="scan / enter item code"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          onSubmitEditing={() => void lookup()}
        />
        <TouchableOpacity style={styles.btn} onPress={() => void lookup()}>
          <Text style={styles.btnText}>Find</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {item && (
        <View style={styles.card}>
          <Text style={styles.title}>
            {item.name} <Text style={styles.mono}>[{item.itemCode}]</Text>
          </Text>
          <Text style={styles.meta}>
            {item.status} · {item.pieces} pc {item.isStudded ? '· studded' : ''}
          </Text>
          {item.metalComponents.map((mc, i) => (
            <Text key={i} style={styles.line}>
              metal: gross {mc.grossWeightG} g · net {mc.netWeightG} g · wastage {(mc.wastageBps / 100).toFixed(2)}%
            </Text>
          ))}
          {item.stoneComponents.map((sc, i) => (
            <Text key={i} style={styles.line}>
              stone: {sc.weightCt} ct {sc.certLab ? `· ${sc.certLab} ${sc.certNo}` : ''}
            </Text>
          ))}
        </View>
      )}

      {price && (
        <View style={styles.card}>
          <Text style={styles.title}>Price at today’s rate</Text>
          <Text style={styles.line}>Metal: {inr(price.metalValuePaise)}</Text>
          {price.stoneValuePaise > 0 && <Text style={styles.line}>Stones: {inr(price.stoneValuePaise)}</Text>}
          <Text style={styles.line}>Making: {inr(price.makingPaise)}</Text>
          <Text style={styles.total}>{inr(price.grossPaise)}</Text>
          <Text style={styles.meta}>before GST · priced {new Date(price.pricedAt).toLocaleTimeString()}</Text>
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
  btn: { backgroundColor: '#b45309', borderRadius: 6, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  error: { color: '#dc2626' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#e7e5e4', gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#78716c' },
  meta: { fontSize: 11, color: '#a8a29e' },
  line: { fontSize: 13, color: '#44403c' },
  total: { fontSize: 22, fontWeight: '700', color: '#b45309' },
});

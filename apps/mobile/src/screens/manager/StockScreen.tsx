/**
 * Manager stock screen — the admin side of inventory, from the phone:
 * - item list with status + weights
 * - create a new item (single metal component form, like the web admin)
 * - post a stock ADJUSTMENT (append-only ledger; signed pieces/grams)
 * - receive an incoming branch transfer
 * All writes hit the same RBAC-guarded endpoints the web admin uses.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, session, ui } from '../../lib/api';

interface Metal {
  id: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface Hsn {
  id: string;
  code: string;
}
interface Item {
  id: string;
  itemCode: string;
  name: string;
  status: string;
  pieces: number;
  metalComponents: { grossWeightG: string; netWeightG: string }[];
}
interface Transfer {
  id: string;
  status: string;
  toBranchId: string;
  fromBranchId: string;
  items: { itemId: string }[];
}

export default function StockScreen(): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([]);
  const [metals, setMetals] = useState<Metal[]>([]);
  const [hsns, setHsns] = useState<Hsn[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  // create-item form (single metal component keeps the phone form sane)
  const [f, setF] = useState({ itemCode: '', name: '', purityId: '', hsnCodeId: '', gross: '', net: '', wastage: '0', makingPerGram: '450' });
  // adjustment form
  const [a, setA] = useState({ itemCode: '', pieces: '0', grams: '0', note: '' });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [its, ms, hs, ts] = await Promise.all([
        api<Item[]>('GET', '/items'),
        api<Metal[]>('GET', '/metals'),
        api<Hsn[]>('GET', '/hsn-codes'),
        api<Transfer[]>('GET', '/transfers'),
      ]);
      setItems(its);
      setMetals(ms);
      setHsns(hs);
      setTransfers(ts.filter((t) => t.status === 'IN_TRANSIT'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createItem(): Promise<void> {
    setMsg('');
    const metal = metals.find((m) => m.purities.some((p) => p.id === f.purityId));
    const branchId = session.user()?.branchId;
    if (!metal || !branchId) return setMsg('pick a purity; user needs a home branch');
    try {
      await api('POST', '/items', {
        itemCode: f.itemCode.toUpperCase(),
        name: f.name,
        branchId,
        hsnCodeId: f.hsnCodeId,
        pieces: 1,
        metalComponents: [{ metalId: metal.id, purityId: f.purityId, grossWeightG: f.gross, netWeightG: f.net, wastageBps: Math.round(Number(f.wastage) * 100) }],
        stoneComponents: [],
        makingCharge: { type: 'PER_GRAM', value: Math.round(Number(f.makingPerGram) * 100) },
        isStudded: false,
        isPrecious: true,
      });
      setMsg(`item ${f.itemCode.toUpperCase()} created`);
      setF({ ...f, itemCode: '', name: '', gross: '', net: '' });
      setShowCreate(false);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  async function postAdjustment(): Promise<void> {
    setMsg('');
    const branchId = session.user()?.branchId;
    const item = items.find((i) => i.itemCode === a.itemCode.trim().toUpperCase().split('#')[0]);
    if (!item || !branchId) return setMsg('item code not found');
    try {
      await api('POST', '/stock-movements', {
        itemId: item.id,
        movementType: 'ADJUSTMENT',
        branchId,
        pieces: parseInt(a.pieces, 10) || 0,
        grossWeightG: a.grams.includes('.') || a.grams.startsWith('-') ? a.grams : `${a.grams}`,
        note: a.note || 'mobile adjustment',
      });
      setMsg('adjustment posted');
      setA({ itemCode: '', pieces: '0', grams: '0', note: '' });
      setShowAdjust(false);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  async function receive(transferId: string): Promise<void> {
    setMsg('');
    try {
      await api('POST', `/transfers/${transferId}/receive`);
      setMsg('transfer received — items re-homed to this branch');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Text style={styles.h1}>Stock</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnHalf} onPress={() => setShowCreate(!showCreate)}>
          <Text style={styles.btnText}>{showCreate ? 'Hide' : 'New item'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnHalf} onPress={() => setShowAdjust(!showAdjust)}>
          <Text style={styles.btnText}>{showAdjust ? 'Hide' : 'Adjustment'}</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <View style={styles.card}>
          <Text style={styles.h2}>New item</Text>
          <TextInput style={styles.input} placeholder="ITEM-CODE" autoCapitalize="characters" value={f.itemCode} onChangeText={(v) => setF({ ...f, itemCode: v })} />
          <TextInput style={styles.input} placeholder="name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <View style={styles.chipsRow}>
            {metals.flatMap((m) => m.purities.map((p) => (
              <TouchableOpacity key={p.id} style={[styles.chip, f.purityId === p.id && styles.chipOn]} onPress={() => setF({ ...f, purityId: p.id })}>
                <Text style={[styles.chipText, f.purityId === p.id && styles.chipTextOn]}>{m.name} {p.label}</Text>
              </TouchableOpacity>
            )))}
          </View>
          <View style={styles.chipsRow}>
            {hsns.map((h) => (
              <TouchableOpacity key={h.id} style={[styles.chip, f.hsnCodeId === h.id && styles.chipOn]} onPress={() => setF({ ...f, hsnCodeId: h.id })}>
                <Text style={[styles.chipText, f.hsnCodeId === h.id && styles.chipTextOn]}>HSN {h.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} placeholder="gross g" keyboardType="decimal-pad" value={f.gross} onChangeText={(v) => setF({ ...f, gross: v })} />
            <TextInput style={[styles.input, styles.flex]} placeholder="net g" keyboardType="decimal-pad" value={f.net} onChangeText={(v) => setF({ ...f, net: v })} />
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} placeholder="wastage %" keyboardType="decimal-pad" value={f.wastage} onChangeText={(v) => setF({ ...f, wastage: v })} />
            <TextInput style={[styles.input, styles.flex]} placeholder="making ₹/g" keyboardType="decimal-pad" value={f.makingPerGram} onChangeText={(v) => setF({ ...f, makingPerGram: v })} />
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => void createItem()}>
            <Text style={styles.btnText}>Create item</Text>
          </TouchableOpacity>
        </View>
      )}

      {showAdjust && (
        <View style={styles.card}>
          <Text style={styles.h2}>Stock adjustment (append-only)</Text>
          <TextInput style={styles.input} placeholder="item code" autoCapitalize="characters" value={a.itemCode} onChangeText={(v) => setA({ ...a, itemCode: v })} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} placeholder="± pieces" value={a.pieces} onChangeText={(v) => setA({ ...a, pieces: v })} />
            <TextInput style={[styles.input, styles.flex]} placeholder="± grams (e.g. -0.100)" value={a.grams} onChangeText={(v) => setA({ ...a, grams: v })} />
          </View>
          <TextInput style={styles.input} placeholder="reason / note" value={a.note} onChangeText={(v) => setA({ ...a, note: v })} />
          <TouchableOpacity style={styles.btn} onPress={() => void postAdjustment()}>
            <Text style={styles.btnText}>Post adjustment</Text>
          </TouchableOpacity>
        </View>
      )}

      {transfers.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.h2}>Incoming transfers</Text>
          {transfers.map((t) => (
            <View key={t.id} style={styles.transferRow}>
              <Text style={styles.line}>{t.items.length} item(s) in transit</Text>
              {t.toBranchId === session.user()?.branchId && (
                <TouchableOpacity style={styles.btnSmall} onPress={() => void receive(t.id)}>
                  <Text style={styles.btnText}>Receive</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.h2}>Items</Text>
      {items.map((it) => (
        <View key={it.id} style={styles.card}>
          <Text style={styles.itemTitle}>
            {it.name} <Text style={styles.mono}>[{it.itemCode}]</Text>
          </Text>
          <Text style={styles.line}>
            {it.status} · {it.pieces} pc · gross {it.metalComponents.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3)} g
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8 },
  h1: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 14, fontWeight: '600' },
  msg: { color: ui.amber, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 6, padding: 9, backgroundColor: '#fff', fontSize: 13 },
  btn: { backgroundColor: ui.amber, borderRadius: 6, padding: 10, alignItems: 'center' },
  btnHalf: { backgroundColor: ui.amber, borderRadius: 6, padding: 10, alignItems: 'center', flex: 1 },
  btnSmall: { backgroundColor: ui.amber, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: ui.border, gap: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: ui.amber, borderColor: ui.amber },
  chipText: { fontSize: 12, color: ui.text },
  chipTextOn: { color: '#fff' },
  transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 11, color: ui.muted },
  line: { fontSize: 13, color: ui.text },
});

/**
 * Manager stock screen — the admin side of inventory, from the phone:
 * item list, create item, post a stock ADJUSTMENT (append-only ledger),
 * receive incoming branch transfers. All writes hit the same
 * RBAC-guarded endpoints the web admin uses.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, session } from '../../lib/api';
import { color, font, radius } from '../../lib/theme';
import { Badge, Btn, Card, Field, Notice, ScreenHeader, SectionTitle } from '../../components/kit';

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
  const [msgKind, setMsgKind] = useState<'success' | 'error'>('success');
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  // create-item form (single metal component keeps the phone form sane)
  const [f, setF] = useState({ itemCode: '', name: '', purityId: '', hsnCodeId: '', gross: '', net: '', wastage: '0', makingPerGram: '450' });
  // adjustment form
  const [a, setA] = useState({ itemCode: '', pieces: '0', grams: '0', note: '' });

  const note = (kind: 'success' | 'error', text: string) => {
    setMsgKind(kind);
    setMsg(text);
  };

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
    const metal = metals.find((m) => m.purities.some((p) => p.id === f.purityId));
    const branchId = session.user()?.branchId;
    if (!metal || !branchId) return note('error', 'pick a purity; user needs a home branch');
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
      note('success', `item ${f.itemCode.toUpperCase()} created`);
      setF({ ...f, itemCode: '', name: '', gross: '', net: '' });
      setShowCreate(false);
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  async function postAdjustment(): Promise<void> {
    const branchId = session.user()?.branchId;
    const item = items.find((i) => i.itemCode === a.itemCode.trim().toUpperCase().split('#')[0]);
    if (!item || !branchId) return note('error', 'item code not found');
    try {
      await api('POST', '/stock-movements', {
        itemId: item.id,
        movementType: 'ADJUSTMENT',
        branchId,
        pieces: parseInt(a.pieces, 10) || 0,
        grossWeightG: a.grams,
        note: a.note || 'mobile adjustment',
      });
      note('success', 'adjustment posted to the ledger');
      setA({ itemCode: '', pieces: '0', grams: '0', note: '' });
      setShowAdjust(false);
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  async function receive(transferId: string): Promise<void> {
    try {
      await api('POST', `/transfers/${transferId}/receive`);
      note('success', 'transfer received — items re-homed to this branch');
      void load();
    } catch (e) {
      note('error', e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={color.gold500} />}
    >
      <ScreenHeader title="Stock" description="Items, adjustments and incoming transfers" />
      {msg ? <Notice kind={msgKind}>{msg}</Notice> : null}

      <View style={styles.row}>
        <Btn title={showCreate ? 'Hide form' : 'New item'} onPress={() => setShowCreate(!showCreate)} />
        <Btn title={showAdjust ? 'Hide form' : 'Adjustment'} variant="secondary" onPress={() => setShowAdjust(!showAdjust)} />
      </View>

      {showCreate && (
        <Card>
          <SectionTitle>New item</SectionTitle>
          <Field label="Item code" placeholder="RING-0004" autoCapitalize="characters" value={f.itemCode} onChangeText={(v) => setF({ ...f, itemCode: v })} />
          <Field label="Name" placeholder="Gold Ring 22K" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Text style={styles.chipLabel}>Purity</Text>
          <View style={styles.chipsRow}>
            {metals.flatMap((m) => m.purities.map((p) => (
              <Pressable key={p.id} style={[styles.chip, f.purityId === p.id && styles.chipOn]} onPress={() => setF({ ...f, purityId: p.id })}>
                <Text style={[styles.chipText, f.purityId === p.id && styles.chipTextOn]}>
                  {m.name} {p.label}
                </Text>
              </Pressable>
            )))}
          </View>
          <Text style={styles.chipLabel}>HSN</Text>
          <View style={styles.chipsRow}>
            {hsns.map((h) => (
              <Pressable key={h.id} style={[styles.chip, f.hsnCodeId === h.id && styles.chipOn]} onPress={() => setF({ ...f, hsnCodeId: h.id })}>
                <Text style={[styles.chipText, f.hsnCodeId === h.id && styles.chipTextOn]}>{h.code}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Field style={{ flex: 1 }} label="Gross g" keyboardType="decimal-pad" value={f.gross} onChangeText={(v) => setF({ ...f, gross: v })} />
            <Field style={{ flex: 1 }} label="Net g" keyboardType="decimal-pad" value={f.net} onChangeText={(v) => setF({ ...f, net: v })} />
          </View>
          <View style={styles.row}>
            <Field style={{ flex: 1 }} label="Wastage %" keyboardType="decimal-pad" value={f.wastage} onChangeText={(v) => setF({ ...f, wastage: v })} />
            <Field style={{ flex: 1 }} label="Making ₹/g" keyboardType="decimal-pad" value={f.makingPerGram} onChangeText={(v) => setF({ ...f, makingPerGram: v })} />
          </View>
          <Btn title="Create item" onPress={() => void createItem()} />
        </Card>
      )}

      {showAdjust && (
        <Card>
          <SectionTitle>Stock adjustment (append-only)</SectionTitle>
          <Field label="Item code" autoCapitalize="characters" value={a.itemCode} onChangeText={(v) => setA({ ...a, itemCode: v })} />
          <View style={styles.row}>
            <Field style={{ flex: 1 }} label="± pieces" value={a.pieces} onChangeText={(v) => setA({ ...a, pieces: v })} />
            <Field style={{ flex: 1 }} label="± grams (e.g. -0.100)" value={a.grams} onChangeText={(v) => setA({ ...a, grams: v })} />
          </View>
          <Field label="Reason / note" value={a.note} onChangeText={(v) => setA({ ...a, note: v })} />
          <Btn title="Post adjustment" onPress={() => void postAdjustment()} />
        </Card>
      )}

      {transfers.length > 0 && (
        <Card>
          <SectionTitle>Incoming transfers</SectionTitle>
          {transfers.map((t) => (
            <View key={t.id} style={styles.transferRow}>
              <Text style={styles.line}>{t.items.length} item(s) in transit</Text>
              {t.toBranchId === session.user()?.branchId && <Btn small title="Receive" onPress={() => void receive(t.id)} />}
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Items</SectionTitle>
      {items.map((it) => (
        <Card key={it.id} style={styles.itemCard}>
          <View style={styles.itemHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{it.name}</Text>
              <Text style={styles.mono}>{it.itemCode}</Text>
            </View>
            <Badge status={it.status} />
          </View>
          <Text style={styles.meta}>
            {it.pieces} pc · gross {it.metalComponents.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3)} g
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  chipLabel: { fontFamily: font.medium, fontSize: 12, color: color.inkSecondary, marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.gold600, borderColor: color.gold600 },
  chipText: { fontFamily: font.medium, fontSize: 12.5, color: color.inkSecondary },
  chipTextOn: { color: '#fff' },
  transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemCard: { gap: 5 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  mono: { fontFamily: font.medium, fontSize: 11.5, color: color.inkMuted, letterSpacing: 0.5 },
  line: { fontFamily: font.regular, fontSize: 13.5, color: color.inkSecondary },
  meta: { fontFamily: font.regular, fontSize: 12, color: color.inkMuted },
});

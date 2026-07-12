/**
 * Stock lookup — the counter scan flow. A barcode scan (camera or
 * keyboard-wedge scanner) or typed item code resolves the item and shows
 * the LIVE price at today's board rate via /items/:id/price. This works
 * because tags never encode price — see the tagging module.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, inr } from '../../lib/api';
import { color, font } from '../../lib/theme';
import { Badge, Btn, Card, Field, Notice, ScreenHeader } from '../../components/kit';
import BarcodeScanButton from '../../components/BarcodeScanButton';

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

  async function lookup(raw?: string): Promise<void> {
    setError('');
    setItem(null);
    setPrice(null);
    try {
      // Accept either a raw item code or a scanned tag code (CODE#ordinal).
      const itemCode = (raw ?? code).trim().toUpperCase().split('#')[0] ?? '';
      const found = await api<Item>('GET', `/items/by-code/${encodeURIComponent(itemCode)}`);
      setItem(found);
      setPrice(await api<Price>('GET', `/items/${found.id}/price`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'not found');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <ScreenHeader title="Stock lookup" description="Scan a tag or enter an item code for the live price" />
      <View style={styles.row}>
        <Field
          style={{ flex: 1 }}
          placeholder="scan / enter item code"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          onSubmitEditing={() => void lookup()}
        />
        <BarcodeScanButton
          onScan={(scanned) => {
            setCode(scanned);
            void lookup(scanned);
          }}
        />
        <Btn title="Find" onPress={() => void lookup()} />
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {item && (
        <Card>
          <View style={styles.itemHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.mono}>{item.itemCode}</Text>
            </View>
            <Badge status={item.status} />
          </View>
          <Text style={styles.meta}>
            {item.pieces} pc{item.isStudded ? ' · studded (composite 3% GST)' : ''}
          </Text>
          {item.metalComponents.map((mc, i) => (
            <Text key={i} style={styles.line}>
              Metal · gross {mc.grossWeightG} g · net {mc.netWeightG} g · wastage {(mc.wastageBps / 100).toFixed(2)}%
            </Text>
          ))}
          {item.stoneComponents.map((sc, i) => (
            <Text key={i} style={styles.line}>
              Stone · {sc.weightCt} ct{sc.certLab ? ` · ${sc.certLab} ${sc.certNo}` : ''}
            </Text>
          ))}
        </Card>
      )}

      {price && (
        <Card style={styles.priceCard}>
          <Text style={styles.priceLabel}>Price at today’s rate</Text>
          <Text style={styles.priceTotal}>{inr(price.grossPaise)}</Text>
          <View style={styles.priceRows}>
            <Text style={styles.line}>Metal {inr(price.metalValuePaise)}</Text>
            {price.stoneValuePaise > 0 && <Text style={styles.line}>Stones {inr(price.stoneValuePaise)}</Text>}
            <Text style={styles.line}>Making {inr(price.makingPaise)}</Text>
          </View>
          <Text style={styles.meta}>before GST · priced {new Date(price.pricedAt).toLocaleTimeString()}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { fontFamily: font.semibold, fontSize: 16, color: color.ink },
  mono: { fontFamily: font.medium, fontSize: 12, color: color.inkMuted, letterSpacing: 0.5 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.inkMuted },
  line: { fontFamily: font.regular, fontSize: 13.5, color: color.inkSecondary },
  priceCard: { borderColor: color.gold200, backgroundColor: color.gold50 },
  priceLabel: { fontFamily: font.medium, fontSize: 12.5, color: color.gold700 },
  priceTotal: { fontFamily: font.bold, fontSize: 30, color: color.gold900, letterSpacing: -0.5 },
  priceRows: { gap: 2, marginTop: 2 },
});

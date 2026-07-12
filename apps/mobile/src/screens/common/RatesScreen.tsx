/** Board rates (common to both views) — latest per (metal, purity). */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api, inr, ui } from '../../lib/api';

interface Metal {
  id: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface RateRow {
  metalId: string;
  purityId: string;
  ratePaisePer10g: number;
  source: string;
  effectiveAt: string;
}
interface Card {
  key: string;
  title: string;
  rate: RateRow | undefined;
}

export default function RatesScreen(): React.JSX.Element {
  const [cards, setCards] = useState<Card[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [metals, rates] = await Promise.all([api<Metal[]>('GET', '/metals'), api<RateRow[]>('GET', '/metal-rates')]);
      const latest = new Map<string, RateRow>();
      for (const r of [...rates].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))) {
        latest.set(`${r.metalId}:${r.purityId}`, r);
      }
      setCards(
        metals.flatMap((m) =>
          m.purities.map((p) => ({
            key: p.id,
            title: `${m.name} ${p.label}`,
            rate: latest.get(`${m.id}:${p.id}`),
          })),
        ),
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={cards}
      keyExtractor={(c) => c.key}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
      ListHeaderComponent={<Text style={styles.h1}>Board rates (per 10 g)</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardRate}>{item.rate ? inr(item.rate.ratePaisePer10g) : '—'}</Text>
          {item.rate && <Text style={styles.cardMeta}>{item.rate.source}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: ui.border },
  cardTitle: { fontSize: 13, color: ui.muted },
  cardRate: { fontSize: 20, fontWeight: '700' },
  cardMeta: { fontSize: 10, color: ui.faint },
});

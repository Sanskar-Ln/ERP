/** Board rates (common to both views) — latest per (metal, purity). */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { api, inr } from '../../lib/api';
import { color } from '../../lib/theme';
import { Badge, ScreenHeader, StatTile } from '../../components/kit';

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
interface CardData {
  key: string;
  title: string;
  rate: RateRow | undefined;
}

export default function RatesScreen(): React.JSX.Element {
  const [cards, setCards] = useState<CardData[]>([]);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={color.gold500} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 10 }}>
          <ScreenHeader title="Board rates" description="Per 10 g at each purity — pull down to refresh" />
        </View>
      }
      renderItem={({ item }) => (
        <StatTile
          label={item.title}
          value={item.rate ? inr(item.rate.ratePaisePer10g) : '—'}
          foot={item.rate ? <Badge status={item.rate.source} /> : undefined}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 18, gap: 10 },
});

/**
 * Manager dashboard — the same picture the web admin dashboard gives:
 * compact board rates + dual-unit stock position, plus the most recent
 * documents. Pull-to-refresh reloads everything.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, inr, session, ui } from '../../lib/api';

interface Metal {
  id: string;
  name: string;
  purities: { id: string; label: string }[];
}
interface RateRow {
  metalId: string;
  purityId: string;
  ratePaisePer10g: number;
  effectiveAt: string;
}
interface Summary {
  byStatus: { branchId: string; status: string; _sum: { pieces: number | null }; _count: { _all: number } }[];
  totalGrossWeightG: string;
  totalNetWeightG: string;
}
interface Doc {
  id: string;
  docNumber: string;
  docType: string;
  status: string;
  grandTotalPaise: number;
}

export default function DashboardScreen(): React.JSX.Element {
  const [rateCards, setRateCards] = useState<{ key: string; title: string; paise: number }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [metals, rates, sum, documents] = await Promise.all([
        api<Metal[]>('GET', '/metals'),
        api<RateRow[]>('GET', '/metal-rates'),
        api<Summary>('GET', '/stock/summary'),
        api<Doc[]>('GET', '/documents'),
      ]);
      const latest = new Map<string, RateRow>();
      for (const r of [...rates].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))) {
        latest.set(`${r.metalId}:${r.purityId}`, r);
      }
      setRateCards(
        metals.flatMap((m) =>
          m.purities
            .map((p) => ({ key: p.id, title: `${m.name} ${p.label}`, rate: latest.get(`${m.id}:${p.id}`) }))
            .filter((c) => c.rate)
            .map((c) => ({ key: c.key, title: c.title, paise: c.rate!.ratePaisePer10g })),
        ),
      );
      setSummary(sum);
      setDocs(documents.slice(0, 5));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Text style={styles.h1}>Dashboard</Text>
      <Text style={styles.meta}>{session.user()?.name} · {session.user()?.role}</Text>

      <Text style={styles.h2}>Board rates (per 10 g)</Text>
      <View style={styles.grid}>
        {rateCards.map((c) => (
          <View key={c.key} style={styles.rateCard}>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardRate}>{inr(c.paise)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Stock position</Text>
      <View style={styles.card}>
        {summary?.byStatus.map((row, i) => (
          <Text key={i} style={styles.line}>
            {row.status}: {row._count._all} item(s) · {row._sum.pieces ?? 0} pc
          </Text>
        ))}
        {summary && (
          <Text style={styles.meta}>
            gross {summary.totalGrossWeightG} g · net {summary.totalNetWeightG} g
          </Text>
        )}
      </View>

      <Text style={styles.h2}>Recent documents</Text>
      <View style={styles.card}>
        {docs.map((d) => (
          <Text key={d.id} style={styles.line}>
            {d.docNumber} · {d.status} · {inr(d.grandTotalPaise)}
          </Text>
        ))}
        {docs.length === 0 && <Text style={styles.meta}>none yet</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8 },
  h1: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 14, fontWeight: '600', marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rateCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: ui.border, minWidth: '45%' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: ui.border, gap: 4 },
  cardTitle: { fontSize: 12, color: ui.muted },
  cardRate: { fontSize: 17, fontWeight: '700' },
  line: { fontSize: 13, color: ui.text },
  meta: { fontSize: 11, color: ui.faint },
});

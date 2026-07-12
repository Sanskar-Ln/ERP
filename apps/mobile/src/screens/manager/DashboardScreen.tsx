/**
 * Manager dashboard — the same picture the web admin dashboard gives:
 * board-rate stat tiles + dual-unit stock position + recent documents.
 * Pull-to-refresh reloads everything.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, inr, session } from '../../lib/api';
import { color, font } from '../../lib/theme';
import { Badge, Card, ScreenHeader, SectionTitle, StatTile } from '../../components/kit';

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={color.gold500} />}
    >
      <ScreenHeader title="Dashboard" description={`${session.user()?.name} · ${session.user()?.role}`} />

      <SectionTitle>Board rates (per 10 g)</SectionTitle>
      <View style={styles.grid}>
        {rateCards.map((c) => (
          <StatTile key={c.key} label={c.title} value={inr(c.paise)} style={styles.gridTile} />
        ))}
      </View>

      <SectionTitle>Stock position</SectionTitle>
      <Card>
        {summary?.byStatus.map((row, i) => (
          <View key={i} style={styles.statusRow}>
            <Badge status={row.status} />
            <Text style={styles.line}>
              {row._count._all} item(s) · {row._sum.pieces ?? 0} pc
            </Text>
          </View>
        ))}
        {summary && (
          <Text style={styles.meta}>
            gross {summary.totalGrossWeightG} g · net {summary.totalNetWeightG} g
          </Text>
        )}
      </Card>

      <SectionTitle>Recent documents</SectionTitle>
      <Card>
        {docs.map((d) => (
          <View key={d.id} style={styles.docRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docNo}>{d.docNumber}</Text>
              <Badge status={d.status} />
            </View>
            <Text style={styles.docTotal}>{inr(d.grandTotalPaise)}</Text>
          </View>
        ))}
        {docs.length === 0 && <Text style={styles.meta}>none yet</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridTile: { flexBasis: '47%', flexGrow: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { fontFamily: font.regular, fontSize: 13.5, color: color.inkSecondary },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.inkMuted },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  docNo: { fontFamily: font.medium, fontSize: 13, color: color.ink, marginBottom: 3 },
  docTotal: { fontFamily: font.semibold, fontSize: 14.5, color: color.ink },
});

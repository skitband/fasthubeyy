import { useMemo } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Avatar } from '@/components/ui';
import { useDbData, usePullToRefresh } from '@/db/hooks';
import { getActiveTrip, listOrders } from '@/db/queries';
import type { OrderView } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { initials, peso } from '@/lib/money';

export default function Reports() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const data = useDbData((db) => {
    try {
      const trip = getActiveTrip(db);
      if (!trip) return null;
      return { trip, orders: listOrders(db, trip.id) };
    } catch {
      return null;
    }
  });

  const buyerRollup = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; orders: number; spend: number }>();
    for (const o of data.orders) {
      const cur = map.get(o.buyer_id) ?? { name: o.buyer_name, orders: 0, spend: 0 };
      cur.orders += 1;
      cur.spend += o.total;
      map.set(o.buyer_id, cur);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [data]);

  const orders = data?.orders ?? [];
  const net = orders.reduce((a, o) => a + o.fee, 0);
  const delivered = orders.filter((o) => o.status === 'delivered').length;
  const avgFee = orders.length ? net / orders.length : 0;
  const kgCarried = orders.reduce((a, o) => a + o.kg, 0);
  const unpaid = orders.reduce((a, o) => a + (o.total - o.paid), 0);

  const bars = [...orders].sort((a, b) => b.fee - a.fee).slice(0, 6);
  const maxFee = bars[0]?.fee || 1;

  const stats = [
    { label: 'Orders on trip', value: String(orders.length) },
    { label: 'Avg fee per order', value: peso(avgFee) },
    { label: 'Kg carried', value: kgCarried.toFixed(1) },
    { label: 'Delivered', value: String(delivered) },
  ];

  async function exportCsv() {
    try {
      const header = 'ref,buyer,status,pay,total,paid,fee,kg';
      const lines = orders.map((o: OrderView) =>
        [o.ref, `"${o.buyer_name}"`, o.status, o.pay, Math.round(o.total), Math.round(o.paid), Math.round(o.fee), o.kg.toFixed(1)].join(',')
      );
      const csv = [header, ...lines].join('\n');
      const file = new File(Paths.cache, `pasabuy-report-${Date.now()}.csv`);
      file.create();
      file.write(csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export trip report',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Saved', `Report written to ${file.uri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>{data ? 'This trip' : 'Trip data unavailable. You can restore a backup below.'}</Text>

        {data ? <>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Net earnings (fees)</Text>
          <Text style={styles.heroNet}>{peso(net)}</Text>
          <View style={styles.chart}>
            {bars.map((o, i) => (
              <View key={o.id} style={styles.barCol}>
                <View style={[styles.bar, { height: Math.max(6, (o.fee / maxFee) * 76), backgroundColor: i === 0 ? colors.white : colors.onInk18 }]} />
                <Text style={styles.barLabel}>{initials(o.buyer_name)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Top buyers</Text>
        <View style={styles.listCard}>
          {buyerRollup.slice(0, 4).map((b, i) => (
            <View key={b.name} style={[styles.buyerRow, i === Math.min(3, buyerRollup.length - 1) && { borderBottomWidth: 0 }]}>
              <Avatar label={initials(b.name)} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.buyerName}>{b.name}</Text>
                <Text style={styles.buyerOrders}>{`${b.orders} order${b.orders === 1 ? '' : 's'}`}</Text>
              </View>
              <Text style={styles.buyerSpend}>{peso(b.spend)}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.exportBtn} onPress={exportCsv}>
          <Text style={styles.exportText}>Export trip report (CSV)</Text>
        </Pressable>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 28 },
  title: { fontFamily: fonts.bold, fontSize: 25, letterSpacing: -0.6, color: colors.ink, marginBottom: 5 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 },
  heroCard: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 18, marginBottom: 12 },
  heroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk60 },
  heroNet: { fontFamily: fonts.extrabold, fontSize: 38, letterSpacing: -1.3, color: colors.white, marginTop: 11, marginBottom: 18 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 96 },
  barCol: { flex: 1, alignItems: 'center', gap: 7 },
  bar: { width: '100%', borderRadius: 5 },
  barLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.onInk60 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: { width: '47.8%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 15 },
  statLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted },
  statValue: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.ink, marginTop: 9 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
  listCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  buyerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  buyerName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  buyerOrders: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  buyerSpend: { fontFamily: fonts.monoSemibold, fontSize: 13, color: colors.ink },
  exportBtn: { borderWidth: 1, borderColor: colors.borderOutline, backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: 15, alignItems: 'center' },
  exportText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
});

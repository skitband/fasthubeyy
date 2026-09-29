import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge } from '@/components/ui';
import { LogPaymentSheet } from '@/components/LogPaymentSheet';
import { useDbData, usePullToRefresh } from '@/db/hooks';
import { getActiveTrip, listOrders } from '@/db/queries';
import type { OrderView } from '@/db/types';
import { colors, fonts, PAY, radius, spacing } from '@/theme/tokens';
import { initials, peso } from '@/lib/money';

export default function Money() {
  const [target, setTarget] = useState<OrderView | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh();
  const data = useDbData((db) => {
    const trip = getActiveTrip(db);
    if (!trip) return null;
    return { trip, orders: listOrders(db, trip.id) };
  });

  if (!data) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <Text style={styles.empty}>No active trip.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { trip, orders } = data;
  const totalDue = orders.reduce((a, o) => a + o.total, 0);
  const collected = orders.reduce((a, o) => a + o.paid, 0);
  const partial = orders.filter((o) => o.pay === 'partial').reduce((a, o) => a + (o.total - o.paid), 0);
  const owed = totalDue - collected;
  const notPaid = Math.max(0, owed - partial);
  const pct = (n: number) => (totalDue ? (n / totalDue) * 100 : 0);
  const shortRoute = `${trip.origin.split(',')[0]} \u2192 ${trip.destination.split(',')[1]?.trim() ?? trip.destination}`;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Payments</Text>
        <Text style={styles.subtitle}>{`${shortRoute} \u00B7 tap a row to log a receipt`}</Text>

        <View style={styles.summaryCard}>
          <View style={styles.bar}>
            <View style={{ width: `${pct(collected)}%`, backgroundColor: colors.successFg }} />
            <View style={{ width: `${pct(partial)}%`, backgroundColor: colors.warningBar }} />
            <View style={{ width: `${pct(notPaid)}%`, backgroundColor: '#E5E2DD' }} />
          </View>
          <View style={{ gap: 10 }}>
            <LegendRow color={colors.successFg} label="Collected" value={peso(collected)} />
            <LegendRow color={colors.warningBar} label="Partial balance" value={peso(partial)} />
            <LegendRow color="#E5E2DD" label="Not paid at all" value={peso(notPaid)} />
          </View>
        </View>

        <View style={{ gap: 9 }}>
          {orders.map((o) => {
            const pay = PAY[o.pay];
            const balance = o.total - o.paid;
            return (
              <Pressable
                key={o.id}
                onPress={() => setTarget(o)}
                style={({ pressed }) => [styles.ledgerRow, pressed && { borderColor: colors.borderHover }]}
              >
                <Avatar label={initials(o.buyer_name)} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.ledgerBuyer}>{o.buyer_name}</Text>
                  <Text style={styles.ledgerMeta}>
                    {o.pay === 'paid' ? 'Fully collected' : `${peso(balance)} balance`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.ledgerTotal}>{peso(o.total)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Badge bg={pay.bg} fg={pay.fg} label={pay.label} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <LogPaymentSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        orderId={target?.id ?? null}
        buyerName={target?.buyer_name ?? ''}
        balance={target ? Math.max(0, target.total - target.paid) : 0}
      />
    </SafeAreaView>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 28 },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, padding: spacing.screen },
  title: { fontFamily: fonts.bold, fontSize: 25, letterSpacing: -0.6, color: colors.ink, marginBottom: 5 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 },
  summaryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.hero, padding: 16, marginBottom: 14 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, backgroundColor: '#E5E2DD' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  legendValue: { fontFamily: fonts.monoSemibold, fontSize: 13, color: colors.ink },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.button, padding: 14 },
  ledgerBuyer: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  ledgerMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  ledgerTotal: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});

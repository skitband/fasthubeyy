import { StyleSheet, Text, View } from 'react-native';
import { BackHeader, Screen } from '@/components/layout';
import { ProgressBar } from '@/components/ui';
import { useDbData } from '@/db/hooks';
import { getActiveTrip, listOrders, luggageUsed } from '@/db/queries';
import { colors, fonts, radius } from '@/theme/tokens';
import { kgLabel } from '@/lib/money';

export default function Luggage() {
  const data = useDbData((db) => {
    const trip = getActiveTrip(db);
    if (!trip) return null;
    return { trip, orders: listOrders(db, trip.id) };
  });

  if (!data) {
    return (
      <Screen refreshable>
        <BackHeader title="Luggage budget" />
        <Text style={styles.hint}>No active trip.</Text>
      </Screen>
    );
  }

  const { trip, orders } = data;
  const used = luggageUsed(orders);
  const allowance = trip.checked_kg;
  const free = Math.max(0, allowance - used);
  const pct = allowance ? (used / allowance) * 100 : 0;
  const heaviest = [...orders]
    .filter((o) => o.kg > 0)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 4);
  const maxKg = heaviest[0]?.kg || 1;

  return (
    <Screen refreshable>
      <BackHeader title="Luggage budget" />

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.big}>{used.toFixed(1)}</Text>
          <Text style={styles.of}>of {allowance} kg allowance</Text>
        </View>
        <View style={{ marginVertical: 16 }}>
          <ProgressBar pct={pct} height={10} />
        </View>
        <Text style={styles.note}>
          {`${free.toFixed(1)} kg still free`}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Weight of orders</Text>
      <View style={styles.listCard}>
        {heaviest.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No order weights entered for this trip yet.</Text>
          </View>
        ) : (
          heaviest.map((o, i) => (
            <View key={o.id} style={[styles.barRow, i === heaviest.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.barBuyer}>{o.buyer_name}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(o.kg / maxKg) * 100}%` }]} />
              </View>
              <Text style={styles.barKg}>{kgLabel(o.kg)}</Text>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.hero, padding: 18, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  big: { fontFamily: fonts.extrabold, fontSize: 44, letterSpacing: -1.8, color: colors.ink },
  of: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  note: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
  listCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  barBuyer: { flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  barTrack: { width: 110, height: 7, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.ink, borderRadius: 4 },
  barKg: { fontFamily: fonts.monoSemibold, fontSize: 12, color: colors.ink, width: 46, textAlign: 'right' },
  emptyRow: { padding: 16 },
  emptyText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted },
});

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, SectionHeader } from '@/components/layout';
import { Card, ProgressBar } from '@/components/ui';
import { OrderCard } from '@/components/OrderCard';
import { TripPickerSheet } from '@/components/TripPickerSheet';
import { NoActiveTrip } from '@/components/NoActiveTrip';
import { useDbData, useRefresh } from '@/db/hooks';
import { countTripOrders, deleteTrip, getActiveTrip, listOrders, listTrips, luggageUsed, setActiveTrip, tripStatus } from '@/db/queries';
import type { Trip } from '@/db/types';
import { Alert } from '@/lib/alert';
import { colors, fonts, radius } from '@/theme/tokens';
import { dateRange, daysBetween, kgLabel, peso, shortDate, todayISO } from '@/lib/money';

export default function TripHub() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const [pickerOpen, setPickerOpen] = useState(false);
  const data = useDbData((d) => {
    const trip = getActiveTrip(d);
    const trips = listTrips(d);
    if (!trip) return { trip: null, trips, orders: [] };
    const orders = listOrders(d, trip.id);
    return { trip, trips, orders };
  });

  function selectTrip(id: string) {
    setActiveTrip(db, id);
    setPickerOpen(false);
    refresh();
  }

  function confirmDeleteTrip(trip: Trip) {
    const route = `${trip.origin.split(',')[0]} \u2192 ${trip.destination.split(',')[0]}`;
    const orderCount = countTripOrders(db, trip.id);
    Alert.alert(
      'Delete trip?',
      orderCount > 0
        ? `${route} and its ${orderCount} order${orderCount === 1 ? '' : 's'} (items and payments) will be deleted. This cannot be undone.`
        : `${route} will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTrip(db, trip.id);
            refresh();
          },
        },
      ]
    );
  }

  if (!data.trip) {
    return <NoActiveTrip />;
  }

  const { trip, trips, orders } = data;
  const collected = orders.reduce((a, o) => a + o.paid, 0);
  const owed = orders.reduce((a, o) => a + (o.total - o.paid), 0);
  const used = luggageUsed(orders);
  const allowance = trip.checked_kg;
  const pct = allowance ? (used / allowance) * 100 : 0;
  const daysLeft = Math.max(0, daysBetween(todayISO(), trip.cutoff_date));
  const attention = orders.filter((o) => o.pay !== 'paid').slice(0, 10);
  const route = `${trip.origin.split(',')[0]} \u2192 ${trip.destination.split(',')[0]}`;

  return (
    <Screen refreshable>
      <View style={styles.topRow}>
        <Pressable style={{ flex: 1 }} onPress={() => setPickerOpen(true)}>
          <Text style={styles.kicker}>Active trip</Text>
          <View style={styles.routeRow}>
            <Text style={styles.route}>{route}</Text>
            <MaterialIcons name="unfold-more" size={25} color={colors.ink} />
          </View>
          <Text style={styles.dates}>{dateRange(trip.depart_date, trip.return_date)}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/trip/new')}
          style={styles.newTripBtn}
          hitSlop={8}
          accessibilityLabel="New trip"
        >
          <MaterialIcons name="add" size={24} color={colors.white} />
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/trip/luggage')} style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroLabel}>Order cutoff</Text>
          <Text style={styles.heroLabel}>{shortDate(trip.cutoff_date)}</Text>
        </View>
        <View style={styles.heroCountRow}>
          <Text style={styles.heroDays}>{daysLeft}</Text>
          <Text style={styles.heroDaysLabel}>days left to accept orders</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroLuggageRow}>
          <Text style={styles.heroLuggageLabel}>Luggage used</Text>
          <Text style={styles.heroLuggageValue}>
            {used.toFixed(1)} / {allowance} kg
          </Text>
        </View>
        <ProgressBar pct={pct} track={colors.onInk18} fill={colors.white} />
      </Pressable>

      <View style={styles.tiles}>
        <Pressable style={styles.tile} onPress={() => router.push('/money')}>
          <Text style={styles.tileLabel}>Collected</Text>
          <Text style={[styles.tileValue, { color: colors.successFg }]}>{peso(collected)}</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={() => router.push('/money')}>
          <Text style={styles.tileLabel}>Still owed</Text>
          <Text style={[styles.tileValue, { color: colors.errorFg }]}>{peso(owed)}</Text>
        </Pressable>
      </View>

      <SectionHeader
        title="Needs your attention"
        right={
          <Pressable onPress={() => router.push('/orders')}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        }
      />
      <View style={{ gap: 9 }}>
        {orders.length === 0 ? (
          <Card>
            <Text style={styles.clearTitle}>No orders yet</Text>
            {tripStatus(trip) === 'closed' ? (
              <Text style={styles.clearBody}>This trip is closed to new orders. Reopen it from Edit trip to add orders.</Text>
            ) : (
              <>
                <Text style={styles.clearBody}>Add your first order for this trip to start tracking items and payments.</Text>
                <Pressable style={styles.emptyBtn} onPress={() => router.push('/order/add')}>
                  <Text style={styles.emptyBtnText}>+ Add order</Text>
                </Pressable>
              </>
            )}
          </Card>
        ) : attention.length === 0 ? (
          <Card>
            <Text style={styles.clearTitle}>All settled</Text>
            <Text style={styles.clearBody}>Every order on this trip is fully paid.</Text>
          </Card>
        ) : (
          attention.map((o) => (
            <OrderCard key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
          ))
        )}
      </View>

      <TripPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        trips={trips}
        activeId={trip.id}
        onSelect={selectTrip}
        onEdit={(t) => {
          setPickerOpen(false);
          router.push({ pathname: '/trip/new', params: { id: t.id } });
        }}
        onDelete={confirmDeleteTrip}
        onNew={() => {
          setPickerOpen(false);
          router.push('/trip/new');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  newTripBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  kicker: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 20 },
  route: { fontFamily: fonts.bold, fontSize: 27, letterSpacing: -0.6, color: colors.ink },
  dates: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 5 },

  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 18, marginBottom: 12 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk62 },
  heroCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 9 },
  heroDays: { fontFamily: fonts.extrabold, fontSize: 40, letterSpacing: -1.6, color: colors.white },
  heroDaysLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.onInk70 },
  heroDivider: { height: 1, backgroundColor: colors.onInk16, marginVertical: 15 },
  heroLuggageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  heroLuggageLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk70 },
  heroLuggageValue: { fontFamily: fonts.monoSemibold, fontSize: 12, color: colors.white },

  tiles: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    padding: 15,
  },
  tileLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted },
  tileValue: { fontFamily: fonts.bold, fontSize: 21, letterSpacing: -0.4, marginTop: 9 },

  seeAll: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.textMuted },
  clearTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink },
  clearBody: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 6 },

  emptyBtn: { marginTop: 20, backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 15, alignItems: 'center' },
  emptyBtnText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.white },
});

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { NoActiveTrip } from '@/components/NoActiveTrip';
import { Input } from '@/components/ui';
import { useDbData, usePullToRefresh } from '@/db/hooks';
import { getActiveTrip, listOrders, luggageUsed } from '@/db/queries';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const FILTERS = ['All', 'Unpaid', 'Paid', 'Bought', 'Packed', 'Delivered'] as const;
type Filter = (typeof FILTERS)[number];
const PAGE_SIZE = 10;

export default function OrdersBoard() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const { refreshing, onRefresh } = usePullToRefresh();
  const data = useDbData((db) => {
    const trip = getActiveTrip(db);
    if (!trip) return null;
    return { trip, orders: listOrders(db, trip.id) };
  });

  if (!data) {
    return <NoActiveTrip />;
  }

  const { trip, orders } = data;
  const used = luggageUsed(orders);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = orders.filter((o) => {
    if (filter === 'All') return true;
    if (filter === 'Unpaid') return o.pay !== 'paid';
    if (filter === 'Paid') return o.pay === 'paid';
    return o.status === filter.toLowerCase();
  }).filter((o) => {
    if (!normalizedSearch) return true;
    return [o.ref, o.id, o.buyer_name, ...o.items.map((item) => item.name)]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });
  const visible = filtered.slice(0, visibleCount);
  const route = `${trip.origin.split(',')[0]} \u2192 ${trip.destination.split(',')[1]?.trim() ?? trip.destination}`;

  function resetVisibleOrders() {
    setVisibleCount(PAGE_SIZE);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }

  function loadMore() {
    if (loadingMoreRef.current || visibleCount >= filtered.length) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }, 250);
  }

  function refreshOrders() {
    resetVisibleOrders();
    onRefresh();
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerPad}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Orders</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/order/add')}>
            <Text style={styles.addBtnText}>+ New order</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {`${route} \u00B7 ${filtered.length} shown of ${orders.length} orders \u00B7 ${used.toFixed(1)} kg booked`}
        </Text>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <Input
            value={search}
            onChangeText={(value) => { setSearch(value); resetVisibleOrders(); }}
            placeholder="Search order number, customer, item"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => { setSearch(''); resetVisibleOrders(); }}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.pills}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => { setFilter(f); resetVisibleOrders(); }}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? colors.ink : colors.surface,
                  borderColor: active ? colors.ink : colors.borderInput,
                },
              ]}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: active ? colors.white : colors.ink }}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderCard order={item} onPress={() => router.push(`/order/${item.id}`)} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshOrders} />}
        ListEmptyComponent={<Text style={styles.empty}>No orders match this filter.</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.ink} style={styles.loadingMore} /> : null}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerPad: { paddingHorizontal: spacing.screen, paddingTop: 6, marginTop: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontFamily: fonts.bold, fontSize: 25, letterSpacing: -0.6, color: colors.ink },
  addBtn: { backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 9, paddingHorizontal: 14 },
  addBtnText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.white },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 14 },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.borderInput, borderRadius: radius.input, paddingHorizontal: 12, backgroundColor: colors.surface, marginBottom: 13 },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  filterBar: { flexGrow: 0, flexShrink: 0 },
  pills: { gap: 7, paddingHorizontal: spacing.screen, paddingBottom: 14, alignItems: 'center' },
  pill: {
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: spacing.screen, paddingBottom: 24, gap: 9, marginTop: 20 },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, paddingHorizontal: spacing.screen, marginTop: 20 },
  loadingMore: { paddingVertical: 14 },
});

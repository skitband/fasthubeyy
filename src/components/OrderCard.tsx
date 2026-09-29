import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, PAY, radius, STATUS } from '@/theme/tokens';
import { initials, kgLabel, peso } from '@/lib/money';
import type { OrderView } from '@/db/types';
import { Avatar, Badge } from './ui';

export function OrderCard({ order, onPress }: { order: OrderView; onPress: () => void }) {
  const st = STATUS[order.status];
  const pay = PAY[order.pay];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.borderHover }]}
    >
      <View style={styles.row}>
        <Avatar label={initials(order.buyer_name)} size={34} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.buyerBlock}>
              <Text style={styles.orderNumber}>{order.ref ?? order.id}</Text>
              <Text style={styles.buyer} numberOfLines={1}>{order.buyer_name}</Text>
            </View>
            <Text style={styles.total}>{peso(order.total)}</Text>
          </View>
          <View style={styles.badgeRow}>
            <Badge bg={st.bg} fg={st.fg} label={st.label} />
            <Badge bg={pay.bg} fg={pay.fg} label={pay.label} />
            <Text style={styles.kg}>{kgLabel(order.kg)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    padding: 15,
  },
  row: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  buyerBlock: { flex: 1, minWidth: 0 },
  orderNumber: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.textMuted, marginBottom: 3 },
  buyer: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink },
  total: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center' },
  kg: { marginLeft: 'auto', fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textMuted },
});

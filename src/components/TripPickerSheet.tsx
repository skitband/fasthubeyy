import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Badge } from './ui';
import type { Trip } from '@/db/types';
import { colors, fonts, radius } from '@/theme/tokens';
import { dateRange } from '@/lib/money';

export function TripPickerSheet({
  visible,
  onClose,
  trips,
  activeId,
  onSelect,
  onNew,
}: {
  visible: boolean;
  onClose: () => void;
  trips: Trip[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Select trip</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <MaterialIcons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {trips.map((t) => {
            const active = t.id === activeId;
            const route = `${t.origin.split(',')[0]} \u2192 ${t.destination.split(',')[0]}`;
            const open = t.status === 'open';
            return (
              <Pressable
                key={t.id}
                onPress={() => onSelect(t.id)}
                style={[styles.tripRow, active && { borderColor: colors.ink, backgroundColor: colors.surfaceSubtle }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.route}>{route}</Text>
                  <Text style={styles.dates}>{dateRange(t.depart_date, t.return_date)}</Text>
                </View>
                <Badge
                  bg={open ? colors.infoBg : colors.neutralBg}
                  fg={open ? colors.infoFg : colors.neutralFg}
                  label={open ? 'OPEN' : 'CLOSED'}
                />
                {active ? (
                  <MaterialIcons name="check-circle" size={20} color={colors.ink} style={{ marginLeft: 8 }} />
                ) : (
                  <View style={{ width: 28 }} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable style={styles.newRow} onPress={onNew}>
          <MaterialIcons name="add" size={20} color={colors.white} />
          <Text style={styles.newText}>New trip</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,12,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.track, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 9,
  },
  route: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  dates: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: 15,
    marginTop: 6,
  },
  newText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.white },
});

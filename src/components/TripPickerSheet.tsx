import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Badge } from './ui';
import { tripStatus } from '@/db/queries';
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
  onEdit,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  trips: Trip[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Modals render outside the app root, so gestures need their own root here (Android). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Select trip</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <MaterialIcons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.hint}>Swipe a trip left to edit or delete it.</Text>

        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {trips.map((t) => {
            const active = t.id === activeId;
            const route = `${t.origin.split(',')[0]} \u2192 ${t.destination.split(',')[0]}`;
            const open = tripStatus(t) === 'open';
            return (
              <View key={t.id} style={[styles.tripCard, active && { borderColor: colors.ink }]}>
                <ReanimatedSwipeable
                  overshootRight={false}
                  rightThreshold={40}
                  friction={2}
                  renderRightActions={(_progress, _translation, swipeable) => (
                    <View style={styles.swipeActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit trip ${route}`}
                        style={[styles.swipeAction, styles.editAction]}
                        onPress={() => {
                          swipeable.close();
                          onEdit(t);
                        }}
                      >
                        <MaterialIcons name="edit" size={19} color={colors.ink} />
                        <Text style={styles.editActionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete trip ${route}`}
                        style={[styles.swipeAction, styles.deleteAction]}
                        onPress={() => {
                          swipeable.close();
                          onDelete(t);
                        }}
                      >
                        <MaterialIcons name="delete-outline" size={19} color={colors.errorFg} />
                        <Text style={styles.deleteActionText}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelect(t.id)}
                    style={[styles.tripRow, active && { backgroundColor: colors.surfaceSubtle }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.route}>{route}</Text>
                      <Text style={styles.dates}>{dateRange(t.depart_date, t.return_date)}</Text>
                    </View>
                    <Badge
                      bg={open ? colors.infoBg : colors.neutralBg}
                      fg={open ? colors.infoFg : colors.neutralFg}
                      label={open ? 'OPEN' : 'CLOSED'}
                      style={styles.badge}
                    />
                    {active ? (
                      <MaterialIcons name="check-circle" size={20} color={colors.ink} style={{ marginLeft: 8 }} />
                    ) : (
                      <View style={{ width: 28 }} />
                    )}
                    <MaterialIcons
                      name="menu-open"
                      size={20}
                      color={colors.textDisabled}
                      accessibilityLabel="Swipe left for edit and delete"
                    />
                  </Pressable>
                </ReanimatedSwipeable>
              </View>
            );
          })}
        </ScrollView>

        <Pressable style={styles.newRow} onPress={onNew}>
          <MaterialIcons name="add" size={20} color={colors.white} />
          <Text style={styles.newText}>New trip</Text>
        </Pressable>
      </View>
      </GestureHandlerRootView>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  tripCard: {
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: 9,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: colors.surface,
  },
  route: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  swipeActions: { flexDirection: 'row', alignSelf: 'stretch' },
  swipeAction: { width: 70, alignItems: 'center', justifyContent: 'center', gap: 4 },
  editAction: { backgroundColor: colors.muted },
  deleteAction: { backgroundColor: colors.errorBg },
  badge: { alignSelf: 'center' },
  editActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.ink },
  deleteActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.errorFg },
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

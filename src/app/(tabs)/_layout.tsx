import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  function openMoreRoute(route: '/more/customers' | '/more/settings') {
    setMoreOpen(false);
    router.push(route);
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.borderCard,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10.5 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Trip',
            tabBarIcon: ({ color }) => <MaterialIcons name="flight-takeoff" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color }) => <MaterialIcons name="inventory-2" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="money"
          options={{
            title: 'Payments',
            tabBarIcon: ({ color }) => <MaterialIcons name="payments" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color }) => <MaterialIcons name="bar-chart" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              setMoreOpen(true);
            },
          }}
          options={{
            title: 'More',
            tabBarIcon: ({ color }) => <MaterialIcons name="more-horiz" size={22} color={color} />,
          }}
        />
      </Tabs>

      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close More menu" style={styles.dismissArea} onPress={() => setMoreOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>More</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close More menu" hitSlop={10} onPress={() => setMoreOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={() => openMoreRoute('/more/customers')}>
              <View style={styles.optionIcon}>
                <MaterialIcons name="people-outline" size={21} color={colors.ink} />
              </View>
              <Text style={styles.optionText}>Customers</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={() => openMoreRoute('/more/settings')}>
              <View style={styles.optionIcon}>
                <MaterialIcons name="settings" size={21} color={colors.ink} />
              </View>
              <Text style={styles.optionText}>Settings</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dismissArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 18, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  option: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  optionPressed: { opacity: 0.65 },
  optionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.muted },
  optionText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.hairline, marginLeft: 50 },
});

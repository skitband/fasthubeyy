import { Link } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function More() {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Manage customers and app data</Text>

        <View style={styles.group}>
          <Link href="/more/settings" asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.iconBox}>
                <MaterialIcons name="settings" size={21} color={colors.ink} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>Settings</Text>
                <Text style={styles.rowDescription}>Database backup, restore, and reset</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          </Link>
          <View style={styles.divider} />
          <Link href="/more/customers" asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.iconBox}>
                <MaterialIcons name="people-outline" size={21} color={colors.ink} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>Customers</Text>
                <Text style={styles.rowDescription}>Add, edit, and remove customer records</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 32 },
  title: { fontFamily: fonts.bold, fontSize: 25, color: colors.ink, marginBottom: 5 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 24 },
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pressed: { backgroundColor: colors.background },
  iconBox: { width: 40, height: 40, borderRadius: radius.input, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  rowDescription: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.hairline, marginLeft: 66 },
});
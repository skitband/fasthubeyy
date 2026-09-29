import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/db/hooks';
import { colors, fonts, spacing } from '@/theme/tokens';

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
  edges = ['top'],
  refreshable = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  refreshable?: boolean;
}) {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <SafeAreaView edges={edges} style={[styles.safe, style]}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshable ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function BackHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable hitSlop={10} onPress={onBack ?? (() => router.back())}>
        <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 16 },
  headerTitle: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 11,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: -0.2, color: colors.ink },
  label: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
});

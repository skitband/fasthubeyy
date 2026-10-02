import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Screen } from './layout';
import { colors, fonts, radius } from '@/theme/tokens';

export function NoActiveTrip() {
  const router = useRouter();
  return (
    <Screen refreshable>
      <Text style={styles.title}>No active trip</Text>
      <Text style={styles.body}>Create a trip to start taking orders.</Text>
      <Pressable style={styles.btn} onPress={() => router.push('/trip/new')}>
        <Text style={styles.btnText}>+ New trip</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 40 },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 8 },
  btn: { marginTop: 20, backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 15, alignItems: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.white },
});

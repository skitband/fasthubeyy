import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, fonts, radius } from '@/theme/tokens';
import { Alert } from '@/lib/alert';
import { saveBundledImage } from '@/lib/saveImage';

const KOFI_URL = 'https://ko-fi.com/serjolio00';
const GCASH_NUMBER = '09544988046';
const gcashQr = require('../../../assets/gcash-qr.jpg');

export default function TabsLayout() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const [moreOpen, setMoreOpen] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  function openMoreRoute(route: '/more/customers' | '/more/settings') {
    setMoreOpen(false);
    router.push(route);
  }

  function openGcashQr() {
    setMoreOpen(false);
    setCopied(false);
    setSaveState('idle');
    setQrVisible(true);
  }

  async function copyNumber() {
    await Clipboard.setStringAsync(GCASH_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadQr() {
    setSaveState('saving');
    try {
      const saved = await saveBundledImage(gcashQr, 'gcash-qr.jpg');
      if (!saved) {
        setSaveState('idle');
        Alert.alert('Permission needed', 'Allow photo access to save the QR code to your gallery.');
        return;
      }
      setSaveState('saved');
    } catch {
      setSaveState('idle');
      Alert.alert('Could not save', 'Take a screenshot of the QR code instead.');
    }
  }

  function openKofi() {
    setMoreOpen(false);
    Linking.openURL(KOFI_URL);
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

            <Text style={styles.sectionLabel}>Support the developer</Text>
            <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={openGcashQr}>
              <View style={styles.optionIcon}>
                <MaterialIcons name="qr-code-2" size={21} color={colors.ink} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>GCash / InstaPay</Text>
                <Text style={styles.optionDescription}>Scan the QR with any bank or e-wallet</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable accessibilityRole="link" style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={openKofi}>
              <View style={styles.optionIcon}>
                <MaterialIcons name="local-cafe" size={21} color={colors.ink} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Buy me a coffee on Ko-fi</Text>
                <Text style={styles.optionDescription}>Card or PayPal, from anywhere</Text>
              </View>
              <MaterialIcons name="open-in-new" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.qrOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close QR code" style={styles.dismissArea} onPress={() => setQrVisible(false)} />
          <View style={styles.qrDialog}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Donate via GCash</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close QR code" hitSlop={10} onPress={() => setQrVisible(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Image source={gcashQr} style={[styles.qr, { maxHeight: Math.min(windowHeight * 0.45, 340) }]} resizeMode="contain" accessibilityLabel="GCash InstaPay QR code" />
            <View style={styles.numberRow}>
              <Text style={styles.numberLabel}>GCash</Text>
              <Text style={styles.numberText} selectable>{GCASH_NUMBER}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copied ? 'Number copied' : 'Copy GCash number'}
                hitSlop={10}
                onPress={copyNumber}
              >
                <MaterialIcons name={copied ? 'check' : 'content-copy'} size={18} color={copied ? colors.successFg : colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={saveState !== 'idle'}
              style={({ pressed }) => [styles.downloadButton, pressed && styles.optionPressed]}
              onPress={downloadQr}
            >
              {saveState === 'saving' ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <MaterialIcons name={saveState === 'saved' ? 'check' : 'file-download'} size={19} color={colors.white} />
              )}
              <Text style={styles.downloadText}>{saveState === 'saved' ? 'Saved to gallery' : 'Download QR'}</Text>
            </Pressable>
            <Text style={styles.qrThanks}>Salamat sa suporta!</Text>
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
  sectionLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 2 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  optionDescription: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  qrOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrDialog: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.hero, padding: 18 },
  qr: { width: '100%', aspectRatio: 1, alignSelf: 'center', borderRadius: radius.card },
  qrHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  qrThanks: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, textAlign: 'center', marginTop: 8 },
  numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  numberLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  numberText: { fontFamily: fonts.monoSemibold, fontSize: 15, color: colors.ink },
  downloadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.button, backgroundColor: colors.ink, marginTop: 12 },
  downloadText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.white },
});

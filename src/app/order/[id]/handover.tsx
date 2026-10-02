import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { MaterialIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHeader, Screen } from '@/components/layout';
import { Input } from '@/components/ui';
import { useDbData, useRefresh } from '@/db/hooks';
import { getOrder, setOrderStatus, updateOrderShipment } from '@/db/queries';
import { colors, fonts, radius } from '@/theme/tokens';
import { peso, spacedCode } from '@/lib/money';
import { toDataUri } from '@/lib/dataUri';

const CHECKLIST = [
  { id: 'c1', label: 'All items checked against the order' },
  { id: 'c2', label: 'Balance collected or receipt attached' },
  { id: 'c3', label: 'Buyer read back the handover code' },
];

export default function Handover() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const [checked, setChecked] = useState<Record<string, boolean>>({ c1: false, c2: false, c3: false });
  const [trackingCode, setTrackingCode] = useState('');
  const [deliveryProofUri, setDeliveryProofUri] = useState<string | null>(null);

  const order = useDbData((d) => getOrder(d, id));

  if (!order) {
    return (
      <Screen>
        <BackHeader title="Hand over" />
        <Text style={styles.hint}>Order not found.</Text>
      </Screen>
    );
  }

  const allChecked = CHECKLIST.every((c) => checked[c.id]);
  const fullyPaid = order.pay === 'paid';
  const canComplete = fullyPaid && allChecked && !!deliveryProofUri;
  const orderId = order.id;
  const firstName = order.buyer_name.split(' ')[0];

  async function attachDeliveryProof() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach delivery proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) setDeliveryProofUri(await toDataUri(result.assets[0].uri, result.assets[0].mimeType));
  }

  function complete() {
    if (!canComplete || !deliveryProofUri) return;
    try {
      db.withTransactionSync(() => {
        updateOrderShipment(db, orderId, { trackingCode, deliveryProofUri });
        setOrderStatus(db, orderId, 'delivered', trackingCode.trim() ? `Tracking ${trackingCode.trim()}` : 'Handed over');
      });
    } catch (error) {
      Alert.alert('Could not mark as delivered', String(error));
      return;
    }
    refresh();
    router.replace('/orders');
  }

  return (
    <Screen>
      <BackHeader title="Hand over" />

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Handover code</Text>
        <Text style={styles.code}>{spacedCode(order.handover_code ?? '0000')}</Text>
        <Text style={styles.codeNote}>Ask {firstName} to read this back before you release the bag.</Text>
      </View>

      <View style={styles.listCard}>
        {CHECKLIST.map((c, i) => {
          const on = checked[c.id];
          return (
            <Pressable
              key={c.id}
              onPress={() => setChecked((s) => ({ ...s, [c.id]: !s[c.id] }))}
              style={[styles.checkRow, i === CHECKLIST.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.box, { borderColor: on ? colors.ink : colors.borderHover, backgroundColor: on ? colors.ink : colors.surface }]}>
                {on ? <MaterialIcons name="check" size={14} color={colors.white} /> : null}
              </View>
              <Text style={[styles.checkLabel, { color: on ? colors.ink : colors.textMuted }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.shipmentCard}>
        <Text style={styles.shipmentTitle}>Delivery details</Text>
        <Text style={styles.shipmentLabel}>Tracking code (optional)</Text>
        <Input value={trackingCode} onChangeText={setTrackingCode} placeholder="Carrier tracking number" autoCapitalize="characters" />
        <Text style={styles.shipmentLabel}>Delivery proof *</Text>
        <Pressable style={styles.proofButton} onPress={attachDeliveryProof}>
          {deliveryProofUri ? (
            <Image source={{ uri: deliveryProofUri }} style={styles.proofPreview} />
          ) : (
            <MaterialIcons name="add-a-photo" size={21} color={colors.textMuted} />
          )}
          <Text style={styles.proofButtonText}>{deliveryProofUri ? 'Change delivery proof' : 'Attach delivery proof'}</Text>
          {deliveryProofUri ? <MaterialIcons name="check-circle" size={20} color={colors.successFg} /> : null}
        </Pressable>
      </View>

      <Pressable
        onPress={complete}
        disabled={!canComplete}
        style={[styles.cta, { backgroundColor: canComplete ? colors.ink : colors.buttonDisabled }]}
      >
        <Text style={styles.ctaText}>
          {!fullyPaid
            ? `Collect ${peso(order.total - order.paid)} first`
            : !allChecked
              ? 'Finish the checklist first'
              : !deliveryProofUri
                ? 'Attach delivery proof first'
                : 'Mark delivered'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  codeCard: { backgroundColor: colors.ink, borderRadius: 18, padding: 22, alignItems: 'center', marginBottom: 14 },
  codeLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk60 },
  code: { fontFamily: fonts.monoSemibold, fontSize: 44, letterSpacing: 5, color: colors.white, marginVertical: 14 },
  codeNote: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onInk62, textAlign: 'center' },
  listCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  box: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5 },
  shipmentCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 14, marginBottom: 16 },
  shipmentTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink, marginBottom: 2 },
  shipmentLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 12, marginBottom: 7 },
  proofButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.borderInput, borderStyle: 'dashed', borderRadius: radius.input, padding: 9 },
  proofPreview: { width: 40, height: 40, borderRadius: 6 },
  proofButtonText: { flex: 1, fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  cta: { borderRadius: radius.button, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.white },
});

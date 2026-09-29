import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Input, PrimaryButton } from './ui';
import { addPayment } from '@/db/queries';
import { useRefresh } from '@/db/hooks';
import { colors, fonts, radius } from '@/theme/tokens';
import { peso } from '@/lib/money';
import type { PayMethod } from '@/db/types';

const METHODS: { key: PayMethod; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
];

export function LogPaymentSheet({
  visible,
  onClose,
  orderId,
  buyerName,
  balance,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string | null;
  buyerName: string;
  balance: number;
}) {
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('gcash');
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAmount(balance > 0 ? String(Math.round(balance)) : '');
      setMethod('gcash');
      setReference('');
      setProofUri(null);
    }
  }, [visible, balance]);

  async function attach() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) setProofUri(result.assets[0].uri);
  }

  function submit() {
    if (!orderId) return;
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      Alert.alert('Amount required', 'Enter an amount greater than zero.');
      return;
    }
    addPayment(db, { orderId, amount: amt, method, reference: reference.trim() || undefined, proofUri: proofUri ?? undefined });
    refresh();
    onClose();
  }

  type PayMethodKey = (typeof METHODS)[number]['key'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modal}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Log payment</Text>
              <Pressable hitSlop={10} onPress={onClose}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.sub}>
              {buyerName}
              {balance > 0 ? ` \u00B7 ${peso(balance)} balance` : ''}
            </Text>

            <Text style={styles.label}>Amount</Text>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ fontFamily: fonts.monoSemibold }} />

            <Text style={styles.label}>Method</Text>
            <View style={styles.methods}>
              {METHODS.map((m) => {
                const active = method === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setMethod(m.key as PayMethodKey)}
                    style={[styles.method, { backgroundColor: active ? colors.ink : colors.surface, borderColor: active ? colors.ink : colors.borderInput }]}
                  >
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: active ? colors.white : colors.ink }}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Reference (optional)</Text>
            <Input value={reference} onChangeText={setReference} placeholder="e.g. GCash ref 8842 1190" />

            <Pressable style={styles.attach} onPress={attach}>
              <MaterialIcons name={proofUri ? 'check-circle' : 'add-a-photo'} size={18} color={proofUri ? colors.successFg : colors.textMuted} />
              <Text style={[styles.attachText, proofUri && { color: colors.successFg }]}>
                {proofUri ? 'Screenshot attached' : 'Attach screenshot'}
              </Text>
            </Pressable>

            <PrimaryButton title="Save payment" onPress={submit} style={{ marginTop: 6 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11,11,12,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 28,
  },
  sheetContent: { paddingBottom: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.track, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  label: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 12, marginBottom: 7 },
  methods: { flexDirection: 'row', gap: 8 },
  method: { flex: 1, alignItems: 'center', borderRadius: radius.input, borderWidth: 1, paddingVertical: 12 },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  attachText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
});

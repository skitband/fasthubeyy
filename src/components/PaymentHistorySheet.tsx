import { useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { DangerButton, DangerIconButton, PrimaryButton } from './ui';
import { useRefresh } from '@/db/hooks';
import { deletePayment, listPayments, markOrderUnpaid } from '@/db/queries';
import type { Payment } from '@/db/types';
import { colors, fonts, radius } from '@/theme/tokens';
import { peso } from '@/lib/money';
import { Alert } from '@/lib/alert';
import { shareStoredFile } from '@/lib/dataUri';

export function PaymentHistorySheet({
  visible,
  onClose,
  orderId,
  buyerName,
  total,
  paid,
  onLogPayment,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string | null;
  buyerName: string;
  total: number;
  paid: number;
  onLogPayment?: () => void;
}) {
  const db = useSQLiteContext();
  const { version, refresh } = useRefresh();
  // Keyed on orderId/visible: the sheet stays mounted while the selected order changes.
  const payments = useMemo(
    () => (visible && orderId ? listPayments(db, orderId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` re-runs the query after refresh()
    [db, version, orderId, visible]
  );
  const pendingLog = useRef(false);
  const [viewing, setViewing] = useState<Payment | null>(null);
  const balance = Math.max(0, total - paid);
  // Payments on a fully paid order are locked, matching the rest of the order screen.
  const canEdit = balance > 0;

  function confirmDeletePayment(payment: Payment) {
    Alert.alert('Delete payment?', `Delete the ${peso(payment.amount)} payment? The balance will go back up.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePayment(db, payment.id);
          refresh();
        },
      },
    ]);
  }

  function confirmClearPayments() {
    if (!orderId) return;
    Alert.alert('Clear all payments?', `Delete all ${payments.length} payment records for this order? It will be marked unpaid.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => {
          markOrderUnpaid(db, orderId);
          refresh();
        },
      },
    ]);
  }

  function close() {
    setViewing(null);
    onClose();
  }

  async function downloadReceipt(payment: Payment) {
    if (!payment.proof_uri) return;
    try {
      await shareStoredFile(payment.proof_uri, `receipt-${payment.paid_at.slice(0, 10)}.jpg`);
    } catch (error) {
      Alert.alert('Could not open receipt', String(error));
    }
  }

  function requestLogPayment() {
    // iOS can't present the next sheet until this modal has fully dismissed.
    if (Platform.OS === 'ios') {
      pendingLog.current = true;
      close();
    } else {
      close();
      onLogPayment?.();
    }
  }

  function onDismiss() {
    if (!pendingLog.current) return;
    pendingLog.current = false;
    onLogPayment?.();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => (viewing ? setViewing(null) : close())} onDismiss={onDismiss}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Payment history</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close payment history" hitSlop={10} onPress={close}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.sub}>{buyerName}</Text>

          <View style={styles.summary}>
            <SummaryCell label="Total" value={peso(total)} />
            <SummaryCell label="Collected" value={peso(paid)} color={colors.successFg} />
            <SummaryCell label="Balance" value={peso(balance)} color={balance > 0 ? colors.errorFg : colors.ink} />
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {payments.length === 0 ? (
              <Text style={styles.empty}>No payments logged yet.</Text>
            ) : (
              payments.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Pressable
                    disabled={!p.proof_uri}
                    accessibilityRole={p.proof_uri ? 'button' : undefined}
                    accessibilityLabel={p.proof_uri ? `View receipt for ${peso(p.amount)}` : undefined}
                    onPress={() => setViewing(p)}
                    style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
                  >
                    {p.proof_uri ? (
                      <Image source={{ uri: p.proof_uri }} style={styles.thumb} />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <MaterialIcons name="receipt-long" size={19} color={colors.ink} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.amount}>{peso(p.amount)}</Text>
                        <Text style={styles.method}>{(p.method ?? 'payment').toUpperCase()}</Text>
                      </View>
                      <Text style={styles.meta}>{new Date(p.paid_at).toLocaleString()}</Text>
                      {p.reference ? <Text style={styles.meta}>{`Ref: ${p.reference}`}</Text> : null}
                      {p.note ? <Text style={styles.note}>{p.note}</Text> : null}
                      {p.proof_uri ? <Text style={styles.viewLink}>View receipt</Text> : null}
                    </View>
                  </Pressable>
                  {canEdit ? (
                    <DangerIconButton
                      accessibilityLabel={`Delete ${peso(p.amount)} payment`}
                      onPress={() => confirmDeletePayment(p)}
                      style={styles.rowDelete}
                    />
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>

          {canEdit && onLogPayment ? (
            <PrimaryButton title="Log payment" onPress={requestLogPayment} style={{ marginTop: 12 }} />
          ) : null}
          {canEdit && payments.length > 0 ? (
            <DangerButton title="Delete payment" onPress={confirmClearPayments} style={{ marginTop: 10 }} />
          ) : null}
          {!canEdit ? (
            <View style={styles.paidBanner}>
              <MaterialIcons name="check-circle" size={18} color={colors.successFg} />
              <Text style={styles.paidText}>Paid in full</Text>
            </View>
          ) : null}
        </View>

        {/* Rendered inside this modal; stacking a second Modal is unreliable on iOS. */}
        {viewing?.proof_uri ? (
          <View style={styles.viewerOverlay}>
            <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(null)} />
            <View style={styles.viewerDialog}>
              <View style={styles.headerRow}>
                <Text style={styles.viewerTitle}>{`Receipt · ${peso(viewing.amount)}`}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close receipt" hitSlop={10} onPress={() => setViewing(null)}>
                  <MaterialIcons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.meta}>
                {[(viewing.method ?? 'payment').toUpperCase(), new Date(viewing.paid_at).toLocaleString(), viewing.reference ? `Ref: ${viewing.reference}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Image source={{ uri: viewing.proof_uri }} style={styles.viewerImage} resizeMode="contain" />
              <PrimaryButton title="Download" onPress={() => void downloadReceipt(viewing)} style={{ marginTop: 12 }} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.track, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCell: { flex: 1, backgroundColor: colors.surfaceSubtle, borderRadius: radius.input, padding: 10 },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.monoSemibold, fontSize: 13.5, color: colors.ink, marginTop: 5 },
  list: { flexGrow: 0 },
  empty: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, paddingVertical: 18, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 11 },
  thumb: { width: 42, height: 42, borderRadius: radius.input },
  thumbPlaceholder: { width: 42, height: 42, borderRadius: radius.input, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  amount: { fontFamily: fonts.monoSemibold, fontSize: 14, color: colors.ink },
  method: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.5 },
  meta: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 3 },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.ink, marginTop: 5 },
  paidBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 12, borderRadius: radius.button, backgroundColor: colors.successBg },
  paidText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.successFg },
  rowDelete: { alignSelf: 'center' },
  viewLink: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.infoFg, marginTop: 5 },
  viewerOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 20 },
  viewerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.6)' },
  viewerDialog: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.hero, padding: 16 },
  viewerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginRight: 12 },
  viewerImage: { width: '100%', height: 380, marginTop: 12, backgroundColor: colors.surfaceSubtle, borderRadius: radius.button },
});

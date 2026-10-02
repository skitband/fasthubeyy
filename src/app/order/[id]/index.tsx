import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Formik, type FormikProps } from 'formik';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSQLiteContext } from 'expo-sqlite';
import { Badge, DangerButton, Input, PrimaryButton } from '@/components/ui';
import { LogPaymentSheet } from '@/components/LogPaymentSheet';
import { PaymentHistorySheet } from '@/components/PaymentHistorySheet';
import { useDbData, usePullToRefresh, useRefresh } from '@/db/hooks';
import { addOrderAttachment, canAddItemsToOrder, canDeleteOrder, clearPaymentProof, deleteOrder, deleteOrderAttachment, deleteOrderItem, getOrder, getTrip, listOrderAttachments, listOrderEvents, listPayments, markOrderFullyPaid, markOrderUnpaid, setOrderStatus, setOrderWeight, tripStatus, updateOrderItem } from '@/db/queries';
import type { OrderAttachment, OrderItem, OrderStatus } from '@/db/types';
import { colors, fonts, PAY, radius, spacing, STATUS } from '@/theme/tokens';
import { peso } from '@/lib/money';
import { toDataUri, shareStoredFile } from '@/lib/dataUri';
import { editOrderItemValidationSchema, type EditOrderItemFormValues } from '@/lib/formSchemas';

const CHAIN = ['confirmed', 'bought', 'packed', 'delivered'] as const;
const STEP_LABEL: Record<string, string> = {
  confirmed: 'Order confirmed',
  bought: 'Bought',
  packed: 'Packed',
  delivered: 'Delivered',
};
const NEXT_PROGRESS: Partial<Record<OrderStatus, { status: OrderStatus; label: string; note: string }>> = {
  requested: { status: 'confirmed', label: 'Confirm order', note: 'Order confirmed' },
  confirmed: { status: 'bought', label: 'Mark as bought', note: 'Items purchased' },
  bought: { status: 'packed', label: 'Mark as packed', note: 'Items packed' },
};

type OrderDetailAttachment = {
  id: string;
  orderAttachmentId: string | null;
  paymentId: string | null;
  name: string;
  uri: string | null;
  mimeType: string | null;
  sourceLabel: string;
  details: string;
};

function isImageAttachment(attachment: OrderDetailAttachment): boolean {
  return attachment.mimeType?.startsWith('image/') === true || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(attachment.name);
}

// Payment rows without a receipt image have nothing to delete; the payment itself is kept.
function canDeleteAttachment(attachment: OrderDetailAttachment): boolean {
  return !!attachment.orderAttachmentId || (!!attachment.paymentId && !!attachment.uri);
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const pullRefresh = usePullToRefresh();
  const [sheet, setSheet] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [weightError, setWeightError] = useState('');
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [attachmentSourceOpen, setAttachmentSourceOpen] = useState(false);
  const pendingAttachmentSource = useRef<OrderAttachment['source'] | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<OrderDetailAttachment | null>(null);

  const data = useDbData((d) => {
    const order = getOrder(d, id);
    if (!order) return null;
    return {
      order,
      trip: getTrip(d, order.trip_id),
      payments: listPayments(d, order.id),
      attachments: listOrderAttachments(d, order.id),
      events: listOrderEvents(d, order.id),
    };
  });

  useEffect(() => {
    if (data?.order) setWeightDraft(String(data.order.weight_kg));
  }, [data?.order.id, data?.order.weight_kg]);

  if (!data) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Text style={styles.missing}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const { order, trip, payments, attachments, events } = data;
  const tripClosed = !!trip && tripStatus(trip) === 'closed';
  const itemsEditable = canAddItemsToOrder(order) && !tripClosed;
  const orderDeletable = canDeleteOrder(order) && !tripClosed;
  const st = STATUS[order.status];
  const pay = PAY[order.pay];
  const subtotal = order.total - order.fee;
  const balance = order.total - order.paid;
  const reachedIdx = ['requested', ...CHAIN].indexOf(order.status);
  const attachmentRows: OrderDetailAttachment[] = [
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      orderAttachmentId: null,
      paymentId: payment.id,
      name: `Payment · ${peso(payment.amount)}`,
      uri: payment.proof_uri,
      mimeType: payment.proof_uri ? 'image/*' : null,
      sourceLabel: 'Payment receipt',
      details: [
        (payment.method ?? 'payment').toUpperCase(),
        new Date(payment.paid_at).toLocaleString(),
        payment.reference ? `Ref: ${payment.reference}` : '',
        payment.note ?? '',
      ].filter(Boolean).join(' · '),
    })),
    ...attachments.map((attachment) => ({
      id: `order-${attachment.id}`,
      orderAttachmentId: attachment.id,
      paymentId: null,
      name: attachment.name,
      uri: attachment.uri,
      mimeType: attachment.mime_type,
      sourceLabel: attachment.source[0].toUpperCase() + attachment.source.slice(1),
      details: new Date(attachment.created_at).toLocaleString(),
    })),
  ];

  function confirmDeleteOrder() {
    if (!orderDeletable) return;
    Alert.alert(
      'Delete order?',
      `Delete ${order.ref} for ${order.buyer_name}? Its items and payments will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteOrder(db, order.id);
            router.back();
            refresh();
          },
        },
      ]
    );
  }

  function togglePaid() {
    if (order.pay === 'paid') {
      Alert.alert(
        'Mark as unpaid?',
        `All ${payments.length} payment record${payments.length === 1 ? '' : 's'} for ${order.ref} will be removed and the full ${peso(order.total)} will be owed again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark unpaid',
            style: 'destructive',
            onPress: () => {
              markOrderUnpaid(db, order.id);
              refresh();
            },
          },
        ]
      );
      return;
    }
    Alert.alert(
      'Mark fully paid?',
      `A ${peso(balance)} cash payment will be logged to settle ${order.ref} for ${order.buyer_name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark paid',
          onPress: () => {
            markOrderFullyPaid(db, order.id);
            refresh();
          },
        },
      ]
    );
  }

  const nextProgress = NEXT_PROGRESS[order.status];
  const weightRequired = nextProgress?.status === 'packed';
  // Weight stays editable until packed, even on paid orders, so packing is never blocked.
  const weightEditable = order.status !== 'packed' && order.status !== 'delivered';

  function advanceProgress() {
    if (!nextProgress) return;
    if (nextProgress.status === 'packed') {
      const trimmed = weightDraft.trim();
      const weight = Number(trimmed);
      if (!trimmed || !Number.isFinite(weight) || weight <= 0) {
        setWeightError('Enter the total order weight before marking as packed.');
        return;
      }
      if (weight !== order.weight_kg) setOrderWeight(db, order.id, weight);
    }
    setOrderStatus(db, order.id, nextProgress.status, nextProgress.note);
    refresh();
  }

  function saveWeight() {
    const trimmed = weightDraft.trim();
    const weight = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(weight) || weight < 0) {
      setWeightError('Enter a valid weight of 0 or greater.');
      return;
    }
    setWeightError('');
    if (weight !== order.weight_kg) {
      setOrderWeight(db, order.id, weight);
      refresh();
    }
  }

  function saveEditedItem(values: EditOrderItemFormValues) {
    if (!editingItem) return;
    updateOrderItem(db, editingItem.id, {
      name: values.name.trim(),
      unitCost: Number(values.cost),
      qty: Number(values.qty),
      photoUri: values.photoUri,
    });
    setEditingItem(null);
    refresh();
  }

  async function chooseItemPhoto(
    setFieldValue: FormikProps<EditOrderItemFormValues>['setFieldValue']
  ) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to update the item photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) {
      const asset = result.assets[0];
      await setFieldValue('photoUri', await toDataUri(asset.uri, asset.mimeType));
    }
  }

  function confirmDeleteItem(item: OrderItem, closeSwipe: () => void) {
    closeSwipe();
    Alert.alert(
      'Remove item?',
      `Remove ${item.name} from this order? Its amount and fee will be removed from the order total.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteOrderItem(db, item.id);
            refresh();
          },
        },
      ]
    );
  }

  async function storeAttachment(input: { name: string; uri: string; source: OrderAttachment['source']; mimeType?: string | null }) {
    const uri = await toDataUri(input.uri, input.mimeType);
    addOrderAttachment(db, { orderId: order.id, ...input, uri });
    refresh();
  }

  function chooseAttachmentSource(source: OrderAttachment['source']) {
    setAttachmentSourceOpen(false);
    // iOS can't present a picker while the menu modal is still dismissing; wait for onDismiss.
    if (Platform.OS === 'ios') pendingAttachmentSource.current = source;
    else void addAttachment(source);
  }

  function onAttachmentMenuDismiss() {
    const source = pendingAttachmentSource.current;
    pendingAttachmentSource.current = null;
    if (source) void addAttachment(source);
  }

  async function addAttachment(source: OrderAttachment['source']) {
    try {
      if (source === 'file') {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
        if (result.canceled || !result.assets?.length) return;
        const file = result.assets[0];
        await storeAttachment({ name: file.name, uri: file.uri, source, mimeType: file.mimeType });
        return;
      }

      if (source === 'photo') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo access to attach an image.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (result.canceled) return;
        const photo = result.assets[0];
        await storeAttachment({ name: photo.fileName ?? `Photo-${Date.now()}.jpg`, uri: photo.uri, source, mimeType: photo.mimeType });
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture an attachment.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled) return;
      const photo = result.assets[0];
      await storeAttachment({ name: photo.fileName ?? `Camera-${Date.now()}.jpg`, uri: photo.uri, source, mimeType: photo.mimeType });
    } catch (error) {
      Alert.alert('Could not add attachment', String(error));
    }
  }

  function confirmDeleteAttachment(attachment: OrderDetailAttachment) {
    const isReceipt = !attachment.orderAttachmentId;
    Alert.alert(
      isReceipt ? 'Remove receipt image?' : 'Delete attachment?',
      isReceipt
        ? 'The receipt image will be removed. The payment record is kept.'
        : `Delete ${attachment.name} from this order? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (attachment.orderAttachmentId) deleteOrderAttachment(db, attachment.orderAttachmentId);
            else if (attachment.paymentId) clearPaymentProof(db, attachment.paymentId);
            setViewingAttachment(null);
            refresh();
          },
        },
      ]
    );
  }

  async function openAttachmentExternally() {
    if (!viewingAttachment?.uri) return;
    try {
      await shareStoredFile(viewingAttachment.uri, viewingAttachment.name);
    } catch (error) {
      Alert.alert('Could not open attachment', String(error));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={pullRefresh.onRefresh} />}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable hitSlop={10} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.white} />
            </Pressable>
            <View style={styles.breadcrumb}>
              <Pressable accessibilityRole="link" accessibilityLabel="Go to orders" hitSlop={8} onPress={() => router.navigate('/orders')}>
                <Text style={styles.crumbLink}>Orders</Text>
              </Pressable>
              <MaterialIcons name="chevron-right" size={14} color={colors.onInk60} />
              <Text style={styles.ref}>{order.ref}</Text>
            </View>
          </View>
          <Text style={styles.buyer}>{order.buyer_name}</Text>
          <View style={styles.contacts}>
            <View style={styles.contactRow}>
              <MaterialIcons name="phone" size={14} color={colors.onInk62} />
              <Text style={styles.contact}>{order.buyer_phone || 'No phone'}</Text>
            </View>
            <View style={[styles.contactRow, { flexShrink: 1 }]}>
              <MaterialIcons name="mail-outline" size={14} color={colors.onInk62} />
              <Text style={styles.contact} numberOfLines={1}>{order.buyer_email || 'No email'}</Text>
            </View>
          </View>
          <View style={styles.badges}>
            <Badge bg={st.bg} fg={st.fg} label={st.label} />
            <Badge bg={pay.bg} fg={pay.fg} label={pay.label} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.itemsHeader}>
            <View>
              <Text style={styles.sectionLabel}>Items</Text>
            </View>
            {itemsEditable ? (
              <Pressable
                accessibilityRole="button"
                style={styles.addItemsButton}
                onPress={() => router.push({ pathname: '/order/add', params: { orderId: order.id } })}
              >
                <MaterialIcons name="add" size={17} color={colors.ink} />
                <Text style={styles.addItemsText}>Add items</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.itemsCard}>
            {order.items.map((it) => (
              <ReanimatedSwipeable
                key={it.id}
                enabled={itemsEditable}
                overshootRight={false}
                rightThreshold={40}
                friction={2}
                renderRightActions={(_progress, _translation, swipeable) => (
                  <View style={styles.swipeActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${it.name}`}
                      style={[styles.swipeAction, styles.deleteAction]}
                      onPress={() => confirmDeleteItem(it, swipeable.close)}
                    >
                      <MaterialIcons name="delete-outline" size={19} color={colors.errorFg} />
                      <Text style={styles.deleteActionText}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              >
                <View style={styles.itemRow}>
                  {it.photo_uri ? (
                    <Image source={{ uri: it.photo_uri }} style={styles.itemThumb} />
                  ) : (
                    <View style={styles.itemThumbPlaceholder} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemName}>{it.qty > 1 ? `${it.name}` : it.name}</Text>
                    <Text style={styles.itemMeta}>{`\u00D7${it.qty}`}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemPrice}>{peso(it.unit_cost * it.qty)}</Text>
                    {itemsEditable ? (
                      <Pressable accessibilityRole="button" onPress={() => setEditingItem(it)} hitSlop={8}>
                        <Text style={styles.editItemText}>Update</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {itemsEditable ? (
                    <MaterialIcons
                      name="menu-open"
                      size={20}
                      color={colors.textDisabled}
                      accessibilityLabel="Swipe left to delete"
                    />
                  ) : null}
                </View>
              </ReanimatedSwipeable>
            ))}
            <View style={styles.totalsBlock}>
              <TotalRow label="Items subtotal" value={peso(subtotal)} muted />
              <TotalRow label="Service fee" value={peso(order.fee)} muted />
              <TotalRow label="Already paid" value={`\u2212${peso(order.paid)}`} color={colors.successFg} />
              <View style={styles.totalDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalDueLabel}>Total due</Text>
                <Text style={styles.totalDueValue}>{peso(balance > 0 ? balance : 0)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.weightFieldSection}>
            <Text style={styles.sectionLabel}>{weightRequired ? 'Total order weight (kg) *' : 'Total order weight (kg)'}</Text>
            <View style={styles.weightInputRow}>
              <Input
                value={weightDraft}
                onChangeText={(value) => { setWeightDraft(value); setWeightError(''); }}
                onBlur={saveWeight}
                keyboardType="decimal-pad"
                editable={weightEditable}
                placeholder="0"
                style={styles.weightInput}
              />
              <Text style={styles.weightUnit}>kg</Text>
            </View>
            {weightError ? (
              <Text style={styles.weightError}>{weightError}</Text>
            ) : weightRequired && !(order.weight_kg > 0) ? (
              <Text style={styles.weightHint}>Required before marking as packed.</Text>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Payment summary</Text>
          <View style={styles.proofCard}>
            <Text style={styles.proofTitle}>{order.pay === 'paid' ? 'Paid in full' : `${peso(order.paid)} collected`}</Text>
            <Text style={styles.proofNote}>{balance > 0 ? `${peso(balance)} balance remaining` : 'No balance remaining'}</Text>
            <View style={styles.proofActions}>
              <Pressable style={styles.proofBtn} onPress={togglePaid}>
                <Text style={styles.proofBtnText}>{order.pay === 'paid' ? 'Mark as unpaid' : 'Mark fully paid'}</Text>
              </Pressable>
              {order.pay !== 'paid' ? (
                <Pressable style={styles.proofBtn} onPress={() => setSheet(true)}>
                  <Text style={styles.proofBtnText}>Log payment</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.proofBtn} onPress={() => setHistoryOpen(true)}>
                <Text style={styles.proofBtnText}>Payment history</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.attachmentSectionHeader}>
            <Text style={styles.sectionLabel}>{`Attachments (${attachmentRows.length})`}</Text>
            <Pressable accessibilityRole="button" style={styles.addAttachmentButton} onPress={() => setAttachmentSourceOpen(true)}>
              <MaterialIcons name="attach-file" size={17} color={colors.ink} />
              <Text style={styles.addAttachmentText}>Add</Text>
            </Pressable>
          </View>
          <View style={styles.paymentHistory}>
            {attachmentRows.length === 0 ? (
              <Text style={styles.historyEmpty}>No attachments yet.</Text>
            ) : (
              attachmentRows.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  accessibilityRole="button"
                  onPress={() => setViewingAttachment(attachment)}
                  style={styles.attachmentRow}
                >
                  {attachment.uri && isImageAttachment(attachment) ? (
                    <Image source={{ uri: attachment.uri }} style={styles.attachmentThumbnail} />
                  ) : (
                    <View style={styles.fileIcon}>
                      <MaterialIcons name={attachment.uri ? 'insert-drive-file' : 'receipt-long'} size={21} color={colors.ink} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.attachmentName} numberOfLines={2}>{attachment.name}</Text>
                    <Text style={styles.historyMeta} numberOfLines={2}>{`${attachment.sourceLabel} · ${attachment.details}`}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={21} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </View>

          {order.tracking_code || order.delivery_proof_uri ? (
            <>
              <Text style={styles.sectionLabel}>Shipment</Text>
              <View style={styles.shipmentCard}>
                {order.tracking_code ? (
                  <View style={styles.trackingRow}>
                    <MaterialIcons name="local-shipping" size={19} color={colors.textMuted} />
                    <View>
                      <Text style={styles.historyMeta}>Tracking code</Text>
                      <Text style={styles.trackingCode}>{order.tracking_code}</Text>
                    </View>
                  </View>
                ) : null}
                {order.delivery_proof_uri ? (
                  <Image source={{ uri: order.delivery_proof_uri }} style={styles.deliveryProof} />
                ) : null}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Progress</Text>
          <View style={styles.timeline}>
            {CHAIN.map((status, index) => {
              const done = CHAIN.indexOf(status) < reachedIdx;
              const last = index === CHAIN.length - 1;
              const statusEvent = [...events].reverse().find((event) => event.status === status);
              return (
                <View key={status} style={styles.stepRow}>
                  <View style={styles.stepLine}>
                    <View style={[styles.dot, { borderColor: done ? colors.ink : colors.borderHover, backgroundColor: done ? colors.ink : colors.surface }]} />
                    {!last && <View style={[styles.line, { backgroundColor: done ? colors.ink : colors.borderOutline }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                    <Text style={[styles.stepTitle, { color: done ? colors.ink : colors.textDisabled }]}>{STEP_LABEL[status]}</Text>
                    <Text style={styles.stepWhen}>{statusEvent ? new Date(statusEvent.at).toLocaleString() : 'Pending'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {nextProgress ? (
            <PrimaryButton title={nextProgress.label} onPress={advanceProgress} style={styles.progressButton} />
          ) : null}
          {order.status === 'packed' ? (
            <>
              <PrimaryButton
                title="Mark as delivered"
                disabled={order.pay !== 'paid'}
                onPress={() => router.push({ pathname: '/order/[id]/handover', params: { id: order.id } })}
                style={[styles.progressButton, order.pay !== 'paid' && { backgroundColor: colors.buttonDisabled }]}
              />
              {order.pay !== 'paid' ? (
                <Text style={styles.deliverHint}>Only fully paid orders can be marked as delivered.</Text>
              ) : null}
            </>
          ) : null}
          <DangerButton title="Delete order" onPress={confirmDeleteOrder} disabled={!orderDeletable} />
          {!orderDeletable ? (
            <Text style={styles.deleteHint}>
              {tripClosed
                ? "Orders on a closed trip can't be deleted."
                : "Fully paid orders can't be deleted. Mark as unpaid first."}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <LogPaymentSheet
        visible={sheet && order.pay !== 'paid'}
        onClose={() => setSheet(false)}
        orderId={order.id}
        buyerName={order.buyer_name}
        balance={balance}
      />

      <PaymentHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orderId={order.id}
        buyerName={order.buyer_name}
        total={order.total}
        paid={order.paid}
        onLogPayment={() => setSheet(true)}
      />

      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <KeyboardAvoidingView style={styles.weightModal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.weightBackdrop} onPress={() => setEditingItem(null)} />
          <View style={styles.weightSheet}>
            <Formik<EditOrderItemFormValues>
              initialValues={{
                name: editingItem?.name ?? '',
                cost: String(editingItem?.unit_cost ?? ''),
                qty: String(editingItem?.qty ?? 1),
                photoUri: editingItem?.photo_uri ?? null,
              }}
              validationSchema={editOrderItemValidationSchema}
              enableReinitialize
              onSubmit={saveEditedItem}
            >
              {({ values, handleChange, handleBlur, handleSubmit, setFieldValue, touched, errors }) => (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.weightSheetHeader}>
                    <Text style={styles.weightSheetTitle}>Update item</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close item editor" hitSlop={10} onPress={() => setEditingItem(null)}>
                      <MaterialIcons name="close" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <Pressable style={styles.editPhotoButton} onPress={() => void chooseItemPhoto(setFieldValue)}>
                    {values.photoUri ? (
                      <Image source={{ uri: values.photoUri }} style={styles.editPhotoPreview} />
                    ) : (
                      <MaterialIcons name="add-a-photo" size={20} color={colors.textMuted} />
                    )}
                    <Text style={styles.editPhotoText}>{values.photoUri ? 'Update image' : 'Add image'}</Text>
                  </Pressable>
                  <Text style={styles.editorLabel}>Item name</Text>
                  <Input value={values.name} onChangeText={handleChange('name')} onBlur={handleBlur('name')} placeholder="Item name" />
                  {touched.name && errors.name ? <Text style={styles.weightError}>{errors.name}</Text> : null}
                  <View style={styles.editorGrid}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editorLabel}>Cost</Text>
                      <Input value={values.cost} onChangeText={handleChange('cost')} onBlur={handleBlur('cost')} keyboardType="decimal-pad" />
                      {touched.cost && errors.cost ? <Text style={styles.weightError}>{errors.cost}</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editorLabel}>Quantity</Text>
                      <Input value={values.qty} onChangeText={handleChange('qty')} onBlur={handleBlur('qty')} keyboardType="number-pad" />
                      {touched.qty && errors.qty ? <Text style={styles.weightError}>{errors.qty}</Text> : null}
                    </View>
                  </View>
                  <PrimaryButton title="Save item" onPress={() => handleSubmit()} style={{ marginTop: 16 }} />
                </ScrollView>
              )}
            </Formik>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={attachmentSourceOpen} transparent animationType="fade" onRequestClose={() => setAttachmentSourceOpen(false)} onDismiss={onAttachmentMenuDismiss}>
        <View style={styles.attachmentModal}>
          <Pressable style={styles.attachmentBackdrop} onPress={() => setAttachmentSourceOpen(false)} />
          <View style={styles.attachmentSheet}>
            <View style={styles.weightSheetHeader}>
              <Text style={styles.weightSheetTitle}>Add attachment</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close attachments menu" hitSlop={10} onPress={() => setAttachmentSourceOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <AttachmentSourceButton icon="folder-open" title="Browse files" onPress={() => chooseAttachmentSource('file')} />
            <AttachmentSourceButton icon="photo-library" title="Choose from photos" onPress={() => chooseAttachmentSource('photo')} />
            <AttachmentSourceButton icon="photo-camera" title="Take a photo" onPress={() => chooseAttachmentSource('camera')} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingAttachment} transparent animationType="fade" onRequestClose={() => setViewingAttachment(null)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewingAttachment(null)} />
          <View style={styles.viewerDialog}>
            <View style={styles.weightSheetHeader}>
              <Text style={styles.viewerTitle} numberOfLines={2}>{viewingAttachment?.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close attachment preview" hitSlop={10} onPress={() => setViewingAttachment(null)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            {viewingAttachment ? (
              <>
                <Text style={styles.viewerMeta}>{`${viewingAttachment.sourceLabel} · ${viewingAttachment.details}`}</Text>
                {viewingAttachment.uri && isImageAttachment(viewingAttachment) ? (
                  <Image source={{ uri: viewingAttachment.uri }} style={styles.viewerImage} resizeMode="contain" />
                ) : (
                  <View style={styles.filePreview}>
                    <MaterialIcons name="insert-drive-file" size={42} color={colors.textMuted} />
                    <Text style={styles.filePreviewText}>This file can be opened with a compatible app.</Text>
                  </View>
                )}
                {viewingAttachment.uri ? (
                  <PrimaryButton title="Download" onPress={() => void openAttachmentExternally()} style={{ marginTop: 12 }} />
                ) : null}
                {canDeleteAttachment(viewingAttachment) ? (
                  <DangerButton
                    title={viewingAttachment.orderAttachmentId ? 'Delete attachment' : 'Remove receipt image'}
                    onPress={() => confirmDeleteAttachment(viewingAttachment)}
                    style={{ marginTop: 10 }}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TotalRow({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, muted && { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.totalValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function AttachmentSourceButton({
  icon,
  title,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.attachmentSourceButton, pressed && styles.attachmentSourcePressed]}>
      <View style={styles.attachmentSourceIcon}>
        <MaterialIcons name={icon} size={20} color={colors.ink} />
      </View>
      <Text style={styles.attachmentSourceTitle}>{title}</Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  missing: { fontFamily: fonts.regular, color: colors.white, padding: 20 },
  header: { backgroundColor: colors.ink, paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 18 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 14 },
  ref: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.onInk60, letterSpacing: 0.6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumbLink: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white, textDecorationLine: 'underline' },
  buyer: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.6, color: colors.white },
  contacts: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 5 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contact: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.onInk62 },
  badges: { flexDirection: 'row', gap: 7, marginTop: 14 },

  body: { backgroundColor: colors.background, paddingHorizontal: spacing.screen, paddingTop: 18, paddingBottom: 28, borderTopLeftRadius: 0 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10, marginTop: 6 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addItemsButton: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: colors.borderOutline, borderRadius: radius.input, backgroundColor: colors.surface },
  addItemsText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.ink },

  itemsCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.surface },
  itemThumb: { width: 46, height: 46, borderRadius: 9 },
  itemThumbPlaceholder: { width: 46, height: 46, borderRadius: 9, backgroundColor: colors.muted },
  itemName: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  itemMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  itemPrice: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  itemRight: { alignItems: 'flex-end', gap: 7 },
  editItemText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.infoFg },
  swipeActions: { flexDirection: 'row', alignSelf: 'stretch' },
  swipeAction: { width: 70, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteAction: { backgroundColor: colors.errorBg },
  deleteActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.errorFg },
  totalsBlock: { padding: 13, backgroundColor: colors.surfaceSubtle, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.ink },
  totalValue: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink },
  totalDivider: { height: 1, backgroundColor: colors.borderCard, marginVertical: 2 },
  totalDueLabel: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  totalDueValue: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },

  proofCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 14, marginBottom: 16 },
  proofTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  proofNote: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 5 },
  proofActions: { flexDirection: 'row', gap: 8, marginTop: 11, flexWrap: 'wrap' },
  proofBtn: { borderWidth: 1, borderColor: colors.borderOutline, borderRadius: radius.input, paddingVertical: 9, paddingHorizontal: 13 },
  proofBtnText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  paymentHistory: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  attachmentSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  addAttachmentButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderOutline, borderRadius: radius.input, backgroundColor: colors.surface, marginBottom: 9 },
  addAttachmentText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.ink },
  attachmentRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.surface },
  paymentEntry: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 9 },
  paymentEntryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyAmount: { fontFamily: fonts.monoSemibold, fontSize: 14, color: colors.ink },
  historyMeta: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: colors.textMuted, marginTop: 3 },
  historyEmpty: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, padding: 14 },
  attachmentThumbnail: { width: 48, height: 48, borderRadius: radius.input },
  fileIcon: { width: 42, height: 42, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  attachmentName: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  shipmentCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 13, gap: 10, marginBottom: 16 },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trackingCode: { fontFamily: fonts.monoSemibold, fontSize: 13, color: colors.ink, marginTop: 2 },
  deliveryProof: { width: 110, height: 135, borderRadius: radius.input },
  weightModal: { flex: 1, justifyContent: 'flex-end' },
  weightBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  weightSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  weightSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weightSheetTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  weightSheetHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 5, marginBottom: 14 },
  weightFieldSection: { marginBottom: 14 },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightInput: { flex: 1, fontFamily: fonts.monoSemibold },
  weightUnit: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.textMuted },
  weightError: { fontFamily: fonts.regular, fontSize: 11, color: colors.errorFg, marginTop: 5 },
  weightHint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 5 },
  editorLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 12, marginBottom: 7 },
  editorGrid: { flexDirection: 'row', gap: 10 },
  attachmentModal: { flex: 1, justifyContent: 'flex-end' },
  attachmentBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  attachmentSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  attachmentSourceButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  attachmentSourcePressed: { opacity: 0.65 },
  attachmentSourceIcon: { width: 38, height: 38, borderRadius: radius.input, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  attachmentSourceTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  viewerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  viewerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.55)' },
  viewerDialog: { width: '100%', maxWidth: 440, maxHeight: '88%', backgroundColor: colors.surface, borderRadius: radius.hero, padding: 16 },
  viewerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginRight: 12 },
  viewerMeta: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  viewerImage: { width: '100%', height: 360, backgroundColor: colors.surfaceSubtle, borderRadius: radius.button },
  filePreview: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surfaceSubtle, borderRadius: radius.button, padding: 18 },
  filePreviewText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
  attachmentDeleteIcon: { padding: 4 },
  editPhotoButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.borderInput, borderStyle: 'dashed', borderRadius: radius.input, padding: 7, marginTop: 10 },
  editPhotoPreview: { width: 40, height: 40, borderRadius: 6 },
  editPhotoText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },

  timeline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 16, marginBottom: 18 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepLine: { alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  line: { width: 2, height: 26 },
  stepTitle: { fontFamily: fonts.semibold, fontSize: 13.5 },
  stepWhen: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  progressButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 13, marginBottom: 10 },
  progressButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  deleteHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  deliverHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.errorFg, textAlign: 'center', marginTop: -4, marginBottom: 10 },

  actions: { flexDirection: 'row', gap: 9 },
});

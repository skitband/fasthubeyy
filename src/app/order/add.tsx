import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldArray, Formik, getIn, type FormikProps } from 'formik';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHeader, Screen } from '@/components/layout';
import { DangerIconButton, Input, PrimaryButton } from '@/components/ui';
import { CustomerSelect } from '@/components/CustomerSelect';
import { useDbData, useRefresh } from '@/db/hooks';
import {
  addOrderItem,
  canAddItemsToOrder,
  createOrder,
  findOpenOrderForBuyer,
  getActiveTrip,
  getOrder,
  getTrip,
  listBuyers,
  tripStatus,
} from '@/db/queries';
import { orderValidationSchema, type OrderFormValues } from '@/lib/formSchemas';
import { colors, fonts, radius } from '@/theme/tokens';
import { itemSubtotal, peso } from '@/lib/money';
import { toDataUri } from '@/lib/dataUri';

export default function AddItem() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const { orderId: routeOrderId } = useLocalSearchParams<{ orderId?: string }>();
  const targetOrderId = routeOrderId ?? null;

  const setup = useDbData((d) => {
    const targetOrder = targetOrderId ? getOrder(d, targetOrderId) : null;
    const trip = targetOrder ? getTrip(d, targetOrder.trip_id) : getActiveTrip(d);
    return { trip, targetOrder, buyers: listBuyers(d) };
  });

  const [pct, setPct] = useState(setup.trip?.fee_pct ?? 15);

  if (!setup.trip) {
    return (
      <Screen>
        <BackHeader title="Add item" />
        <Text style={styles.hint}>Create a trip first.</Text>
      </Screen>
    );
  }

  if (targetOrderId && !setup.targetOrder) {
    return (
      <Screen>
        <BackHeader title="Add items" />
        <Text style={styles.hint}>This order could not be found.</Text>
      </Screen>
    );
  }

  if (tripStatus(setup.trip) === 'closed') {
    return (
      <Screen>
        <BackHeader title={setup.targetOrder ? 'Add items' : 'Add order'} />
        <Text style={styles.hint}>{"This trip is closed, so new orders and items can't be added. Reopen it from Edit trip to continue."}</Text>
      </Screen>
    );
  }

  if (setup.targetOrder && !canAddItemsToOrder(setup.targetOrder)) {
    return (
      <Screen>
        <BackHeader title="Add items" />
        <Text style={styles.hint}>This order is fully paid or delivered, so no more items can be added.</Text>
      </Screen>
    );
  }

  const trip = setup.trip;
  const feePerKg = trip.fee_per_kg;

  async function pickPhoto(
    itemIndex: number,
    setFieldValue: FormikProps<OrderFormValues>['setFieldValue']
  ) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach an item photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) {
      const asset = result.assets[0];
      await setFieldValue(`items.${itemIndex}.photoUri`, await toDataUri(asset.uri, asset.mimeType));
    }
  }

  function save(values: OrderFormValues) {
    const targetOrder = targetOrderId ? getOrder(db, targetOrderId) : null;
    if (targetOrderId && !canAddItemsToOrder(targetOrder)) {
      Alert.alert('Order is closed', 'Items cannot be added to an order that is fully paid or delivered.');
      return;
    }
    const existing = targetOrder ?? findOpenOrderForBuyer(db, trip.id, values.buyerId);
    let orderId = existing?.id ?? '';
    try {
      db.withTransactionSync(() => {
        if (!existing) {
          orderId = createOrder(db, {
            tripId: trip.id,
            buyerId: values.buyerId,
            weightKg: Number(values.weightKg) || 0,
            weightFeePerKg: feePerKg,
          });
        }
        for (const item of values.items) {
          addOrderItem(db, {
            orderId,
            name: item.name.trim(),
            qty: Number(item.qty),
            unitCost: Number(item.cost),
            kg: 0,
            feePct: pct,
            feePerKg,
            photoUri: item.photoUri ?? undefined,
          });
        }
      });
    } catch (error) {
      Alert.alert('Could not save order', String(error));
      return;
    }
    refresh();
    router.replace(`/order/${orderId}`);
  }

  const shortRoute = `${trip.origin.split(',')[0]} \u2192 ${trip.destination.split(',')[0]}`;

  return (
    <Screen>
      <BackHeader title={setup.targetOrder ? 'Add items' : 'New order'} />
      <Text style={styles.hint}>Add multiple items for one customer order. Set total weight from the order details.</Text>

      <Formik<OrderFormValues>
        key={setup.targetOrder?.id ?? 'new-order'}
        initialValues={{
          buyerId: setup.targetOrder?.buyer_id ?? '',
          weightKg: setup.targetOrder ? String(setup.targetOrder.weight_kg) : '',
          items: [{ name: '', cost: '', qty: '1', photoUri: null }],
        }}
        validationSchema={orderValidationSchema}
        onSubmit={save}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue, setFieldTouched, setValues }) => {
          const subtotal = values.items.reduce(
            (total, item) => total + itemSubtotal(Number(item.cost) || 0, Number(item.qty) || 0),
            0
          );
          const matchingOpenOrder = values.buyerId ? findOpenOrderForBuyer(db, trip.id, values.buyerId) : null;
          const existingOrder = setup.targetOrder ?? (matchingOpenOrder ? getOrder(db, matchingOpenOrder.id) : null);
          const existingSubtotal = existingOrder?.items.reduce(
            (total, item) => total + itemSubtotal(item.unit_cost, item.qty),
            0
          ) ?? 0;
          const existingServiceFee = existingOrder?.items.reduce(
            (total, item) => total + itemSubtotal(item.unit_cost, item.qty) * (item.fee_pct / 100),
            0
          ) ?? 0;
          const orderWeightKg = Number(values.weightKg) || 0;
          const handlingRate = existingOrder?.weight_fee_per_kg ?? feePerKg;
          const feePctPart = subtotal * (pct / 100);
          const handling = orderWeightKg * handlingRate;
          const feeAmt = existingServiceFee + feePctPart + handling;
          const buyerPays = existingSubtotal + subtotal + feeAmt;
          const over = orderWeightKg > trip.checked_kg;

          return (
            <>
              <Text style={styles.sectionLabel}>Customer *</Text>
              {setup.targetOrder ? (
                <View style={styles.fixedCustomer}>
                  <MaterialIcons name="person-outline" size={19} color={colors.textMuted} />
                  <Text style={styles.fixedCustomerText}>{setup.targetOrder.buyer_name}</Text>
                </View>
              ) : (
                <CustomerSelect
                  buyers={setup.buyers}
                  value={values.buyerId || null}
                  onChange={(id) => {
                    const existing = findOpenOrderForBuyer(db, trip.id, id);
                    // One update so validation sees both new values; Formik's per-field setters validate against stale render state.
                    void setValues({ ...values, buyerId: id, weightKg: existing ? String(existing.weight_kg) : '' });
                    void setFieldTouched('buyerId', true, false);
                  }}
                />
              )}
              <FieldError message={errors.buyerId} visible={Boolean(touched.buyerId)} />

              <FieldArray name="items">
                {(arrayHelpers) => (
                  <View style={styles.itemsSection}>
                    <View style={styles.itemsHeader}>
                      <Text style={styles.sectionLabel}>Items ({values.items.length})</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => arrayHelpers.push({ name: '', cost: '', qty: '1', photoUri: null })}
                        style={styles.addItemButton}
                      >
                        <MaterialIcons name="add" size={18} color={colors.ink} />
                        <Text style={styles.addItemText}>Add item</Text>
                      </Pressable>
                    </View>

                    {values.items.map((item, index) => {
                      const path = (field: string) => `items.${index}.${field}`;
                      return (
                        <View key={index} style={styles.itemCard}>
                          <View style={styles.itemCardHeader}>
                            <Text style={styles.itemTitle}>{`Item ${index + 1}`}</Text>
                            {values.items.length > 1 ? (
                              <DangerIconButton accessibilityLabel={`Remove item ${index + 1}`} onPress={() => arrayHelpers.remove(index)} />
                            ) : null}
                          </View>
                          <View style={styles.itemTopRow}>
                            <Pressable style={styles.photoSlot} onPress={() => void pickPhoto(index, setFieldValue)}>
                              {item.photoUri ? (
                                <Image source={{ uri: item.photoUri }} style={styles.photo} />
                              ) : (
                                <>
                                  <MaterialIcons name="add-a-photo" size={20} color={colors.textMuted} />
                                  <Text style={styles.photoText}>Photo</Text>
                                </>
                              )}
                            </Pressable>
                            <View style={{ flex: 1 }}>
                              <Input
                                value={item.name}
                                onChangeText={handleChange(path('name'))}
                                onBlur={handleBlur(path('name'))}
                                placeholder="Item name"
                              />
                              <FieldError message={getIn(errors, path('name'))} visible={Boolean(getIn(touched, path('name')))} />
                            </View>
                          </View>
                          <View style={styles.grid}>
                            <NumberField label="Cost *" value={item.cost} onChange={handleChange(path('cost'))} onBlur={handleBlur(path('cost'))} error={getIn(errors, path('cost'))} touched={Boolean(getIn(touched, path('cost')))} keyboard="decimal-pad" />
                            <NumberField label="Qty *" value={item.qty} onChange={handleChange(path('qty'))} onBlur={handleBlur(path('qty'))} error={getIn(errors, path('qty'))} touched={Boolean(getIn(touched, path('qty')))} keyboard="number-pad" />
                          </View>
                        </View>
                      );
                    })}
                    <FieldError message={typeof errors.items === 'string' ? errors.items : undefined} visible />
                  </View>
                )}
              </FieldArray>

              <View style={styles.feeCard}>
                <View style={styles.feeHeader}>
                  <Text style={styles.feeTitle}>Service fee</Text>
                  <Text style={styles.feePct}>{pct}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={40}
                  step={1}
                  value={pct}
                  onValueChange={setPct}
                  minimumTrackTintColor={colors.ink}
                  maximumTrackTintColor={colors.track}
                  thumbTintColor={colors.ink}
                />
                <View style={styles.feeDivider} />
                <BreakdownRow label={`Item cost (${values.items.length} items)`} value={peso(subtotal)} />
                <BreakdownRow label={`Service fee ${pct}%`} value={peso(feePctPart)} />
                <BreakdownRow label={`Order weight handling (\u20B1${handlingRate}/kg)`} value={peso(handling)} />
              </View>

              <View style={styles.earnCard}>
                <View>
                  <Text style={styles.earnLabel}>Buyer pays</Text>
                  <Text style={styles.earnBig}>{peso(buyerPays)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.earnLabel}>You earn</Text>
                  <Text style={styles.earnSmall}>{peso(feeAmt)}</Text>
                </View>
              </View>

              <View style={[styles.capMsg, { backgroundColor: over ? colors.errorBg : colors.neutralBg }]}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: over ? colors.errorFg : colors.neutralFg }}>
                  {over
                    ? `This pushes you over the ${trip.checked_kg} kg allowance. Excess costs \u20B1${trip.excess_per_kg ?? 1250}/kg.`
                    : `Uses ${orderWeightKg.toFixed(1)} kg for this order.`}
                </Text>
              </View>

              <PrimaryButton
                title={`Save to ${shortRoute}`}
                onPress={() => handleSubmit()}
              />
            </>
          );
        }}
      </Formik>
    </Screen>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  touched,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: (event: unknown) => void;
  error?: unknown;
  touched: boolean;
  keyboard: 'decimal-pad' | 'number-pad';
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.numLabel}>{label}</Text>
      <Input value={value} onChangeText={onChange} onBlur={onBlur} keyboardType={keyboard} style={styles.numInput} />
      <FieldError message={error} visible={touched} />
    </View>
  );
}

function FieldError({ message, visible }: { message?: unknown; visible: boolean }) {
  return visible && typeof message === 'string' ? <Text style={styles.fieldError}>{message}</Text> : null;
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 },
  fixedCustomer: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: radius.input, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.surface },
  fixedCustomerText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 8 },
  itemsSection: { marginTop: 18, marginBottom: 14 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  addItemButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderOutline, borderRadius: radius.button },
  addItemText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  itemCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 13, marginBottom: 9 },
  itemCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  photoSlot: {
    width: 64,
    height: 64,
    borderRadius: radius.input,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  photoText: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted, marginTop: 3 },
  grid: { flexDirection: 'row', gap: 9 },
  numLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 6 },
  numInput: { fontFamily: fonts.monoSemibold },
  fieldError: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.errorFg, marginTop: 4 },
  feeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    padding: 15,
    marginBottom: 14,
  },
  feeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  feeTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  feePct: { fontFamily: fonts.monoSemibold, fontSize: 13.5, color: colors.ink },
  feeDivider: { height: 1, backgroundColor: colors.borderCard, marginTop: 6, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  breakdownLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  breakdownValue: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink },
  earnCard: {
    backgroundColor: colors.ink,
    borderRadius: radius.card,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  earnLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk60 },
  earnBig: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.8, color: colors.white, marginTop: 7 },
  earnSmall: { fontFamily: fonts.bold, fontSize: 18, color: colors.white, marginTop: 7 },
  capMsg: { borderRadius: radius.button, padding: 13, marginBottom: 16 },
});

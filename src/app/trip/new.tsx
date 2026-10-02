import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type TextInputProps } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Formik } from 'formik';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHeader, Label, Screen } from '@/components/layout';
import { Input, PrimaryButton } from '@/components/ui';
import { useDbData, useRefresh } from '@/db/hooks';
import { createTrip, getTrip, setTripStatusOverride, tripStatus, updateTrip } from '@/db/queries';
import type { TripStatus } from '@/db/types';
import { tripValidationSchema, type TripFormValues } from '@/lib/formSchemas';
import { colors, fonts, radius } from '@/theme/tokens';
import { shortDate } from '@/lib/money';

type StatusChoice = 'auto' | TripStatus;
const STATUS_CHOICES: { key: StatusChoice; label: string }[] = [
  { key: 'auto', label: 'Automatic' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];

export default function NewTrip() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const editing = useDbData((d) => (editId ? getTrip(d, editId) : null));
  const [statusChoice, setStatusChoice] = useState<StatusChoice>(editing?.status_override ?? 'auto');

  function save(values: TripFormValues) {
    const input = {
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      departDate: values.departDate,
      returnDate: values.returnDate,
      cutoffDate: values.cutoffDate,
      checkedKg: Number(values.checkedKg),
      cabinKg: Number(values.cabinKg),
      feePct: Number(values.feePct),
      feePerKg: Number(values.feePerKg),
    };
    if (editing) {
      updateTrip(db, editing.id, input);
      setTripStatusOverride(db, editing.id, statusChoice === 'auto' ? null : statusChoice);
      refresh();
      router.back();
      return;
    }
    const id = createTrip(db, input);
    if (statusChoice !== 'auto') setTripStatusOverride(db, id, statusChoice);
    refresh();
    router.replace('/');
  }

  if (editId && !editing) {
    return (
      <Screen>
        <BackHeader title="Edit trip" />
        <Text style={styles.hint}>This trip could not be found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title={editing ? 'Edit trip' : 'New trip'} />
      <Text style={styles.hint}>
        {editing
          ? 'Fee changes apply to items added from now on; existing items keep their original fees.'
          : 'Complete every field. Orders can only be accepted before the cutoff.'}
      </Text>
      <Formik<TripFormValues>
        key={editing?.id ?? 'new-trip'}
        initialValues={{
          origin: editing?.origin ?? '',
          destination: editing?.destination ?? '',
          departDate: editing?.depart_date ?? '',
          returnDate: editing?.return_date ?? '',
          cutoffDate: editing?.cutoff_date ?? '',
          checkedKg: editing ? String(editing.checked_kg) : '',
          cabinKg: editing ? String(editing.cabin_kg) : '',
          feePct: editing ? String(editing.fee_pct) : '',
          feePerKg: editing ? String(editing.fee_per_kg) : '',
        }}
        validationSchema={tripValidationSchema}
        onSubmit={save}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue, setFieldTouched }) => (
          <>
            <Label>Route *</Label>
            <View style={styles.routeRow}>
              <View style={{ flex: 1 }}>
                <Input value={values.origin} onChangeText={handleChange('origin')} onBlur={handleBlur('origin')} placeholder="From (e.g. Dubai, DXB)" />
                <FormError message={touched.origin ? errors.origin : undefined} />
              </View>
              <Text style={styles.arrow}>{'\u2192'}</Text>
              <View style={{ flex: 1 }}>
                <Input value={values.destination} onChangeText={handleChange('destination')} onBlur={handleBlur('destination')} placeholder="To (e.g. Manila, MNL)" />
                <FormError message={touched.destination ? errors.destination : undefined} />
              </View>
            </View>

            <View style={{ height: 12 }} />
            <Label>Travel dates *</Label>
            <View style={styles.routeRow}>
              <View style={{ flex: 1 }}>
                <DateField value={values.departDate} onChange={(value) => { void setFieldValue('departDate', value); void setFieldTouched('departDate', true, false); }} />
                <FormError message={touched.departDate ? errors.departDate : undefined} />
              </View>
              <Text style={styles.arrow}>{'\u2192'}</Text>
              <View style={{ flex: 1 }}>
                <DateField value={values.returnDate} onChange={(value) => { void setFieldValue('returnDate', value); void setFieldTouched('returnDate', true, false); }} />
                <FormError message={touched.returnDate ? errors.returnDate : undefined} />
              </View>
            </View>

            <View style={{ height: 12 }} />
            <Label>Order cutoff *</Label>
            <DateField value={values.cutoffDate} onChange={(value) => { void setFieldValue('cutoffDate', value); void setFieldTouched('cutoffDate', true, false); }} full />
            <FormError message={touched.cutoffDate ? errors.cutoffDate : undefined} />

            <View style={{ height: 12 }} />
            <View style={styles.numRow}>
              <NumField label="Checked baggage (kg) *" value={values.checkedKg} onChange={handleChange('checkedKg')} onBlur={handleBlur('checkedKg')} error={touched.checkedKg ? errors.checkedKg : undefined} placeholder="30" />
              <NumField label="Cabin bag (kg) *" value={values.cabinKg} onChange={handleChange('cabinKg')} onBlur={handleBlur('cabinKg')} error={touched.cabinKg ? errors.cabinKg : undefined} placeholder="7" />
            </View>

            <View style={{ height: 12 }} />
            <View style={styles.numRow}>
              <NumField label="Service fee rate (%) *" value={values.feePct} onChange={handleChange('feePct')} onBlur={handleBlur('feePct')} error={touched.feePct ? errors.feePct : undefined} placeholder="15" />
              <NumField label={'Handling (\u20B1/kg) *'} value={values.feePerKg} onChange={handleChange('feePerKg')} onBlur={handleBlur('feePerKg')} error={touched.feePerKg ? errors.feePerKg : undefined} placeholder="150" />
            </View>

            <View style={{ height: 12 }} />
            <Label>Trip status</Label>
            <View style={styles.statusRow}>
              {STATUS_CHOICES.map((choice) => {
                const selected = statusChoice === choice.key;
                return (
                  <Pressable
                    key={choice.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setStatusChoice(choice.key)}
                    style={[styles.statusOption, selected && styles.statusOptionSelected]}
                  >
                    <Text style={[styles.statusOptionText, selected && styles.statusOptionTextSelected]}>{choice.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.statusHint}>
              {statusChoice === 'auto'
                ? `Closes automatically after the order cutoff.${values.cutoffDate ? ` Currently ${tripStatus({ status_override: null, cutoff_date: values.cutoffDate })}.` : ''}`
                : `Stays ${statusChoice} regardless of the order cutoff.`}
              {' Closed trips accept no new orders, items or order deletions; payments and delivery still work.'}
            </Text>

            <View style={{ height: 20 }} />
            <PrimaryButton title={editing ? 'Save changes' : 'Create trip'} onPress={() => handleSubmit()} />
          </>
        )}
      </Formik>
    </Screen>
  );
}

function NumField({ label, value, onChange, onBlur, error, placeholder }: { label: string; value: string; onChange: (v: string) => void; onBlur: TextInputProps['onBlur']; error?: string; placeholder?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <Input value={value} onChangeText={onChange} onBlur={onBlur} placeholder={placeholder} keyboardType="decimal-pad" style={{ fontFamily: fonts.monoSemibold }} />
      <FormError message={error} />
    </View>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

// Local YYYY-MM-DD so the calendar date is preserved regardless of timezone.
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function DateField({ value, onChange, full }: { value: string; onChange: (iso: string) => void; full?: boolean }) {
  const [show, setShow] = useState(false);
  const webInput = useRef<HTMLInputElement>(null);
  const parsed = new Date(value + 'T00:00:00');
  const valid = !isNaN(parsed.getTime());
  const base = valid ? parsed : new Date();

  function open() {
    if (Platform.OS === 'web') {
      const el = webInput.current;
      if (!el) return;
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    } else if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base,
        mode: 'date',
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(toLocalISO(selected));
        },
      });
    } else {
      setShow(true);
    }
  }

  return (
    <View style={full ? { width: '100%' } : { flex: 1 }}>
      <Pressable style={styles.dateField} onPress={open}>
        <Text style={styles.dateText}>{valid ? shortDate(value) : 'Pick date'}</Text>
        <MaterialIcons name="calendar-month" size={18} color={colors.textMuted} />
      </Pressable>

      {/* The community picker has no web build; drive the browser's native date input instead. */}
      {Platform.OS === 'web' && (
        <input
          ref={webInput}
          type="date"
          value={valid ? value : ''}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
          style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShow(false)} />
          <View style={styles.iosPickerCard}>
            <DateTimePicker
              value={base}
              mode="date"
              display="spinner"
              themeVariant="light"
              onChange={(_e, s) => s && onChange(toLocalISO(s))}
            />
            <Pressable style={styles.doneBtn} onPress={() => setShow(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 18 },
  routeRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  arrow: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  numRow: { flexDirection: 'row', gap: 12 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusOption: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.input, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.surface },
  statusOptionSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  statusOptionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  statusOptionTextSelected: { color: colors.white },
  statusHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 6 },
  error: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.errorFg, marginTop: 4 },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  dateText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,12,0.35)' },
  iosPickerCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.hero,
    padding: 12,
  },
  doneBtn: { backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  doneText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});

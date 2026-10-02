import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Alert } from '@/lib/alert';
import { Formik } from 'formik';
import { useSQLiteContext } from 'expo-sqlite';
import { Input, PrimaryButton } from './ui';
import { createBuyer, deleteBuyer, updateBuyer } from '@/db/queries';
import { customerValidationSchema, type CustomerFormValues } from '@/lib/formSchemas';
import { useRefresh } from '@/db/hooks';
import type { Buyer } from '@/db/types';
import { colors, fonts, radius } from '@/theme/tokens';

export function CustomerSelect({
  buyers,
  value,
  onChange,
}: {
  buyers: Buyer[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const [mode, setMode] = useState<'closed' | 'list' | 'create' | 'edit'>('closed');
  const [editingBuyerId, setEditingBuyerId] = useState<string | null>(null);

  const selected = buyers.find((b) => b.id === value) ?? null;
  const editingBuyer = buyers.find((buyer) => buyer.id === editingBuyerId) ?? null;

  function openCreate() {
    setEditingBuyerId(null);
    setMode('create');
  }

  function openEdit(buyer: Buyer) {
    setEditingBuyerId(buyer.id);
    setMode('edit');
  }

  function saveCustomer(details: CustomerFormValues) {
    const isEditing = !!editingBuyerId;
    const normalized = {
      name: details.name.trim(),
      contact: details.contact.trim(),
      address: details.address.trim(),
      email: details.email.trim(),
    };
    if (editingBuyerId) {
      updateBuyer(db, editingBuyerId, normalized);
    } else {
      const id = createBuyer(db, normalized);
      onChange(id);
    }
    refresh();
    setEditingBuyerId(null);
    setMode(isEditing ? 'list' : 'closed');
  }

  function confirmDelete(buyer: Buyer) {
    Alert.alert(
      'Delete customer?',
      `${buyer.name} will be removed from customer selection. Existing order records will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBuyer(db, buyer.id);
            if (value === buyer.id) onChange('');
            refresh();
          },
        },
      ]
    );
  }

  return (
    <>
      <Pressable style={styles.field} onPress={() => setMode('list')}>
        <Text style={[styles.fieldText, !selected && { color: colors.textDisabled }]} numberOfLines={1}>
          {selected ? selected.name : 'Select customer'}
        </Text>
        <MaterialIcons name="expand-more" size={20} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={mode !== 'closed'}
        transparent
        animationType="slide"
        onRequestClose={() => setMode('closed')}
      >
        <KeyboardAvoidingView
          style={styles.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setMode('closed')} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {mode === 'list' ? (
              <>
                <View style={styles.headerRow}>
                  <Text style={styles.title}>Select customer</Text>
                  <Pressable hitSlop={10} onPress={() => setMode('closed')}>
                    <MaterialIcons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Pressable style={styles.createRow} onPress={openCreate}>
                  <View style={styles.createIcon}>
                    <MaterialIcons name="person-add" size={18} color={colors.white} />
                  </View>
                  <Text style={styles.createText}>Create new customer</Text>
                </Pressable>

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {buyers.map((b) => {
                    const active = b.id === value;
                    return (
                      <Swipeable
                        key={b.id}
                        overshootRight={false}
                        rightThreshold={40}
                        friction={2}
                        renderRightActions={(_progress, _dragX, swipeable) => (
                          <View style={styles.swipeActions}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${b.name}`}
                              style={[styles.swipeAction, styles.editAction]}
                              onPress={() => {
                                swipeable.close();
                                openEdit(b);
                              }}
                            >
                              <MaterialIcons name="edit" size={19} color={colors.ink} />
                              <Text style={styles.editActionText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${b.name}`}
                              style={[styles.swipeAction, styles.deleteAction]}
                              onPress={() => {
                                swipeable.close();
                                confirmDelete(b);
                              }}
                            >
                              <MaterialIcons name="delete-outline" size={19} color={colors.errorFg} />
                              <Text style={styles.deleteActionText}>Delete</Text>
                            </Pressable>
                          </View>
                        )}
                      >
                        <Pressable
                          style={styles.customerRow}
                          onPress={() => {
                            onChange(b.id);
                            setMode('closed');
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.customerName}>{b.name}</Text>
                            {b.phone || b.email ? (
                              <Text style={styles.customerMeta} numberOfLines={1}>
                                {[b.phone, b.email].filter(Boolean).join(' \u00B7 ')}
                              </Text>
                            ) : null}
                          </View>
                          {active ? <MaterialIcons name="check-circle" size={20} color={colors.ink} /> : null}
                        </Pressable>
                      </Swipeable>
                    );
                  })}
                  {buyers.length === 0 ? (
                    <Text style={styles.emptyText}>No customers yet. Create one above.</Text>
                  ) : null}
                </ScrollView>
              </>
            ) : (
              <Formik<CustomerFormValues>
                key={editingBuyerId ?? 'new-customer'}
                initialValues={{
                  name: editingBuyer?.name ?? '',
                  contact: editingBuyer?.phone ?? '',
                  address: editingBuyer?.address ?? '',
                  email: editingBuyer?.email ?? '',
                }}
                validationSchema={customerValidationSchema}
                onSubmit={saveCustomer}
              >
                {({ values, errors, touched, handleChange, handleBlur, handleSubmit }) => (
                  <ScrollView
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.createContent}
                  >
                    <View style={styles.headerRow}>
                      <Pressable hitSlop={10} onPress={() => setMode('list')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialIcons name="arrow-back-ios-new" size={16} color={colors.ink} />
                        <Text style={styles.title}>{mode === 'edit' ? 'Edit customer' : 'New customer'}</Text>
                      </Pressable>
                      <Pressable hitSlop={10} onPress={() => setMode('closed')}>
                        <MaterialIcons name="close" size={22} color={colors.textMuted} />
                      </Pressable>
                    </View>

                    <Text style={styles.label}>Name *</Text>
                    <Input value={values.name} onChangeText={handleChange('name')} onBlur={handleBlur('name')} placeholder="Full name" />
                    <FormError message={touched.name ? errors.name : undefined} />

                    <Text style={styles.label}>Contact *</Text>
                    <Input value={values.contact} onChangeText={handleChange('contact')} onBlur={handleBlur('contact')} placeholder="Phone or messaging handle" />
                    <FormError message={touched.contact ? errors.contact : undefined} />

                    <Text style={styles.label}>Address *</Text>
                    <Input value={values.address} onChangeText={handleChange('address')} onBlur={handleBlur('address')} placeholder="Delivery address" />
                    <FormError message={touched.address ? errors.address : undefined} />

                    <Text style={styles.label}>Email *</Text>
                    <Input value={values.email} onChangeText={handleChange('email')} onBlur={handleBlur('email')} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />
                    <FormError message={touched.email ? errors.email : undefined} />

                    <PrimaryButton title={mode === 'edit' ? 'Save changes' : 'Save customer'} onPress={() => handleSubmit()} style={{ marginTop: 18 }} />
                  </ScrollView>
                )}
              </Formik>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    paddingVertical: 13,
    paddingHorizontal: 13,
  },
  fieldText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
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
    padding: 20,
    paddingBottom: 34,
  },
  createContent: { paddingBottom: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.track, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderStyle: 'dashed',
    marginBottom: 10,
  },
  createIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  swipeActions: { flexDirection: 'row', alignSelf: 'stretch' },
  swipeAction: { width: 70, alignItems: 'center', justifyContent: 'center', gap: 4 },
  editAction: { backgroundColor: colors.muted },
  deleteAction: { backgroundColor: colors.errorBg },
  editActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.ink },
  deleteActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.errorFg },
  customerName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink },
  customerMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  emptyText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, paddingVertical: 16 },
  label: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 12, marginBottom: 7 },
  error: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.errorFg, marginTop: 4 },
});

import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Formik } from 'formik';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHeader } from '@/components/layout';
import { Avatar, DangerIconButton, Input, PrimaryButton } from '@/components/ui';
import { useDbData, usePullToRefresh, useRefresh } from '@/db/hooks';
import { createBuyer, deleteBuyer, listBuyers, updateBuyer } from '@/db/queries';
import { customerValidationSchema, type CustomerFormValues } from '@/lib/formSchemas';
import type { Buyer } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { initials } from '@/lib/money';

export default function Customers() {
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const pullRefresh = usePullToRefresh();
  const buyers = useDbData(listBuyers);
  const [formVisible, setFormVisible] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<Buyer | null>(null);

  function startCreate() {
    setEditingBuyer(null);
    setFormVisible(true);
  }

  function startEdit(buyer: Buyer) {
    setEditingBuyer(buyer);
    setFormVisible(true);
  }

  function saveCustomer(details: CustomerFormValues) {
    const normalized = {
      name: details.name.trim(),
      contact: details.contact.trim(),
      address: details.address.trim(),
      email: details.email.trim(),
    };
    if (editingBuyer) {
      updateBuyer(db, editingBuyer.id, normalized);
    } else {
      createBuyer(db, normalized);
    }
    refresh();
    setFormVisible(false);
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
            refresh();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={pullRefresh.onRefresh} />}>
        <BackHeader title="Customers" />
        <View style={styles.headingRow}>
          <Text style={styles.subtitle}>{`${buyers.length} customer${buyers.length === 1 ? '' : 's'}`}</Text>
          <Pressable accessibilityRole="button" onPress={startCreate} style={styles.addButton}>
            <MaterialIcons name="person-add" size={18} color={colors.white} />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {buyers.map((buyer, index) => (
            <View key={buyer.id} style={[styles.customerRow, index === buyers.length - 1 && styles.lastRow]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => startEdit(buyer)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
              >
                <Avatar label={initials(buyer.name)} size={38} />
                <View style={styles.buyerCopy}>
                  <Text style={styles.buyerName}>{buyer.name}</Text>
                  {buyer.phone ? <Text style={styles.buyerMeta}>{buyer.phone}</Text> : null}
                  {buyer.email ? <Text style={styles.buyerMeta} numberOfLines={1}>{buyer.email}</Text> : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${buyer.name}`}
                hitSlop={6}
                style={styles.iconButton}
                onPress={() => startEdit(buyer)}
              >
                <MaterialIcons name="edit" size={18} color={colors.ink} />
              </Pressable>
              <DangerIconButton accessibilityLabel={`Delete ${buyer.name}`} onPress={() => confirmDelete(buyer)} />
            </View>
          ))}
          {buyers.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="people-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>No customers yet</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setFormVisible(false)} />
          <View style={styles.sheet}>
            <Formik<CustomerFormValues>
              key={editingBuyer?.id ?? 'new-customer'}
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
                  contentContainerStyle={styles.formContent}
                >
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>{editingBuyer ? 'Edit customer' : 'New customer'}</Text>
                    <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setFormVisible(false)}>
                      <MaterialIcons name="close" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <Text style={styles.fieldLabel}>Name *</Text>
                  <Input value={values.name} onChangeText={handleChange('name')} onBlur={handleBlur('name')} placeholder="Full name" />
                  <FormError message={touched.name ? errors.name : undefined} />
                  <Text style={styles.fieldLabel}>Contact *</Text>
                  <Input value={values.contact} onChangeText={handleChange('contact')} onBlur={handleBlur('contact')} placeholder="Phone or messaging handle" />
                  <FormError message={touched.contact ? errors.contact : undefined} />
                  <Text style={styles.fieldLabel}>Address *</Text>
                  <Input value={values.address} onChangeText={handleChange('address')} onBlur={handleBlur('address')} placeholder="Delivery address" />
                  <FormError message={touched.address ? errors.address : undefined} />
                  <Text style={styles.fieldLabel}>Email *</Text>
                  <Input value={values.email} onChangeText={handleChange('email')} onBlur={handleBlur('email')} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />
                  <FormError message={touched.email ? errors.email : undefined} />
                  <PrimaryButton title={editingBuyer ? 'Save changes' : 'Save customer'} onPress={() => handleSubmit()} style={{ marginTop: 18 }} />
                </ScrollView>
              )}
            </Formik>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 32 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.ink, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 8 },
  addButtonText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.white },
  list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden' },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 74, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  lastRow: { borderBottomWidth: 0 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: radius.input },
  buyerCopy: { flex: 1, minWidth: 0 },
  buyerName: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink, marginBottom: 3 },
  buyerMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  rowPressed: { backgroundColor: colors.background },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  sheet: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  formContent: { paddingBottom: 8 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  formTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  fieldLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 12, marginBottom: 7 },
  error: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.errorFg, marginTop: 4 },
});
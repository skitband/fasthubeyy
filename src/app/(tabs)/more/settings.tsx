import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHeader } from '@/components/layout';
import { useRefresh } from '@/db/hooks';
import { exportDatabaseBackup, importDatabaseBackup } from '@/db/backup';
import { resetDatabase } from '@/db/queries';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function Settings() {
  const db = useSQLiteContext();
  const { refresh } = useRefresh();
  const [isBusy, setIsBusy] = useState(false);
  const isPicking = useRef(false);

  async function exportBackup() {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const file = await exportDatabaseBackup(db);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/x-sqlite3',
          dialogTitle: 'Export database backup',
          UTI: 'public.database',
        });
      } else {
        Alert.alert('Backup saved', `Backup created at ${file.uri}`);
      }
    } catch (error) {
      Alert.alert('Backup failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function selectBackup() {
    if (isBusy || isPicking.current) return;
    isPicking.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/x-sqlite3', 'application/vnd.sqlite3', 'application/octet-stream', '*/*'],
      });
      if (result.canceled || !result.assets?.length) return;

      const backup = result.assets[0];
      Alert.alert(
        'Replace local data?',
        `Restoring ${backup.name} will replace the database currently on this device. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore backup', style: 'destructive', onPress: () => void restoreBackup(backup.uri) },
        ]
      );
    } catch (error) {
      Alert.alert('Unable to select backup', String(error));
    } finally {
      isPicking.current = false;
    }
  }

  async function restoreBackup(uri: string) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await importDatabaseBackup(db, uri);
      refresh();
      Alert.alert('Restore complete', 'Your local database has been restored from backup.');
    } catch (error) {
      Alert.alert('Restore failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }

  function confirmReset() {
    if (isBusy) return;
    Alert.alert(
      'Reset database?',
      'This permanently deletes every trip, customer, order, payment, and setting on this device. Export a backup first. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Confirm permanent reset',
            'All local database records will be erased. Are you sure you want to continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset database', style: 'destructive', onPress: performReset },
            ]
          ),
        },
      ]
    );
  }

  function performReset() {
    setIsBusy(true);
    try {
      resetDatabase(db);
      refresh();
      Alert.alert('Database reset', 'All local data has been removed.');
    } catch (error) {
      Alert.alert('Reset failed', String(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <BackHeader title="Settings" />
        <Text style={styles.subtitle}>Manage local database backups and data</Text>

        <Text style={styles.sectionLabel}>Data backup</Text>
        <View style={styles.group}>
          <ActionRow icon="file-download" title="Export database backup" description="Create a full SQLite snapshot to save or share." onPress={exportBackup} disabled={isBusy} />
          <View style={styles.divider} />
          <ActionRow icon="restore" title="Import and restore backup" description="Choose a .db backup file to replace local data." onPress={selectBackup} disabled={isBusy} />
        </View>
        {isBusy ? <Text style={styles.busy}>Processing database...</Text> : null}

        <View style={styles.notice}>
          <MaterialIcons name="info-outline" size={18} color={colors.infoFg} />
          <Text style={styles.noticeText}>Backups contain customer, trip, order, and payment records. Keep exported files somewhere private.</Text>
        </View>

        <Text style={[styles.sectionLabel, styles.resetHeading]}>Danger zone</Text>
        <View style={styles.resetPanel}>
          <Text style={styles.resetTitle}>Reset database</Text>
          <Text style={styles.resetDescription}>Permanently erase all local trips, customers, orders, payments, and settings.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={confirmReset}
            style={({ pressed }) => [styles.resetButton, pressed && styles.resetPressed, isBusy && styles.disabled]}
          >
            <MaterialIcons name="delete-forever" size={19} color={colors.white} />
            <Text style={styles.resetButtonText}>Reset all data</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionRow({
  icon,
  title,
  description,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.actionIcon}>
        <MaterialIcons name={icon} size={20} color={colors.ink} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 32 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: -9, marginBottom: 24 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 15 },
  pressed: { backgroundColor: colors.background },
  disabled: { opacity: 0.55 },
  actionIcon: { width: 38, height: 38, borderRadius: radius.input, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  actionDescription: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.hairline, marginLeft: 64 },
  busy: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.textMuted, marginTop: -5, marginBottom: 16, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, backgroundColor: colors.infoBg, borderRadius: radius.button },
  noticeText: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: colors.infoFg },
  resetHeading: { marginTop: 24 },
  resetPanel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.errorBg, borderRadius: radius.card, padding: 15 },
  resetTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  resetDescription: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 6, marginBottom: 14 },
  resetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.errorFg, borderRadius: radius.button, paddingVertical: 13 },
  resetPressed: { opacity: 0.85 },
  resetButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
});
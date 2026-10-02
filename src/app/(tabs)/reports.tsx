import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Avatar } from '@/components/ui';
import { NoActiveTrip } from '@/components/NoActiveTrip';
import { useDbData, usePullToRefresh } from '@/db/hooks';
import { getActiveTrip, listOrders } from '@/db/queries';
import type { OrderView, Trip } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { dateRange, initials, peso } from '@/lib/money';
import { downloadOnWeb } from '@/lib/webDownload';

type ReportFormat = 'csv' | 'pdf';

function reportFilename(format: ReportFormat) {
  return `pasabuy-report-${Date.now()}.${format}`;
}

function csvCell(value: string | number | null) {
  let s = String(value ?? '');
  // Neutralise spreadsheet formula injection from user-entered text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function buildCsv(orders: OrderView[]) {
  const header = 'ref,buyer,status,pay,total,paid,fee,kg';
  const lines = orders.map((o) =>
    [o.ref, o.buyer_name, o.status, o.pay, Math.round(o.total), Math.round(o.paid), Math.round(o.fee), o.kg.toFixed(1)].map(csvCell).join(',')
  );
  return [header, ...lines].join('\n');
}

function buildHtml(trip: Trip, orders: OrderView[], stats: { label: string; value: string }[], net: number, unpaid: number) {
  const route = `${trip.origin} \u2192 ${trip.destination}`;
  const rows = orders
    .map(
      (o) => `<tr>
        <td>${escapeHtml(o.ref ?? '')}</td>
        <td>${escapeHtml(o.buyer_name)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td>${escapeHtml(o.pay)}</td>
        <td class="num">${escapeHtml(peso(o.total))}</td>
        <td class="num">${escapeHtml(peso(o.paid))}</td>
        <td class="num">${escapeHtml(peso(o.fee))}</td>
        <td class="num">${o.kg.toFixed(1)}</td>
      </tr>`
    )
    .join('');
  const statCells = [...stats, { label: 'Net earnings (fees)', value: peso(net) }, { label: 'Still owed', value: peso(unpaid) }]
    .map((s) => `<div class="stat"><div class="label">${escapeHtml(s.label)}</div><div class="value">${escapeHtml(s.value)}</div></div>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Trip report</title>
<style>
  @page { margin: 24px; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0b0b0c; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #6b6b70; font-size: 12px; margin: 0 0 18px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .stat { flex: 1 1 30%; border: 1px solid #e4e4e7; border-radius: 10px; padding: 10px; }
  .label { font-size: 11px; color: #6b6b70; }
  .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 6px 5px; border-bottom: 1px solid #e4e4e7; }
  th { color: #6b6b70; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style></head><body>
<h1>${escapeHtml(route)}</h1>
<p class="muted">${escapeHtml(dateRange(trip.depart_date, trip.return_date))} &middot; Generated ${escapeHtml(new Date().toLocaleString())}</p>
<div class="stats">${statCells}</div>
<table>
  <thead><tr><th>Ref</th><th>Buyer</th><th>Status</th><th>Pay</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Fee</th><th class="num">Kg</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="8">No orders on this trip.</td></tr>'}</tbody>
</table>
</body></html>`;
}

// expo-print on web only prints the current page, so print the report from a hidden iframe instead.
function printOnWeb(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export default function Reports() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const [formatOpen, setFormatOpen] = useState(false);
  const pendingFormat = useRef<ReportFormat | null>(null);
  const data = useDbData((db) => {
    try {
      const trip = getActiveTrip(db);
      if (!trip) return null;
      return { trip, orders: listOrders(db, trip.id) };
    } catch {
      return null;
    }
  });

  const buyerRollup = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; orders: number; spend: number }>();
    for (const o of data.orders) {
      const cur = map.get(o.buyer_id) ?? { name: o.buyer_name, orders: 0, spend: 0 };
      cur.orders += 1;
      cur.spend += o.total;
      map.set(o.buyer_id, cur);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [data]);

  if (!data) {
    return <NoActiveTrip />;
  }

  const orders = data.orders;
  const net = orders.reduce((a, o) => a + o.fee, 0);
  const delivered = orders.filter((o) => o.status === 'delivered').length;
  const avgFee = orders.length ? net / orders.length : 0;
  const kgCarried = orders.reduce((a, o) => a + o.kg, 0);
  const unpaid = orders.reduce((a, o) => a + (o.total - o.paid), 0);

  const bars = [...orders].sort((a, b) => b.fee - a.fee).slice(0, 6);
  const maxFee = bars[0]?.fee || 1;

  const stats = [
    { label: 'Orders on trip', value: String(orders.length) },
    { label: 'Avg fee per order', value: peso(avgFee) },
    { label: 'Kg carried', value: kgCarried.toFixed(1) },
    { label: 'Delivered', value: String(delivered) },
  ];

  function chooseFormat(format: ReportFormat) {
    setFormatOpen(false);
    // iOS can't present the share sheet while the menu modal is still dismissing; wait for onDismiss.
    if (Platform.OS === 'ios') pendingFormat.current = format;
    else void exportReport(format);
  }

  function onFormatMenuDismiss() {
    const format = pendingFormat.current;
    pendingFormat.current = null;
    if (format) void exportReport(format);
  }

  async function exportReport(format: ReportFormat) {
    if (!data) return;
    const filename = reportFilename(format);
    try {
      if (format === 'csv') {
        const csv = buildCsv(orders);
        if (Platform.OS === 'web') return downloadOnWeb(csv, filename, 'text/csv;charset=utf-8');
        const file = new File(Paths.cache, filename);
        file.create();
        file.write(csv);
        await shareFile(file.uri, 'text/csv', 'public.comma-separated-values-text');
      } else {
        const html = buildHtml(data.trip, orders, stats, net, unpaid);
        if (Platform.OS === 'web') return printOnWeb(html);
        const { uri } = await Print.printToFileAsync({ html });
        await shareFile(uri, 'application/pdf', 'com.adobe.pdf');
      }
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  }

  async function shareFile(uri: string, mimeType: string, UTI: string) {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Export trip report' });
    } else {
      Alert.alert('Saved', `Report written to ${uri}`);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>
          {`${data.trip.origin.split(',')[0]} \u2192 ${data.trip.destination.split(',')[0]}`}
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Net earnings (fees)</Text>
          <Text style={styles.heroNet}>{peso(net)}</Text>
          <View style={styles.chart}>
            {bars.map((o, i) => (
              <View key={o.id} style={styles.barCol}>
                <View style={[styles.bar, { height: Math.max(6, (o.fee / maxFee) * 76), backgroundColor: i === 0 ? colors.white : colors.onInk18 }]} />
                <Text style={styles.barLabel}>{initials(o.buyer_name)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Top buyers</Text>
        <View style={styles.listCard}>
          {buyerRollup.slice(0, 4).map((b, i) => (
            <View key={b.name} style={[styles.buyerRow, i === Math.min(3, buyerRollup.length - 1) && { borderBottomWidth: 0 }]}>
              <Avatar label={initials(b.name)} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.buyerName}>{b.name}</Text>
                <Text style={styles.buyerOrders}>{`${b.orders} order${b.orders === 1 ? '' : 's'}`}</Text>
              </View>
              <Text style={styles.buyerSpend}>{peso(b.spend)}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.exportBtn} onPress={() => setFormatOpen(true)}>
          <Text style={styles.exportText}>Export trip report</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={formatOpen} transparent animationType="fade" onRequestClose={() => setFormatOpen(false)} onDismiss={onFormatMenuDismiss}>
        <View style={styles.sheetModal}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setFormatOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Export format</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close export menu" hitSlop={10} onPress={() => setFormatOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <FormatOption icon="picture-as-pdf" title="PDF" description="Formatted report for sharing or printing" onPress={() => chooseFormat('pdf')} />
            <FormatOption icon="table-chart" title="CSV" description="Spreadsheet data for Excel or Sheets" onPress={() => chooseFormat('csv')} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FormatOption({
  icon,
  title,
  description,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
      <View style={styles.optionIcon}>
        <MaterialIcons name={icon} size={20} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6, paddingBottom: 28, marginTop: 20 },
  title: { fontFamily: fonts.bold, fontSize: 25, letterSpacing: -0.6, color: colors.ink, marginBottom: 5 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 },
  heroCard: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 18, marginBottom: 12 },
  heroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.onInk60 },
  heroNet: { fontFamily: fonts.extrabold, fontSize: 38, letterSpacing: -1.3, color: colors.white, marginTop: 11, marginBottom: 18 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 96 },
  barCol: { flex: 1, alignItems: 'center', gap: 7 },
  bar: { width: '100%', borderRadius: 5 },
  barLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.onInk60 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: { width: '47.8%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, padding: 15 },
  statLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted },
  statValue: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.ink, marginTop: 9 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
  listCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: 16 },
  buyerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  buyerName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  buyerOrders: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  buyerSpend: { fontFamily: fonts.monoSemibold, fontSize: 13, color: colors.ink },
  exportBtn: { borderWidth: 1, borderColor: colors.borderOutline, backgroundColor: colors.ink, borderRadius: radius.card, paddingVertical: 15, alignItems: 'center' },
  exportText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.white },
  sheetModal: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,11,12,0.35)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  option: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  optionPressed: { opacity: 0.65 },
  optionIcon: { width: 38, height: 38, borderRadius: radius.input, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  optionDescription: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
});

// Design tokens from the Pasabuy Tracker handoff. Values are final (high-fidelity).

export const colors = {
  ink: '#0B0B0C', // primary-950: buttons, hero cards, active tab
  primaryHover: '#2A2A2C',
  buttonDisabled: '#B6B3AE',

  background: '#F4F3F0',
  surface: '#FFFFFF',
  surfaceSubtle: '#FAF9F7',
  muted: '#ECEAE6', // avatar / muted
  track: '#EDEBE7',

  text: '#0B0B0C',
  textMuted: '#6B6A67',
  textDisabled: '#9A9894',
  tabInactive: '#A3A19C',

  borderCard: 'rgba(11,11,12,0.08)',
  borderInput: 'rgba(11,11,12,0.12)',
  borderOutline: 'rgba(11,11,12,0.14)',
  borderHover: 'rgba(11,11,12,0.30)',
  hairline: 'rgba(11,11,12,0.06)',

  // status
  successFg: '#0E7A4A',
  successBg: '#E3F3EA',
  warningFg: '#8A5A00',
  warningBg: '#FBEEDA',
  warningBar: '#D79A22',
  errorFg: '#A62828',
  errorBg: '#F8E4E2',
  infoFg: '#14459E',
  infoBg: '#E3EAFA',
  purpleFg: '#5B3B94',
  purpleBg: '#EDE6F7',
  neutralFg: '#4A4845',
  neutralBg: '#EDEBE7',

  white: '#FFFFFF',
  // on-ink translucent whites
  onInk62: 'rgba(255,255,255,0.62)',
  onInk70: 'rgba(255,255,255,0.70)',
  onInk60: 'rgba(255,255,255,0.60)',
  onInk16: 'rgba(255,255,255,0.16)',
  onInk18: 'rgba(255,255,255,0.18)',
} as const;

export const radius = {
  input: 8,
  button: 10,
  card: 12,
  hero: 16,
  pill: 999,
} as const;

export const spacing = {
  screen: 20,
  card: 16,
  listGap: 10,
  sectionGap: 18,
} as const;

// Font families (loaded via expo-font in the root layout).
export const fonts = {
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
  extrabold: 'SchibstedGrotesk_800ExtraBold',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

export type StatusColor = { bg: string; fg: string; label: string };

export const PAY: Record<'paid' | 'partial' | 'unpaid', StatusColor> = {
  paid: { bg: colors.successBg, fg: colors.successFg, label: 'PAID' },
  partial: { bg: colors.warningBg, fg: colors.warningFg, label: 'PARTIAL' },
  unpaid: { bg: colors.errorBg, fg: colors.errorFg, label: 'UNPAID' },
};

export const STATUS: Record<string, StatusColor> = {
  requested: { bg: colors.neutralBg, fg: colors.neutralFg, label: 'REQUESTED' },
  confirmed: { bg: colors.infoBg, fg: colors.infoFg, label: 'CONFIRMED' },
  bought: { bg: colors.purpleBg, fg: colors.purpleFg, label: 'BOUGHT' },
  packed: { bg: colors.warningBg, fg: colors.warningFg, label: 'PACKED' },
  delivered: { bg: colors.successBg, fg: colors.successFg, label: 'DELIVERED' },
};

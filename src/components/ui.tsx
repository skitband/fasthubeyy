import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius } from '@/theme/tokens';

export function Avatar({ label, size = 38, bg = colors.muted, fg = colors.ink }: { label: string; size?: number; bg?: string; fg?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: size * 0.32 }}>{label}</Text>
    </View>
  );
}

export function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: 10.5 }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({
  pct,
  height = 7,
  track = colors.track,
  fill = colors.ink,
}: {
  pct: number;
  height?: number;
  track?: string;
  fill?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${clamped}%`, backgroundColor: fill, borderRadius: height / 2 }} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ color = colors.hairline, style }: { color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: color }, style]} />;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: disabled ? colors.buttonDisabled : pressed ? colors.primaryHover : colors.ink },
        style,
      ]}
    >
      <Text style={styles.primaryBtnText}>{title}</Text>
    </Pressable>
  );
}

export function OutlineButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.outlineBtn, pressed && { backgroundColor: colors.background }, style]}
    >
      <Text style={styles.outlineBtnText}>{title}</Text>
    </Pressable>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: TextProps['style'] }) {
  return <Text style={[{ fontFamily: fonts.monoSemibold, color: colors.text }, style]}>{children}</Text>;
}

export const Input = forwardRef<TextInput, TextInputProps>((props, ref) => {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textDisabled}
      {...props}
      style={[styles.input, props.style]}
    />
  );
});
Input.displayName = 'Input';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function IconButton({ children, ...props }: PressableProps & { children: React.ReactNode }) {
  return (
    <Pressable hitSlop={8} {...props}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, alignSelf: 'flex-start' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    padding: 15,
  },
  primaryBtn: {
    borderRadius: radius.button,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 14.5 },
  outlineBtn: {
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderOutline,
    backgroundColor: colors.surface,
  },
  outlineBtnText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13.5 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    paddingVertical: 13,
    paddingHorizontal: 13,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  fieldLabel: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.textMuted,
    marginBottom: 7,
  },
});

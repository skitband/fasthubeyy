import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '@/theme/tokens';

type ToastType = 'success' | 'error';
type ToastState = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ show: (message: string, type?: ToastType) => void }>({ show: () => {} });

const useNativeDriver = Platform.OS !== 'web';

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity]);

  const show = useCallback(
    (message: string, type: ToastType = 'success') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ id: Date.now(), message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver }).start();
      hideTimer.current = setTimeout(hide, type === 'error' ? 5000 : 3000);
    },
    [opacity, hide]
  );

  const value = useMemo(() => ({ show }), [show]);
  const isError = toast?.type === 'error';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View style={[styles.wrap, { top: insets.top + 10, opacity }]}>
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            onPress={hide}
            style={[styles.toast, isError && styles.toastError]}
          >
            <MaterialIcons name={isError ? 'error-outline' : 'check-circle'} size={20} color={isError ? colors.errorFg : colors.successFg} />
            <Text style={styles.text}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000, pointerEvents: 'box-none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 440,
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.successFg,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastError: { borderColor: colors.errorFg },
  text: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
});

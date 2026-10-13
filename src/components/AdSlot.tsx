import type { StyleProp, ViewStyle } from 'react-native';

// AdSense only runs on the web build; native renders nothing.
export function AdSlot(_props: { slot?: string; style?: StyleProp<ViewStyle> }) {
  return null;
}

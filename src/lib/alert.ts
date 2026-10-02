import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

// react-native-web's Alert.alert is a no-op, so fall back to browser dialogs on web.
function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  const action = [...buttons].reverse().find((b) => b.style !== 'cancel');
  if (window.confirm(text)) action?.onPress?.();
  else cancel?.onPress?.();
}

export const Alert = {
  alert: Platform.OS === 'web' ? webAlert : NativeAlert.alert,
};

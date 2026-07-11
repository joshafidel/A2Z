import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation: window.confirm on web (react-native-web's
 * Alert has no buttons), native Alert elsewhere. Destructive actions must
 * go through here so they always genuinely ask first.
 */
export function confirmAction(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
}

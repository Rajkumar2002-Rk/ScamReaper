import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type PermissionSnapshot = {
  notifications: PermissionStatus;
};

async function getNotificationStatus(): Promise<PermissionStatus> {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return 'granted';
  if (perm.canAskAgain) return 'undetermined';
  return 'denied';
}

export const PermissionsService = {
  async getAll(): Promise<PermissionSnapshot> {
    return {
      notifications: await getNotificationStatus(),
    };
  },

  async requestNotifications(): Promise<PermissionStatus> {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const next = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    if (next.granted) return 'granted';
    return next.canAskAgain ? 'undetermined' : 'denied';
  },

  /**
   * iOS 26 Call Screening is configured in the system Settings app, not via
   * a runtime permission prompt. This helper opens the Phone settings page
   * so the user can enable "Screen Unknown Callers" → "Ask Reason for Calling".
   */
  async openCallScreeningSettings(): Promise<void> {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    }
  },

  async openAppSettings(): Promise<void> {
    await Linking.openSettings();
  },
};

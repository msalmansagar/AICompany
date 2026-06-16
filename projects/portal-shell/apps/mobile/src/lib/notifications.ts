// NOTE: Push notifications require EAS Build.
// expo-notifications does NOT work in Expo Go from SDK 53+.
// Use `expo-dev-client` (via `eas build --profile development`) for testing push notifications.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Notification handler — runs when a notification is received in foreground
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    // Required by the type — set priority for Android
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ---------------------------------------------------------------------------
// Push token registration
// NOTE: getExpoPushTokenAsync() will throw when running in Expo Go (SDK 53+).
// It requires a native build produced by EAS Build or expo run:android/ios.
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Portal Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0078D4',
    });
  }

  try {
    // NOTE: Requires EAS Build — throws "Must be a native build" in Expo Go.
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    // Silently return null when running in Expo Go or simulator without credentials.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local notification (works in both Expo Go and native builds)
// ---------------------------------------------------------------------------

export async function scheduleLocalNotification(
  title: string,
  body: string,
  delaySeconds: number = 1,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { seconds: delaySeconds },
  });
}

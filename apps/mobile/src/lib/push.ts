import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api, errorMessage } from './api';

export type PushResult = { ok: true; token: string; registered: boolean } | { ok: false; reason: string };

/** Expo Go no longer supports remote push; only dev/production builds do. */
export const pushSupported = () =>
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Loaded lazily so Expo Go never evaluates expo-notifications (it warns on import there).
type NotificationsModule = typeof import('expo-notifications');
let mod: NotificationsModule | null = null;
async function notifications(): Promise<NotificationsModule> {
  if (!mod) mod = await import('expo-notifications');
  return mod;
}

/**
 * Ask permission, fetch the native FCM/APNs device token and register it with the API.
 * Every step is guarded: without FCM/APNs credentials this resolves with a reason instead of throwing.
 */
export async function enablePush(prefs: { lang: string; region?: string; topics?: string[] }): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: 'Push needs a development or store build (not Expo Go).' };
  if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical device.' };
  try {
    const N = await notifications();
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('stories', {
        name: 'Story updates & corrections',
        importance: N.AndroidImportance.DEFAULT,
      });
    }
    const current = await N.getPermissionsAsync();
    const granted = current.granted || (await N.requestPermissionsAsync()).granted;
    if (!granted) return { ok: false, reason: 'Notification permission was not granted.' };

    let token: string;
    try {
      token = String((await N.getDevicePushTokenAsync()).data);
    } catch {
      return { ok: false, reason: 'Push credentials (FCM/APNs) are not configured for this build yet.' };
    }
    try {
      await api.registerDevice({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android', ...prefs });
      return { ok: true, token, registered: true };
    } catch (e) {
      return { ok: false, reason: `Could not register device: ${errorMessage(e)}` };
    }
  } catch (e) {
    return { ok: false, reason: errorMessage(e) };
  }
}

/**
 * Show notifications while foregrounded and route taps with `data.storyId` / `data.url`
 * to the story screen. No-op where push is unsupported. Returns a cleanup function.
 */
export function installNotificationRouting(open: (storyId: string) => void): () => void {
  if (!pushSupported()) return () => {};
  let sub: { remove: () => void } | null = null;
  let cancelled = false;
  notifications()
    .then((N) => {
      if (cancelled) return;
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      const route = (data: Record<string, unknown> | undefined) => {
        const id = typeof data?.storyId === 'string' ? data.storyId : storyIdFromUrl(data?.url);
        if (id) open(id);
      };
      const last = N.getLastNotificationResponse();
      if (last) route(last.notification.request.content.data);
      sub = N.addNotificationResponseReceivedListener((r) => route(r.notification.request.content.data));
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    sub?.remove();
  };
}

function storyIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = /story\/([^/?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

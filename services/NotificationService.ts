import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CallEntry } from '@/constants/sample-calls';

/**
 * NotificationService
 *
 * Wraps expo-notifications to deliver verdict-specific alerts with
 * actionable categories (Accept / Decline / Ask More / Block / etc.).
 *
 * Categories are registered once at app startup. The caller IDs flow
 * through the notification payload so handlers can route back to the
 * right entry in the call log.
 */

export type VerdictKind = 'scam' | 'legitimate' | 'unsure' | 'unknown_language';

const CATEGORIES: Record<VerdictKind, string> = {
  scam: 'scamreaper.scam',
  legitimate: 'scamreaper.legit',
  unsure: 'scamreaper.unsure',
  unknown_language: 'scamreaper.unknown_lang',
};

let categoriesRegistered = false;
let foregroundHandlerSet = false;
let permissionRequested = false;

/**
 * Show notifications even while the app is open — without this, the
 * simulator silently swallows everything we schedule while ScamReaper
 * is the foreground app, which is exactly when the user is testing.
 */
function ensureForegroundHandler() {
  if (foregroundHandlerSet) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // Back-compat for older expo-notifications typings:
      shouldShowAlert: true,
    } as unknown as Notifications.NotificationBehavior),
  });
  foregroundHandlerSet = true;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  if (permissionRequested) return false;
  permissionRequested = true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerNotificationCategories(): Promise<void> {
  if (categoriesRegistered || Platform.OS === 'web') return;
  ensureForegroundHandler();
  await ensurePermission();
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORIES.scam, [
      { identifier: 'view', buttonTitle: 'View Details' },
      { identifier: 'block', buttonTitle: 'Block Number', options: { isDestructive: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORIES.legitimate, [
      { identifier: 'accept', buttonTitle: 'Accept' },
      { identifier: 'decline', buttonTitle: 'Decline', options: { isDestructive: true } },
      { identifier: 'ask_more', buttonTitle: 'Ask More' },
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORIES.unsure, [
      { identifier: 'view', buttonTitle: 'View Details' },
      { identifier: 'call_back', buttonTitle: 'Call Back' },
      { identifier: 'dismiss', buttonTitle: 'Dismiss' },
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORIES.unknown_language, [
      { identifier: 'listen', buttonTitle: 'Listen' },
      { identifier: 'block', buttonTitle: 'Block', options: { isDestructive: true } },
      { identifier: 'dismiss', buttonTitle: 'Dismiss' },
    ]);
    categoriesRegistered = true;
  } catch {
    // Categories unavailable — we'll still send plain notifications below.
  }
}

function summarize(transcript: string, max = 80): string {
  const clean = transcript.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export type NotificationIntent = {
  kind: VerdictKind;
  title: string;
  body: string;
  category: string;
  data: Record<string, unknown>;
};

export function buildNotification(entry: CallEntry, opts?: {
  languageLabel?: string;
  languageIsUnknown?: boolean;
  lowConfidence?: boolean;
}): NotificationIntent {
  const summary = summarize(
    entry.transcript.find((t) => t.speaker === 'caller')?.text ?? entry.claim,
  );
  const tag = opts?.lowConfidence ? ' (Low Confidence)' : '';

  if (opts?.languageIsUnknown) {
    return {
      kind: 'unknown_language',
      title: `🌐 Unknown Language Detected`,
      body: `${opts?.languageLabel ? `${opts.languageLabel} detected — ` : ''}Could not classify. Tap to listen and decide manually.`,
      category: CATEGORIES.unknown_language,
      data: { callId: entry.id, kind: 'unknown_language' },
    };
  }

  if (entry.status === 'scam') {
    return {
      kind: 'scam',
      title: `💀 SCAM BLOCKED${tag}`,
      body: `Caller claimed: ${summary}\nNumber: ${entry.number}. Tap to view details.`,
      category: CATEGORIES.scam,
      data: { callId: entry.id, kind: 'scam' },
    };
  }
  if (entry.status === 'legitimate') {
    return {
      kind: 'legitimate',
      title: `📞 Legitimate Call${tag}`,
      body: `${entry.callerName ?? entry.number} — ${summary}\nTap to Accept, Decline, or Ask More.`,
      category: CATEGORIES.legitimate,
      data: { callId: entry.id, kind: 'legitimate' },
    };
  }
  return {
    kind: 'unsure',
    title: `⚠️ Unsure`,
    body: `Asked caller to email you. Caller said: ${summary}. Tap to review.`,
    category: CATEGORIES.unsure,
    data: { callId: entry.id, kind: 'unsure' },
  };
}

/**
 * Wire up what happens when the user taps a notification or one of its
 * action buttons. Called once from the root layout.
 *
 * Routing rule: every verdict notification carries a `callId`, so a plain
 * tap (no action identifier, or our "view" / "listen" action) goes
 * straight to the call-detail screen for that entry. Destructive actions
 * like "block" / "decline" are logged but don't navigate — we want the
 * user to stay on their lock screen.
 */
export function attachNotificationResponseHandler(
  navigate: (callId: string) => void,
): () => void {
  ensureForegroundHandler();
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response.notification.request.content.data as
        | { callId?: string }
        | undefined;
      const callId = data?.callId;
      if (!callId) return;
      const action = response.actionIdentifier;
      const openActions = new Set<string>([
        Notifications.DEFAULT_ACTION_IDENTIFIER,
        'view',
        'listen',
        'ask_more',
        'call_back',
        'accept',
      ]);
      if (openActions.has(action)) {
        navigate(callId);
      }
      // "block" / "decline" / "dismiss" intentionally do nothing visible.
    } catch {
      /* swallow — notification routing must never crash the app */
    }
  });
  return () => sub.remove();
}

export async function sendVerdictNotification(intent: NotificationIntent): Promise<void> {
  try {
    ensureForegroundHandler();
    const granted = await ensurePermission();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: intent.title,
        body: intent.body,
        data: intent.data,
        categoryIdentifier: intent.category,
      },
      trigger: null,
    });
  } catch {
    /* Notifications unavailable — silent. */
  }
}

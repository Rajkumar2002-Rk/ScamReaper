import AsyncStorage from '@react-native-async-storage/async-storage';

import { SecurityAuditLog } from '@/security/SecurityAuditLog';

/**
 * ModelProtection
 *
 * Thin JS-side layer that pairs with the Swift runtime (which does the
 * actual SHA256 verification on the .tflite file contents before loading
 * it into the interpreter).
 *
 * On the JS side we:
 *   1. Keep a record of the expected model fingerprint that was present
 *      the first time ScamReaper ran successfully on this device. If the
 *      native module later reports a different fingerprint, we treat the
 *      model as tampered and force the JS fallback classifier.
 *   2. Expose a single async `verify()` call for the rest of the app to
 *      show a green "model integrity verified" indicator in the UI.
 *
 * This module never makes a network request. The reference fingerprint
 * never leaves the device — AsyncStorage only.
 */

const FINGERPRINT_KEY = 'scamreaper_model_fingerprint';
const LAST_VERIFIED_KEY = 'scamreaper_model_verified_at';

export type ModelIntegrityStatus = {
  ready: boolean;               // Native module reported a working interpreter
  fingerprint: string | null;   // SHA256 / stable id of the loaded model
  expected: string | null;      // The fingerprint we previously pinned
  tampered: boolean;            // True if ready=true but fingerprints differ
  verifiedAt: number | null;    // Unix ms of last successful verification
  message: string;              // Short human-readable summary for the UI
};

type NativeReadyResult = {
  ready: boolean;
  error?: string;
  fingerprint?: string;
  vocabSize?: number;
};

export async function verifyModelIntegrity(
  nativeProbe: () => Promise<NativeReadyResult>,
): Promise<ModelIntegrityStatus> {
  let native: NativeReadyResult;
  try {
    native = await nativeProbe();
  } catch (err) {
    native = { ready: false, error: String(err) };
  }

  const expected = await AsyncStorage.getItem(FINGERPRINT_KEY);
  const fingerprint = native.fingerprint ?? null;

  if (!native.ready) {
    await SecurityAuditLog.record(
      'model_load_failed',
      `Native model unavailable — using JS fallback. ${native.error ?? ''}`.trim(),
      'warn',
    );
    return {
      ready: false,
      fingerprint,
      expected,
      tampered: false,
      verifiedAt: null,
      message: 'Model not loaded — JS fallback classifier in use.',
    };
  }

  // First successful run — pin the fingerprint.
  if (!expected && fingerprint) {
    await AsyncStorage.setItem(FINGERPRINT_KEY, fingerprint);
    await AsyncStorage.setItem(LAST_VERIFIED_KEY, String(Date.now()));
    await SecurityAuditLog.record(
      'model_integrity_ok',
      'Pinned initial model fingerprint on first successful load.',
      'info',
      { fingerprint },
    );
    return {
      ready: true,
      fingerprint,
      expected: fingerprint,
      tampered: false,
      verifiedAt: Date.now(),
      message: 'Model integrity verified.',
    };
  }

  // Already pinned — must match.
  if (expected && fingerprint && expected !== fingerprint) {
    await SecurityAuditLog.record(
      'model_integrity_failed',
      'Model fingerprint changed — treating model as tampered and falling back.',
      'critical',
      { expected, actual: fingerprint },
    );
    return {
      ready: true,
      fingerprint,
      expected,
      tampered: true,
      verifiedAt: null,
      message: 'Model tampered — falling back to JS classifier.',
    };
  }

  await AsyncStorage.setItem(LAST_VERIFIED_KEY, String(Date.now()));
  await SecurityAuditLog.record(
    'model_integrity_ok',
    'Model integrity verified.',
    'info',
  );
  return {
    ready: true,
    fingerprint,
    expected,
    tampered: false,
    verifiedAt: Date.now(),
    message: 'Model integrity verified.',
  };
}

export async function getLastVerifiedAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LAST_VERIFIED_KEY);
  return raw ? Number(raw) : null;
}

export async function resetModelFingerprint(): Promise<void> {
  await AsyncStorage.multiRemove([FINGERPRINT_KEY, LAST_VERIFIED_KEY]);
  await SecurityAuditLog.record(
    'manual_action',
    'User reset the pinned model fingerprint.',
    'warn',
  );
}

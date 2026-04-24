import AsyncStorage from '@react-native-async-storage/async-storage';

import { SecurityAuditLog } from '@/security/SecurityAuditLog';

/**
 * AntiBypassDetection
 *
 * Scammers have started adapting to scam-screening AIs by padding their
 * scripts with legit-sounding keywords ("appointment reminder, delivery
 * tracking, recruiter follow-up, doctor office") to push the classifier
 * toward GREEN. This module runs alongside the TFLite model and flags
 * those manipulation patterns so the final verdict is not fooled.
 *
 * All signals are heuristic and run locally. We track repeated call
 * attempts from the same phone number across AsyncStorage so we can
 * penalise a caller who tried three different scripts in 24 hours.
 */

const HISTORY_KEY = 'scamreaper_bypass_history';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h

type AttemptRecord = {
  number: string;
  transcriptHash: string;
  timestamp: number;
};

export type BypassSignal = {
  tripped: boolean;            // Final gate: if true, force RED.
  reasons: string[];           // Human-readable flags for the UI.
  score: number;               // 0–1, how suspicious this transcript looks.
};

// Keywords that, when densely present, suggest deliberate keyword stuffing.
const LEGIT_BAIT = [
  'appointment', 'delivery', 'tracking', 'recruiter', 'hiring', 'interview',
  'clinic', 'pharmacy', 'doctor', 'dentist', 'reminder', 'confirm',
  'follow-up', 'reference', 'job application',
];

// Phrases a scammer would still slip in even while padding with legit words.
const SCAM_HIDDEN = [
  'gift card', 'wire transfer', 'bitcoin', 'crypto', 'ssn',
  'one-time code', 'one time code', 'otp', 'routing number',
  'your card number', 'warrant', 'arrest', 'irs', 'medicare',
  'suspended', 'verify your identity',
];

function hashString(s: string): string {
  // Tiny FNV-1a-ish hash — good enough to detect "is this exactly the same
  // transcript I saw from this number two hours ago?"
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

async function loadHistory(): Promise<AttemptRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed: AttemptRecord[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - WINDOW_MS;
    return parsed.filter((r) => r.timestamp >= cutoff);
  } catch {
    return [];
  }
}

async function saveHistory(history: AttemptRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
  } catch {
    /* disk full — drop */
  }
}

/**
 * Inspect a transcript + caller number for bypass attempts.
 * Should be called BEFORE or ALONGSIDE the TFLite classifier so the caller
 * can override a false-GREEN verdict.
 */
export async function detectBypass(
  number: string,
  transcript: string,
): Promise<BypassSignal> {
  const reasons: string[] = [];
  let score = 0;

  const text = transcript.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;

  // 1. Keyword stuffing — unusually high density of legit-sounding tokens.
  let legitHits = 0;
  for (const term of LEGIT_BAIT) if (text.includes(term)) legitHits++;
  const legitDensity = legitHits / Math.max(1, wordCount / 10);
  if (legitHits >= 4) {
    reasons.push('Keyword stuffing detected — unusual density of legit-sounding terms.');
    score += 0.4;
  } else if (legitDensity > 1.2 && legitHits >= 3) {
    reasons.push('High legitimacy-keyword density for a short transcript.');
    score += 0.25;
  }

  // 2. A scam signal hiding behind the legit padding.
  let hiddenHits = 0;
  for (const term of SCAM_HIDDEN) if (text.includes(term)) hiddenHits++;
  if (legitHits >= 2 && hiddenHits >= 1) {
    reasons.push('Scam-style phrases hidden inside otherwise legit-sounding speech.');
    score += 0.5;
  }

  // 3. Unnaturally structured speech — very short sentences, or a flat
  //    list of keywords with no verbs.
  const avgWordsPerSentence =
    wordCount / Math.max(1, (transcript.match(/[.!?]/g) || []).length);
  if (wordCount > 20 && avgWordsPerSentence < 4) {
    reasons.push('Robotic / fragmented speech pattern.');
    score += 0.2;
  }

  // 4. Repeated calls from the same number with different scripts.
  const history = await loadHistory();
  const sameNumber = history.filter((h) => h.number === number);
  const hash = hashString(text);
  const record: AttemptRecord = { number, transcriptHash: hash, timestamp: Date.now() };

  const distinctScriptsFromNumber = new Set(sameNumber.map((h) => h.transcriptHash));
  distinctScriptsFromNumber.add(hash);
  if (number && number !== 'Unknown' && distinctScriptsFromNumber.size >= 3) {
    reasons.push(
      `Caller tried ${distinctScriptsFromNumber.size} different scripts in the last 24h.`,
    );
    score += 0.4;
  }

  const updatedHistory = [record, ...history];
  await saveHistory(updatedHistory);

  const tripped = score >= 0.6;

  if (tripped) {
    await SecurityAuditLog.record(
      'bypass_attempt',
      `Bypass attempt detected from ${number || 'Unknown'}.`,
      'critical',
      { score, reasons, number },
    );
  }

  return { tripped, reasons, score: Math.min(1, score) };
}

export async function clearBypassHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
  await SecurityAuditLog.record(
    'manual_action',
    'User cleared the bypass-attempt history.',
    'info',
  );
}

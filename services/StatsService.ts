import AsyncStorage from '@react-native-async-storage/async-storage';

import { CallEntry } from '@/constants/sample-calls';
import { CallScreeningService } from '@/services/CallScreeningService';

/**
 * StatsService
 *
 * Derives user-facing metrics from the stored call log. Everything is
 * computed locally. We estimate "time saved" using an industry-average
 * scam-call duration of 4 minutes — that's the only non-local number,
 * and it's a constant, not a download.
 */

const STREAK_START_KEY = 'scamreaper_streak_start';
const AVG_SCAM_CALL_MINUTES = 4;

export type Stats = {
  totalScreened: number;
  blockedThisWeek: number;
  blockedThisMonth: number;
  blockedToday: number;
  topScamType: string;
  timeSavedMinutes: number;
  streakDays: number;
  communityProtectedEstimate: number; // Local extrapolation only.
};

type Bucket = { label: string; matchers: string[] };

const SCAM_TYPES: Bucket[] = [
  { label: 'IRS / Tax impersonation', matchers: ['irs', 'tax', 'social security', 'ssn'] },
  { label: 'Bank / Card fraud', matchers: ['bank', 'card number', 'routing', 'one-time code', 'otp'] },
  { label: 'Prize / Gift card scam', matchers: ['prize', 'won', 'gift card', 'congratulations'] },
  { label: 'Tech support scam', matchers: ['tech support', 'virus', 'compromised', 'microsoft', 'apple support'] },
  { label: 'Car warranty', matchers: ['warranty', 'vehicle'] },
  { label: 'Medicare / Insurance', matchers: ['medicare', 'insurance', 'health plan'] },
  { label: 'Crypto / Investment', matchers: ['bitcoin', 'crypto', 'investment', 'trading'] },
];

function classifyScam(entry: CallEntry): string {
  const text = `${entry.claim} ${entry.transcript.map((t) => t.text).join(' ')}`.toLowerCase();
  for (const b of SCAM_TYPES) {
    if (b.matchers.some((m) => text.includes(m))) return b.label;
  }
  return 'Generic phone scam';
}

async function getStreakStart(): Promise<number> {
  const raw = await AsyncStorage.getItem(STREAK_START_KEY);
  if (raw) return Number(raw);
  const now = Date.now();
  await AsyncStorage.setItem(STREAK_START_KEY, String(now));
  return now;
}

export async function computeStats(): Promise<Stats> {
  const calls = await CallScreeningService.getCalls();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const scams = calls.filter((c) => c.status === 'scam');
  const blockedThisWeek = scams.filter((c) => c.timestamp >= weekAgo).length;
  const blockedThisMonth = scams.filter((c) => c.timestamp >= monthAgo).length;
  const blockedToday = scams.filter((c) => c.timestamp >= dayStart.getTime()).length;

  const typeCounts = new Map<string, number>();
  for (const s of scams) {
    const t = classifyScam(s);
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  let topScamType = '—';
  let topCount = 0;
  for (const [t, c] of typeCounts) {
    if (c > topCount) {
      topScamType = t;
      topCount = c;
    }
  }

  const timeSavedMinutes = scams.length * AVG_SCAM_CALL_MINUTES;

  const streakStart = await getStreakStart();
  const streakDays = Math.max(1, Math.floor((now - streakStart) / (24 * 60 * 60 * 1000)) + 1);

  // Conservative local extrapolation: assume each user with scam-blocking
  // behaviour helps the community model indirectly. Pure placeholder —
  // multiplies THIS user's scams so the UI shows "community" impact
  // without ever talking to a server.
  const communityProtectedEstimate = scams.length * 12;

  return {
    totalScreened: calls.length,
    blockedThisWeek,
    blockedThisMonth,
    blockedToday,
    topScamType,
    timeSavedMinutes,
    streakDays,
    communityProtectedEstimate,
  };
}

export async function getWeeklyBlockedHistogram(): Promise<number[]> {
  // Returns [oldest … newest] counts of blocked scams per day for last 7 days.
  const calls = await CallScreeningService.getCalls();
  const now = new Date();
  const days: number[] = new Array(7).fill(0);
  for (const c of calls) {
    if (c.status !== 'scam') continue;
    const d = new Date(c.timestamp);
    const diffDays = Math.floor(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (diffDays >= 0 && diffDays < 7) days[6 - diffDays] += 1;
  }
  return days;
}

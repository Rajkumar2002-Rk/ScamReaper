import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { CallEntry, CallStatus, SAMPLE_CALLS } from '@/constants/sample-calls';
import { NativeScamDetector, ScamVerdict } from '@/services/NativeScamDetector';
import {
  buildNotification,
  registerNotificationCategories,
  sendVerdictNotification,
} from '@/services/NotificationService';
import { RageMode } from '@/services/RageModeService';

const STORAGE_KEY = 'scamreaper_calls';
const COUNTER_KEY = 'scamreaper_screened_count';
const SAMPLES_HIDDEN_KEY = 'scamreaper_samples_hidden';

export type ScreenedCallEvent = {
  number: string;
  callerName?: string;
  transcript: string;
  timestamp?: number;
};

type Listener = (calls: CallEntry[]) => void;

/**
 * CallScreeningService
 *
 * Surfaces iOS 26 Call Screening transcripts to the React layer, runs them
 * through the classifier + security stack, stores the verdict locally, and
 * fires a smart notification.
 *
 * Architecture stays native-bridge-first: if the Swift module isn't linked,
 * the whole pipeline still works via the JS fallback classifier.
 */
class CallScreeningServiceImpl {
  private listeners = new Set<Listener>();
  private cache: CallEntry[] | null = null;
  private nativeSubscription: { remove: () => void } | null = null;

  async init() {
    await registerNotificationCategories();
    await this.attachNative();
    await this.load();
  }

  private async attachNative() {
    if (Platform.OS !== 'ios') return;
    const bridge = (NativeModules as Record<string, unknown>).ScamReaperCallBridge;
    if (!bridge) return;
    try {
      const emitter = new NativeEventEmitter(bridge as never);
      this.nativeSubscription = emitter.addListener(
        'onScreenedCall',
        (event: ScreenedCallEvent) => {
          this.ingestScreenedCall(event).catch(() => {});
        },
      );
    } catch {
      // Native emitter unavailable — safe to ignore.
    }
  }

  dispose() {
    this.nativeSubscription?.remove();
    this.nativeSubscription = null;
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.cache) listener(this.cache);
    return () => this.listeners.delete(listener);
  }

  async getCalls(): Promise<CallEntry[]> {
    if (this.cache) return this.cache;
    return this.load();
  }

  async getCallsWithSamples(): Promise<CallEntry[]> {
    const real = await this.getCalls();
    if (real.length === 0) return SAMPLE_CALLS;
    return [...real, ...SAMPLE_CALLS];
  }

  async getScreenedCount(): Promise<number> {
    const raw = await AsyncStorage.getItem(COUNTER_KEY);
    return raw ? Number(raw) : 0;
  }

  async clear() {
    this.cache = [];
    await AsyncStorage.multiRemove([STORAGE_KEY, COUNTER_KEY]);
    await AsyncStorage.setItem(SAMPLES_HIDDEN_KEY, 'true');
    this.notify();
  }

  async areSamplesHidden(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(SAMPLES_HIDDEN_KEY);
    return raw === 'true';
  }

  async restoreSamples() {
    await AsyncStorage.removeItem(SAMPLES_HIDDEN_KEY);
    this.notify();
  }

  async ingestScreenedCall(event: ScreenedCallEvent): Promise<CallEntry> {
    const entry = await this.buildEntry(event);
    const existing = await this.load();
    const next = [entry, ...existing];
    this.cache = next;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const count = (await this.getScreenedCount()) + 1;
    await AsyncStorage.setItem(COUNTER_KEY, String(count));
    this.notify();
    await this.fireNotification(entry);
    return entry;
  }

  private async buildEntry(event: ScreenedCallEvent): Promise<CallEntry> {
    const ts = event.timestamp ?? Date.now();
    const analysis = await NativeScamDetector.analyze(event.transcript);
    const status = verdictToStatus(analysis.verdict);

    const sourceTag =
      analysis.source === 'tflite'
        ? `TensorFlow Lite (${(analysis.confidence * 100).toFixed(0)}% confidence${analysis.lowConfidence ? ', low' : ''})`
        : 'keyword fallback';

    const lines: string[] = [];
    if (analysis.explanation) lines.push(analysis.explanation);
    if (analysis.bypass && analysis.bypass.tripped) {
      lines.push(
        `⚠️ Bypass attempt detected (score ${analysis.bypass.score.toFixed(2)}): ${analysis.bypass.reasons.join(' ')}`,
      );
    }
    if (!analysis.language.isEnglish && analysis.language.code !== 'unknown') {
      lines.push(`Language: ${analysis.language.label} — non-English calls are never auto-classified as RED for your safety.`);
    }
    lines.push(`Detection engine: ${sourceTag}.`);

    // Rage Mode fires only on RED and only when the user opted in.
    let rageModeUsed = false;
    let rageModeLanguage: string | undefined;
    const rageEnabled = await RageMode.isEnabled();
    if (analysis.rageModeReady && rageEnabled) {
      const rage = await RageMode.trigger();
      rageModeUsed = true;
      rageModeLanguage = rage.languageLabel;
      lines.push(`Rage Mode activated — responded in ${rage.languageLabel}: "${rage.text}"`);
    }

    const transcriptEntries: CallEntry['transcript'] = [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'caller', text: event.transcript },
      { speaker: 'system', text: `ScamReaper verdict: ${statusBanner(status)}` },
    ];
    if (rageModeUsed && rageModeLanguage) {
      transcriptEntries.push({
        speaker: 'ai',
        text: `(Rage Mode, ${rageModeLanguage}) — response sent to waste scammer's time.`,
      });
    }

    return {
      id: `call_${ts}_${Math.random().toString(36).slice(2, 8)}`,
      number: event.number || 'Unknown',
      callerName: event.callerName,
      claim: firstClaim(event.transcript),
      status,
      time: 'Just now',
      timestamp: ts,
      verdict: lines.join('\n\n'),
      transcript: transcriptEntries,
      language: analysis.language.label,
      languageCode: analysis.language.code,
      lowConfidence: analysis.lowConfidence,
      bypassFlagged: !!analysis.bypass?.tripped,
      rageModeUsed,
      rageModeLanguage,
    };
  }

  private async load(): Promise<CallEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: CallEntry[] = raw ? JSON.parse(raw) : [];
      this.cache = parsed;
      this.notify();
      return parsed;
    } catch {
      this.cache = [];
      return [];
    }
  }

  private notify() {
    if (!this.cache) return;
    for (const l of this.listeners) l(this.cache);
  }

  private async fireNotification(entry: CallEntry) {
    const intent = buildNotification(entry, {
      languageLabel: entry.language,
      languageIsUnknown: entry.languageCode === 'unknown',
      lowConfidence: entry.lowConfidence,
    });
    await sendVerdictNotification(intent);
  }
}

function verdictToStatus(v: ScamVerdict): CallStatus {
  if (v === 'RED') return 'scam';
  if (v === 'GREEN') return 'legitimate';
  return 'unsure';
}

function firstClaim(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= 90) return trimmed;
  return trimmed.slice(0, 87) + '...';
}

function statusBanner(status: CallStatus): string {
  if (status === 'scam') return 'RED — Scam detected';
  if (status === 'legitimate') return 'GREEN — Legitimate call';
  return 'YELLOW — Unable to verify';
}

export const CallScreeningService = new CallScreeningServiceImpl();

import { NativeModules } from 'react-native';

import { detectBypass, BypassSignal } from '@/security/AntiBypassDetection';
import { SecurityAuditLog } from '@/security/SecurityAuditLog';
import { detectLanguage, DetectedLanguage } from '@/services/LanguageDetector';

export type ScamVerdict = 'RED' | 'GREEN' | 'YELLOW';

export type ScamAnalysis = {
  verdict: ScamVerdict;
  confidence: number;
  scores: { RED: number; GREEN: number; YELLOW: number };
  source: 'tflite' | 'fallback';
  explanation?: string;
  language: DetectedLanguage;
  lowConfidence: boolean;       // True when classifier was between 0.70 and 0.85
  bypass?: BypassSignal;        // Present when bypass detection tripped
  rageModeReady: boolean;       // Hint to caller: if RED, Rage Mode may fire
};

type NativeResult = {
  verdict: string;
  confidence: number;
  scores: { RED: number; GREEN: number; YELLOW: number };
  error?: string;
};

type NativeReadyResult = {
  ready: boolean;
  error?: string;
  fingerprint?: string;
  vocabSize?: number;
};

type NativeModuleShape = {
  analyze(transcript: string): Promise<NativeResult>;
  isReady(): Promise<NativeReadyResult>;
};

const native = (NativeModules as Record<string, unknown>).ScamDetector as
  | NativeModuleShape
  | undefined;

// ----- Confidence tiers (see Phase 4 spec) -----
const YELLOW_THRESHOLD = 0.70;       // Below this → force YELLOW
const LOW_CONFIDENCE_CEILING = 0.85; // 0.70–0.85 → tag "Low Confidence"

// Minimum wall-clock time every analyze() call must take. Keeps fast-path
// classifications indistinguishable from slow-path ones so a probing
// attacker can't learn whether they hit the native module or fallback.
const TIMING_FLOOR_MS = 220;

/**
 * Keyword fallback classifier. Runs when the native TFLite bridge is
 * unavailable (Expo Go, simulator without native build, or model load
 * failure). Output shape mirrors the native path so callers never have
 * to branch on which engine ran.
 */
function fallbackClassify(transcript: string): Omit<ScamAnalysis, 'language' | 'lowConfidence' | 'rageModeReady'> {
  const t = transcript.toLowerCase();

  const scamSignals = [
    'irs', 'social security', 'ssn', 'arrest', 'warrant', 'lawsuit',
    'gift card', 'wire transfer', 'bitcoin', 'crypto', 'cryptocurrency',
    'suspended', 'suspend', 'verify your identity', 'one time code',
    'one-time code', 'otp', 'credit card number', 'routing number',
    'you have won', 'you won', 'prize', 'winner', 'congratulations',
    'immediate payment', 'urgent', 'limited time', 'expire',
    'medicare', 'refund', 'deport', 'immigration',
    'tech support', 'virus', 'compromised', 'car warranty', 'extended warranty',
  ];
  const legitSignals = [
    'appointment', 'reschedule', 'delivery', 'tracking number',
    'pharmacy', 'reminder', 'confirm', 'interview', 'recruiter',
    'hiring manager', 'job application', 'reference', 'follow-up',
    'clinic', 'doctor', 'dentist', 'meeting scheduled',
  ];

  let redScore = 0;
  let greenScore = 0;
  for (const phrase of scamSignals) if (t.includes(phrase)) redScore += 1;
  for (const phrase of legitSignals) if (t.includes(phrase)) greenScore += 1;

  const total = redScore + greenScore + 1;
  const red = redScore / total;
  const green = greenScore / total;
  const yellow = 1 / total;

  let verdict: ScamVerdict;
  let explanation: string;
  if (redScore >= 2 || (redScore >= 1 && greenScore === 0)) {
    verdict = 'RED';
    explanation =
      'Transcript contains phrases strongly associated with known phone scams (urgency, payment demands, or impersonation of authorities).';
  } else if (greenScore >= 1 && redScore === 0) {
    verdict = 'GREEN';
    explanation =
      'Transcript matches the pattern of a routine legitimate call (appointment, delivery, recruiter, etc.).';
  } else {
    verdict = 'YELLOW';
    explanation =
      'Not enough signal to classify confidently. The caller will be asked to send an official email for verification.';
  }

  return {
    verdict,
    confidence: verdict === 'YELLOW' ? 0.5 : 0.8,
    scores: { RED: red, GREEN: green, YELLOW: yellow },
    source: 'fallback',
    explanation,
  };
}

function explainFromVerdict(
  v: ScamVerdict,
  lowConfidence: boolean,
  lang: DetectedLanguage,
): string {
  const tag = lowConfidence ? ' (Low Confidence)' : '';
  if (!lang.isEnglish && lang.code !== 'unknown') {
    return `Non-English response detected (${lang.label}) — classified as Unsure for your safety. ScamReaper only makes confident RED / GREEN decisions on English speech.`;
  }
  if (lang.code === 'unknown') {
    return 'Transcript language could not be confidently identified — classified as Unsure. You can listen and decide manually.';
  }
  if (v === 'RED')
    return `On-device AI flagged this transcript as a scam${tag}. Urgency cues, payment-related language, and scam-style phrasing matched trained patterns above the confidence threshold.`;
  if (v === 'GREEN')
    return `On-device AI classified this as a legitimate call${tag} — appointment / delivery / recruiter / follow-up language dominated the transcript.`;
  return `On-device AI could not make a confident decision (confidence below ${YELLOW_THRESHOLD.toFixed(2)}). An official email will be requested from the caller.`;
}

async function withTimingFloor<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const out = await fn();
  const elapsed = Date.now() - start;
  if (elapsed < TIMING_FLOOR_MS) {
    await new Promise((r) => setTimeout(r, TIMING_FLOOR_MS - elapsed));
  }
  return out;
}

export const NativeScamDetector = {
  /** Probe the native module — also returns fingerprint used by ModelProtection. */
  async isAvailable(): Promise<boolean> {
    if (!native) return false;
    try {
      const res = await native.isReady();
      return !!res.ready;
    } catch {
      return false;
    }
  },

  async probeNative(): Promise<NativeReadyResult> {
    if (!native) return { ready: false, error: 'native module not linked' };
    try {
      return await native.isReady();
    } catch (err) {
      return { ready: false, error: String(err) };
    }
  },

  async analyze(transcript: string): Promise<ScamAnalysis> {
    return withTimingFloor(async () => {
      const language = detectLanguage(transcript);

      // Hard rule #1: non-English → YELLOW, no classifier invoked.
      if (!language.isEnglish) {
        await SecurityAuditLog.record(
          'language_detected',
          `Non-English transcript classified as YELLOW (${language.label}).`,
          'info',
          { language: language.code, reason: language.reason },
        );
        const explanation = explainFromVerdict('YELLOW', false, language);
        return {
          verdict: 'YELLOW' as const,
          confidence: 0.5,
          scores: { RED: 0, GREEN: 0, YELLOW: 1 },
          source: (native ? 'tflite' : 'fallback') as 'tflite' | 'fallback',
          explanation,
          language,
          lowConfidence: false,
          rageModeReady: false,
        };
      }

      // Hard rule #2: bypass detected → force RED, regardless of classifier.
      const bypass = await detectBypass(
        // `number` is unknown at this call-site — CallScreeningService
        // passes `detectBypass` separately with the phone number when it
        // wants number-aware tracking. Here we still run the transcript
        // heuristics (keyword-stuffing, hidden scam terms, robotic speech)
        // by passing an empty number; repeated-script tracking gracefully
        // no-ops in that case.
        '',
        transcript,
      );

      // Primary classifier path.
      let base: Omit<ScamAnalysis, 'language' | 'lowConfidence' | 'rageModeReady'>;
      if (!native) {
        base = fallbackClassify(transcript);
        await SecurityAuditLog.record(
          'fallback_used',
          'JS fallback classifier invoked (native bridge unavailable).',
          'warn',
        );
      } else {
        try {
          const res = await native.analyze(transcript);
          const raw = (res.verdict || '').toUpperCase();
          const verdict: ScamVerdict =
            raw === 'RED' || raw === 'GREEN' || raw === 'YELLOW' ? raw : 'YELLOW';
          const confidence = typeof res.confidence === 'number' ? res.confidence : 0;
          const finalVerdict: ScamVerdict =
            confidence >= YELLOW_THRESHOLD ? verdict : 'YELLOW';
          base = {
            verdict: finalVerdict,
            confidence,
            scores: {
              RED: res.scores?.RED ?? 0,
              GREEN: res.scores?.GREEN ?? 0,
              YELLOW: res.scores?.YELLOW ?? 0,
            },
            source: 'tflite',
            explanation: explainFromVerdict(finalVerdict, false, language),
          };
        } catch (err) {
          base = fallbackClassify(transcript);
          await SecurityAuditLog.record(
            'fallback_used',
            `Native analyze() threw — using JS fallback. ${String(err)}`,
            'warn',
          );
        }
      }

      // Confidence tiers
      const lowConfidence =
        base.confidence >= YELLOW_THRESHOLD &&
        base.confidence < LOW_CONFIDENCE_CEILING &&
        base.verdict !== 'YELLOW';

      // Apply bypass override (overrides RED/GREEN/YELLOW alike).
      let finalVerdict = base.verdict;
      let finalExplanation = explainFromVerdict(base.verdict, lowConfidence, language);
      if (bypass.tripped) {
        finalVerdict = 'RED';
        finalExplanation =
          'Bypass attempt detected — transcript shows signs of keyword stuffing or repeated probing from this caller. ' +
          bypass.reasons.join(' ') +
          ' Forced to RED for your safety.';
      }

      await SecurityAuditLog.record(
        'classification',
        `Verdict ${finalVerdict} (source=${base.source}, confidence=${base.confidence.toFixed(2)})${
          bypass.tripped ? ' [bypass override]' : ''
        }${lowConfidence ? ' [low confidence]' : ''}`,
        bypass.tripped ? 'warn' : 'info',
        {
          verdict: finalVerdict,
          confidence: base.confidence,
          source: base.source,
          language: language.code,
        },
      );

      return {
        ...base,
        verdict: finalVerdict,
        explanation: finalExplanation,
        language,
        lowConfidence,
        bypass: bypass.tripped ? bypass : undefined,
        rageModeReady: finalVerdict === 'RED',
      };
    });
  },
};

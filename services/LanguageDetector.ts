/**
 * LanguageDetector
 *
 * Lightweight on-device language detection. The goal is not linguistic
 * perfection — it's to answer a single yes/no question safely:
 *
 *     "Is this transcript confidently in English?"
 *
 * If not, `NativeScamDetector` forces a YELLOW verdict so the user gets
 * to decide manually. We never classify a non-English transcript as RED
 * because the underlying TFLite model was trained on English only.
 *
 * Runs in pure JS — zero native deps, zero network calls.
 */

export type DetectedLanguage = {
  code: 'en' | 'es' | 'hi' | 'te' | 'zh' | 'fr' | 'ar' | 'ru' | 'unknown';
  label: string;                   // Display name
  isEnglish: boolean;              // Shortcut the classifier checks first
  confidence: number;              // 0–1
  reason: string;                  // Short explanation for the UI / logs
};

const UNKNOWN: DetectedLanguage = {
  code: 'unknown',
  label: 'Unknown',
  isEnglish: false,
  confidence: 0,
  reason: 'No detectable language signal.',
};

// Script-based detection — any one of these matching kills "English".
const SCRIPT_PATTERNS: { code: DetectedLanguage['code']; label: string; re: RegExp }[] = [
  { code: 'zh', label: 'Mandarin / Chinese', re: /[\u4E00-\u9FFF]/ },
  { code: 'hi', label: 'Hindi', re: /[\u0900-\u097F]/ },
  { code: 'te', label: 'Telugu', re: /[\u0C00-\u0C7F]/ },
  { code: 'ar', label: 'Arabic', re: /[\u0600-\u06FF]/ },
  { code: 'ru', label: 'Russian / Cyrillic', re: /[\u0400-\u04FF]/ },
];

// Latin-script words that strongly signal a non-English language.
const LATIN_MARKERS: { code: DetectedLanguage['code']; label: string; words: string[] }[] = [
  {
    code: 'es',
    label: 'Spanish',
    words: [
      ' hola ', ' gracias ', ' buenos ', ' buenas ', ' llamada ', ' señor ',
      ' señora ', ' estamos ', ' usted ', ' por favor ', ' número ', ' tarjeta ',
      ' banco ', ' urgente ', ' necesito ', ' cuenta ',
    ],
  },
  {
    code: 'fr',
    label: 'French',
    words: [
      ' bonjour ', ' merci ', ' monsieur ', ' madame ', " s'il vous plaît ",
      ' appel ', ' numéro ', ' compte ', " c'est ", ' votre ',
      ' bonsoir ', ' banque ', ' urgent ',
    ],
  },
];

const ENGLISH_STOPWORDS = [
  ' the ', ' and ', ' you ', ' your ', ' please ', ' for ', ' this ', ' that ',
  ' have ', ' from ', ' with ', ' about ', ' call ', ' number ', ' are ',
  ' is ', ' not ', ' we ', ' i ', ' me ', ' my ', ' will ', ' be ', ' to ',
];

export function detectLanguage(raw: string): DetectedLanguage {
  const text = raw.trim();
  if (!text) return UNKNOWN;

  // 1. Non-Latin scripts are unambiguous.
  for (const s of SCRIPT_PATTERNS) {
    if (s.re.test(text)) {
      return {
        code: s.code,
        label: s.label,
        isEnglish: false,
        confidence: 0.95,
        reason: `Non-Latin script detected (${s.label}).`,
      };
    }
  }

  const padded = ` ${text.toLowerCase()} `;

  // 2. Latin-script non-English words.
  for (const m of LATIN_MARKERS) {
    let hits = 0;
    for (const w of m.words) if (padded.includes(w)) hits++;
    if (hits >= 2) {
      return {
        code: m.code,
        label: m.label,
        isEnglish: false,
        confidence: Math.min(0.95, 0.5 + hits * 0.1),
        reason: `Matched ${hits} ${m.label} word markers.`,
      };
    }
  }

  // 3. English stopword density.
  let enHits = 0;
  for (const w of ENGLISH_STOPWORDS) if (padded.includes(w)) enHits++;

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (enHits >= 3 || (wordCount <= 8 && enHits >= 2)) {
    return {
      code: 'en',
      label: 'English',
      isEnglish: true,
      confidence: Math.min(0.95, 0.5 + enHits * 0.08),
      reason: `Matched ${enHits} English stopwords.`,
    };
  }

  // 4. Short transcripts with Latin letters but no strong signal — err on
  //    the safe side and mark as unknown so the caller yellow-flags.
  const hasLatinLetters = /[A-Za-z]/.test(text);
  if (hasLatinLetters && wordCount <= 3) {
    return {
      ...UNKNOWN,
      reason: 'Transcript too short to confidently detect language.',
    };
  }

  // 5. Fallback — we saw Latin letters and nothing screamed non-English,
  //    but we also don't have strong English stopwords. Call it unknown.
  if (hasLatinLetters) {
    return {
      ...UNKNOWN,
      reason: 'Latin-script text with no strong language signal.',
    };
  }

  return UNKNOWN;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { SecurityAuditLog } from '@/security/SecurityAuditLog';

/**
 * RageModeService
 *
 * Opt-in feature. When enabled and ScamReaper flags a call as RED, the
 * on-device AI responds in a randomly-chosen language (and with harmless,
 * fabricated details) to waste the scammer's time and confuse their
 * script. Pure psychological warfare — no network, no real data.
 *
 * Storage key is kept in sync with the Settings screen toggle.
 */

const RAGE_MODE_KEY = 'scamreaper_rage_mode';

export type RageLanguage = 'en' | 'es' | 'hi' | 'te' | 'zh' | 'fr';

export type RageResponse = {
  language: RageLanguage;
  languageLabel: string;
  text: string;
  usedAt: number;
};

const RESPONSES: Record<RageLanguage, { label: string; lines: string[] }> = {
  en: {
    label: 'English',
    lines: [
      "Oh thank goodness you called, I was just about to feed my pet iguana Kevin. Hold on, he's climbing the curtains.",
      "Yes hello, this is me. My bank routing number? Let me find it. Is this going to take long because my soup is boiling.",
      "I've been expecting your call. My name is Bartholomew. How may I help you waste your time today?",
    ],
  },
  es: {
    label: 'Spanish',
    lines: [
      'Hola, sí, soy yo. Un momento, mi gato se comió el teléfono. ¿Puede repetir todo desde el principio?',
      'Muy bien, tengo tiempo. Mi número de seguro social tiene exactamente ochenta y tres dígitos, ¿está listo para escribir?',
      'Perdón, estoy cocinando arepas. ¿Quiere esperar o llamarme en tres horas?',
    ],
  },
  hi: {
    label: 'Hindi',
    lines: [
      'नमस्ते, हाँ मैं हूँ। एक मिनट, मेरी दादी फोन पर हैं। वो आपसे बात करना चाहेंगी।',
      'ज़रूर, मेरा बैंक अकाउंट नंबर याद है। पहले मुझे अपनी चाय ख़त्म करनी है।',
      'अच्छा, आप IRS से हैं? मेरे पास दो घंटे हैं, शुरू कीजिये।',
    ],
  },
  te: {
    label: 'Telugu',
    lines: [
      'హలో, అవును నేనే. ఒక్క నిమిషం, మా ఆవు పారిపోయింది. మళ్ళీ చెప్పండి.',
      'సరే, నాకు సమయం ఉంది. మీ పేరు మళ్ళీ చెప్పండి, నేను రాసుకుంటున్నాను.',
      'మీరు బ్యాంక్ నుండా? నా కార్డ్ నంబర్ గుర్తు లేదు, మీరు వెయిట్ చేయగలరా?',
    ],
  },
  zh: {
    label: 'Mandarin',
    lines: [
      '你好，是的，我就是。请稍等，我的乌龟刚刚逃跑了，我需要抓住它。',
      '好的，我有时间。请再说一次你的公司名字，我的耳朵不太好。',
      '不好意思，我正在做饺子。你可以一个小时后再打吗？',
    ],
  },
  fr: {
    label: 'French',
    lines: [
      "Bonjour, oui c'est bien moi. Un instant, mon chat vient de s'asseoir sur le téléphone.",
      "Très bien, je vous écoute. Pouvez-vous répéter depuis le début, j'ai oublié mes lunettes.",
      "Excusez-moi, je fais du pain. Vous pouvez patienter pendant que le four chauffe?",
    ],
  },
};

export const RageMode = {
  async isEnabled(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(RAGE_MODE_KEY);
    return raw === 'true';
  },

  async setEnabled(on: boolean): Promise<void> {
    await AsyncStorage.setItem(RAGE_MODE_KEY, String(on));
    await SecurityAuditLog.record(
      'manual_action',
      `Rage Mode ${on ? 'enabled' : 'disabled'} by user.`,
      'info',
    );
  },

  /** Pick a random language + line. No side effects beyond audit log. */
  async trigger(): Promise<RageResponse> {
    const langs = Object.keys(RESPONSES) as RageLanguage[];
    const language = langs[Math.floor(Math.random() * langs.length)];
    const pool = RESPONSES[language];
    const line = pool.lines[Math.floor(Math.random() * pool.lines.length)];
    const response: RageResponse = {
      language,
      languageLabel: pool.label,
      text: line,
      usedAt: Date.now(),
    };
    await SecurityAuditLog.record(
      'rage_mode_triggered',
      `Rage Mode responded in ${pool.label}.`,
      'info',
      { language },
    );
    return response;
  },
};

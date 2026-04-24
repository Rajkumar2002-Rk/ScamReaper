import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { ONBOARDING_KEY } from '@/app/onboarding';
import { CallScreeningService } from '@/services/CallScreeningService';
import { NativeScamDetector } from '@/services/NativeScamDetector';
import { RageMode } from '@/services/RageModeService';

const SUPPORT_EMAIL = 'help@scamreaper.app';

const SIMULATED_TRANSCRIPTS = [
  {
    number: '+1 (302) 555-0142',
    claim:
      'This is the Social Security Administration. Your SSN has been suspended due to suspicious activity. You must verify your identity immediately or be arrested.',
  },
  {
    number: '+1 (612) 555-0987',
    claim:
      "Hi, this is Emma from Dr. Patel's office. I'm calling to confirm your cleaning appointment tomorrow at 9am. Please call us back if you need to reschedule.",
  },
  {
    number: 'Unknown',
    claim: 'I need to speak with the homeowner about an important matter.',
  },
  {
    number: '+1 (408) 555-7733',
    claim:
      'Congratulations you have won an all-expense paid cruise to the Bahamas. To claim your prize we just need your credit card for the port fees of $49.99.',
  },
  {
    number: '+1 (510) 555-2020',
    claim:
      'This is your bank security team. We detected a fraudulent charge of $499 from your account. To reverse it please confirm your full card number and the one time code we just sent you.',
  },
  {
    number: '+34 91 555 0011',
    claim:
      'Hola buenos días, llamamos de su banco. Hemos detectado una transacción urgente en su cuenta y necesitamos que confirme su número de tarjeta por favor.',
  },
  {
    number: '+1 (305) 555-4411',
    claim:
      'Hi yes appointment confirmation delivery tracking pharmacy reminder recruiter follow-up interview — please send us your social security number to complete the reference check.',
  },
];

type PrimaryLang = 'en' | 'es' | 'hi' | 'te' | 'zh' | 'fr';
const PRIMARY_LANG_LABELS: Record<PrimaryLang, string> = {
  en: 'English',
  es: 'Spanish',
  hi: 'Hindi',
  te: 'Telugu',
  zh: 'Mandarin',
  fr: 'French',
};

type Settings = {
  scamAction: 'block' | 'waste';
  emailRequest: boolean;
  aiVoice: boolean;
  rageMode: boolean;
  notificationsEnabled: boolean;
  sensitivePreview: boolean;
  primaryLanguage: PrimaryLang;
};

const DEFAULT_SETTINGS: Settings = {
  scamAction: 'waste',
  emailRequest: true,
  aiVoice: true,
  rageMode: false,
  notificationsEnabled: true,
  sensitivePreview: true,
  primaryLanguage: 'en',
};

const STORAGE_KEY = 'scamreaper_settings';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [nativeReady, setNativeReady] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    });
    RageMode.isEnabled().then((on) =>
      setSettings((s) => ({ ...s, rageMode: on })),
    );
  }, []);

  const refreshNative = useCallback(async () => {
    setNativeReady(await NativeScamDetector.isAvailable());
  }, []);

  useEffect(() => {
    refreshNative();
  }, [refreshNative]);

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function toggleRage(val: boolean) {
    update({ rageMode: val });
    await RageMode.setEnabled(val);
  }

  function pickPrimaryLang() {
    const codes: PrimaryLang[] = ['en', 'es', 'hi', 'te', 'zh', 'fr'];
    const options = codes.map((c) => ({
      text: PRIMARY_LANG_LABELS[c],
      onPress: () => update({ primaryLanguage: c }),
    }));
    Alert.alert('Primary Language', 'Pick your preferred call language.', [
      ...options,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function simulateCall() {
    const pick =
      SIMULATED_TRANSCRIPTS[Math.floor(Math.random() * SIMULATED_TRANSCRIPTS.length)];
    const entry = await CallScreeningService.ingestScreenedCall({
      number: pick.number,
      transcript: pick.claim,
    });
    Alert.alert(
      'Simulated call ingested',
      `Number: ${entry.number}\nVerdict: ${entry.status.toUpperCase()}${entry.lowConfidence ? ' (Low Conf.)' : ''}${entry.bypassFlagged ? '\n⚠️ Bypass attempt flagged' : ''}\n\nCheck Home or Call Log to see it.`,
    );
  }

  function confirmClearLog() {
    Alert.alert('Clear call log?', 'This will delete all stored screened calls on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => CallScreeningService.clear() },
    ]);
  }

  function reportProblem() {
    Alert.alert(
      'Report a problem',
      'Found a bug, a call that was wrongly blocked, or something that felt unsafe? Our team will read every report personally.\n\nNothing from your phone is sent automatically — you choose what to write.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: () => {
            const subject = encodeURIComponent('ScamReaper — I need to report something');
            const body = encodeURIComponent(
              'Hi ScamReaper team,\n\nWhat happened:\n\n\nWhen it happened:\n\n\n(You can delete any of this — only send what you are comfortable sharing.)',
            );
            Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {
              Alert.alert(
                'No email app set up',
                `Please email us at ${SUPPORT_EMAIL} from any device. We reply within 72 hours.`,
              );
            });
          },
        },
      ],
    );
  }

  function confirmResetOnboarding() {
    Alert.alert('Reset onboarding?', 'You will see the welcome screens again the next time you open the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => AsyncStorage.removeItem(ONBOARDING_KEY) },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* ── SCAM RESPONSE ──────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>WHEN A SCAM IS DETECTED</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.optionRow} onPress={() => update({ scamAction: 'block' })}>
          <View style={styles.radio}>
            {settings.scamAction === 'block' && <View style={styles.radioFilled} />}
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Silent Block</Text>
            <Text style={styles.optionDesc}>Hang up immediately without engaging the scammer</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.optionRow} onPress={() => update({ scamAction: 'waste' })}>
          <View style={styles.radio}>
            {settings.scamAction === 'waste' && <View style={styles.radioFilled} />}
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Waste Their Time 💀</Text>
            <Text style={styles.optionDesc}>AI keeps scammer talking with fake harmless info</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.optionTitle}>Rage Mode 💀🌐</Text>
            <Text style={styles.optionDesc}>
              On RED calls the AI replies in a random language (Spanish, Hindi, Telugu, Mandarin, French)
              to confuse the scammer and waste more of their time. Off by default.
            </Text>
          </View>
          <Switch
            value={settings.rageMode}
            onValueChange={toggleRage}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── NOTIFICATIONS ─────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>NOTIFICATION PREFERENCES</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.optionTitle}>Verdict Notifications</Text>
            <Text style={styles.optionDesc}>Get a notification with Accept / Decline / View Details actions after every screened call.</Text>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={(val) => update({ notificationsEnabled: val })}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.optionTitle}>Show Transcript Preview</Text>
            <Text style={styles.optionDesc}>Include a short caller quote in the notification body. Disable if your lock screen is shared.</Text>
          </View>
          <Switch
            value={settings.sensitivePreview}
            onValueChange={(val) => update({ sensitivePreview: val })}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── UNSURE CALLERS ─────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>UNSURE CALLERS</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.optionTitle}>Ask for Official Email</Text>
            <Text style={styles.optionDesc}>AI requests unsure callers send email from official domain</Text>
          </View>
          <Switch
            value={settings.emailRequest}
            onValueChange={(val) => update({ emailRequest: val })}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── AI VOICE ───────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>AI VOICE</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.optionTitle}>AI Voice</Text>
            <Text style={styles.optionDesc}>AI speaks to callers using on-device text-to-speech</Text>
          </View>
          <Switch
            value={settings.aiVoice}
            onValueChange={(val) => update({ aiVoice: val })}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── LANGUAGE ───────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>LANGUAGE</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.devRow} onPress={pickPrimaryLang}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Primary Language</Text>
            <Text style={styles.optionDesc}>
              ScamReaper only issues confident RED/GREEN verdicts in English. Non-English calls are
              always routed to YELLOW so you can decide manually.
            </Text>
          </View>
          <Text style={styles.devArrow}>{PRIMARY_LANG_LABELS[settings.primaryLanguage]} ›</Text>
        </TouchableOpacity>
      </View>

      {/* ── SECURITY ───────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>SECURITY</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.devRow} onPress={() => router.push('/security-log')}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>
              {nativeReady === null
                ? 'Checking integrity…'
                : nativeReady
                  ? 'Model integrity ✓ Verified'
                  : 'Model not loaded — JS fallback'}
            </Text>
            <Text style={styles.optionDesc}>
              View the on-device security audit log, bypass attempts, and model verification history.
            </Text>
          </View>
          <Text style={[styles.devArrow, { color: nativeReady ? '#30d158' : '#ffd60a' }]}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.devRow} onPress={() => router.push('/stats')}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Statistics Dashboard</Text>
            <Text style={styles.optionDesc}>
              Calls screened, scams blocked, time saved, weekly trend.
            </Text>
          </View>
          <Text style={styles.devArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── ABOUT ──────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <Text style={styles.aboutTitle}>💀 ScamReaper</Text>
        <Text style={styles.aboutBody}>
          ScamReaper runs 100% on your phone. No servers. No data collection.
          No subscriptions. Free, forever.
        </Text>
        <View style={styles.divider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Data sent to servers</Text>
          <Text style={[styles.aboutValue, { color: '#30d158' }]}>None</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Call recording</Text>
          <Text style={[styles.aboutValue, { color: '#30d158' }]}>Never</Text>
        </View>
        <TouchableOpacity style={styles.aboutRow} onPress={reportProblem}>
          <Text style={styles.aboutLabel}>Report a problem</Text>
          <Text style={[styles.aboutValue, { color: '#ff3b30' }]}>Email us ›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutSmallTitle}>We are here for you</Text>
          <Text style={styles.aboutSmall}>
            If a call feels wrong — or if ScamReaper ever gets something wrong —
            tap “Report a problem” above. A real person on our team reads every
            message and replies within 72 hours.
          </Text>
        </View>
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutSmallTitle}>Your privacy, plainly</Text>
          <Text style={styles.aboutSmall}>
            Calls are analyzed on this phone. Nothing about who calls you, what
            they say, or what ScamReaper decides is ever sent anywhere.
          </Text>
        </View>
      </View>

      {/* ── DEVELOPER TOOLS ────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>DEVELOPER TOOLS</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.devRow} onPress={simulateCall}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Simulate Screened Call</Text>
            <Text style={styles.optionDesc}>
              Ingest a random fake transcript to test the detection flow
            </Text>
          </View>
          <Text style={styles.devArrow}>▶</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.devRow} onPress={confirmClearLog}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Clear Call Log</Text>
            <Text style={styles.optionDesc}>Delete all stored screened calls</Text>
          </View>
          <Text style={[styles.devArrow, { color: '#ff3b30' }]}>✕</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.devRow}
          onPress={() => CallScreeningService.restoreSamples()}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Restore Sample Calls</Text>
            <Text style={styles.optionDesc}>Bring back the built-in demo entries</Text>
          </View>
          <Text style={[styles.devArrow, { color: '#30d158' }]}>↩</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.devRow} onPress={confirmResetOnboarding}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Reset Onboarding</Text>
            <Text style={styles.optionDesc}>Show welcome screens on next launch</Text>
          </View>
          <Text style={[styles.devArrow, { color: '#ffd60a' }]}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 60 },
  header: { marginTop: 60, marginBottom: 32 },
  title: { fontSize: 34, fontWeight: 'bold', color: '#fff' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, marginBottom: 24, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginLeft: 16 },
  optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFilled: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ff3b30' },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, color: '#fff', fontWeight: '500' },
  optionDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  toggleText: { flex: 1 },

  aboutTitle: { fontSize: 20, fontWeight: 'bold', color: '#ff3b30', padding: 16, paddingBottom: 8 },
  aboutBody: { fontSize: 14, color: '#888', paddingHorizontal: 16, paddingBottom: 16, lineHeight: 20 },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  aboutLabel: { fontSize: 15, color: '#fff' },
  aboutValue: { fontSize: 15, color: '#888' },
  aboutBlock: { paddingHorizontal: 16, paddingVertical: 12 },
  aboutSmallTitle: { color: '#fff', fontWeight: '600', fontSize: 14, marginBottom: 4 },
  aboutSmall: { color: '#888', fontSize: 13, lineHeight: 18 },

  devRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  devArrow: { color: '#30d158', fontSize: 16, fontWeight: '600' },
});

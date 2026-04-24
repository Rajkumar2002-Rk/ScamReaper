import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionsService, PermissionStatus } from '@/services/PermissionsService';

export const ONBOARDING_KEY = 'scamreaper_onboarding_complete';

type StepId = 'welcome' | 'notifications' | 'system' | 'enable';

const STEPS: StepId[] = ['welcome', 'notifications', 'system', 'enable'];

export default function OnboardingScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const [notifStatus, setNotifStatus] = useState<PermissionStatus>('undetermined');

  useEffect(() => {
    PermissionsService.getAll().then((snap) => setNotifStatus(snap.notifications));
  }, []);

  const step = STEPS[stepIndex];

  function next() {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finish();
    }
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  }

  async function handleRequestNotifications() {
    const status = await PermissionsService.requestNotifications();
    setNotifStatus(status);
    if (status === 'granted') {
      setTimeout(next, 200);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progress}>
        {STEPS.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.progressDot,
              idx <= stepIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 'welcome' && <WelcomeStep />}
        {step === 'notifications' && (
          <NotificationsStep
            status={notifStatus}
            onRequest={handleRequestNotifications}
          />
        )}
        {step === 'system' && (
          <SystemStep onOpenSettings={() => PermissionsService.openCallScreeningSettings()} />
        )}
        {step === 'enable' && <EnableStep />}
      </ScrollView>

      <View style={styles.footer}>
        {stepIndex > 0 && (
          <TouchableOpacity onPress={() => setStepIndex((i) => i - 1)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={next} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {stepIndex === STEPS.length - 1 ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function WelcomeStep() {
  return (
    <View>
      <Text style={styles.heroEmoji}>💀</Text>
      <Text style={styles.heroTitle}>Welcome to ScamReaper</Text>
      <Text style={styles.heroSubtitle}>
        A free, open-source AI scam call detector that runs 100% on your device.
      </Text>
      <View style={styles.bulletList}>
        <Bullet icon="🛡️" title="Auto-screen unknown calls" body="iOS 26 answers, ScamReaper decides." />
        <Bullet icon="🤖" title="On-device AI" body="Classifies every call as RED, GREEN, or YELLOW." />
        <Bullet icon="🔒" title="Zero data collection" body="No servers, no cloud, no tracking. Ever." />
      </View>
    </View>
  );
}

function NotificationsStep({
  status,
  onRequest,
}: {
  status: PermissionStatus;
  onRequest: () => void;
}) {
  return (
    <View>
      <Text style={styles.stepNumber}>STEP 1</Text>
      <Text style={styles.stepTitle}>Enable Notifications</Text>
      <Text style={styles.stepBody}>
        ScamReaper needs permission to notify you when a suspicious call is screened, so you can
        decide what to do in real time.
      </Text>

      <View style={styles.permissionCard}>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Notifications</Text>
          <View style={[styles.statusPill, pillStyle(status)]}>
            <Text style={[styles.statusPillText, pillTextStyle(status)]}>
              {status === 'granted' ? 'Granted' : status === 'denied' ? 'Denied' : 'Not set'}
            </Text>
          </View>
        </View>
        {status !== 'granted' && (
          <TouchableOpacity style={styles.permissionButton} onPress={onRequest}>
            <Text style={styles.permissionButtonText}>
              {status === 'denied' ? 'Open Settings to Enable' : 'Allow Notifications'}
            </Text>
          </TouchableOpacity>
        )}
        {status === 'denied' && (
          <Text style={styles.deniedNote}>
            Notifications are blocked. You can still use ScamReaper, but you won&apos;t be alerted
            when calls are screened.
          </Text>
        )}
      </View>
    </View>
  );
}

function SystemStep({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <View>
      <Text style={styles.stepNumber}>STEP 2</Text>
      <Text style={styles.stepTitle}>Turn on iOS 26 Call Screening</Text>
      <Text style={styles.stepBody}>
        ScamReaper relies on Apple&apos;s built-in Call Screening. You only need to enable this once.
      </Text>

      <View style={styles.instructionCard}>
        <InstructionLine num="1" text="Open iPhone Settings" />
        <InstructionLine num="2" text="Tap Apps → Phone" />
        <InstructionLine num="3" text="Tap Screen Unknown Callers" />
        <InstructionLine num="4" text="Choose Ask Reason for Calling" />
        <InstructionLine num="5" text="Come back to ScamReaper" />
      </View>

      <TouchableOpacity style={styles.linkButton} onPress={onOpenSettings}>
        <Text style={styles.linkButtonText}>Open iPhone Settings →</Text>
      </TouchableOpacity>
    </View>
  );
}

function EnableStep() {
  return (
    <View>
      <Text style={styles.stepNumber}>STEP 3</Text>
      <Text style={styles.stepTitle}>You&apos;re ready 💀</Text>
      <Text style={styles.stepBody}>
        Tap Get Started and then flip the ScamReaper toggle on the home screen. From now on every
        unknown call will be auto-screened, analyzed, and logged — all on your device.
      </Text>

      <View style={styles.readyCard}>
        <Text style={styles.readyTitle}>What happens next</Text>
        <ReadyLine text="Unknown call comes in" />
        <ReadyLine text="iOS asks the caller their reason" />
        <ReadyLine text="ScamReaper analyzes the transcript" />
        <ReadyLine text="You get a notification with the verdict" />
      </View>
    </View>
  );
}

function Bullet({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.bulletTitle}>{title}</Text>
        <Text style={styles.bulletBody}>{body}</Text>
      </View>
    </View>
  );
}

function InstructionLine({ num, text }: { num: string; text: string }) {
  return (
    <View style={styles.instructionRow}>
      <View style={styles.instructionNum}>
        <Text style={styles.instructionNumText}>{num}</Text>
      </View>
      <Text style={styles.instructionText}>{text}</Text>
    </View>
  );
}

function ReadyLine({ text }: { text: string }) {
  return (
    <View style={styles.readyRow}>
      <Text style={styles.readyBullet}>→</Text>
      <Text style={styles.readyText}>{text}</Text>
    </View>
  );
}

function pillStyle(status: PermissionStatus) {
  if (status === 'granted') return { backgroundColor: '#30d15822' };
  if (status === 'denied') return { backgroundColor: '#ff3b3022' };
  return { backgroundColor: '#ffd60a22' };
}

function pillTextStyle(status: PermissionStatus) {
  if (status === 'granted') return { color: '#30d158' };
  if (status === 'denied') return { color: '#ff3b30' };
  return { color: '#ffd60a' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    paddingBottom: 4,
  },
  progressDot: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2a2a2a',
  },
  progressDotActive: { backgroundColor: '#ff3b30' },

  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 24 },

  heroEmoji: { fontSize: 72, textAlign: 'center', marginTop: 20, marginBottom: 8 },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ff3b30',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },

  bulletList: { gap: 14 },
  bulletRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  bulletIcon: { fontSize: 24 },
  bulletTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  bulletBody: { color: '#888', fontSize: 13, marginTop: 2 },

  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff3b30',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
  },
  stepBody: {
    fontSize: 15,
    color: '#aaa',
    lineHeight: 22,
    marginBottom: 24,
  },

  permissionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  permissionLabel: { color: '#fff', fontSize: 16, fontWeight: '500' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  permissionButton: {
    marginTop: 14,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  permissionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  deniedNote: { color: '#888', fontSize: 13, marginTop: 10, lineHeight: 18 },

  instructionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  instructionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instructionNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNumText: { color: '#fff', fontWeight: '700' },
  instructionText: { color: '#fff', fontSize: 15, flex: 1 },

  linkButton: { padding: 14, alignItems: 'center' },
  linkButtonText: { color: '#ff3b30', fontSize: 15, fontWeight: '600' },

  readyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  readyTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 6 },
  readyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  readyBullet: { color: '#ff3b30', fontSize: 15, fontWeight: '700' },
  readyText: { color: '#ddd', fontSize: 14, flex: 1, lineHeight: 20 },

  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#888', fontWeight: '600', fontSize: 15 },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

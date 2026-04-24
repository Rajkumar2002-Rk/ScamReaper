import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getLastVerifiedAt } from '@/security/ModelProtection';
import { SecurityAuditLog, SecurityEvent, SecuritySeverity } from '@/security/SecurityAuditLog';
import { NativeScamDetector } from '@/services/NativeScamDetector';

const severityColor: Record<SecuritySeverity, string> = {
  info: '#30d158',
  warn: '#ffd60a',
  critical: '#ff3b30',
};

export default function SecurityLogScreen() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [nativeReady, setNativeReady] = useState<boolean | null>(null);
  const [lastVerified, setLastVerified] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setEvents(await SecurityAuditLog.list());
        setNativeReady(await NativeScamDetector.isAvailable());
        setLastVerified(await getLastVerifiedAt());
      })();
    }, []),
  );

  const bypassCount = events.filter((e) => e.type === 'bypass_attempt').length;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Security Log</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: nativeReady ? '#30d158' : '#ffd60a' },
              ]}
            />
            <Text style={styles.statusText}>
              {nativeReady === null
                ? 'Checking model integrity…'
                : nativeReady
                  ? 'Model integrity verified'
                  : 'Model not loaded — JS fallback active'}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            {lastVerified
              ? `Last verification: ${new Date(lastVerified).toLocaleString()}`
              : 'No verification recorded yet.'}
          </Text>
        </View>

        {bypassCount > 0 && (
          <View style={styles.bypassCard}>
            <Text style={styles.bypassTitle}>⚠️ {bypassCount} bypass attempt{bypassCount === 1 ? '' : 's'} detected</Text>
            <Text style={styles.bypassBody}>
              Scammers have tried to game ScamReaper — attempts are flagged
              below and have been auto-forced to RED.
            </Text>
          </View>
        )}

        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>RECENT EVENTS ({events.length})</Text>
          {events.length > 0 && (
            <TouchableOpacity
              onPress={async () => {
                await SecurityAuditLog.clear();
                setEvents([]);
              }}
            >
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {events.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No security events yet.</Text>
          </View>
        ) : (
          events.map((e) => (
            <View key={e.id} style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View
                  style={[
                    styles.severityPill,
                    { backgroundColor: severityColor[e.severity] + '22' },
                  ]}
                >
                  <Text style={[styles.severityText, { color: severityColor[e.severity] }]}>
                    {e.severity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.eventTime}>
                  {new Date(e.timestamp).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.eventType}>{e.type.replace(/_/g, ' ')}</Text>
              <Text style={styles.eventMsg}>{e.message}</Text>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 60,
    marginBottom: 24,
  },
  back: { color: '#ff3b30', fontWeight: '600', fontSize: 16, width: 60 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  statusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  statusSub: { color: '#888', marginTop: 6, fontSize: 12 },

  bypassCard: {
    backgroundColor: '#1a0e0e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ff3b30',
  },
  bypassTitle: { color: '#ff3b30', fontWeight: '700', fontSize: 15 },
  bypassBody: { color: '#aaa', fontSize: 13, marginTop: 6, lineHeight: 18 },

  sectionLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#888', letterSpacing: 0.8 },
  clear: { color: '#ff3b30', fontSize: 13, fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
  },
  emptyText: { color: '#888' },

  eventCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  severityPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  severityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  eventTime: { color: '#555', fontSize: 11 },
  eventType: { color: '#fff', fontWeight: '600', fontSize: 14, marginTop: 6 },
  eventMsg: { color: '#aaa', fontSize: 13, marginTop: 2, lineHeight: 18 },
});

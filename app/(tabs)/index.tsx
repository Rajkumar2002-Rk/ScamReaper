import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { CallEntry, SAMPLE_CALLS, STATUS_CONFIG } from '@/constants/sample-calls';
import { verifyModelIntegrity } from '@/security/ModelProtection';
import { CallScreeningService } from '@/services/CallScreeningService';
import { NativeScamDetector } from '@/services/NativeScamDetector';
import { computeStats, Stats } from '@/services/StatsService';

const ENABLED_KEY = 'scamreaper_enabled';

export default function HomeScreen() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [screenedCount, setScreenedCount] = useState(0);
  const [calls, setCalls] = useState<CallEntry[]>(SAMPLE_CALLS);
  const [hasRealCalls, setHasRealCalls] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [modelOk, setModelOk] = useState<boolean>(false);
  const [modelMessage, setModelMessage] = useState<string>('Checking model integrity…');

  useEffect(() => {
    AsyncStorage.getItem(ENABLED_KEY).then((raw) => {
      if (raw !== null) setIsEnabled(raw === 'true');
    });
  }, []);

  const refresh = useCallback(async () => {
    const real = await CallScreeningService.getCalls();
    const count = await CallScreeningService.getScreenedCount();
    const samplesHidden = await CallScreeningService.areSamplesHidden();
    setScreenedCount(count);
    const samples = samplesHidden ? [] : SAMPLE_CALLS;
    if (real.length === 0) {
      setCalls(samples);
      setHasRealCalls(false);
    } else {
      setCalls([...real, ...samples]);
      setHasRealCalls(true);
    }
    setStats(await computeStats());
  }, []);

  useEffect(() => {
    CallScreeningService.init();
    const unsub = CallScreeningService.subscribe(() => {
      refresh();
    });
    refresh();

    (async () => {
      const status = await verifyModelIntegrity(() =>
        NativeScamDetector.probeNative(),
      );
      setModelOk(status.ready && !status.tampered);
      setModelMessage(status.message);
    })();

    return unsub;
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function toggleEnabled(val: boolean) {
    setIsEnabled(val);
    AsyncStorage.setItem(ENABLED_KEY, String(val));
  }

  const statusColor = isEnabled ? '#30d158' : '#ff3b30';
  const statusText = isEnabled ? 'Active — Screening calls' : 'Inactive — Not screening';
  const recentCalls = calls.slice(0, 3);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>💀 ScamReaper</Text>
        <Text style={styles.subtitle}>AI Scam Call Detector</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable ScamReaper</Text>
          <Switch
            value={isEnabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: '#333', true: '#ff3b30' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Security status — green dot when TFLite model is verified. */}
      <TouchableOpacity
        style={styles.securityCard}
        onPress={() => router.push('/security-log')}
        activeOpacity={0.7}
      >
        <View style={styles.securityRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: modelOk ? '#30d158' : '#ffd60a' },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>
              {modelOk ? 'Model integrity verified' : 'JS fallback active'}
            </Text>
            <Text style={styles.securitySub}>{modelMessage}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Stats summary — tap to open the full dashboard. */}
      <TouchableOpacity
        style={styles.statsCard}
        onPress={() => router.push('/stats')}
        activeOpacity={0.8}
      >
        <View style={styles.statsRow}>
          <View style={styles.statsCell}>
            <Text style={styles.statsNumber}>{screenedCount}</Text>
            <Text style={styles.statsLabel}>Screened</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCell}>
            <View style={styles.scamsTodayWrap}>
              <Text style={[styles.statsNumber, { color: '#ff3b30' }]}>
                {stats?.blockedToday ?? 0}
              </Text>
              {stats && stats.blockedToday > 0 && (
                <View style={styles.badgeDot} />
              )}
            </View>
            <Text style={styles.statsLabel}>Scams today</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCell}>
            <Text style={[styles.statsNumber, { color: '#30d158' }]}>
              {stats?.timeSavedMinutes ?? 0}m
            </Text>
            <Text style={styles.statsLabel}>Time saved</Text>
          </View>
        </View>
        <Text style={styles.statsFooter}>View full stats →</Text>
      </TouchableOpacity>

      {stats && stats.communityProtectedEstimate > 0 && (
        <View style={styles.communityCard}>
          <Text style={styles.communityText}>
            🌐 ScamReaper community has blocked an estimated{' '}
            <Text style={{ color: '#30d158', fontWeight: '700' }}>
              {stats.communityProtectedEstimate.toLocaleString()}
            </Text>{' '}
            scams. All estimated locally — no data sent anywhere.
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Calls</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/call-log')}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {!hasRealCalls && (
        <View style={styles.sampleBanner}>
          <Text style={styles.sampleBannerText}>
            Showing sample calls. Real calls will appear here once iOS 26 Call Screening activates.
          </Text>
        </View>
      )}

      {recentCalls.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No calls screened yet 💀</Text>
        </View>
      ) : (
        recentCalls.map((call) => {
          const config = STATUS_CONFIG[call.status];
          return (
            <TouchableOpacity
              key={call.id}
              style={styles.callCard}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/call-detail', params: { id: call.id } })}
            >
              <View style={styles.callTopRow}>
                <Text style={styles.callNumber}>{call.number}</Text>
                <Text style={styles.callTime}>{call.time}</Text>
              </View>
              <Text style={styles.callClaim} numberOfLines={2}>
                {call.claim}
              </Text>
              <View style={[styles.badge, { backgroundColor: config.color + '22' }]}>
                <Text style={styles.badgeEmoji}>{config.emoji}</Text>
                <Text style={[styles.badgeText, { color: config.color }]}>{config.badgeLabel}</Text>
                {call.lowConfidence && (
                  <Text style={[styles.badgeText, { color: '#888', marginLeft: 6 }]}>
                    · LOW CONF
                  </Text>
                )}
                {call.bypassFlagged && (
                  <Text style={[styles.badgeText, { color: '#ff9500', marginLeft: 6 }]}>
                    · BYPASS
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 60 },
  header: { alignItems: 'center', marginTop: 60, marginBottom: 28 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#ff3b30' },
  subtitle: { fontSize: 16, color: '#888', marginTop: 8 },

  statusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 15, color: '#fff', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginLeft: 16 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  toggleLabel: { fontSize: 16, color: '#fff' },

  securityCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  securityTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  securitySub: { color: '#888', fontSize: 12, marginTop: 2 },
  chev: { color: '#555', fontSize: 22 },

  statsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statsCell: { flex: 1, alignItems: 'center' },
  statsDivider: { width: 1, height: 40, backgroundColor: '#2a2a2a' },
  statsNumber: { fontSize: 28, fontWeight: 'bold', color: '#ff3b30' },
  statsLabel: { fontSize: 11, color: '#888', marginTop: 4, letterSpacing: 0.5 },
  statsFooter: { color: '#ff3b30', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  scamsTodayWrap: { flexDirection: 'row', alignItems: 'center' },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginLeft: 4,
  },

  communityCard: {
    backgroundColor: '#0e1a0f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#30d158',
  },
  communityText: { color: '#aaa', fontSize: 12, lineHeight: 17 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  seeAll: { fontSize: 14, color: '#ff3b30', fontWeight: '600' },

  sampleBanner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ffd60a',
  },
  sampleBannerText: { color: '#aaa', fontSize: 12, lineHeight: 17 },

  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
  },
  emptyText: { color: '#888' },

  callCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  callTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callNumber: { fontSize: 16, fontWeight: '600', color: '#fff' },
  callTime: { fontSize: 13, color: '#555' },
  callClaim: { fontSize: 14, color: '#aaa' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    marginTop: 2,
  },
  badgeEmoji: { fontSize: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});

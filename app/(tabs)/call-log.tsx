import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CallEntry, SAMPLE_CALLS, STATUS_CONFIG } from '@/constants/sample-calls';
import { CallScreeningService } from '@/services/CallScreeningService';

export default function CallLogScreen() {
  const [calls, setCalls] = useState<CallEntry[]>(SAMPLE_CALLS);

  const refresh = useCallback(async () => {
    const real = await CallScreeningService.getCalls();
    const samplesHidden = await CallScreeningService.areSamplesHidden();
    const samples = samplesHidden ? [] : SAMPLE_CALLS;
    setCalls([...real, ...samples]);
  }, []);

  useEffect(() => {
    const unsub = CallScreeningService.subscribe(() => refresh());
    refresh();
    return unsub;
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Call Log</Text>
        <Text style={styles.subtitle}>{calls.length} calls screened</Text>
      </View>

      {calls.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>💀</Text>
          <Text style={styles.emptyTitle}>No calls screened yet</Text>
          <Text style={styles.emptyBody}>
            When iOS 26 screens an unknown call, ScamReaper will analyze it and log it here.
          </Text>
        </View>
      )}

      {calls.map((call) => {
        const config = STATUS_CONFIG[call.status];
        return (
          <TouchableOpacity
            key={call.id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/call-detail', params: { id: call.id } })}
          >
            <View style={styles.topRow}>
              <Text style={styles.number}>{call.number}</Text>
              <Text style={styles.time}>{call.time}</Text>
            </View>
            <Text style={styles.claim}>{call.claim}</Text>
            <View style={[styles.badge, { backgroundColor: config.color + '22' }]}>
              <View style={[styles.dot, { backgroundColor: config.color }]} />
              <Text style={[styles.badgeText, { color: config.color }]}>{config.badgeLabel}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 60 },
  header: { marginTop: 60, marginBottom: 24 },
  title: { fontSize: 34, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 16, fontWeight: '600', color: '#fff' },
  time: { fontSize: 13, color: '#555' },
  claim: { fontSize: 14, color: '#aaa' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    marginTop: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  emptyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: { fontSize: 44, marginBottom: 4 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyBody: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});

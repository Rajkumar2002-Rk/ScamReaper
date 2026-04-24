import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallEntry, getCallById, STATUS_CONFIG } from '@/constants/sample-calls';
import { CallScreeningService } from '@/services/CallScreeningService';

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [call, setCall] = useState<CallEntry | undefined>(id ? getCallById(id) : undefined);

  useEffect(() => {
    if (!id) return;
    CallScreeningService.getCalls().then((real) => {
      const found = real.find((c) => c.id === id);
      if (found) setCall(found);
      else if (!call) setCall(getCallById(id));
    });
  }, [id, call]);

  if (!call) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>Call not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const config = STATUS_CONFIG[call.status];

  function blockNumber() {
    Alert.alert('Blocked', `${call!.number} has been blocked.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  function callBack() {
    Alert.alert('Call back', `Dialing ${call!.number}...`);
  }

  function dismiss() {
    router.back();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Call Details</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Verdict banner */}
        <View style={[styles.verdictBanner, { backgroundColor: config.color + '22' }]}>
          <View style={[styles.verdictDot, { backgroundColor: config.color }]} />
          <Text style={[styles.verdictLabel, { color: config.color }]}>
            {config.emoji}  {config.badgeLabel}
          </Text>
        </View>

        {/* Caller details */}
        <Text style={styles.sectionLabel}>CALLER</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Number</Text>
            <Text style={styles.detailValue}>{call.number}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Name</Text>
            <Text style={styles.detailValue}>{call.callerName ?? 'Unknown'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>When</Text>
            <Text style={styles.detailValue}>{call.time}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Claim</Text>
            <Text style={[styles.detailValue, styles.detailValueWrap]}>{call.claim}</Text>
          </View>
        </View>

        {/* ScamReaper verdict explanation */}
        <Text style={styles.sectionLabel}>SCAMREAPER VERDICT</Text>
        <View style={styles.card}>
          <View style={styles.verdictBody}>
            <Text style={styles.verdictText}>{call.verdict}</Text>
          </View>
        </View>

        {/* Full transcript */}
        <Text style={styles.sectionLabel}>FULL TRANSCRIPT</Text>
        <View style={styles.card}>
          {call.transcript.map((line, idx) => (
            <View
              key={idx}
              style={[
                styles.transcriptLine,
                idx !== call.transcript.length - 1 && styles.transcriptLineBorder,
              ]}
            >
              <Text style={[styles.speaker, speakerStyle(line.speaker)]}>
                {speakerLabel(line.speaker)}
              </Text>
              <Text style={styles.transcriptText}>{line.text}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionButton, styles.blockButton]} onPress={blockNumber}>
            <Text style={styles.blockButtonText}>Block Number</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.callButton]} onPress={callBack}>
            <Text style={styles.callButtonText}>Call Back</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.dismissButton} onPress={dismiss}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function speakerLabel(speaker: 'caller' | 'ai' | 'system') {
  if (speaker === 'caller') return 'CALLER';
  if (speaker === 'ai') return 'SCAMREAPER';
  return 'SYSTEM';
}

function speakerStyle(speaker: 'caller' | 'ai' | 'system') {
  if (speaker === 'caller') return { color: '#ff3b30' };
  if (speaker === 'ai') return { color: '#30d158' };
  return { color: '#888' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: { color: '#ff3b30', fontSize: 16, fontWeight: '600' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundTitle: { color: '#fff', fontSize: 18 },
  backLink: { color: '#ff3b30', fontSize: 16 },

  verdictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 10,
  },
  verdictDot: { width: 10, height: 10, borderRadius: 5 },
  verdictLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },

  divider: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginLeft: 16,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  detailLabel: { fontSize: 14, color: '#888' },
  detailValue: { fontSize: 14, color: '#fff', fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  detailValueWrap: { maxWidth: '70%' },

  verdictBody: { padding: 16 },
  verdictText: { color: '#ddd', fontSize: 14, lineHeight: 21 },

  transcriptLine: { padding: 16, gap: 6 },
  transcriptLineBorder: { borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  speaker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  transcriptText: { color: '#eee', fontSize: 14, lineHeight: 20 },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  blockButton: { backgroundColor: '#ff3b30' },
  blockButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  callButton: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#30d158' },
  callButtonText: { color: '#30d158', fontSize: 15, fontWeight: '700' },

  dismissButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  dismissText: { color: '#888', fontSize: 15, fontWeight: '600' },
});

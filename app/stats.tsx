import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { computeStats, getWeeklyBlockedHistogram, Stats } from '@/services/StatsService';

/**
 * Statistics Dashboard
 *
 * CEO-level overview of how much work ScamReaper has done on this device.
 * Everything here is computed locally from the call log — no network calls.
 *
 * We avoid pulling in a chart library to keep the binary tiny; the bar
 * chart is drawn with plain <View>s which matches the dark aesthetic
 * without a native dependency.
 */
export default function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [histogram, setHistogram] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setStats(await computeStats());
        setHistogram(await getWeeklyBlockedHistogram());
      })();
    }, []),
  );

  const maxBar = Math.max(1, ...histogram);
  const dayLabels = ['−6d', '−5d', '−4d', '−3d', '−2d', '−1d', 'Today'];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Statistics</Text>
          <View style={{ width: 60 }} />
        </View>

        {stats && (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>CALLS SCREENED</Text>
              <Text style={styles.heroNumber}>{stats.totalScreened}</Text>
              <Text style={styles.heroSub}>
                ScamReaper has protected you for {stats.streakDays} day{stats.streakDays === 1 ? '' : 's'}.
              </Text>
            </View>

            <View style={styles.row}>
              <StatCard label="Blocked this week" value={stats.blockedThisWeek} accent="#ff3b30" />
              <StatCard label="Blocked this month" value={stats.blockedThisMonth} accent="#ff3b30" />
            </View>
            <View style={styles.row}>
              <StatCard label="Blocked today" value={stats.blockedToday} accent="#ff9500" />
              <StatCard label="Time saved" value={`${stats.timeSavedMinutes}m`} accent="#30d158" />
            </View>

            <View style={styles.sectionLabelWrap}>
              <Text style={styles.sectionLabel}>LAST 7 DAYS</Text>
            </View>
            <View style={styles.chartCard}>
              <View style={styles.chart}>
                {histogram.map((v, i) => {
                  const pct = (v / maxBar) * 100;
                  return (
                    <View key={i} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${Math.max(2, pct)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.barValue}>{v}</Text>
                      <Text style={styles.barLabel}>{dayLabels[i]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionLabelWrap}>
              <Text style={styles.sectionLabel}>MOST COMMON SCAM TYPE</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.topType}>{stats.topScamType}</Text>
              <Text style={styles.topTypeSub}>
                Based on {stats.blockedThisMonth} scam call
                {stats.blockedThisMonth === 1 ? '' : 's'} blocked this month.
              </Text>
            </View>

            <View style={styles.sectionLabelWrap}>
              <Text style={styles.sectionLabel}>COMMUNITY PROTECTION</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.communityNumber}>
                {stats.communityProtectedEstimate.toLocaleString()}
              </Text>
              <Text style={styles.communitySub}>
                Estimated scams the ScamReaper community — users like you — have
                collectively blocked. Derived from your local stats only; no
                data is ever sent to a server.
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: accent + '33' }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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

  heroCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroLabel: { color: '#888', letterSpacing: 1, fontSize: 11, fontWeight: '600' },
  heroNumber: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#ff3b30',
    marginTop: 6,
  },
  heroSub: { color: '#aaa', marginTop: 6, fontSize: 13, textAlign: 'center' },

  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },

  sectionLabelWrap: { marginTop: 12, marginBottom: 8, marginLeft: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#888', letterSpacing: 0.8 },

  chartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingHorizontal: 4,
  },
  barCol: { alignItems: 'center', flex: 1, height: '100%' },
  barTrack: {
    flex: 1,
    width: 18,
    backgroundColor: '#0f0f0f',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { backgroundColor: '#ff3b30', width: '100%', borderRadius: 4 },
  barValue: { color: '#fff', fontSize: 11, marginTop: 4 },
  barLabel: { color: '#555', fontSize: 10 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  topType: { color: '#ff3b30', fontSize: 20, fontWeight: 'bold' },
  topTypeSub: { color: '#888', marginTop: 4 },

  communityNumber: { color: '#30d158', fontSize: 30, fontWeight: 'bold' },
  communitySub: { color: '#888', marginTop: 6, fontSize: 13, lineHeight: 18 },
});

import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { useListeningStats, usePlaybackHistory, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { Song } from '@/src/types';

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function minutes(seconds: number) {
  return Math.max(0, Math.round((seconds || 0) / 60));
}

export default function ReplayScreen() {
  const { currentSong, playSong } = usePlayer();
  const { listeningStats } = useListeningStats();
  const { history } = usePlaybackHistory();

  const songsById = useMemo(() => {
    const map = new Map<string, Song>();
    for (const entry of history) {
      if (entry.song?.id && !map.has(entry.song.id)) map.set(entry.song.id, entry.song);
    }
    return map;
  }, [history]);

  const topTracks = useMemo(() => {
    return Object.entries(listeningStats.trackCounts || {})
      .map(([id, seconds]) => ({ id, seconds: Number(seconds || 0), song: songsById.get(id) }))
      .filter((item): item is { id: string; seconds: number; song: Song } => Boolean(item.song))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);
  }, [listeningStats.trackCounts, songsById]);

  const topArtists = useMemo(() => {
    const totals = new Map<string, number>();
    for (const track of topTracks) {
      const names = artistNames(track.song)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      for (const name of names) totals.set(name, (totals.get(name) || 0) + track.seconds);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [topTracks]);

  const days = useMemo(() => {
    const result: { key: string; label: string; seconds: number }[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = localDayKey(date);
      result.push({
        key,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
        seconds: Number(listeningStats.dailySeconds?.[key] || 0),
      });
    }
    return result;
  }, [listeningStats.dailySeconds]);

  const maxDay = Math.max(1, ...days.map((day) => day.seconds));
  const topQueue = topTracks.map((item) => item.song);
  const activeDays = days.filter((day) => day.seconds > 0).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>YOUR LISTENING</Text>
          <Text style={styles.title}>Replay</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>HARMONIA REPLAY</Text>
          <Text style={styles.heroNumber}>{minutes(listeningStats.totalSeconds)}</Text>
          <Text style={styles.heroLabel}>minutes listened on this device</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroMetric}>
              <Text style={styles.metricValue}>{listeningStats.playCount}</Text>
              <Text style={styles.metricLabel}>tracks started</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.heroMetric}>
              <Text style={styles.metricValue}>{activeDays}/7</Text>
              <Text style={styles.metricLabel}>active days</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.heroMetric}>
              <Text style={styles.metricValue}>{topArtists.length}</Text>
              <Text style={styles.metricLabel}>top artists</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Last 7 days</Text>
            <Text style={styles.sectionMeta}>{days.reduce((sum, day) => sum + minutes(day.seconds), 0)} min</Text>
          </View>
          <View style={styles.chart}>
            {days.map((day) => (
              <View key={day.key} style={styles.day}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: Math.max(4, 92 * (day.seconds / maxDay)) }]} />
                </View>
                <Text style={styles.dayLabel}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {!!topTracks.length && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Top tracks</Text>
              <Pressable onPress={() => void playSong(topTracks[0].song, topQueue)}>
                <Text style={styles.playAll}>Play all</Text>
              </Pressable>
            </View>
            <View style={styles.trackCard}>
              {topTracks.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => void playSong(item.song, topQueue)}
                  style={[styles.trackRow, currentSong?.id === item.song.id && styles.trackRowActive]}
                >
                  <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
                  <TrackArtwork song={item.song} size={48} radius={10} />
                  <View style={styles.trackCopy}>
                    <Text numberOfLines={1} style={[styles.trackTitle, currentSong?.id === item.song.id && styles.trackTitleActive]}>{item.song.name}</Text>
                    <Text numberOfLines={1} style={styles.trackArtist}>{artistNames(item.song)}</Text>
                  </View>
                  <Text style={styles.trackTime}>{minutes(item.seconds)}m</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!!topArtists.length && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top artists</Text>
            <View style={styles.artistCard}>
              {topArtists.map(([name, seconds], index) => (
                <View key={name} style={styles.artistRow}>
                  <Text style={styles.artistRank}>{index + 1}</Text>
                  <Text numberOfLines={1} style={styles.artistName}>{name}</Text>
                  <Text style={styles.artistTime}>{minutes(seconds)} min</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!topTracks.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your Replay is warming up.</Text>
            <Text style={styles.emptyBody}>
              Harmonia builds Replay from listening that happens on this device. Play some music and come back later.
            </Text>
            <Pressable onPress={() => router.replace('/(tabs)')} style={styles.primary}>
              <Text style={styles.primaryText}>Start listening</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerCopy: { flex: 1 },
  kicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.textStrong, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  hero: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 22,
    marginTop: 16,
    marginBottom: 30,
  },
  heroKicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroNumber: {
    color: colors.textStrong,
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '900',
    letterSpacing: -2,
    marginTop: 10,
  },
  heroLabel: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  heroStats: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  heroMetric: { flex: 1, alignItems: 'center' },
  metricValue: { color: colors.textStrong, fontSize: 18, fontWeight: '800' },
  metricLabel: { color: colors.textFaint, fontSize: 10, marginTop: 3, textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: colors.border },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.textStrong, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  chart: {
    height: 136,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  day: { flex: 1, alignItems: 'center' },
  barTrack: {
    width: 14,
    height: 92,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 7, backgroundColor: colors.accentBright },
  dayLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', marginTop: 8 },
  playAll: { color: colors.accentBright, fontSize: 13, fontWeight: '800' },
  trackCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  trackRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackRowActive: { backgroundColor: 'rgba(16,185,129,0.08)' },
  rank: { width: 26, color: colors.textFaint, fontSize: 11, fontWeight: '800' },
  trackCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  trackTitle: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  trackTitleActive: { color: colors.accentBright },
  trackArtist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  trackTime: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginLeft: 10 },
  artistCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 12,
  },
  artistRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  artistRank: { width: 28, color: colors.textFaint, fontSize: 12, fontWeight: '800' },
  artistName: { flex: 1, color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  artistTime: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  empty: { minHeight: 340, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  emptyTitle: { color: colors.textStrong, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  primary: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentBright,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryText: { color: '#061108', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});

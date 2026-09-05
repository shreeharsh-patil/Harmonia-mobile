import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Song } from '@/src/types';

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function minutes(seconds: number) {
  return Math.max(0, Math.round((seconds || 0) / 60));
}

export default function ReplayScreen() {
  const { listeningStats, history, currentSong, playSong } = usePlayer();

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
    const result: Array<{ key: string; label: string; seconds: number }> = [];
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

  const shareReplay = async () => {
    const topTrack = topTracks[0];
    const topArtist = topArtists[0];
    const lines = [
      'My Harmonia Replay',
      `${minutes(listeningStats.totalSeconds)} minutes listened`,
      `${listeningStats.playCount} tracks started`,
      `${activeDays}/7 active listening days`,
      topTrack ? `Top track: ${topTrack.song.name} — ${artistNames(topTrack.song)}` : null,
      topArtist ? `Top artist: ${topArtist[0]}` : null,
      '',
      'Made with Harmonia Mobile',
    ].filter(Boolean);

    await Share.share({
      title: 'My Harmonia Replay',
      message: lines.join('\n'),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View>
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
          <Pressable onPress={() => void shareReplay()} style={styles.shareReplay} accessibilityLabel="Share Harmonia Replay">
            <Text style={styles.shareReplayText}>Share Replay</Text>
          </Pressable>
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
                    <Text numberOfLines={1} style={styles.trackTitle}>{item.song.name}</Text>
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
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  backText: { color: '#F2F2F2', fontSize: 32, lineHeight: 34, marginTop: -2 },
  kicker: { color: '#595959', fontSize: 9, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '850' as any, letterSpacing: -0.8, marginTop: 2 },
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  hero: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2B2B2B', backgroundColor: '#101010', padding: 20, marginTop: 8, marginBottom: 30 },
  heroKicker: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  heroNumber: { color: '#FAFAFA', fontSize: 58, lineHeight: 64, fontWeight: '900', letterSpacing: -2.5, marginTop: 10 },
  heroLabel: { color: '#7A7A7A', fontSize: 13, marginTop: 1 },
  heroStats: { height: 80, flexDirection: 'row', alignItems: 'center', marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#252525', paddingTop: 15 },
  shareReplay: { height: 42, borderRadius: 13, backgroundColor: '#ECECEC', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  shareReplayText: { color: '#090909', fontSize: 12, fontWeight: '850' as any },
  heroMetric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#F0F0F0', fontSize: 19, fontWeight: '850' as any },
  metricLabel: { color: '#606060', fontSize: 9, marginTop: 4, textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 35, backgroundColor: '#282828' },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F3F3F3', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: '#5B5B5B', fontSize: 11, fontWeight: '700' },
  chart: { height: 132, borderRadius: 18, backgroundColor: '#0E0E0E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#202020', flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  day: { flex: 1, alignItems: 'center' },
  barTrack: { width: 14, height: 92, borderRadius: 7, backgroundColor: '#171717', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 7, backgroundColor: '#E8E8E8' },
  dayLabel: { color: '#606060', fontSize: 9, fontWeight: '700', marginTop: 7 },
  playAll: { color: '#E8E8E8', fontSize: 12, fontWeight: '800' },
  trackCard: { borderRadius: 18, backgroundColor: '#0E0E0E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#202020', overflow: 'hidden' },
  trackRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C1C' },
  trackRowActive: { backgroundColor: '#151515' },
  rank: { width: 28, color: '#555', fontSize: 10, fontWeight: '800' },
  trackCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  trackTitle: { color: '#ECECEC', fontSize: 13, fontWeight: '750' as any },
  trackArtist: { color: '#676767', fontSize: 11, marginTop: 3 },
  trackTime: { color: '#555', fontSize: 10, fontWeight: '700', marginLeft: 10 },
  artistCard: { borderRadius: 18, backgroundColor: '#0E0E0E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#202020', overflow: 'hidden', marginTop: 13 },
  artistRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C1C' },
  artistRank: { width: 30, color: '#555', fontSize: 11, fontWeight: '800' },
  artistName: { flex: 1, color: '#E6E6E6', fontSize: 13, fontWeight: '700' },
  artistTime: { color: '#5E5E5E', fontSize: 10, fontWeight: '700' },
  empty: { minHeight: 340, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  emptyTitle: { color: '#ECECEC', fontSize: 21, fontWeight: '850' as any, textAlign: 'center' },
  emptyBody: { color: '#6D6D6D', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  primary: { height: 48, borderRadius: 15, backgroundColor: '#EEEEEE', paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryText: { color: '#090909', fontSize: 13, fontWeight: '850' as any },
});

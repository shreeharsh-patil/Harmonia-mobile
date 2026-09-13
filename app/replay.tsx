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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SongRow } from '@/src/components/SongRow';
import { albumName, artistNames } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Song } from '@/src/types';

type RankedTrack = { song: Song; count: number };
type RankedLabel = { label: string; count: number };

function monthPrefix(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 7);
}

function monthTitle(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ReplayScreen() {
  const { history, listeningStats, playSong } = usePlayer();
  const now = new Date();
  const prefix = monthPrefix(now);

  const replay = useMemo(() => {
    const monthHistory = history.filter((entry) => monthPrefix(new Date(entry.playedAt)) === prefix);
    const trackMap = new Map<string, RankedTrack>();
    const artistMap = new Map<string, number>();
    const albumMap = new Map<string, number>();

    for (const entry of monthHistory) {
      const key = String(entry.song.id || `${entry.song.name}:${artistNames(entry.song)}`);
      const current = trackMap.get(key);
      trackMap.set(key, {
        song: entry.song,
        count: (current?.count || 0) + 1,
      });

      const artist = artistNames(entry.song).trim();
      if (artist) artistMap.set(artist, (artistMap.get(artist) || 0) + 1);

      const album = albumName(entry.song).trim();
      if (album) albumMap.set(album, (albumMap.get(album) || 0) + 1);
    }

    const topTracks = [...trackMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    const topArtists: RankedLabel[] = [...artistMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topAlbums: RankedLabel[] = [...albumMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const seconds = Object.entries(listeningStats.dailySeconds)
      .filter(([day]) => day.startsWith(prefix))
      .reduce((total, [, value]) => total + Number(value || 0), 0);

    return {
      monthHistory,
      topTracks,
      topArtists,
      topAlbums,
      minutes: Math.round(seconds / 60),
    };
  }, [history, listeningStats.dailySeconds, prefix]);

  const shareReplay = async () => {
    const topSong = replay.topTracks[0];
    const topArtist = replay.topArtists[0];
    const message = [
      `My Harmonia Replay — ${monthTitle(now)}`,
      `${replay.minutes} minutes listened`,
      `${replay.monthHistory.length} plays`,
      topSong ? `Top song: ${topSong.song.name} — ${artistNames(topSong.song)}` : null,
      topArtist ? `Top artist: ${topArtist.label}` : null,
    ].filter(Boolean).join('\n');

    await Share.share({ message });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={23} color="#F4F4F4" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>YOUR LISTENING</Text>
          <Text style={styles.title}>Replay</Text>
        </View>
        <Pressable onPress={() => void shareReplay()} style={styles.iconButton} accessibilityLabel="Share Replay">
          <Ionicons name="share-outline" size={21} color="#F4F4F4" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroMonth}>{monthTitle(now).toUpperCase()}</Text>
          <Text style={styles.heroMinutes}>{replay.minutes.toLocaleString()}</Text>
          <Text style={styles.heroLabel}>minutes listened</Text>

          <View style={styles.statsRow}>
            <Stat value={replay.monthHistory.length} label="Plays" />
            <View style={styles.rule} />
            <Stat value={replay.topTracks.length} label="Top tracks" />
            <View style={styles.rule} />
            <Stat value={replay.topArtists.length} label="Artists" />
          </View>
        </View>

        {replay.topTracks.length ? (
          <>
            <SectionHeader title="Top songs" detail="Most played this month" />
            <View style={styles.songGroup}>
              {replay.topTracks.map((item) => (
                <SongRow
                  key={item.song.id}
                  song={item.song}
                  onPress={() => void playSong(item.song, replay.topTracks.map((track) => track.song))}
                  trailing={<Text style={styles.count}>{item.count}×</Text>}
                />
              ))}
            </View>

            <SectionHeader title="Top artists" detail="Your strongest rotation" />
            <View style={styles.rankCard}>
              {replay.topArtists.map((item, index) => (
                <RankRow key={item.label} rank={index + 1} label={item.label} count={item.count} />
              ))}
            </View>

            <SectionHeader title="Top albums" detail="Albums you returned to" />
            <View style={styles.rankCard}>
              {replay.topAlbums.map((item, index) => (
                <RankRow key={item.label} rank={index + 1} label={item.label} count={item.count} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="stats-chart-outline" size={32} color="#5B5B5B" />
            <Text style={styles.emptyTitle}>Your Replay is warming up</Text>
            <Text style={styles.emptyBody}>
              Keep listening in Harmonia. Plays and listening time recorded on this phone will appear here automatically.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDetail}>{detail}</Text>
    </View>
  );
}

function RankRow({ rank, label, count }: { rank: number; label: string; count: number }) {
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rank}>{String(rank).padStart(2, '0')}</Text>
      <Text numberOfLines={1} style={styles.rankLabel}>{label}</Text>
      <Text style={styles.rankCount}>{count} plays</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  header: {
    minHeight: 68,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#262626',
  },
  content: { paddingBottom: 150 },
  hero: {
    marginHorizontal: 18,
    marginTop: 12,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#111',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2A',
  },
  heroMonth: { color: '#777', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroMinutes: { color: '#FFF', fontSize: 58, lineHeight: 64, fontWeight: '900', letterSpacing: -2.8, marginTop: 18 },
  heroLabel: { color: '#838383', fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  stat: { flex: 1 },
  statValue: { color: '#EDEDED', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#656565', fontSize: 10, fontWeight: '700', marginTop: 3 },
  rule: { width: StyleSheet.hairlineWidth, height: 38, backgroundColor: '#2D2D2D', marginHorizontal: 10 },
  sectionHeader: { paddingHorizontal: 18, marginTop: 30, marginBottom: 9 },
  sectionTitle: { color: '#F1F1F1', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionDetail: { color: '#646464', fontSize: 11, marginTop: 3 },
  songGroup: { paddingHorizontal: 18 },
  count: { color: '#707070', fontSize: 11, fontWeight: '800', minWidth: 32, textAlign: 'right' },
  rankCard: {
    marginHorizontal: 18,
    borderRadius: 18,
    backgroundColor: '#101010',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  rankRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1D1D1D',
  },
  rank: { width: 34, color: '#5E5E5E', fontSize: 11, fontWeight: '900' },
  rankLabel: { flex: 1, color: '#E6E6E6', fontSize: 14, fontWeight: '700' },
  rankCount: { color: '#666', fontSize: 10, fontWeight: '700', marginLeft: 12 },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { color: '#E6E6E6', fontSize: 18, fontWeight: '800', marginTop: 14 },
  emptyBody: { color: '#6A6A6A', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
});

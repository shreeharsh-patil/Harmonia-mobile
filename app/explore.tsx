import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { SongRow } from '@/src/components/SongRow';
import {
  fetchHomeSections,
  fetchRecommendedMixes,
} from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { usePlaybackActivity, usePlayer, type PlaybackHistoryEntry } from '@/src/providers/PlayerProvider';
import type { MusicSection, Playlist, RecommendedMix, Song } from '@/src/types';

function uniqueRecentSongs(history: PlaybackHistoryEntry[]) {
  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const entry of history) {
    const id = String(entry.song?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    songs.push(entry.song);
    if (songs.length >= 12) break;
  }
  return songs;
}

export default function ExploreScreen() {
  const { token } = useAuth();
  const { currentSong, playSong } = usePlayer();
  const { history } = usePlaybackActivity();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const recentSongs = useMemo(() => uniqueRecentSongs(history), [history]);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    const [homeResult, mixResult] = await Promise.allSettled([
      fetchHomeSections(),
      token ? fetchRecommendedMixes(token) : Promise.resolve<RecommendedMix[]>([]),
    ]);

    if (generation !== loadGenerationRef.current) return;

    if (homeResult.status === 'fulfilled') {
      setSections(homeResult.value);
    } else {
      setError(homeResult.reason?.message || 'Unable to load Explore');
    }

    setMixes(mixResult.status === 'fulfilled' ? mixResult.value : []);
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  const openMix = (mix: RecommendedMix) => {
    const id = String(mix._mixId || mix.id || '');
    if (!id) return;
    router.push({ pathname: '/mix/[id]', params: { id } });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>DISCOVER</Text>
          <Text style={styles.title}>Explore</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFF" />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>HARMONIA EXPLORE</Text>
          <Text style={styles.heroTitle}>Find the next thing worth playing.</Text>
          <Text style={styles.heroBody}>
            Curated shelves, your Harmonia mixes and recent listening live together without changing the existing catalog or playback pipeline.
          </Text>
        </View>

        {!!error && (
          <Pressable onPress={() => void load()} style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        )}

        {loading && !sections.length ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFF" />
          </View>
        ) : (
          <>
            {!!recentSongs.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Jump back in</Text>
                  <Text style={styles.sectionMeta}>{recentSongs.length}</Text>
                </View>
                <View style={styles.songList}>
                  {recentSongs.slice(0, 6).map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      active={currentSong?.id === song.id}
                      onPress={() => void playSong(song, recentSongs)}
                    />
                  ))}
                </View>
              </View>
            )}

            {!!mixes.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Made for you</Text>
                  <Text style={styles.sectionMeta}>Personal mixes</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {mixes.map((mix, index) => (
                    <PlaylistCard
                      key={String(mix._mixId || mix.id || index)}
                      playlist={mix}
                      onPress={() => openMix(mix)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {sections.map((section) => (
              <View key={String(section.id || section._id || section.name)} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{section.name}</Text>
                  <Text style={styles.sectionMeta}>{section.playlists?.length || 0}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {(section.playlists || []).map((playlist, index) => (
                    <PlaylistCard
                      key={String(playlist.id || playlist._id || `${section.name}-${index}`)}
                      playlist={playlist}
                      onPress={() => openPlaylist(playlist)}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}

            {!sections.length && !mixes.length && !recentSongs.length && !error && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing to explore yet</Text>
                <Text style={styles.emptyBody}>Play a few songs or pull to refresh the catalog.</Text>
              </View>
            )}
          </>
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
  headerCopy: { flex: 1 },
  kicker: { color: '#595959', fontSize: 9, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '850' as any, letterSpacing: -0.8, marginTop: 2 },
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  hero: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', backgroundColor: '#101010', padding: 20, marginTop: 8, marginBottom: 28 },
  heroKicker: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  heroTitle: { color: '#F5F5F5', fontSize: 27, lineHeight: 31, fontWeight: '850' as any, letterSpacing: -0.8, marginTop: 9, maxWidth: 320 },
  heroBody: { color: '#777', fontSize: 13, lineHeight: 20, marginTop: 10, maxWidth: 340 },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F3F3F3', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: '#5B5B5B', fontSize: 11, fontWeight: '700' },
  rail: { gap: 12, paddingRight: 18 },
  songList: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#0D0D0D', borderWidth: StyleSheet.hairlineWidth, borderColor: '#202020', paddingHorizontal: 8, paddingVertical: 4 },
  loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  errorBox: { borderRadius: 14, backgroundColor: '#171010', padding: 14, marginBottom: 22 },
  error: { color: '#EE8A8A', fontSize: 13, fontWeight: '600' },
  retry: { color: '#777', fontSize: 11, marginTop: 4 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: '#DDD', fontSize: 17, fontWeight: '800' },
  emptyBody: { color: '#686868', fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});

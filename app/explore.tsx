import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { SongRow } from '@/src/components/SongRow';
import { ExploreSkeleton } from '@/src/components/ExploreSkeleton';
import {
  fetchHomeSections,
  fetchRecommendedMixes,
} from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { usePlaybackHistory, usePlayer, type PlaybackHistoryEntry } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
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
  const { history } = usePlaybackHistory();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const recentSongs = useMemo(() => uniqueRecentSongs(history), [history]);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [homeResult, mixResult] = await Promise.allSettled([
      fetchHomeSections({ forceRefresh: refresh }),
      token ? fetchRecommendedMixes(token) : Promise.resolve<RecommendedMix[]>([]),
    ]);

    if (generation !== loadGenerationRef.current) return;

    if (homeResult.status === 'fulfilled') {
      setSections(homeResult.value);
    } else {
      setError(homeResult.reason?.message || 'Unable to load recommendations');
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

  useFocusEffect(
    useCallback(() => {
      void load(false);

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void load(false);
        }
      });

      const interval = setInterval(() => {
        if (AppState.currentState === 'active') {
          void load(true);
        }
      }, 10 * 60_000);

      return () => {
        sub.remove();
        clearInterval(interval);
      };
    }, [load])
  );

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
          <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
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
          <ExploreSkeleton />
        ) : (
          <>
            {!!recentSongs.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Jump back in</Text>
                  <Text style={styles.sectionMeta}>{recentSongs.length} tracks</Text>
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
                  <Text style={styles.sectionMeta}>{section.playlists?.length || 0} playlists</Text>
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
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
    marginTop: 16,
    marginBottom: 28,
  },
  heroKicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: {
    color: colors.textStrong,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 8,
    maxWidth: 320,
  },
  heroBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 340 },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.textStrong, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  rail: { gap: 14, paddingRight: 16 },
  songList: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  errorBox: {
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 14,
    marginBottom: 22,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  retry: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
  emptyBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});

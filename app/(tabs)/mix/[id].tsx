import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistArtworkUrl, PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { CatalogDetailSkeleton } from '@/src/components/CatalogDetailSkeleton';
import { ArtworkColorHeader } from '@/src/components/ArtworkColorHeader';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { fetchRecommendedMixes, fetchSongs } from '@/src/lib/api';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';
import type { RecommendedMix, Song } from '@/src/types';

export default function MixScreen() {
  const insets = useSafeAreaInsets();
  // Web detail pages skip color extraction in battery-saver mode.
  const { batterySaver } = usePreferences();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const { currentSong, playSong } = usePlayer();
  const [mix, setMix] = useState<RecommendedMix | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !id) {
      setMix(null);
      setSongs([]);
      setLoading(false);
      if (token && !id) setError('This mix link is incomplete.');
      return;
    }

    setLoading(true);
    setError(null);
    setMix(null);
    setSongs([]);
    try {
      const mixes = await fetchRecommendedMixes(token);
      const found = mixes.find((item) => String(item._mixId || item.id || '') === id) || null;
      if (!found) throw new Error('This mix is no longer available');
      const nextSongs = await fetchSongs((found.songIds || []).slice(0, 100));
      if (generation !== loadGenerationRef.current) return;

      setMix(found);
      setSongs(nextSongs);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this mix');
      }
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    setMix(null);
    setSongs([]);
    setActionSong(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!songs.length || playing) return;
    setPlaying(true);
    try {
      let queue = [...songs];
      let selected = queue[Math.max(0, Math.min(startIndex, queue.length - 1))];
      if (shuffle && queue.length > 1) {
        for (let index = queue.length - 1; index > 0; index -= 1) {
          const random = Math.floor(Math.random() * (index + 1));
          [queue[index], queue[random]] = [queue[random], queue[index]];
        }
        selected = queue[0];
      }
      await playSong(selected, queue);
    } finally {
      setPlaying(false);
    }
  };

  const subtitle = useMemo(() => {
    if (!mix) return '';
    if (mix.sourceType === 'liked_songs') return 'Based on your Liked Songs';
    return 'Based on your recent listening';
  }, [mix]);

  // Web detail pages wash the header with the artwork's dominant color.
  // Memoized before the early returns and against 2 Hz progress re-renders.
  const paletteCover = useMemo(
    () => (mix ? playlistArtworkUrl(mix as any, 64) : ''),
    [mix]
  );

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Sign in for your mixes</Text>
          <Text style={styles.errorBody}>Made for You mixes use your Harmonia listening history.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.primarySingle}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !mix) {
    return (
      <SafeAreaView style={styles.safe}><CatalogDetailSkeleton /></SafeAreaView>
    );
  }

  if (!mix) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Mix unavailable</Text>
          <Text style={styles.errorBody}>{error || 'Harmonia could not load this recommendation.'}</Text>
          <Pressable onPress={() => void load()} style={styles.primarySingle}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ArtworkColorHeader artworkUrl={paletteCover} enabled={!batterySaver} height={330} />
      <FlatList
        data={songs}
        keyExtractor={(item, index) => item.id || String(index)}
        initialNumToRender={SONG_LIST_INITIAL_RENDER}
        maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
        updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
        windowSize={SONG_LIST_WINDOW_SIZE}
        contentContainerStyle={[styles.list, { paddingBottom: contentBottomInset }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.top}><BackButton /></View>
            <View style={styles.hero}>
              <View style={styles.artworkContainer}>
                <PlaylistArtwork playlist={mix} size={224} radius={18} />
              </View>
              <Text style={styles.kicker}>MADE FOR YOU</Text>
              <Text style={styles.title}>{mix.name}</Text>
              <Text style={styles.meta}>
                {subtitle}{songs.length ? ` · ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}` : ''}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  disabled={!songs.length || playing}
                  onPress={() => void playFrom(0)}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                >
                  {playing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Ionicons name="play" size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.primaryText}>Play</Text>
                </Pressable>
                <Pressable
                  disabled={!songs.length || playing}
                  onPress={() => void playFrom(0, true)}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                >
                  <Ionicons name="shuffle" size={18} color={colors.textStrong} />
                  <Text style={styles.secondaryText}>Shuffle</Text>
                </Pressable>
              </View>
            </View>
            {!!error && <Text style={styles.inlineError}>{error}</Text>}
            <Text style={styles.sectionTitle}>Tracks</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>This mix is empty</Text>
            <Text style={styles.emptyBody}>Like and play more songs, then refresh your recommendations later.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            active={currentSong?.id === item.id}
            onPress={() => void playFrom(index)}
            onMorePress={() => setActionSong(item)}
          />
        )}
      />
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
      <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  top: { height: 56, justifyContent: 'center' },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  artworkContainer: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  kicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginTop: 20 },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.8,
    marginTop: 6,
  },
  meta: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 22 },
  primary: {
    minWidth: 124,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 22,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  primarySingle: {
    marginTop: 18,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondary: {
    minWidth: 124,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 22,
  },
  secondaryText: { color: colors.textStrong, fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: colors.textStrong, fontSize: 20, fontWeight: '800' },
  errorBody: { color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  inlineError: { color: colors.danger, fontSize: 12, marginBottom: 12 },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { CatalogDetailSkeleton } from '@/src/components/CatalogDetailSkeleton';
import { ArtworkColorHeader } from '@/src/components/ArtworkColorHeader';
import { SongRow } from '@/src/components/SongRow';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  fetchAlbum,
  fetchSongs,
} from '@/src/lib/api';
import {
  albumTitle,
  entityImageUrl,
} from '@/src/lib/entities';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { artistNames } from '@/src/lib/song';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, Song } from '@/src/types';

export default function AlbumScreen() {
  const insets = useSafeAreaInsets();
  // Web detail pages skip color extraction in battery-saver mode.
  const { batterySaver } = usePreferences();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { isAlbumLiked, toggleAlbumLike } = useLibrary();
  const { currentSong, isPlaying, playSong, togglePlayback } = usePlayer();

  const [album, setAlbum] = useState<HarmoniaAlbum | null>(null);
  // Artwork resolution walks many fields and runs regexes; memoize so the
  // 2 Hz progress re-renders do not recompute it (and so the value is stable
  // even though these screens return early while loading).
  const cover = useMemo(() => entityImageUrl(album, 224), [album]);
  const paletteCover = useMemo(() => entityImageUrl(album, 64), [album]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [isShuffle, setIsShuffle] = useState(false);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!id) {
      setAlbum(null);
      setSongs([]);
      setLoading(false);
      setError('This album link is incomplete.');
      return;
    }

    setLoading(true);
    setError(null);
    setAlbum(null);
    setSongs([]);
    try {
      const detail = await fetchAlbum(id);
      let nextSongs: Song[] = [];
      if (Array.isArray(detail.songs) && detail.songs.length) {
        nextSongs = detail.songs;
      } else if (Array.isArray(detail.songIds) && detail.songIds.length) {
        nextSongs = await fetchSongs(detail.songIds);
      }
      if (generation !== loadGenerationRef.current) return;

      setAlbum(detail);
      setSongs(nextSongs);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this album');
      }
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setAlbum(null);
    setSongs([]);
    setActionSong(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const isAlbumActive = useMemo(() => {
    return Boolean(currentSong && songs.some((s) => s.id === currentSong.id));
  }, [currentSong, songs]);

  const handlePlayToggle = async () => {
    if (!songs.length || playing) return;
    if (isAlbumActive) {
      await togglePlayback();
      return;
    }
    await playFrom(0, isShuffle);
  };

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!songs.length || playing) return;
    setPlaying(true);
    try {
      let queue = songs;
      let selected = songs[Math.max(0, Math.min(startIndex, queue.length - 1))];
      if (shuffle && songs.length > 1) {
        queue = [...songs];
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

  if (loading && !album) {
    return (
      <SafeAreaView style={styles.safe}><CatalogDetailSkeleton /></SafeAreaView>
    );
  }

  if (!album) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Album unavailable</Text>
          <Text style={styles.errorBody}>{error || 'This album could not be loaded.'}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Web album page washes the header with the artwork's dominant color.
  const subtitle =
    album.primaryArtists ||
    (songs[0] ? artistNames(songs[0]) : '') ||
    String((album as any).artist || 'Various artists');
  const release = album.releaseDate || album.year;
  const meta = [
    release ? String(release) : '',
    songs.length ? `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}` : '',
  ].filter(Boolean).join(' • ');
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
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: contentBottomInset }]}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <BackButton />
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => {
                    void toggleAlbumLike(album);
                  }}
                  style={styles.headerAction}
                  accessibilityLabel={isAlbumLiked(String(album.id || id || '')) ? 'Remove album from library' : 'Save album'}
                >
                  <Ionicons
                    name={isAlbumLiked(String(album.id || id || '')) ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isAlbumLiked(String(album.id || id || '')) ? colors.danger : colors.textStrong}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroSection}>
              <View style={styles.artworkContainer}>
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Ionicons name="disc-outline" size={58} color={colors.textFaint} />
                  </View>
                )}
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.kicker}>ALBUM</Text>
                <Text style={styles.title}>{albumTitle(album)}</Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                {!!meta && <Text style={styles.meta}>{meta}</Text>}
              </View>

              <View style={styles.controlsBar}>
                <Pressable
                  disabled={!songs.length || playing}
                  onPress={() => void handlePlayToggle()}
                  style={({ pressed }) => [styles.playButtonCircle, pressed && styles.pressed]}
                  accessibilityLabel="Play album"
                >
                  {playing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name={isAlbumActive && isPlaying ? 'pause' : 'play'}
                      size={24}
                      color="#FFFFFF"
                      style={isAlbumActive && isPlaying ? undefined : { marginLeft: 3 }}
                    />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setIsShuffle((val) => !val)}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel="Shuffle"
                >
                  <Ionicons
                    name="shuffle"
                    size={22}
                    color={isShuffle ? colors.accent : colors.textMuted}
                  />
                </Pressable>

                <Pressable
                  onPress={() => {
                    void toggleAlbumLike(album);
                  }}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel="Like album"
                >
                  <Ionicons
                    name={isAlbumLiked(String(album.id || id || '')) ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isAlbumLiked(String(album.id || id || '')) ? colors.danger : colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            {!!error && <Text style={styles.inlineError}>{error}</Text>}
            <Text style={styles.sectionTitle}>Tracks</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No playable tracks</Text>
            <Text style={styles.emptyBody}>No playable tracks are available for this album.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.songRowWrap}>
            <SongRow
              song={item}
              index={index}
              showIndex={true}
              isPlaying={isPlaying && currentSong?.id === item.id}
              active={currentSong?.id === item.id}
              onPress={() => void playFrom(index)}
              onMorePress={() => setActionSong(item)}
            />
          </View>
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
  list: { paddingBottom: 40 },
  top: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  artworkContainer: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    marginBottom: 18,
  },
  cover: { width: 224, height: 224, borderRadius: 12, backgroundColor: colors.surface },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  heroCopy: { width: '100%', alignItems: 'center' },
  kicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 4 },
  title: {
    color: colors.textStrong,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.7,
  },
  subtitle: { color: colors.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  meta: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 4 },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 18,
    gap: 12,
  },
  playButtonCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 6,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: colors.textStrong, fontSize: 20, fontWeight: '800' },
  errorBody: { color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  retry: {
    marginTop: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  inlineError: { color: colors.danger, fontSize: 12, marginHorizontal: 16, marginBottom: 12 },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  songRowWrap: { paddingHorizontal: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});

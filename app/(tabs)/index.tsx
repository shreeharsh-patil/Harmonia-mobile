import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  fetchHomeSections,
  fetchRecentlyPlayedPlaylists,
  fetchRecommendedMixes,
  fetchTrendingHomeContent,
} from '@/src/lib/api';
import { albumTitle, entityImageUrl } from '@/src/lib/entities';
import { latestHomePlaylists } from '@/src/lib/homeSections';
import { getStaticHomeSections } from '@/src/lib/staticCatalog';
import { artistNames } from '@/src/lib/song';
import { RAIL_BATCH_SIZE, RAIL_INITIAL_RENDER, RAIL_WINDOW_SIZE } from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import {
  usePlaybackHistory,
  usePlayer,
  type PlaybackHistoryEntry,
} from '@/src/providers/PlayerProvider';

import { useArtworkPalette } from '@/src/lib/palette';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, MusicSection, Playlist, RecommendedMix, Song } from '@/src/types';

const TRENDING_SCREEN_REFRESH_MS = 10 * 60_000;

function uniqueRecentSongs(history: PlaybackHistoryEntry[], limit = 12) {
  const seen = new Set<string>();
  const songs: Song[] = [];

  for (const entry of history) {
    const id = String(entry.song?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    songs.push(entry.song);
    if (songs.length >= limit) break;
  }

  return songs;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const { likedSongs } = useLibrary();
  const { currentSong, isPlaying, playSong, togglePlayback } = usePlayer();
  const { batterySaver } = usePreferences();
  // Web music layout tints its ambient mesh glows from the playing artwork's
  // palette (dominant rgba(.,0.10-0.12), secondary rgba(.,0.08)); the saffron
  // and emerald tokens are the no-song fallback. Battery saver keeps the
  // token glows and skips artwork download + pixel extraction entirely.
  const paletteSong = batterySaver ? null : currentSong;
  const { dominantRgb, secondaryRgb } = useArtworkPalette(paletteSong, 64);
  const { history } = usePlaybackHistory();

  const [sections, setSections] = useState<MusicSection[]>(() => getStaticHomeSections());
  const [recentPlaylists, setRecentPlaylists] = useState<Playlist[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [trendingAlbums, setTrendingAlbums] = useState<HarmoniaAlbum[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topColumnIndex, setTopColumnIndex] = useState(0);
  const loadGenerationRef = useRef(0);
  const lastCatalogRefreshRef = useRef(0);
  const lastTrendingRefreshRef = useRef(0);
  const catalogRefreshInFlightRef = useRef(false);
  const trendingRefreshInFlightRef = useRef(false);
  const recentRefreshInFlightRef = useRef(false);
  const topSongsRef = useRef<FlatList<Song[]> | null>(null);
  const recentSongs = useMemo(() => uniqueRecentSongs(history), [history]);
  const latestPlaylists = useMemo(() => latestHomePlaylists(sections), [sections]);
  const quickCardWidth = Math.floor((width - 32) / 2);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const publicRequest = fetchHomeSections({ forceRefresh: refresh });
    const recentRequest = token
      ? fetchRecentlyPlayedPlaylists(token)
      : Promise.resolve<Playlist[]>([]);
    const mixRequest = token
      ? fetchRecommendedMixes(token)
      : Promise.resolve<RecommendedMix[]>([]);
    const trendingRequest = fetchTrendingHomeContent({ forceRefresh: refresh });

    // The playlist feed is the primary Home content and is normally much
    // faster than chart/album discovery. Paint it as soon as it arrives instead
    // of keeping the entire screen behind the slowest secondary request.
    const [publicResult] = await Promise.allSettled([publicRequest]);

    if (generation !== loadGenerationRef.current) return;

    if (publicResult.status === 'fulfilled') {
      setSections(publicResult.value);
      lastCatalogRefreshRef.current = Date.now();
    } else {
      setError(publicResult.reason?.message || 'Unable to load music');
    }

    setLoading(false);
    setRefreshing(false);

    const [recentResult, mixResult, trendingResult] = await Promise.allSettled([
      recentRequest,
      mixRequest,
      trendingRequest,
    ]);

    if (generation !== loadGenerationRef.current) return;

    setRecentPlaylists(recentResult.status === 'fulfilled' ? recentResult.value : []);
    setMixes(mixResult.status === 'fulfilled' ? mixResult.value : []);

    if (trendingResult.status === 'fulfilled') {
      setTrendingAlbums(trendingResult.value.albums);
      setTrendingSongs(trendingResult.value.songs);
      lastTrendingRefreshRef.current = Date.now();
    } else {
      setTrendingAlbums([]);
      setTrendingSongs([]);
    }

  }, [token]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const refreshRecentPlaylistsSilently = useCallback(async () => {
    if (!token) {
      setRecentPlaylists([]);
      return;
    }
    if (recentRefreshInFlightRef.current) return;

    recentRefreshInFlightRef.current = true;
    try {
      const next = await fetchRecentlyPlayedPlaylists(token);
      setRecentPlaylists(next);
    } catch {
      // Keep the last successful recent list. The quick-access grid should not
      // disappear just because a background sync request briefly fails.
    } finally {
      recentRefreshInFlightRef.current = false;
    }
  }, [token]);

  const refreshTrendingSilently = useCallback(async (force = false) => {
    // A focused tab can remain mounted while the app is backgrounded. Avoid
    // waking the network/cache pipeline until Harmonia is actually visible.
    if (AppState.currentState !== 'active') return;
    if (trendingRefreshInFlightRef.current) return;
    if (
      !force &&
      lastTrendingRefreshRef.current > 0 &&
      Date.now() - lastTrendingRefreshRef.current < TRENDING_SCREEN_REFRESH_MS
    ) {
      return;
    }

    trendingRefreshInFlightRef.current = true;
    try {
      const next = await fetchTrendingHomeContent({ forceRefresh: true });
      if (next.albums.length) setTrendingAlbums(next.albums);
      if (next.songs.length) {
        setTrendingSongs((current) => {
          const currentIds = current.map((song) => String(song.id || '')).join('|');
          const nextIds = next.songs.map((song) => String(song.id || '')).join('|');
          return currentIds === nextIds ? current : next.songs;
        });
      }
      lastTrendingRefreshRef.current = Date.now();
    } catch {
      // Keep the last successful chart instead of flashing an empty section.
    } finally {
      trendingRefreshInFlightRef.current = false;
    }
  }, []);

  const refreshCatalogSilently = useCallback(async (force = false) => {
    if (AppState.currentState !== 'active') return;
    if (catalogRefreshInFlightRef.current) return;
    if (
      !force &&
      lastCatalogRefreshRef.current > 0 &&
      Date.now() - lastCatalogRefreshRef.current < TRENDING_SCREEN_REFRESH_MS
    ) {
      return;
    }

    catalogRefreshInFlightRef.current = true;
    try {
      const next = await fetchHomeSections({ forceRefresh: true });
      if (next.length) setSections(next);
      lastCatalogRefreshRef.current = Date.now();
    } catch {
      // Retain the last successful playlist feed during a transient outage.
    } finally {
      catalogRefreshInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Expo Router keeps tab screens mounted. Re-fetch recents every time Home
      // regains focus so a playlist played on another screen appears here
      // immediately instead of waiting for a full app remount.
      void refreshRecentPlaylistsSilently();
      void refreshCatalogSilently();
      void refreshTrendingSilently();

      const appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refreshRecentPlaylistsSilently();
          void refreshCatalogSilently();
          void refreshTrendingSilently();
        }
      });

      const interval = setInterval(() => {
        void refreshCatalogSilently(true);
        void refreshTrendingSilently(true);
      }, TRENDING_SCREEN_REFRESH_MS);

      return () => {
        clearInterval(interval);
        appStateSubscription.remove();
      };
    }, [refreshCatalogSilently, refreshRecentPlaylistsSilently, refreshTrendingSilently])
  );

  const openPlaylist = useCallback((playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    router.push({ pathname: '/playlist/[id]', params: { id } });
  }, []);

  const openAlbum = useCallback((album: HarmoniaAlbum) => {
    const id = String(album.id || '');
    if (!id) return;
    router.push({ pathname: '/album/[id]', params: { id } });
  }, []);

  const openMix = useCallback((mix: RecommendedMix) => {
    const id = String(mix._mixId || mix.id || '');
    if (!id) return;
    router.push({ pathname: '/mix/[id]', params: { id } });
  }, []);

  const featuredFallback = useMemo(
    () => sections.flatMap((section) => section.playlists || []).slice(0, 5),
    [sections]
  );

  const quickPlaylists = useMemo(
    () => recentPlaylists.length ? recentPlaylists.slice(0, 5) : featuredFallback,
    [featuredFallback, recentPlaylists]
  );

  const topColumns = useMemo(() => {
    const columns: Song[][] = [];
    for (let index = 0; index < trendingSongs.length; index += 4) {
      columns.push(trendingSongs.slice(index, index + 4));
    }
    return columns;
  }, [trendingSongs]);

  const topColumnWidth = Math.min(342, Math.max(282, width - 54));

  const playRecentSong = useCallback((song: Song) => {
    void playSong(song, recentSongs);
  }, [playSong, recentSongs]);

  const scrollTopSongs = (direction: -1 | 1) => {
    if (!topColumns.length) return;
    const nextIndex = Math.max(0, Math.min(topColumns.length - 1, topColumnIndex + direction));
    setTopColumnIndex(nextIndex);
    topSongsRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const hasContent =
    sections.some((section) => section.playlists?.length) ||
    recentSongs.length > 0 ||
    recentPlaylists.length > 0 ||
    trendingAlbums.length > 0 ||
    trendingSongs.length > 0;

  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View pointerEvents="none" style={styles.ambientBackdrop}>
        <View
          style={[
            styles.glowOrb,
            styles.glowSaffron,
            // Gate on paletteSong, not currentSong: in battery saver the hook
            // receives null and must keep the saffron/emerald tokens instead
            // of tinting with the neutral default palette.
            paletteSong
              ? { backgroundColor: `rgba(${dominantRgb[0]}, ${dominantRgb[1]}, ${dominantRgb[2]}, 0.14)` }
              : null,
          ]}
        />
        <View
          style={[
            styles.glowOrb,
            styles.glowEmerald,
            paletteSong
              ? { backgroundColor: `rgba(${secondaryRgb[0]}, ${secondaryRgb[1]}, ${secondaryRgb[2]}, 0.10)` }
              : null,
          ]}
        />
      </View>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Discover</Text>
      </View>

      <FlatList<MusicSection>
        data={sections}
        keyExtractor={(section, index) => String(section.id || section._id || `${section.name}-${index}`)}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.textStrong}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
        ListHeaderComponent={
          <>
            {!!latestPlaylists.length && (
              <PlaylistRail
                title="Latest Playlists"
                data={latestPlaylists}
                onPress={openPlaylist}
              />
            )}

            <View style={styles.quickGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={likedSongs.length ? 'Play liked songs' : 'Open your library'}
                onPress={() => {
                  if (likedSongs.length) void playSong(likedSongs[0], likedSongs);
                  else router.push('/(tabs)/library');
                }}
                style={({ pressed }) => [styles.quickCard, { width: quickCardWidth }, pressed && styles.pressed]}
              >
                <View style={styles.likedArtwork}>
                  <Ionicons name="heart" size={18} color="#FFF" />
                </View>
                <Text numberOfLines={2} style={styles.quickTitle}>Liked Songs</Text>
              </Pressable>

              {quickPlaylists.map((playlist, index) => (
                <QuickPlaylistCard
                  key={String(playlist.id || playlist._id || `quick-${index}`)}
                  playlist={playlist}
                  width={quickCardWidth}
                  onPress={openPlaylist}
                />
              ))}
            </View>

            {!!error && (
              <Pressable onPress={() => void load()} style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
                <Text style={styles.retry}>Tap to retry</Text>
              </Pressable>
            )}

            {loading && !hasContent && (
              <HomeSkeleton />
            )}

            {!loading && (
              <>
                {!!trendingAlbums.length && (
                  <AlbumRail
                    title="Latest Albums"
                    albums={trendingAlbums}
                    onPress={openAlbum}
                  />
                )}

                {!!trendingSongs.length && (
                  <View style={styles.section}>
                    <View style={styles.topSongsHead}>
                      <View style={styles.sectionHeadCopy}>
                        <Text style={styles.sectionTitle}>Latest Songs</Text>
                        <Text numberOfLines={1} style={styles.sectionSubtitle}>
                          Fresh from the India chart · refreshed automatically ({trendingSongs.length} {trendingSongs.length === 1 ? 'song' : 'songs'})
                        </Text>
                      </View>
                      <View style={styles.chartActions}>
                        <Pressable
                          onPress={() => scrollTopSongs(-1)}
                          disabled={topColumnIndex === 0}
                          style={[styles.chartArrow, topColumnIndex === 0 && styles.chartArrowDisabled]}
                          accessibilityLabel="Previous top songs"
                        >
                          <Ionicons name="chevron-back" size={16} color={colors.text} />
                        </Pressable>
                        <Pressable
                          onPress={() => scrollTopSongs(1)}
                          disabled={topColumnIndex >= topColumns.length - 1}
                          style={[styles.chartArrow, topColumnIndex >= topColumns.length - 1 && styles.chartArrowDisabled]}
                          accessibilityLabel="Next top songs"
                        >
                          <Ionicons name="chevron-forward" size={16} color={colors.text} />
                        </Pressable>
                      </View>
                    </View>

                    <FlatList<Song[]>
                      ref={topSongsRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={topColumns}
                      keyExtractor={(_, index) => `top-column-${index}`}
                      initialNumToRender={2}
                      maxToRenderPerBatch={2}
                      windowSize={3}
                      snapToInterval={topColumnWidth + 10}
                      decelerationRate="fast"
                      contentContainerStyle={styles.chartRail}
                      getItemLayout={(_, index) => ({
                        length: topColumnWidth + 10,
                        offset: (topColumnWidth + 10) * index,
                        index,
                      })}
                      onMomentumScrollEnd={(event) => {
                        const next = Math.round(event.nativeEvent.contentOffset.x / (topColumnWidth + 10));
                        setTopColumnIndex(Math.max(0, Math.min(topColumns.length - 1, next)));
                      }}
                      renderItem={({ item: songs, index: columnIndex }) => (
                        <View style={[styles.chartColumn, { width: topColumnWidth }]}>
                          {songs.filter(Boolean).map((song, localIndex) => {
                            const songId = String(song.id || song.songId || song.sourceId || '');
                            const isCurrent = Boolean(currentSong?.id && String(currentSong.id) === songId);
                            return (
                              <Pressable
                                key={songId || `chart-song-${columnIndex}-${localIndex}`}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  isCurrent && isPlaying
                                    ? `Pause ${song.name || song.title || 'song'}`
                                    : `Play ${song.name || song.title || 'song'}`
                                }
                                onPress={() => {
                                  if (isCurrent) {
                                    void togglePlayback();
                                  } else {
                                    void playSong(song, trendingSongs);
                                  }
                                }}
                                style={({ pressed }) => [styles.chartRow, pressed && styles.pressed]}
                              >
                                <View style={styles.chartArtworkWrap}>
                                  <TrackArtwork song={song} size={52} radius={10} />
                                  {isCurrent && (
                                    <View style={styles.chartPlaybackOverlay}>
                                      <Ionicons
                                        name={isPlaying ? 'pause' : 'play'}
                                        size={18}
                                        color="#FFF"
                                      />
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.chartNumber}>{columnIndex * 4 + localIndex + 1}</Text>
                                <View style={styles.chartCopy}>
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.chartTitle,
                                      isCurrent && styles.chartTitleActive,
                                    ]}
                                  >
                                    {song.name || song.title || 'Untitled Track'}
                                  </Text>
                                  <Text numberOfLines={1} style={styles.chartArtist}>{artistNames(song)}</Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    />
                  </View>
                )}

                {!!recentSongs.length && (
                  <SongRail
                    title="Recently Played"
                    songs={recentSongs}
                    currentSongId={currentSong?.id}
                    onPress={playRecentSong}
                  />
                )}

                {!!recentPlaylists.length && (
                  <PlaylistRail
                    title="Recently Played Playlists"
                    data={recentPlaylists}
                    onPress={openPlaylist}
                  />
                )}
              </>
            )}
          </>
        }
        renderItem={({ item: section }) => (
          <PlaylistRail
            key={String(section.id || section._id || section.name)}
            title={section.name}
            data={section.playlists || []}
            onPress={openPlaylist}
          />
        )}
        ListFooterComponent={
          <>
            {!!mixes.length && (
              <View style={styles.section}>
                <SectionHeader title="Recommended for You" />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={mixes}
                  keyExtractor={(item, index) => String(item._mixId || item.id || index)}
                  initialNumToRender={RAIL_INITIAL_RENDER}
                  maxToRenderPerBatch={RAIL_BATCH_SIZE}
                  windowSize={RAIL_WINDOW_SIZE}
                  contentContainerStyle={styles.rail}
                  renderItem={({ item }) => (
                    <PlaylistCard playlist={item} size={140} onPress={() => openMix(item)} />
                  )}
                />
              </View>
            )}

            {!hasContent && !error && !loading && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing to show yet</Text>
                <Text style={styles.emptyBody}>Pull to refresh the Harmonia catalog.</Text>
              </View>
            )}
          </>
        }
      />
    </SafeAreaView>
  );
}

const QuickPlaylistCard = memo(function QuickPlaylistCard({
  playlist,
  width,
  onPress,
}: {
  playlist: Playlist;
  width: number;
  onPress: (playlist: Playlist) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${playlist.name || playlist.title || 'playlist'}`}
      onPress={() => onPress(playlist)}
      style={({ pressed }) => [styles.quickCard, { width }, pressed && styles.pressed]}
    >
      <PlaylistArtwork playlist={playlist} size={52} radius={12} />
      <Text numberOfLines={2} style={styles.quickTitle}>
        {playlist.name || playlist.title || 'Playlist'}
      </Text>
    </Pressable>
  );
});

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const PlaylistRail = memo(function PlaylistRail({
  title,
  data,
  onPress,
}: {
  title: string;
  data: Playlist[];
  onPress: (playlist: Playlist) => void;
}) {
  if (!data.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(item, index) => String(item.id || item._id || `${title}-${index}`)}
        initialNumToRender={RAIL_INITIAL_RENDER}
        maxToRenderPerBatch={RAIL_BATCH_SIZE}
        windowSize={RAIL_WINDOW_SIZE}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => (
          <PlaylistCard playlist={item} size={140} onPress={() => onPress(item)} />
        )}
      />
    </View>
  );
});

const SongRail = memo(function SongRail({
  title,
  songs,
  currentSongId,
  onPress,
}: {
  title: string;
  songs: Song[];
  currentSongId?: string;
  onPress: (song: Song) => void;
}) {
  if (!songs.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={songs}
        keyExtractor={(item, index) => String(item.id || `recent-song-${index}`)}
        initialNumToRender={RAIL_INITIAL_RENDER}
        maxToRenderPerBatch={RAIL_BATCH_SIZE}
        windowSize={RAIL_WINDOW_SIZE}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => {
          const active = String(currentSongId || '') === String(item.id || '');
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.name || item.title || 'song'}`}
              onPress={() => onPress(item)}
              style={({ pressed }) => [styles.recentSongCard, pressed && styles.pressed]}
            >
              <TrackArtwork song={item} size={140} radius={8} />
              <Text numberOfLines={1} style={[styles.recentSongTitle, active && styles.recentSongTitleActive]}>
                {item.name || item.title || 'Untitled Track'}
              </Text>
              <Text numberOfLines={1} style={styles.recentSongArtist}>{artistNames(item)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
});

const AlbumRail = memo(function AlbumRail({
  title,
  albums,
  onPress,
}: {
  title: string;
  albums: HarmoniaAlbum[];
  onPress: (album: HarmoniaAlbum) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={albums}
        keyExtractor={(item, index) => String(item.id || `album-${index}`)}
        initialNumToRender={RAIL_INITIAL_RENDER}
        maxToRenderPerBatch={RAIL_BATCH_SIZE}
        windowSize={RAIL_WINDOW_SIZE}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => {
          const cover = entityImageUrl(item, 140);
          return (
            <Pressable
              onPress={() => onPress(item)}
              style={({ pressed }) => [styles.albumCard, pressed && styles.pressed]}
            >
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={styles.albumArtwork}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.albumArtwork, styles.albumFallback]}>
                  <Ionicons name="disc-outline" size={34} color="#666" />
                </View>
              )}
              <Text numberOfLines={1} style={styles.albumTitle}>{albumTitle(item)}</Text>
              <Text numberOfLines={1} style={styles.albumMeta}>
                {item.primaryArtists || item.year || 'Album'}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
});

function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonRail}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.skeletonCard}>
                <View style={styles.skeletonArtwork} />
                <View style={styles.skeletonLine} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  ambientBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  // Web layout's fixed saffron glow: top-left radial gradient
  glowSaffron: {
    top: -140,
    left: -140,
    backgroundColor: colors.glowSaffron,
  },
  // Web layout's emerald glow drifting from the lower right
  glowEmerald: {
    bottom: -120,
    right: -140,
    backgroundColor: colors.glowEmerald,
  },
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 4,
  },
  // Web section headers: text-xl/2xl font-bold tracking-tight text-foreground
  topTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  // Web QuickAccessCards: h-14 rounded-2xl bg-card/40 p-1 pr-3 with
  // hairline border-border/10 on the artwork
  quickCard: {
    minHeight: 56,
    borderRadius: 16,
    padding: 4,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardTranslucent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.4)',
  },
  // Liked Songs artwork stays a solid vivid tile like the web gradient cover
  likedArtwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDark,
  },
  quickTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    marginLeft: 10,
  },
  section: { marginBottom: 24 },
  sectionHead: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 1,
  },
  sectionHeadCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  sectionTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rail: { paddingHorizontal: 1, paddingBottom: 1 },
  recentSongCard: { width: 140, marginRight: 16 },
  recentSongTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 8 },
  recentSongTitleActive: { color: colors.accent },
  recentSongArtist: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  albumCard: { width: 140, marginRight: 16 },
  // Web playlist cards: rounded-lg (8px) square artwork with shadow-md
  albumArtwork: { width: 140, height: 140, borderRadius: 8, backgroundColor: colors.surface },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 10 },
  albumMeta: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 2 },
  topSongsHead: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  chartActions: { flexDirection: 'row', gap: 6 },
  // Web chart arrows: h-8 w-8 rounded-full bg-secondary/60 text-foreground
  chartArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(36,36,36,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartArrowDisabled: { opacity: 0.35 },
  chartRail: { gap: 10, paddingRight: 8 },
  chartColumn: { gap: 6 },
  chartArtworkWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.35)',
  },
  chartPlaybackOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // Web TrendingSongs rows: p-2 rounded-2xl bg-card/40 border-border/20
  chartRow: {
    minHeight: 60,
    borderRadius: 16,
    backgroundColor: colors.cardTranslucent,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.3)',
  },
  chartNumber: {
    width: 26,
    textAlign: 'right',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chartCopy: { flex: 1, minWidth: 0, paddingRight: 4, marginLeft: 10 },
  chartTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  chartTitleActive: { color: colors.accent, fontWeight: '700' },
  chartArtist: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  errorBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,114,127,0.22)',
    backgroundColor: 'rgba(84,28,21,0.28)',
    padding: 14,
    marginBottom: 18,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  retry: { color: colors.muted, fontSize: 11, marginTop: 4 },
  empty: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: colors.muted, fontSize: 11, marginTop: 5 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  skeletonWrap: { paddingTop: 2 },
  skeletonTitle: { width: 140, height: 20, borderRadius: 6, backgroundColor: colors.surface, marginBottom: 9 },
  skeletonRail: { flexDirection: 'row', gap: 12 },
  skeletonCard: { width: 140 },
  skeletonArtwork: { width: 140, height: 140, borderRadius: 8, backgroundColor: colors.surface },
  skeletonLine: { width: 90, height: 10, borderRadius: 4, backgroundColor: colors.surface, marginTop: 8 },
});

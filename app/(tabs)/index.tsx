import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import { albumTitle, imageUrl } from '@/src/lib/entities';
import { artistNames } from '@/src/lib/song';
import { RAIL_BATCH_SIZE, RAIL_INITIAL_RENDER, RAIL_WINDOW_SIZE } from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import {
  usePlaybackHistory,
  usePlayer,
  type PlaybackHistoryEntry,
} from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, MusicSection, Playlist, RecommendedMix, Song } from '@/src/types';

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
  const { currentSong, playSong } = usePlayer();
  const { history } = usePlaybackHistory();

  const [sections, setSections] = useState<MusicSection[]>([]);
  const [recentPlaylists, setRecentPlaylists] = useState<Playlist[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [trendingAlbums, setTrendingAlbums] = useState<HarmoniaAlbum[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topColumnIndex, setTopColumnIndex] = useState(0);
  const loadGenerationRef = useRef(0);
  const topSongsRef = useRef<FlatList<Song[]> | null>(null);
  const recentSongs = useMemo(() => uniqueRecentSongs(history), [history]);
  const quickCardWidth = Math.floor((width - 32) / 2);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [publicResult, recentResult, mixResult, trendingResult] = await Promise.allSettled([
      fetchHomeSections({ forceRefresh: refresh }),
      token ? fetchRecentlyPlayedPlaylists(token) : Promise.resolve<Playlist[]>([]),
      token ? fetchRecommendedMixes(token) : Promise.resolve<RecommendedMix[]>([]),
      fetchTrendingHomeContent({ forceRefresh: refresh }),
    ]);

    if (generation !== loadGenerationRef.current) return;

    if (publicResult.status === 'fulfilled') {
      setSections(publicResult.value);
    } else {
      setError(publicResult.reason?.message || 'Unable to load music');
    }

    setRecentPlaylists(recentResult.status === 'fulfilled' ? recentResult.value : []);
    setMixes(mixResult.status === 'fulfilled' ? mixResult.value : []);

    if (trendingResult.status === 'fulfilled') {
      setTrendingAlbums(trendingResult.value.albums);
      setTrendingSongs(trendingResult.value.songs);
    } else {
      setTrendingAlbums([]);
      setTrendingSongs([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

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
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Discover</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.textStrong}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
      >
        <View pointerEvents="none" style={styles.ambientGlow} />

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
                  <Ionicons name="heart" size={20} color="#FF3B4D" />
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

            {loading && !hasContent ? (
              <HomeSkeleton />
            ) : (
              <>
                {!!trendingAlbums.length && (
                  <AlbumRail
                    title="Trending Albums"
                    albums={trendingAlbums}
                    onPress={openAlbum}
                  />
                )}

                {!!trendingSongs.length && (
                  <View style={styles.section}>
                    <View style={styles.topSongsHead}>
                      <View style={styles.sectionHeadCopy}>
                        <Text style={styles.sectionTitle}>Top Songs</Text>
                        <Text numberOfLines={1} style={styles.sectionSubtitle}>
                          The most popular tracks right now ({trendingSongs.length} {trendingSongs.length === 1 ? 'song' : 'songs'})
                        </Text>
                      </View>
                      <View style={styles.chartActions}>
                        <Pressable
                          onPress={() => scrollTopSongs(-1)}
                          disabled={topColumnIndex === 0}
                          style={[styles.chartArrow, topColumnIndex === 0 && styles.chartArrowDisabled]}
                          accessibilityLabel="Previous top songs"
                        >
                          <Ionicons name="chevron-back" size={18} color="#DADADA" />
                        </Pressable>
                        <Pressable
                          onPress={() => scrollTopSongs(1)}
                          disabled={topColumnIndex >= topColumns.length - 1}
                          style={[styles.chartArrow, topColumnIndex >= topColumns.length - 1 && styles.chartArrowDisabled]}
                          accessibilityLabel="Next top songs"
                        >
                          <Ionicons name="chevron-forward" size={18} color="#DADADA" />
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
                          {songs.map((song, localIndex) => (
                            <Pressable
                              key={String(song.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Play ${song.name || 'song'}`}
                              onPress={() => void playSong(song, trendingSongs)}
                              style={({ pressed }) => [styles.chartRow, pressed && styles.pressed]}
                            >
                              <TrackArtwork song={song} size={52} radius={8} />
                              <Text style={styles.chartNumber}>{columnIndex * 4 + localIndex + 1}</Text>
                              <View style={styles.chartCopy}>
                                <Text numberOfLines={1} style={styles.chartTitle}>{song.name}</Text>
                                <Text numberOfLines={1} style={styles.chartArtist}>{artistNames(song)}</Text>
                              </View>
                            </Pressable>
                          ))}
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

                {sections.map((section) => (
                  <PlaylistRail
                    key={String(section.id || section._id || section.name)}
                    title={section.name}
                    data={section.playlists || []}
                    onPress={openPlaylist}
                  />
                ))}

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

                {!hasContent && !error && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>Nothing to show yet</Text>
                    <Text style={styles.emptyBody}>Pull to refresh the Harmonia catalog.</Text>
                  </View>
                )}
              </>
            )}
      </ScrollView>
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
          const cover = imageUrl(item.image as any, 140);
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
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(18,18,18,0.88)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(41,41,41,0.35)',
    zIndex: 4,
  },
  topTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: -12,
    right: -12,
    height: 260,
    backgroundColor: 'rgba(69,10,245,0.10)',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickCard: {
    minHeight: 56,
    borderRadius: 12,
    padding: 2,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(23,23,23,0.84)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.56)',
  },
  likedArtwork: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#450AF5',
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
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rail: { paddingHorizontal: 1, paddingBottom: 1 },
  recentSongCard: { width: 140, marginRight: 16 },
  recentSongTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '600', marginTop: 8 },
  recentSongTitleActive: { color: colors.accentBright },
  recentSongArtist: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  albumCard: { width: 140, marginRight: 16 },
  albumArtwork: { width: 140, height: 140, borderRadius: 12, backgroundColor: colors.surface },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '600', marginTop: 8 },
  albumMeta: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '400', marginTop: 2 },
  topSongsHead: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  chartActions: { flexDirection: 'row', gap: 6 },
  chartArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartArrowDisabled: { opacity: 0.35 },
  chartRail: { gap: 10, paddingRight: 8 },
  chartColumn: { gap: 6 },
  chartRow: {
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(23,23,23,0.84)',
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.46)',
  },
  chartNumber: {
    width: 28,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chartCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  chartTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  chartArtist: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  errorBox: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,114,127,0.22)',
    backgroundColor: 'rgba(84,28,21,0.28)',
    padding: 14,
    marginBottom: 18,
  },
  error: { color: '#FCA5A5', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  retry: { color: colors.muted, fontSize: 11, marginTop: 4 },
  empty: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 11, marginTop: 5 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  skeletonWrap: { paddingTop: 2 },
  skeletonTitle: { width: 140, height: 20, borderRadius: 6, backgroundColor: colors.surface, marginBottom: 9 },
  skeletonRail: { flexDirection: 'row', gap: 12 },
  skeletonCard: { width: 140 },
  skeletonArtwork: { width: 140, height: 140, borderRadius: 12, backgroundColor: colors.surface },
  skeletonLine: { width: 90, height: 10, borderRadius: 4, backgroundColor: colors.surface, marginTop: 8 },
});

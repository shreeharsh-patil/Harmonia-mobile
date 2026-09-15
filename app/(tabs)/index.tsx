import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, MusicSection, Playlist, RecommendedMix, Song } from '@/src/types';


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const { likedSongs } = useLibrary();
  const { currentSong, playSong } = usePlayer();

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

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [publicResult, recentResult, mixResult, trendingResult] = await Promise.allSettled([
      fetchHomeSections(),
      token ? fetchRecentlyPlayedPlaylists(token) : Promise.resolve<Playlist[]>([]),
      token ? fetchRecommendedMixes(token) : Promise.resolve<RecommendedMix[]>([]),
      fetchTrendingHomeContent(),
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
  }, [load]);

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  const openAlbum = (album: HarmoniaAlbum) => {
    const id = String(album.id || '');
    if (!id) return;
    router.push({ pathname: '/album/[id]', params: { id } });
  };

  const openMix = (mix: RecommendedMix) => {
    const id = String(mix._mixId || mix.id || '');
    if (!id) return;
    router.push({ pathname: '/mix/[id]', params: { id } });
  };

  const featuredFallback = useMemo(
    () => sections.flatMap((section) => section.playlists || []).slice(0, 5),
    [sections]
  );

  const quickPlaylists = recentPlaylists.length
    ? recentPlaylists.slice(0, 5)
    : featuredFallback;

  const topColumns = useMemo(() => {
    const columns: Song[][] = [];
    for (let index = 0; index < trendingSongs.length; index += 4) {
      columns.push(trendingSongs.slice(index, index + 4));
    }
    return columns;
  }, [trendingSongs]);

  const topColumnWidth = Math.min(342, Math.max(282, width - 54));

  const scrollTopSongs = (direction: -1 | 1) => {
    if (!topColumns.length) return;
    const nextIndex = Math.max(0, Math.min(topColumns.length - 1, topColumnIndex + direction));
    setTopColumnIndex(nextIndex);
    topSongsRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const hasContent =
    sections.some((section) => section.playlists?.length) ||
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
                onPress={() => {
                  if (likedSongs.length) void playSong(likedSongs[0], likedSongs);
                  else router.push('/(tabs)/library');
                }}
                style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
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
                  onPress={() => openPlaylist(playlist)}
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
                          The most popular tracks right now ({trendingSongs.length} songs)
                        </Text>
                      </View>
                      <View style={styles.chartActions}>
                        <Pressable
                          onPress={() => scrollTopSongs(-1)}
                          disabled={topColumnIndex === 0}
                          style={[styles.chartArrow, topColumnIndex === 0 && styles.chartArrowDisabled]}
                          accessibilityLabel="Previous top songs"
                        >
                          <Ionicons name="chevron-back" size={16} color="#DADADA" />
                        </Pressable>
                        <Pressable
                          onPress={() => scrollTopSongs(1)}
                          disabled={topColumnIndex >= topColumns.length - 1}
                          style={[styles.chartArrow, topColumnIndex >= topColumns.length - 1 && styles.chartArrowDisabled]}
                          accessibilityLabel="Next top songs"
                        >
                          <Ionicons name="chevron-forward" size={16} color="#DADADA" />
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
                              onPress={() => void playSong(song, trendingSongs)}
                              style={({ pressed }) => [styles.chartRow, pressed && styles.pressed]}
                            >
                              <TrackArtwork song={song} size={46} radius={8} />
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

                {!!recentPlaylists.length && (
                  <PlaylistRail
                    title="Recently Played"
                    data={recentPlaylists}
                    onPress={openPlaylist}
                    showAll
                  />
                )}

                {sections.map((section) => (
                  <PlaylistRail
                    key={String(section.id || section._id || section.name)}
                    title={section.name}
                    data={section.playlists || []}
                    onPress={openPlaylist}
                    showAll
                  />
                ))}

                {!!mixes.length && (
                  <View style={styles.section}>
                    <SectionHeader title="Recommended for You" showAll />
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
                        <PlaylistCard playlist={item} size={116} onPress={() => openMix(item)} />
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

function QuickPlaylistCard({
  playlist,
  onPress,
}: {
  playlist: Playlist;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
    >
      <PlaylistArtwork playlist={playlist} size={44} radius={7} />
      <Text numberOfLines={2} style={styles.quickTitle}>
        {playlist.name || playlist.title || 'Playlist'}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ title, showAll = false }: { title: string; showAll?: boolean }) {
  return (
    <View style={styles.sectionHead}>
      <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
      {showAll && (
        <Pressable onPress={() => router.push('/(tabs)/search')} hitSlop={8}>
          <Text style={styles.showAll}>Show all</Text>
        </Pressable>
      )}
    </View>
  );
}

function PlaylistRail({
  title,
  data,
  onPress,
  showAll = false,
}: {
  title: string;
  data: Playlist[];
  onPress: (playlist: Playlist) => void;
  showAll?: boolean;
}) {
  if (!data.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} showAll={showAll} />
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
          <PlaylistCard playlist={item} size={116} onPress={() => onPress(item)} />
        )}
      />
    </View>
  );
}

function AlbumRail({
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
          const cover = imageUrl(item.image as any, 116);
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
}

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
  safe: { flex: 1, backgroundColor: '#0C0C0C' },
  topBar: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#242424',
    backgroundColor: '#0D0D0D',
    zIndex: 4,
  },
  topTitle: {
    color: '#EDEDED',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  ambientGlow: {
    position: 'absolute',
    top: -70,
    left: -50,
    width: 270,
    height: 220,
    borderRadius: 140,
    backgroundColor: 'rgba(69,10,245,0.08)',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 20,
  },
  quickCard: {
    width: '49%',
    minHeight: 48,
    borderRadius: 8,
    padding: 2,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  likedArtwork: {
    width: 44,
    height: 44,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A65F2',
  },
  quickTitle: {
    flex: 1,
    minWidth: 0,
    color: '#E7E7E7',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    marginLeft: 7,
  },
  section: { marginBottom: 24 },
  sectionHead: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 1,
  },
  sectionHeadCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  sectionTitle: {
    flexShrink: 1,
    color: '#F0F0F0',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  sectionSubtitle: { color: '#777', fontSize: 9, marginTop: 1 },
  showAll: { color: '#8F8F8F', fontSize: 10, fontWeight: '700' },
  rail: { paddingHorizontal: 1, paddingBottom: 1 },
  albumCard: { width: 116, marginRight: 12 },
  albumArtwork: { width: 116, height: 116, borderRadius: 8, backgroundColor: '#171717' },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { color: '#E8E8E8', fontSize: 11, fontWeight: '700', marginTop: 7 },
  albumMeta: { color: '#777', fontSize: 9, fontWeight: '500', marginTop: 2 },
  topSongsHead: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  chartActions: { flexDirection: 'row', gap: 6 },
  chartArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartArrowDisabled: { opacity: 0.35 },
  chartRail: { gap: 10, paddingRight: 8 },
  chartColumn: { gap: 6 },
  chartRow: {
    minHeight: 58,
    borderRadius: 11,
    backgroundColor: '#111111',
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartNumber: {
    width: 24,
    textAlign: 'center',
    color: '#7A7A7A',
    fontSize: 10,
    fontWeight: '800',
  },
  chartCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  chartTitle: { color: '#ECECEC', fontSize: 11, fontWeight: '800' },
  chartArtist: { color: '#777', fontSize: 9, marginTop: 2 },
  errorBox: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,114,127,0.22)',
    backgroundColor: 'rgba(84,28,21,0.28)',
    padding: 10,
    marginBottom: 18,
  },
  error: { color: colors.danger, fontSize: 11, fontWeight: '600' },
  retry: { color: colors.muted, fontSize: 9, marginTop: 3 },
  empty: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#E7E7E7', fontSize: 15, fontWeight: '800' },
  emptyBody: { color: '#777', fontSize: 11, marginTop: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  skeletonWrap: { paddingTop: 2 },
  skeletonTitle: { width: 140, height: 20, borderRadius: 6, backgroundColor: '#171717', marginBottom: 9 },
  skeletonRail: { flexDirection: 'row', gap: 12 },
  skeletonCard: { width: 116 },
  skeletonArtwork: { width: 116, height: 116, borderRadius: 8, backgroundColor: '#171717' },
  skeletonLine: { width: 90, height: 10, borderRadius: 4, backgroundColor: '#171717', marginTop: 8 },
});

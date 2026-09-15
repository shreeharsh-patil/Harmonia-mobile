import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  fetchHomeSections,
  fetchRecentlyPlayedPlaylists,
  fetchRecommendedMixes,
} from '@/src/lib/api';
import { RAIL_BATCH_SIZE, RAIL_INITIAL_RENDER, RAIL_WINDOW_SIZE } from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { MusicSection, Playlist, RecommendedMix } from '@/src/types';

type FeedTab = 'all' | 'music';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { likedSongs } = useLibrary();
  const { currentSong, playSong } = usePlayer();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [recentPlaylists, setRecentPlaylists] = useState<Playlist[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [publicResult, recentResult, mixResult] = await Promise.allSettled([
      fetchHomeSections(),
      token ? fetchRecentlyPlayedPlaylists(token) : Promise.resolve<Playlist[]>([]),
      token ? fetchRecommendedMixes(token) : Promise.resolve<RecommendedMix[]>([]),
    ]);

    if (generation !== loadGenerationRef.current) return;

    if (publicResult.status === 'fulfilled') {
      setSections(publicResult.value);
    } else {
      setError(publicResult.reason?.message || 'Unable to load music');
    }

    setRecentPlaylists(recentResult.status === 'fulfilled' ? recentResult.value : []);
    setMixes(mixResult.status === 'fulfilled' ? mixResult.value : []);
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
  const hasContent =
    sections.some((section) => section.playlists?.length) ||
    recentPlaylists.length > 0 ||
    mixes.length > 0;
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

        <View style={styles.feedTabs}>
          {(['all', 'music'] as FeedTab[]).map((tab) => {
            const active = activeFeedTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveFeedTab(tab)}
                style={[styles.feedPill, active && styles.feedPillActive]}
              >
                <Text style={[styles.feedPillText, active && styles.feedPillTextActive]}>
                  {tab === 'all' ? 'All' : 'Music'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.quickGrid}>
          <Pressable
            onPress={() => {
              if (likedSongs.length) void playSong(likedSongs[0], likedSongs);
              else router.push('/(tabs)/library');
            }}
            style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
          >
            <View style={styles.likedArtwork}>
              <Ionicons name="heart" size={22} color="#EF4444" />
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
            {!!recentPlaylists.length && (
              <PlaylistRail
                title="Recently Played"
                data={recentPlaylists}
                onPress={openPlaylist}
              />
            )}

            {!!mixes.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Recommended for You</Text>
                </View>
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
                    <PlaylistCard playlist={item} onPress={() => openMix(item)} />
                  )}
                />
              </View>
            )}

            {sections.map((section) => (
              <PlaylistRail
                key={String(section.id || section._id || section.name)}
                title={section.name}
                data={section.playlists || []}
                onPress={openPlaylist}
              />
            ))}

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
      <PlaylistArtwork playlist={playlist} size={48} radius={12} />
      <Text numberOfLines={2} style={styles.quickTitle}>
        {playlist.name || playlist.title || 'Playlist'}
      </Text>
    </Pressable>
  );
}

function PlaylistRail({
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
      <View style={styles.sectionHead}>
        <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
      </View>
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
          <PlaylistCard playlist={item} onPress={() => onPress(item)} />
        )}
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
                <View style={styles.skeletonLineShort} />
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
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.96)',
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
    paddingTop: 14,
  },
  ambientGlow: {
    position: 'absolute',
    top: -90,
    left: -70,
    width: 300,
    height: 260,
    borderRadius: 150,
    backgroundColor: 'rgba(69,10,245,0.08)',
  },
  feedTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  feedPill: {
    minHeight: 30,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,10,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedPillActive: {
    backgroundColor: colors.textStrong,
    borderColor: colors.textStrong,
  },
  feedPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  feedPillTextActive: {
    color: colors.background,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickCard: {
    width: '48.7%',
    minHeight: 56,
    borderRadius: 16,
    padding: 4,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,10,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  likedArtwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
  },
  quickTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    marginLeft: 9,
  },
  section: { marginBottom: 28 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rail: { paddingHorizontal: 2, paddingBottom: 2 },
  errorBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,114,127,0.22)',
    backgroundColor: 'rgba(84,28,21,0.28)',
    padding: 12,
    marginBottom: 20,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  retry: { color: colors.muted, fontSize: 11, marginTop: 4 },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyBody: { color: colors.muted, fontSize: 13, marginTop: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  skeletonWrap: { paddingTop: 2 },
  skeletonTitle: {
    width: 160,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 12,
  },
  skeletonRail: { flexDirection: 'row', gap: 16 },
  skeletonCard: { width: 140 },
  skeletonArtwork: {
    width: 140,
    height: 140,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  skeletonLine: {
    width: 112,
    height: 12,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    marginTop: 10,
  },
  skeletonLineShort: {
    width: 76,
    height: 9,
    borderRadius: 4,
    backgroundColor: colors.surface,
    marginTop: 5,
  },
});

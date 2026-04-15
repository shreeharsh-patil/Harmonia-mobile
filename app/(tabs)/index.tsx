import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
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
import { TrackArtwork } from '@/src/components/TrackArtwork';
import {
  fetchHomeSections,
  fetchRecentlyPlayedPlaylists,
  fetchRecommendedMixes,
} from '@/src/lib/api';
import { artistNames } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { MusicSection, Playlist, RecommendedMix } from '@/src/types';

export default function HomeScreen() {
  const { token, user } = useAuth();
  const { likedSongs } = useLibrary();
  const { currentSong, togglePlayback, isPlaying, playSong } = usePlayer();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [recentPlaylists, setRecentPlaylists] = useState<Playlist[]>([]);
  const [mixes, setMixes] = useState<RecommendedMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const publicSections = await fetchHomeSections();
      setSections(publicSections);

      if (token) {
        const [recentResult, mixResult] = await Promise.allSettled([
          fetchRecentlyPlayedPlaylists(token),
          fetchRecommendedMixes(token),
        ]);
        if (recentResult.status === 'fulfilled') setRecentPlaylists(recentResult.value);
        if (mixResult.status === 'fulfilled') setMixes(mixResult.value);
      } else {
        setRecentPlaylists([]);
        setMixes([]);
      }
    } catch (cause: any) {
      setError(cause?.message || 'Unable to load music');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

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

  const hasContent = sections.some((section) => section.playlists?.length) || recentPlaylists.length || mixes.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFF" />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>HARMONIA</Text>
            <Text style={styles.heading}>{user?.name ? `For ${user.name.split(' ')[0]}.` : 'Listen to something good.'}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
            <Text style={styles.avatarText}>{String(user?.name || 'H').trim().charAt(0).toUpperCase() || 'H'}</Text>
          </Pressable>
        </View>

        {currentSong && (
          <Pressable onPress={() => router.push('/player')} style={styles.resume}>
            <TrackArtwork song={currentSong} size={62} radius={12} />
            <View style={styles.resumeCopy}>
              <Text style={styles.resumeLabel}>CONTINUE LISTENING</Text>
              <Text numberOfLines={1} style={styles.resumeTitle}>{currentSong.name}</Text>
              <Text numberOfLines={1} style={styles.resumeArtist}>{artistNames(currentSong)}</Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                void togglePlayback();
              }}
              style={styles.resumeButton}
            >
              <Text style={styles.resumeButtonText}>{isPlaying ? 'Ⅱ' : '▶'}</Text>
            </Pressable>
          </Pressable>
        )}

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
            {!!token && !!likedSongs.length && (
              <View style={styles.quick}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Quick access</Text>
                  <Text style={styles.sectionMeta}>Liked Songs</Text>
                </View>
                <Pressable
                  onPress={() => void playSong(likedSongs[0], likedSongs)}
                  style={styles.likedQuick}
                >
                  <View style={styles.likedIcon}><Text style={styles.likedIconText}>♥</Text></View>
                  <View style={styles.likedCopy}>
                    <Text style={styles.likedTitle}>Liked Songs</Text>
                    <Text style={styles.likedMeta}>{likedSongs.length} saved tracks</Text>
                  </View>
                  <Text style={styles.quickPlay}>▶</Text>
                </Pressable>
              </View>
            )}

            {!!recentPlaylists.length && (
              <PlaylistRail title="Recently played" data={recentPlaylists} onPress={openPlaylist} />
            )}

            {!!mixes.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Made for you</Text>
                  <Text style={styles.sectionMeta}>{mixes.length}</Text>
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={mixes}
                  keyExtractor={(item, index) => String(item._mixId || item.id || index)}
                  renderItem={({ item }) => <PlaylistCard playlist={item} onPress={() => openMix(item)} />}
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

function PlaylistRail({ title, data, onPress }: { title: string; data: Playlist[]; onPress: (playlist: Playlist) => void }) {
  if (!data.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{data.length}</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(item, index) => String(item.id || item._id || `${title}-${index}`)}
        renderItem={({ item }) => <PlaylistCard playlist={item} onPress={() => onPress(item)} />}
      />
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonRail}>
            {[0, 1].map((item) => (
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
  safe: { flex: 1, backgroundColor: '#070707' },
  content: { paddingHorizontal: 18, paddingBottom: 160 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 26 },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  eyebrow: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heading: { color: '#FFF', fontSize: 29, lineHeight: 33, fontWeight: '800', letterSpacing: -0.9, marginTop: 5, maxWidth: 290 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#EDEDED', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#080808', fontSize: 18, fontWeight: '900' },
  resume: { height: 82, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', backgroundColor: '#111', padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  resumeCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  resumeLabel: { color: '#5F5F5F', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  resumeTitle: { color: '#F4F4F4', fontSize: 15, fontWeight: '800', marginTop: 4 },
  resumeArtist: { color: '#7C7C7C', fontSize: 12, marginTop: 2 },
  resumeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  resumeButtonText: { color: '#080808', fontSize: 17, fontWeight: '900' },
  quick: { marginBottom: 28 },
  likedQuick: { height: 68, backgroundColor: '#111', borderWidth: StyleSheet.hairlineWidth, borderColor: '#282828', borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11 },
  likedIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E9E9E9', alignItems: 'center', justifyContent: 'center' },
  likedIconText: { color: '#101010', fontSize: 19 },
  likedCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  likedTitle: { color: '#F0F0F0', fontSize: 14, fontWeight: '800' },
  likedMeta: { color: '#707070', fontSize: 11, marginTop: 3 },
  quickPlay: { color: '#EDEDED', fontSize: 17, paddingHorizontal: 8 },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F4F4F4', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: '#555', fontSize: 11, fontWeight: '700' },
  errorBox: { borderRadius: 14, backgroundColor: '#171010', padding: 14, marginBottom: 22 },
  error: { color: '#EE8A8A', fontSize: 13, fontWeight: '600' },
  retry: { color: '#777', fontSize: 11, marginTop: 4 },
  empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#DDD', fontSize: 17, fontWeight: '800' },
  emptyBody: { color: '#686868', fontSize: 13, marginTop: 5 },
  skeletonTitle: { width: 130, height: 20, borderRadius: 7, backgroundColor: '#141414', marginBottom: 13 },
  skeletonRail: { flexDirection: 'row', gap: 14 },
  skeletonCard: { width: 148 },
  skeletonArtwork: { width: 148, height: 148, borderRadius: 16, backgroundColor: '#111' },
  skeletonLine: { width: 112, height: 12, borderRadius: 5, backgroundColor: '#141414', marginTop: 10 },
  skeletonLineShort: { width: 76, height: 9, borderRadius: 4, backgroundColor: '#101010', marginTop: 6 },
});

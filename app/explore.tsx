import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { SongRow } from '@/src/components/SongRow';
import { fetchHomeSections, searchMusic } from '@/src/lib/api';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { MusicSection, Playlist, Song } from '@/src/types';

const DISCOVERY_FILTERS = [
  'Trending',
  'Hindi',
  'English',
  'Punjabi',
  'Chill',
  'Workout',
  'Indie',
  'Devotional',
] as const;

export default function ExploreScreen() {
  const { playSong, currentSong } = usePlayer();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [filter, setFilter] = useState<(typeof DISCOVERY_FILTERS)[number]>('Trending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    const [sectionsResult, searchResult] = await Promise.allSettled([
      fetchHomeSections(),
      searchMusic(filter, 24),
    ]);

    if (sectionsResult.status === 'fulfilled') {
      setSections(sectionsResult.value);
    }

    if (searchResult.status === 'fulfilled') {
      setSongs(searchResult.value.songs.results || []);
    } else {
      setSongs([]);
    }

    if (sectionsResult.status === 'rejected' && searchResult.status === 'rejected') {
      setError(searchResult.reason?.message || sectionsResult.reason?.message || 'Unable to load Explore');
    }

    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSections = useMemo(
    () => sections.filter((section) => section.playlists?.length).slice(0, 8),
    [sections]
  );

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={23} color="#F4F4F4" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DISCOVER</Text>
          <Text style={styles.title}>Explore</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.iconButton} accessibilityLabel="Search">
          <Ionicons name="search" size={21} color="#F4F4F4" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFF" />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionLabel}>PICK A VIBE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {DISCOVERY_FILTERS.map((item) => {
            const active = item === filter;
            return (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? (
          <Pressable onPress={() => void load()} style={styles.errorBox}>
            <Text style={styles.errorTitle}>Explore is unavailable</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        ) : null}

        {loading && !songs.length && !visibleSections.length ? (
          <View style={styles.loader}>
            <ActivityIndicator color="#FFF" />
            <Text style={styles.loaderText}>Finding music…</Text>
          </View>
        ) : (
          <>
            {!!songs.length && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <View>
                    <Text style={styles.sectionTitle}>{filter}</Text>
                    <Text style={styles.sectionSubtitle}>Tracks picked from Harmonia's available catalog and direct providers.</Text>
                  </View>
                  <Text style={styles.sectionCount}>{songs.length}</Text>
                </View>
                <View style={styles.songGroup}>
                  {songs.slice(0, 12).map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      active={currentSong?.id === song.id}
                      onPress={() => void playSong(song, songs)}
                    />
                  ))}
                </View>
              </View>
            )}

            {visibleSections.map((section) => (
              <View key={String(section.id || section._id || section.name)} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{section.name}</Text>
                  <Text style={styles.sectionCount}>{section.playlists.length}</Text>
                </View>
                <FlatList
                  horizontal
                  data={section.playlists}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item, index) => String(item.id || item._id || `${section.name}-${index}`)}
                  renderItem={({ item }) => (
                    <PlaylistCard playlist={item} onPress={() => openPlaylist(item)} />
                  )}
                />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
  headerCopy: { flex: 1, minWidth: 0 },
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
  sectionLabel: {
    color: '#5F5F5F',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 18,
  },
  filters: { gap: 8, paddingHorizontal: 18, paddingBottom: 10 },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 15,
    borderRadius: 18,
    backgroundColor: '#121212',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: '#EFEFEF', borderColor: '#EFEFEF' },
  filterText: { color: '#888', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#080808' },
  section: { marginTop: 26 },
  sectionHead: {
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { color: '#F1F1F1', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionSubtitle: { color: '#6E6E6E', fontSize: 11, lineHeight: 16, marginTop: 4, maxWidth: 310 },
  sectionCount: { color: '#5F5F5F', fontSize: 10, fontWeight: '800' },
  songGroup: { paddingHorizontal: 18 },
  loader: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { color: '#6E6E6E', fontSize: 12 },
  errorBox: {
    marginHorizontal: 18,
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#151010',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3B2020',
  },
  errorTitle: { color: '#E9B3B3', fontSize: 14, fontWeight: '800' },
  errorBody: { color: '#A67676', fontSize: 12, lineHeight: 18, marginTop: 5 },
  retry: { color: '#D7D7D7', fontSize: 11, fontWeight: '800', marginTop: 9 },
});

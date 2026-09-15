import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { RECENT_SEARCHES_KEY } from '@/src/config';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { searchMusic } from '@/src/lib/api';
import { albumTitle, artistTitle, imageUrl } from '@/src/lib/entities';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, SearchPayload, Song } from '@/src/types';

const MAX_RECENT_SEARCHES = 10;

type BrowseCategory = {
  id: string;
  name: string;
  query: string;
  color: string;
  coverImage: string;
};

const BROWSE_CATEGORIES: BrowseCategory[] = [
  { id: 'hindi', name: 'Hindi', query: 'Hindi Hits', color: '#A47C34', coverImage: 'https://c.saavncdn.com/editorial/charts_Hindi1990s_136920_20240408061858_500x500.jpg' },
  { id: 'english', name: 'English', query: 'English Hits', color: '#687880', coverImage: 'https://c.saavncdn.com/editorial/EnglishNurseryRhymes_20240902092448_500x500.jpg' },
  { id: 'new-releases', name: 'New Releases', query: 'New Releases', color: '#3C4044', coverImage: 'https://c.saavncdn.com/editorial/TaazaTunes_20260626100440_500x500.jpg' },
  { id: 'summer', name: 'Summer', query: 'Summer Hits', color: '#9C9470', coverImage: 'https://c.saavncdn.com/editorial/RetroChill_20250626045906_500x500.jpg' },
  { id: 'pop', name: 'Pop', query: 'Pop Hits', color: '#148A08', coverImage: 'https://c.saavncdn.com/editorial/BestOfIndipopHindi_20260504065326_500x500.jpg' },
  { id: 'charts', name: 'Charts', query: 'Top Songs Global', color: '#8D67AB', coverImage: 'https://c.saavncdn.com/editorial/GlobalPop_20260608125844_500x500.jpg' },
  { id: 'punjabi', name: 'Punjabi', query: 'Punjabi Hits', color: '#B89047', coverImage: 'https://c.saavncdn.com/editorial/PunjabiHitSongs_20260409070056_500x500.jpg' },
  { id: 'telugu', name: 'Telugu', query: 'Telugu Hits', color: '#8C503C', coverImage: 'https://c.saavncdn.com/editorial/charts_Telugu1990s_157621_20240408063237_500x500.jpg' },
  { id: 'malayalam', name: 'Malayalam', query: 'Malayalam Hits', color: '#508C78', coverImage: 'https://c.saavncdn.com/editorial/charts_Malayalam2000s_160867_20240408063713_500x500.jpg' },
  { id: 'haryanvi', name: 'Haryanvi', query: 'Haryanvi Hits', color: '#B8A05C', coverImage: 'https://c.saavncdn.com/editorial/Haryanvi-IndiaSuperhitsTop50_20260626054333_500x500.jpg' },
  { id: 'bhojpuri', name: 'Bhojpuri', query: 'Bhojpuri Hits', color: '#5C78A0', coverImage: 'https://c.saavncdn.com/editorial/BhojpuriViralHits_20260610102957_500x500.jpg' },
  { id: 'ghazal', name: 'Ghazal', query: 'Ghazals', color: '#7C7C64', coverImage: 'https://c.saavncdn.com/editorial/BestOfGhazalsHindi_20260325065302_500x500.jpg' },
  { id: 'indie', name: 'Indie', query: 'Indian Indie', color: '#5C9078', coverImage: 'https://c.saavncdn.com/editorial/BestIndianLoFiHits_20241121053632_500x500.jpg' },
  { id: 'love', name: 'Love', query: 'Love Songs', color: '#E61E32', coverImage: 'https://c.saavncdn.com/editorial/MostStreamedLoveSongs-Hindi_20260629041408_500x500.jpg' },
  { id: 'trending', name: 'Trending', query: 'Trending', color: '#506080', coverImage: 'https://c.saavncdn.com/editorial/NowTrending_20260423085344_500x500.jpg' },
  { id: 'mood', name: 'Mood', query: 'Mood Booster', color: '#E1118C', coverImage: 'https://c.saavncdn.com/editorial/MidDayMoodBoosters_20250428092413_500x500.jpg' },
  { id: 'party', name: 'Party', query: 'Party Hits', color: '#AF2896', coverImage: 'https://c.saavncdn.com/editorial/BestOfDanceHindi_20260622051632_500x500.jpg' },
  { id: 'devotional', name: 'Devotional', query: 'Devotional Songs', color: '#3C647C', coverImage: 'https://c.saavncdn.com/editorial/Hanuman_20260401062920_500x500.jpg' },
  { id: 'decades', name: 'Decades', query: '90s Hits', color: '#BA5D07', coverImage: 'https://c.saavncdn.com/editorial/90sEvergreenHits_20241128053307_500x500.jpg' },
  { id: 'hip-hop', name: 'Hip-Hop', query: 'Hip Hop Hits', color: '#BC5900', coverImage: 'https://c.saavncdn.com/editorial/Let_sPlayEmiwayBantai_20240517065551_500x500.jpg' },
  { id: 'dance-electronic', name: 'Dance/Electronic', query: 'EDM Hits', color: '#D84000', coverImage: 'https://c.saavncdn.com/editorial/BestOfEDMHindi_20251003074023_500x500.jpg' },
  { id: 'student', name: 'Student', query: 'Student Study', color: '#7A5C54', coverImage: 'https://c.saavncdn.com/editorial/logo/StudyModeOn_99978252_20170706_500x500.jpg' },
  { id: 'chill', name: 'Chill', query: 'Chill Hits', color: '#477D95', coverImage: 'https://c.saavncdn.com/editorial/FILTRDilKaSukoon_20250515094823_500x500.jpg' },
  { id: 'gaming', name: 'Gaming', query: 'Gaming Beats', color: '#8C5CBA', coverImage: 'https://c.saavncdn.com/editorial/logo/MonstercatGaming_20190604084018_500x500.jpg' },
  { id: 'k-pop', name: 'K-pop', query: 'K-Pop Hits', color: '#148A08', coverImage: 'https://c.saavncdn.com/editorial/KKLoveSongsHindi_20240730105418_500x500.jpg' },
  { id: 'workout', name: 'Workout', query: 'Workout Beats', color: '#776850', coverImage: 'https://c.saavncdn.com/editorial/BollywoodRockWorkoutMix_20240229050234_500x500.jpg' },
  { id: 'radar', name: 'RADAR', query: 'Radar India', color: '#7C7C9C', coverImage: 'https://c.saavncdn.com/editorial/UnderTheRadarPop_20260605113945_500x500.jpg' },
  { id: 'equal', name: 'EQUAL', query: 'Equal India', color: '#006450', coverImage: 'https://c.saavncdn.com/editorial/WomenInPop_20260506065144_500x500.jpg' },
  { id: 'fresh', name: 'Fresh', query: 'Fresh Finds', color: '#507C8C', coverImage: 'https://c.saavncdn.com/editorial/FreshTunes_20260703111718_500x500.jpg' },
  { id: 'rock', name: 'Rock', query: 'Rock Hits', color: '#7C787C', coverImage: 'https://c.saavncdn.com/editorial/BestOfRockHindi_20260325065230_500x500.jpg' },
]

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { isLiked } = useLibrary();
  const { currentSong, playSong } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);
  const recentSearchesRef = useRef<string[]>([]);
  const recentMutationRef = useRef(0);
  const recentWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const commitRecentSearches = useCallback((next: string[]) => {
    recentSearchesRef.current = next;
    setRecentSearches(next);
  }, []);

  const persistRecentSearches = (next: string[]) => {
    recentWriteChainRef.current = recentWriteChainRef.current
      .catch(() => {})
      .then(() => next.length
        ? AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
        : AsyncStorage.removeItem(RECENT_SEARCHES_KEY)
      );
    return recentWriteChainRef.current;
  };

  const trimmed = query.trim();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const generation = recentMutationRef.current;

      void recentWriteChainRef.current
        .catch(() => {})
        .then(() => AsyncStorage.getItem(RECENT_SEARCHES_KEY))
        .then((raw) => {
          if (!active || generation !== recentMutationRef.current) return;
          if (!raw) {
            commitRecentSearches([]);
            return;
          }

          const parsed = JSON.parse(raw);
          commitRecentSearches(
            Array.isArray(parsed)
              ? parsed.filter((item) => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES)
              : []
          );
        })
        .catch(() => {});

      return () => {
        active = false;
      };
    }, [commitRecentSearches])
  );

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    // Never show results from the previous query under a new search term.
    setResults(null);
    setError(null);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const value = await searchMusic(trimmed, 30, controller.signal);
        if (active) setResults(value);
      } catch (cause: any) {
        if (active && cause?.name !== 'AbortError') {
          setError(cause?.message || 'Search failed');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, retrySeq]);

  const songs = useMemo(() => results?.songs?.results || [], [results]);
  const albums = useMemo(() => results?.albums?.results || [], [results]);
  const artists = useMemo(() => results?.artists?.results || [], [results]);
  const playlists = useMemo(() => results?.playlists?.results || [], [results]);
  const hasResults = songs.length || albums.length || artists.length || playlists.length;
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  const rememberSearch = async (value = trimmed) => {
    const clean = value.trim();
    if (!clean) return;
    recentMutationRef.current += 1;
    const next = [
      clean,
      ...recentSearchesRef.current.filter(
        (item) => item.toLowerCase() !== clean.toLowerCase()
      ),
    ].slice(0, MAX_RECENT_SEARCHES);
    commitRecentSearches(next);
    await persistRecentSearches(next).catch(() => {});
  };

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    void rememberSearch();
    Keyboard.dismiss();
    router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  const openAlbum = (album: HarmoniaAlbum) => {
    const id = String(album.id || '');
    if (!id || id.startsWith('search-')) return;
    void rememberSearch();
    Keyboard.dismiss();
    router.push({ pathname: '/album/[id]', params: { id } });
  };

  const openArtist = (artist: HarmoniaArtistEntity) => {
    const id = String(artist.id || '');
    if (!id || id.startsWith('search-')) return;
    void rememberSearch();
    Keyboard.dismiss();
    router.push({ pathname: '/artist/[id]', params: { id } });
  };

  const openBrowseCategory = (category: BrowseCategory) => {
    setQuery(category.query);
    Keyboard.dismiss();
  };

  const header = (
    <>
      {!!artists.length && (
        <SearchRail title="Artists">
          {artists.slice(0, 12).map((artist, index) => {
            const cover = imageUrl(artist.image as any, 112);
            const id = String(artist.id || '');
            const navigable = Boolean(id && !id.startsWith('search-'));
            return (
              <Pressable key={id || `artist-${index}`} disabled={!navigable} onPress={() => openArtist(artist)} style={styles.artistCard}>
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.artistImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.artistImage, styles.imageFallback]}><Ionicons name="person-outline" size={30} color="#575757" /></View>
                )}
                <Text numberOfLines={1} style={styles.entityTitle}>{artistTitle(artist)}</Text>
                <Text numberOfLines={1} style={styles.entityMeta}>{navigable ? 'Artist' : 'Artist result'}</Text>
              </Pressable>
            );
          })}
        </SearchRail>
      )}

      {!!albums.length && (
        <SearchRail title="Albums">
          {albums.slice(0, 12).map((album, index) => {
            const cover = imageUrl(album.image as any, 126);
            const id = String(album.id || '');
            const navigable = Boolean(id && !id.startsWith('search-'));
            return (
              <Pressable key={id || `album-${index}`} disabled={!navigable} onPress={() => openAlbum(album)} style={styles.albumCard}>
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.albumImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.albumImage, styles.imageFallback]}><Ionicons name="disc-outline" size={30} color="#575757" /></View>
                )}
                <Text numberOfLines={1} style={styles.entityTitle}>{albumTitle(album)}</Text>
                <Text numberOfLines={1} style={styles.entityMeta}>{album.primaryArtists || album.year || 'Album'}</Text>
              </Pressable>
            );
          })}
        </SearchRail>
      )}

      {!!playlists.length && (
        <SearchRail title="Playlists">
          {playlists.slice(0, 12).map((playlist, index) => (
            <PlaylistCard
              key={String(playlist.id || playlist._id || index)}
              playlist={playlist}
              size={126}
              onPress={() => openPlaylist(playlist)}
            />
          ))}
        </SearchRail>
      )}

      {!!songs.length && <Text style={styles.sectionTitle}>Songs</Text>}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Search</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#777" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="What do you want to listen to?"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              void rememberSearch();
              Keyboard.dismiss();
            }}
            style={styles.input}
          />
          {!!query && (
            <Pressable accessibilityRole="button" onPress={() => setQuery('')} style={styles.clear} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={21} color="#7A7A7A" />
            </Pressable>
          )}
        </View>
      </View>

      {!trimmed ? (
        <ScrollView
          contentContainerStyle={[styles.idleContent, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.browseHead}>
            <Text style={styles.browseTitle}>Browse all</Text>
          </View>

          <View style={styles.browseGrid}>
            {BROWSE_CATEGORIES.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${category.name}`}
                onPress={() => openBrowseCategory(category)}
                style={({ pressed }) => [
                  styles.browseCard,
                  { backgroundColor: category.color },
                  pressed && styles.browseCardPressed,
                ]}
              >
                <View style={styles.browseCardCopy}>
                  <Text numberOfLines={2} style={styles.browseCardTitle}>{category.name}</Text>
                </View>

                <View style={styles.browseArtworkWrap}>
                  <Image
                    source={{ uri: category.coverImage }}
                    style={styles.browseArtwork}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
              </Pressable>
            ))}
          </View>

          {!!recentSearches.length && (
            <View style={styles.recentFooter}>
              <Text style={styles.recentFooterTitle}>Recent searches</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentFooterRow}>
                {recentSearches.slice(0, 6).map((item) => (
                  <Pressable accessibilityRole="button" key={item} onPress={() => setQuery(item)} style={styles.recentFooterChip}>
                    <Ionicons name="time-outline" size={14} color="#898989" />
                    <Text numberOfLines={1} style={styles.recentFooterText}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      ) : error && !results ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Search failed</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => setRetrySeq((value) => value + 1)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<Song>
          data={songs}
          keyExtractor={(item, index) => item.id || String(index)}
          initialNumToRender={SONG_LIST_INITIAL_RENDER}
          maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
          updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
          windowSize={SONG_LIST_WINDOW_SIZE}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={!loading && !hasResults ? <Text style={styles.empty}>No results found for “{trimmed}”.</Text> : null}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              active={currentSong?.id === item.id}
              onMorePress={() => setActionSong(item)}
              onPress={() => {
                void rememberSearch();
                Keyboard.dismiss();
                void playSong(item, songs);
              }}
              trailing={isLiked(item.id) ? <Text style={styles.likedIndicator}>♥</Text> : null}
            />
          )}
          contentContainerStyle={[styles.results, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {loading && <View style={styles.inlineLoading}><ActivityIndicator color="#AAA" size="small" /></View>}
      {!!error && !!results && (
        <Text
          numberOfLines={1}
          style={[styles.nonBlockingError, { bottom: Math.max(16, contentBottomInset - 12) }]}
        >
          {error}
        </Text>
      )}
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function SearchRail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.railSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1D1D1D',
    backgroundColor: '#0D0D0D',
  },
  pageTitle: { color: '#F7F7F7', fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.9, marginBottom: 14 },
  searchBox: {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#171717',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 11,
  },
  input: { flex: 1, color: colors.textStrong, fontSize: 17, fontWeight: '650' as any, paddingVertical: 0 },
  clear: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  results: { paddingHorizontal: 16, paddingTop: 14 },
  railSection: { marginBottom: 27, paddingTop: 8 },
  rail: { gap: 12, paddingRight: 10 },
  sectionTitle: { color: '#EEE', fontSize: 19, fontWeight: '800', marginBottom: 12 },
  artistCard: { width: 118 },
  artistImage: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#111' },
  albumCard: { width: 126 },
  albumImage: { width: 126, height: 126, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  entityTitle: { color: '#E8E8E8', fontSize: 13, fontWeight: '700', marginTop: 8 },
  entityMeta: { color: '#676767', fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  idleContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24 },
  browseHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  browseTitle: { color: '#F3F3F3', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  browseGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  browseCard: {
    width: '48.4%',
    height: 112,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  browseCardPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  browseCardCopy: { paddingHorizontal: 14, paddingTop: 15, paddingRight: '30%' },
  browseCardTitle: { color: '#FFF', fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -0.25 },
  browseArtworkWrap: {
    position: 'absolute',
    right: -13,
    bottom: -13,
    width: '49%',
    aspectRatio: 1,
    borderRadius: 7,
    overflow: 'hidden',
    transform: [{ rotate: '25deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: -3, height: 4 },
    elevation: 6,
  },
  browseArtwork: { width: '100%', height: '100%' },
  recentFooter: { marginTop: 28, paddingBottom: 4 },
  recentFooterTitle: { color: '#DADADA', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  recentFooterRow: { gap: 8, paddingRight: 16 },
  recentFooterChip: { height: 38, borderRadius: 19, backgroundColor: '#171717', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  recentFooterText: { color: '#B8B8B8', fontSize: 12, fontWeight: '600', maxWidth: 150 },
  errorTitle: { color: '#ECECEC', fontSize: 18, fontWeight: '800' },
  error: { color: '#888', textAlign: 'center', marginTop: 7, lineHeight: 19 },
  retry: { marginTop: 17, height: 42, borderRadius: 13, backgroundColor: '#EEE', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#080808', fontWeight: '800', fontSize: 12 },
  empty: { color: '#777', textAlign: 'center', paddingVertical: 60 },
  inlineLoading: { position: 'absolute', top: 76, right: 32 },
  nonBlockingError: { position: 'absolute', left: 20, right: 20, color: '#D98787', fontSize: 11, backgroundColor: '#171010', borderRadius: 10, padding: 9 },
  likedIndicator: { color: '#FFF', fontSize: 17, marginLeft: 8 },
});

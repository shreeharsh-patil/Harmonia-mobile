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
import { BROWSE_CATALOGS, type BrowseCatalog } from '@/src/lib/browseCatalog';
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

  const openBrowseCategory = (category: BrowseCatalog) => {
    Keyboard.dismiss();
    router.push({ pathname: '/catalog/[id]', params: { id: category.id } });
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
            {BROWSE_CATALOGS.map((category) => (
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
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(18,18,18,0.96)',
  },
  pageTitle: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14 },
  searchBox: {
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.textStrong, fontSize: 16, fontWeight: '600', paddingVertical: 0 },
  clear: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  results: { paddingHorizontal: 16, paddingTop: 14 },
  railSection: { marginBottom: 27, paddingTop: 8 },
  rail: { gap: 12, paddingRight: 10 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 12 },
  artistCard: { width: 118 },
  artistImage: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surface },
  albumCard: { width: 126 },
  albumImage: { width: 126, height: 126, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  entityTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
  entityMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  idleContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24 },
  browseHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  browseTitle: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
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
  recentFooterTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  recentFooterRow: { gap: 8, paddingRight: 16 },
  recentFooterChip: { height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  recentFooterText: { color: colors.muted, fontSize: 12, fontWeight: '600', maxWidth: 150 },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  error: { color: colors.muted, textAlign: 'center', marginTop: 7, lineHeight: 19 },
  retry: { marginTop: 17, height: 42, borderRadius: 13, backgroundColor: colors.textStrong, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.background, fontWeight: '800', fontSize: 12 },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 60 },
  inlineLoading: { position: 'absolute', top: 76, right: 32 },
  nonBlockingError: { position: 'absolute', left: 20, right: 20, color: '#FCA5A5', fontSize: 11, backgroundColor: '#241414', borderRadius: 10, padding: 9 },
  likedIndicator: { color: '#FFF', fontSize: 17, marginLeft: 8 },
});

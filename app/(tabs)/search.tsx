import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { RECENT_SEARCHES_KEY } from '@/src/config';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { searchMusic } from '@/src/lib/api';
import { albumTitle, artistTitle, imageUrl } from '@/src/lib/entities';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, SearchPayload, Song } from '@/src/types';

const MAX_RECENT_SEARCHES = 10;

export default function SearchScreen() {
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

  recentSearchesRef.current = recentSearches;

  const commitRecentSearches = (next: string[]) => {
    recentSearchesRef.current = next;
    setRecentSearches(next);
  };

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

  useEffect(() => {
    const generation = recentMutationRef.current;
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (!raw || generation !== recentMutationRef.current) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          commitRecentSearches(
            parsed.filter((item) => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES)
          );
        }
      })
      .catch(() => {});
  }, []);

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

  const clearRecent = async () => {
    recentMutationRef.current += 1;
    commitRecentSearches([]);
    await persistRecentSearches([]).catch(() => {});
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

  const header = (
    <>
      {!!artists.length && (
        <SearchRail title="Artists">
          {artists.slice(0, 12).map((artist, index) => {
            const cover = imageUrl(artist.image as any);
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
            const cover = imageUrl(album.image as any);
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
        <Text style={styles.heading}>Search</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#777" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Songs, artists, albums, playlists"
            placeholderTextColor="#656565"
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
            <Pressable onPress={() => setQuery('')} style={styles.clear} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color="#6F6F6F" />
            </Pressable>
          )}
        </View>
      </View>

      {!trimmed ? (
        <ScrollView contentContainerStyle={styles.idleContent} showsVerticalScrollIndicator={false}>
          {!!recentSearches.length ? (
            <View>
              <View style={styles.recentHead}>
                <Text style={styles.sectionTitle}>Recent searches</Text>
                <Pressable onPress={() => void clearRecent()} hitSlop={10}>
                  <Text style={styles.clearRecent}>Clear</Text>
                </Pressable>
              </View>
              <View style={styles.recentWrap}>
                {recentSearches.map((item) => (
                  <Pressable key={item} onPress={() => setQuery(item)} style={styles.recentChip}>
                    <Ionicons name="time-outline" size={15} color="#777" />
                    <Text numberOfLines={1} style={styles.recentText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.discover}>
              <Text style={styles.discoverKicker}>FIND YOUR NEXT TRACK</Text>
              <Text style={styles.discoverTitle}>Search the Harmonia catalog.</Text>
              <Text style={styles.discoverBody}>
                Bundled Harmonia discovery plus direct JioSaavn keeps songs, playlists, artists and albums available even without account sync.
              </Text>
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
          contentContainerStyle={styles.results}
          showsVerticalScrollIndicator={false}
        />
      )}

      {loading && <View style={styles.inlineLoading}><ActivityIndicator color="#AAA" size="small" /></View>}
      {!!error && !!results && <Text numberOfLines={1} style={styles.nonBlockingError}>{error}</Text>}
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
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 13 },
  heading: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginBottom: 16 },
  searchBox: { height: 50, borderRadius: 15, backgroundColor: '#131313', borderWidth: StyleSheet.hairlineWidth, borderColor: '#272727', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingVertical: 0 },
  clear: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  results: { paddingHorizontal: 18, paddingBottom: 165 },
  railSection: { marginBottom: 27, paddingTop: 8 },
  rail: { gap: 12, paddingRight: 10 },
  sectionTitle: { color: '#EEE', fontSize: 19, fontWeight: '800', marginBottom: 12 },
  artistCard: { width: 118 },
  artistImage: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#111' },
  albumCard: { width: 126 },
  albumImage: { width: 126, height: 126, borderRadius: 14, backgroundColor: '#111' },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  entityTitle: { color: '#E8E8E8', fontSize: 13, fontWeight: '700', marginTop: 8 },
  entityMeta: { color: '#676767', fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  idleContent: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 160 },
  discover: { flex: 1, justifyContent: 'center', paddingHorizontal: 12, paddingBottom: 80 },
  discoverKicker: { color: '#575757', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  discoverTitle: { color: '#F4F4F4', fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 8 },
  discoverBody: { color: '#737373', fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 330 },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  clearRecent: { color: '#818181', fontSize: 12, fontWeight: '700' },
  recentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  recentChip: { maxWidth: '100%', height: 39, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: '#282828', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  recentText: { color: '#B7B7B7', fontSize: 12, fontWeight: '600', maxWidth: 230 },
  errorTitle: { color: '#ECECEC', fontSize: 18, fontWeight: '800' },
  error: { color: '#888', textAlign: 'center', marginTop: 7, lineHeight: 19 },
  retry: { marginTop: 17, height: 42, borderRadius: 13, backgroundColor: '#EEE', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#080808', fontWeight: '800', fontSize: 12 },
  empty: { color: '#777', textAlign: 'center', paddingVertical: 60 },
  inlineLoading: { position: 'absolute', top: 101, right: 32 },
  nonBlockingError: { position: 'absolute', left: 20, right: 20, bottom: 154, color: '#D98787', fontSize: 11, backgroundColor: '#171010', borderRadius: 10, padding: 9 },
  likedIndicator: { color: '#FFF', fontSize: 17, marginLeft: 8 },
});

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { SongRow } from '@/src/components/SongRow';
import { fetchPlaylistSongs, searchMusic } from '@/src/lib/api';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Playlist, SearchPayload, Song } from '@/src/types';

export default function SearchScreen() {
  const { currentSong, playSong } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = { active: true };
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const value = await searchMusic(trimmed);
        if (controller.active) setResults(value);
      } catch (cause: any) {
        if (controller.active) setError(cause?.message || 'Search failed');
      } finally {
        if (controller.active) setLoading(false);
      }
    }, 350);

    return () => {
      controller.active = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const songs = useMemo(() => results?.songs?.results || [], [results]);
  const playlists = results?.playlists?.results || [];

  const playPlaylist = async (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || playlist.name);
    setPlaylistLoading(id);
    Keyboard.dismiss();
    try {
      const list = await fetchPlaylistSongs(playlist);
      if (!list.length) throw new Error('No playable tracks found');
      await playSong(list[0], list);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to play playlist');
    } finally {
      setPlaylistLoading(null);
    }
  };

  const header = (
    <>
      {!!playlists.length && (
        <View style={styles.playlistSection}>
          <Text style={styles.sectionTitle}>Playlists</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={playlists.slice(0, 10)}
            keyExtractor={(item, index) => String(item.id || item._id || index)}
            renderItem={({ item }) => (
              <View style={playlistLoading === String(item.id || item._id || item.name) ? styles.dim : undefined}>
                <PlaylistCard playlist={item} size={126} onPress={() => void playPlaylist(item)} />
              </View>
            )}
          />
        </View>
      )}
      {!!songs.length && <Text style={styles.sectionTitle}>Songs</Text>}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Search</Text>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Songs, artists, albums, playlists"
            placeholderTextColor="#656565"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} style={styles.clear}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading && !results ? (
        <View style={styles.center}><ActivityIndicator color="#FFF" /></View>
      ) : !trimmed ? (
        <View style={styles.discover}>
          <Text style={styles.discoverKicker}>FIND YOUR NEXT TRACK</Text>
          <Text style={styles.discoverTitle}>Search the Harmonia catalog.</Text>
          <Text style={styles.discoverBody}>Songs, playlists, artists and albums from the same catalog as the web player.</Text>
        </View>
      ) : error && !songs.length ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList<Song>
          data={songs}
          keyExtractor={(item, index) => item.id || String(index)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No songs found for “{trimmed}”.</Text> : null
          }
          renderItem={({ item }) => (
            <SongRow
              song={item}
              active={currentSong?.id === item.id}
              onPress={() => {
                Keyboard.dismiss();
                void playSong(item, songs);
              }}
            />
          )}
          contentContainerStyle={styles.results}
          showsVerticalScrollIndicator={false}
        />
      )}

      {loading && results && <View style={styles.inlineLoading}><ActivityIndicator color="#999" size="small" /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 13 },
  heading: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginBottom: 16 },
  searchBox: { height: 50, borderRadius: 15, backgroundColor: '#131313', borderWidth: StyleSheet.hairlineWidth, borderColor: '#272727', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  searchIcon: { color: '#777', fontSize: 22, marginRight: 9, marginTop: -2 },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingVertical: 0 },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: '#777', fontSize: 24 },
  results: { paddingHorizontal: 18, paddingBottom: 165 },
  playlistSection: { marginBottom: 27, paddingTop: 10 },
  sectionTitle: { color: '#EEE', fontSize: 19, fontWeight: '800', marginBottom: 12 },
  dim: { opacity: 0.45 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  discover: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 100 },
  discoverKicker: { color: '#575757', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  discoverTitle: { color: '#F4F4F4', fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 8 },
  discoverBody: { color: '#737373', fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 330 },
  error: { color: '#EB8888', textAlign: 'center' },
  empty: { color: '#777', textAlign: 'center', paddingVertical: 60 },
  inlineLoading: { position: 'absolute', top: 95, right: 32 },
});

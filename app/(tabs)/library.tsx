import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { SongRow } from '@/src/components/SongRow';
import { fetchPlaylistSongs } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Playlist } from '@/src/types';

type LibraryTab = 'playlists' | 'liked';

export default function LibraryScreen() {
  const { token } = useAuth();
  const {
    playlists,
    likedSongs,
    loading,
    refreshing,
    error,
    refresh,
    toggleLike,
    createPlaylist,
  } = useLibrary();
  const { currentSong, playSong } = usePlayer();
  const [tab, setTab] = useState<LibraryTab>('playlists');
  const [newPlaylist, setNewPlaylist] = useState('');
  const [creating, setCreating] = useState(false);
  const [playingPlaylist, setPlayingPlaylist] = useState<string | null>(null);

  if (!token) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.guest}>
          <View style={styles.guestIcon}><Text style={styles.guestIconText}>♫</Text></View>
          <Text style={styles.guestTitle}>Your music, everywhere.</Text>
          <Text style={styles.guestBody}>Sign in to bring your playlists and liked songs from Harmonia web to this phone.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.signIn}>
            <Text style={styles.signInText}>Sign in to Harmonia</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const playPlaylist = async (playlist: Playlist) => {
    const id = String(playlist._id || playlist.id || '');
    if (!id || playingPlaylist) return;
    setPlayingPlaylist(id);
    try {
      const songs = await fetchPlaylistSongs(playlist);
      if (songs.length) await playSong(songs[0], songs);
    } finally {
      setPlayingPlaylist(null);
    }
  };

  const submitPlaylist = async () => {
    if (!newPlaylist.trim() || creating) return;
    setCreating(true);
    const result = await createPlaylist(newPlaylist);
    if (result) setNewPlaylist('');
    setCreating(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Library</Text>
        <Pressable onPress={() => void refresh()} style={styles.refresh}>
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('playlists')} style={[styles.chip, tab === 'playlists' && styles.chipActive]}>
          <Text style={[styles.chipText, tab === 'playlists' && styles.chipTextActive]}>Playlists</Text>
        </Pressable>
        <Pressable onPress={() => setTab('liked')} style={[styles.chip, tab === 'liked' && styles.chipActive]}>
          <Text style={[styles.chipText, tab === 'liked' && styles.chipTextActive]}>Liked songs</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#FFF" /></View>
      ) : tab === 'playlists' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFF" />}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.createBox}>
            <Text style={styles.createTitle}>New playlist</Text>
            <View style={styles.createRow}>
              <TextInput
                value={newPlaylist}
                onChangeText={setNewPlaylist}
                placeholder="Playlist name"
                placeholderTextColor="#5E5E5E"
                style={styles.input}
                onSubmitEditing={() => void submitPlaylist()}
              />
              <Pressable onPress={() => void submitPlaylist()} style={styles.createButton}>
                {creating ? <ActivityIndicator color="#080808" size="small" /> : <Text style={styles.createButtonText}>+</Text>}
              </Pressable>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          {playlists.length ? playlists.map((playlist) => {
            const id = String(playlist._id || playlist.id || '');
            return (
              <Pressable
                key={id || playlist.name}
                onPress={() => void playPlaylist(playlist)}
                style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}
              >
                <PlaylistArtwork playlist={playlist} size={68} radius={13} />
                <View style={styles.playlistCopy}>
                  <Text numberOfLines={1} style={styles.playlistName}>{playlist.name}</Text>
                  <Text style={styles.playlistMeta}>
                    {playlist.songCount ?? playlist.songIds?.length ?? 0} songs
                  </Text>
                </View>
                {playingPlaylist === id
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <View style={styles.roundPlay}><Text style={styles.roundPlayText}>▶</Text></View>}
              </Pressable>
            );
          }) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No playlists yet</Text>
              <Text style={styles.emptyBody}>Create your first playlist above. It will appear on Harmonia web too.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={likedSongs}
          keyExtractor={(item, index) => item.id || String(index)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFF" />}
          contentContainerStyle={styles.likedContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No liked songs yet</Text>
              <Text style={styles.emptyBody}>Like tracks from Search and they will stay synced with your Harmonia account.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <SongRow
              song={item}
              active={currentSong?.id === item.id}
              onPress={() => void playSong(item, likedSongs)}
              trailing={
                <Pressable onPress={() => void toggleLike(item)} style={styles.heart}>
                  <Text style={styles.heartText}>♥</Text>
                </Pressable>
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#A0A0A0', fontSize: 23 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  chip: { paddingHorizontal: 15, height: 34, borderRadius: 17, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#EEEEEE' },
  chipText: { color: '#888', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#090909' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 165 },
  likedContent: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 165, flexGrow: 1 },
  createBox: { backgroundColor: '#101010', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 14, marginBottom: 18 },
  createTitle: { color: '#9A9A9A', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  createRow: { flexDirection: 'row', gap: 9 },
  input: { flex: 1, height: 46, borderRadius: 13, backgroundColor: '#181818', color: '#FFF', paddingHorizontal: 14, fontSize: 14 },
  createButton: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: '#080808', fontSize: 25, fontWeight: '500', marginTop: -2 },
  playlistRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#171717' },
  playlistCopy: { flex: 1, marginLeft: 13, minWidth: 0 },
  playlistName: { color: '#F0F0F0', fontSize: 15, fontWeight: '750' as any },
  playlistMeta: { color: '#6E6E6E', fontSize: 12, marginTop: 4 },
  roundPlay: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center' },
  roundPlayText: { color: '#EAEAEA', fontSize: 13 },
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heartText: { color: '#FFF', fontSize: 20 },
  empty: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { color: '#D8D8D8', fontSize: 17, fontWeight: '800' },
  emptyBody: { color: '#6F6F6F', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  error: { color: '#EA8383', fontSize: 12, marginBottom: 10 },
  guest: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 90 },
  guestIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: '#151515', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  guestIconText: { color: '#FFF', fontSize: 27 },
  guestTitle: { color: '#F4F4F4', fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  guestBody: { color: '#777', fontSize: 15, lineHeight: 22, marginTop: 10 },
  signIn: { height: 52, borderRadius: 16, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  signInText: { color: '#080808', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});

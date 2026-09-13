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
import { useLocalMusic } from '@/src/providers/LocalMusicProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Playlist, Song } from '@/src/types';

type LibraryTab = 'playlists' | 'liked' | 'downloads' | 'local';

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

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
  const { downloads, totalBytes, removeDownload } = useOffline();
  const {
    songs: localSongs,
    loading: localLoading,
    permissionDenied,
    scan: scanLocalMusic,
  } = useLocalMusic();
  const { currentSong, playSong } = usePlayer();

  const [tab, setTab] = useState<LibraryTab>('playlists');
  const [newPlaylist, setNewPlaylist] = useState('');
  const [creating, setCreating] = useState(false);
  const [playingPlaylist, setPlayingPlaylist] = useState<string | null>(null);

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
    if (!token) {
      router.push('/login');
      return;
    }
    if (!newPlaylist.trim() || creating) return;
    setCreating(true);
    const result = await createPlaylist(newPlaylist);
    if (result) setNewPlaylist('');
    setCreating(false);
  };

  const accountGate = (
    <View style={styles.accountGate}>
      <Text style={styles.gateKicker}>HARMONIA ACCOUNT</Text>
      <Text style={styles.gateTitle}>Sync this part of your library.</Text>
      <Text style={styles.gateBody}>Playlists and liked songs use the same account as Harmonia web.</Text>
      <Pressable onPress={() => router.push('/login')} style={styles.signIn}>
        <Text style={styles.signInText}>Sign in</Text>
      </Pressable>
    </View>
  );

  const renderSongList = (
    data: Song[],
    emptyTitle: string,
    emptyBody: string,
    trailing?: (song: Song) => React.ReactNode
  ) => (
    <FlatList
      data={data}
      keyExtractor={(item, index) => item.id || String(index)}
      contentContainerStyle={styles.songList}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyBody}>{emptyBody}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <SongRow
          song={item}
          active={currentSong?.id === item.id}
          onPress={() => void playSong(item, data)}
          trailing={trailing?.(item)}
        />
      )}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Library</Text>
        {token && (
          <Pressable onPress={() => void refresh()} style={styles.refresh}>
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsScroller}
      >
        {([
          ['playlists', 'Playlists'],
          ['liked', 'Liked'],
          ['downloads', `Downloads · ${downloads.length}`],
          ['local', 'On device'],
        ] as Array<[LibraryTab, string]>).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.chip, tab === value && styles.chipActive]}
          >
            <Text style={[styles.chipText, tab === value && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'playlists' && (
        !token ? accountGate : loading ? (
          <View style={styles.center}><ActivityIndicator color="#FFF" /></View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFF" />}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.createBox}>
              <Text style={styles.createTitle}>NEW PLAYLIST</Text>
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
                    <Text style={styles.playlistMeta}>{playlist.songCount ?? playlist.songIds?.length ?? 0} songs</Text>
                  </View>
                  {playingPlaylist === id
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <View style={styles.roundPlay}><Text style={styles.roundPlayText}>▶</Text></View>}
                </Pressable>
              );
            }) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No playlists yet</Text>
                <Text style={styles.emptyBody}>Create one here and it will also appear in Harmonia web.</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {tab === 'liked' && (
        !token ? accountGate : renderSongList(
          likedSongs,
          'No liked songs yet',
          'Like songs from Search and they will stay synchronized with Harmonia web.',
          (song) => (
            <Pressable onPress={() => void toggleLike(song)} style={styles.rowAction}>
              <Text style={styles.heartText}>♥</Text>
            </Pressable>
          )
        )
      )}

      {tab === 'downloads' && (
        <View style={styles.flex}>
          <View style={styles.summary}>
            <View>
              <Text style={styles.summaryKicker}>OFFLINE MUSIC</Text>
              <Text style={styles.summaryValue}>{formatBytes(totalBytes)}</Text>
            </View>
            <Text style={styles.summaryMeta}>{downloads.length} track{downloads.length === 1 ? '' : 's'}</Text>
          </View>
          {renderSongList(
            downloads.map((item) => item.song),
            'Nothing downloaded',
            'Open Now Playing → Tools and download a track. Harmonia will use the local copy when you play it.',
            (song) => (
              <Pressable onPress={() => void removeDownload(song.id)} style={styles.rowAction}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            )
          )}
        </View>
      )}

      {tab === 'local' && (
        <View style={styles.flex}>
          <View style={styles.localHeader}>
            <View style={styles.localCopy}>
              <Text style={styles.summaryKicker}>LOCAL MUSIC</Text>
              <Text style={styles.localTitle}>{localSongs.length ? `${localSongs.length} tracks on this phone` : 'Play music already on your phone'}</Text>
            </View>
            <Pressable
              disabled={localLoading}
              onPress={() => void scanLocalMusic()}
              style={styles.scanButton}
            >
              {localLoading
                ? <ActivityIndicator color="#080808" size="small" />
                : <Text style={styles.scanButtonText}>{localSongs.length ? 'Rescan' : 'Scan'}</Text>}
            </Pressable>
          </View>
          {permissionDenied && (
            <Text style={styles.permissionError}>Audio-library permission is required to show music stored on this device.</Text>
          )}
          {renderSongList(
            localSongs,
            'No local tracks loaded',
            'Tap Scan to let Harmonia find audio stored on this phone.'
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#A0A0A0', fontSize: 23 },
  tabsScroller: { flexGrow: 0, marginTop: 14, marginBottom: 5 },
  tabs: { gap: 8, paddingHorizontal: 18, paddingVertical: 4 },
  chip: { paddingHorizontal: 15, height: 34, borderRadius: 17, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#EEEEEE' },
  chipText: { color: '#888', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#090909' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 165 },
  songList: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 165, flexGrow: 1 },
  createBox: { backgroundColor: '#101010', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 14, marginBottom: 18 },
  createTitle: { color: '#777', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  createRow: { flexDirection: 'row', gap: 9 },
  input: { flex: 1, height: 46, borderRadius: 13, backgroundColor: '#181818', color: '#FFF', paddingHorizontal: 14, fontSize: 14 },
  createButton: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: '#080808', fontSize: 25, fontWeight: '500', marginTop: -2 },
  playlistRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#171717' },
  playlistCopy: { flex: 1, marginLeft: 13, minWidth: 0 },
  playlistName: { color: '#F0F0F0', fontSize: 15, fontWeight: '700' },
  playlistMeta: { color: '#6E6E6E', fontSize: 12, marginTop: 4 },
  roundPlay: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center' },
  roundPlayText: { color: '#EAEAEA', fontSize: 13 },
  rowAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heartText: { color: '#FFF', fontSize: 20 },
  removeText: { color: '#8D8D8D', fontSize: 25, fontWeight: '300' },
  empty: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { color: '#D8D8D8', fontSize: 17, fontWeight: '800' },
  emptyBody: { color: '#6F6F6F', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  error: { color: '#EA8383', fontSize: 12, marginBottom: 10 },
  pressed: { opacity: 0.65 },
  accountGate: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 90 },
  gateKicker: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  gateTitle: { color: '#F1F1F1', fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7, marginTop: 8 },
  gateBody: { color: '#747474', fontSize: 14, lineHeight: 21, marginTop: 9 },
  signIn: { height: 50, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  signInText: { color: '#080808', fontSize: 14, fontWeight: '800' },
  summary: { marginHorizontal: 18, marginTop: 9, marginBottom: 7, minHeight: 78, borderRadius: 18, backgroundColor: '#101010', borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryKicker: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  summaryValue: { color: '#F1F1F1', fontSize: 22, fontWeight: '800', marginTop: 4 },
  summaryMeta: { color: '#747474', fontSize: 12 },
  localHeader: { marginHorizontal: 18, marginTop: 9, marginBottom: 7, minHeight: 78, borderRadius: 18, backgroundColor: '#101010', borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  localCopy: { flex: 1, minWidth: 0 },
  localTitle: { color: '#DCDCDC', fontSize: 14, fontWeight: '700', marginTop: 5 },
  scanButton: { minWidth: 66, height: 38, borderRadius: 12, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  scanButtonText: { color: '#080808', fontSize: 11, fontWeight: '800' },
  permissionError: { color: '#E38A8A', fontSize: 12, lineHeight: 18, paddingHorizontal: 20, paddingVertical: 8 },
});

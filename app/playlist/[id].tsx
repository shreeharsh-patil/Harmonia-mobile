import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import {
  deletePlaylist,
  fetchPlaylistDetails,
  fetchPlaylistSongs,
  removeSongFromPlaylist,
  trackRecentlyPlayedPlaylist,
  updatePlaylist,
} from '@/src/lib/api';
import { playlistTitle } from '@/src/lib/entities';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Playlist, Song } from '@/src/types';

function getId(playlist?: Playlist | null) {
  return String(playlist?._id || playlist?.id || '');
}

export default function PlaylistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const {
    playlists: ownedPlaylists,
    refresh,
    isPlaylistLiked,
    togglePlaylistLike,
  } = useLibrary();
  const { currentSong, playSong } = usePlayer();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  const owned = useMemo(
    () => Boolean(id && ownedPlaylists.some((item) => getId(item) === id)),
    [id, ownedPlaylists]
  );

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchPlaylistDetails(id, token);
      setPlaylist(detail);
      setDraftName(playlistTitle(detail));
      setDraftDescription(String(detail.description || ''));
      setSongs(await fetchPlaylistSongs(detail));
    } catch (cause: any) {
      setError(cause?.message || 'Unable to load this playlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id, token]);

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!songs.length || playing) return;
    setPlaying(true);
    try {
      let queue = [...songs];
      let selected = queue[Math.max(0, Math.min(startIndex, queue.length - 1))];
      if (shuffle && queue.length > 1) {
        for (let index = queue.length - 1; index > 0; index -= 1) {
          const random = Math.floor(Math.random() * (index + 1));
          [queue[index], queue[random]] = [queue[random], queue[index]];
        }
        selected = queue[0];
      }
      await playSong(selected, queue);
      if (token && playlist) {
        void trackRecentlyPlayedPlaylist(token, playlist).catch(() => {});
      }
    } finally {
      setPlaying(false);
    }
  };

  const saveEdits = async () => {
    if (!owned || !token || !id || saving || !draftName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePlaylist(token, id, {
        name: draftName.trim(),
        description: draftDescription.trim(),
      });
      setPlaylist((current) => ({ ...(current || {}), ...updated } as Playlist));
      setEditing(false);
      await refresh();
    } catch (cause: any) {
      setError(cause?.message || 'Could not update this playlist');
    } finally {
      setSaving(false);
    }
  };

  const removeTrack = async (song: Song) => {
    if (!owned || !token || !id || removingSongId) return;
    setRemovingSongId(song.id);
    setError(null);
    const previous = songs;
    setSongs((current) => current.filter((item) => item.id !== song.id));
    try {
      await removeSongFromPlaylist(token, id, song.id);
      await refresh();
    } catch (cause: any) {
      setSongs(previous);
      setError(cause?.message || 'Could not remove this song');
    } finally {
      setRemovingSongId(null);
    }
  };

  const confirmDelete = () => {
    if (!owned || !token || !id) return;
    Alert.alert(
      'Delete playlist?',
      'This removes the playlist from your Harmonia account on mobile and web.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deletePlaylist(token, id);
                await refresh();
                router.back();
              } catch (cause: any) {
                setError(cause?.message || 'Could not delete this playlist');
              }
            })();
          },
        },
      ]
    );
  };

  if (loading && !playlist) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color="#FFF" /></View></SafeAreaView>;
  }

  if (!playlist) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Playlist unavailable</Text>
          <Text style={styles.errorBody}>{error || 'This playlist could not be loaded.'}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const owner =
    typeof playlist.owner === 'string'
      ? playlist.owner
      : String((playlist as any).userName || (playlist as any).subtitle || (owned ? 'You' : 'Harmonia'));
  const count = songs.length || Number(playlist.songCount || playlist.songIds?.length || 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={songs}
        keyExtractor={(item, index) => item.id || String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <BackButton />
              <View style={styles.headerActions}>
                {!owned && (
                  <Pressable
                    onPress={() => {
                      if (!token) {
                        router.push('/login');
                        return;
                      }
                      void togglePlaylistLike(playlist);
                    }}
                    style={styles.headerAction}
                    accessibilityLabel={isPlaylistLiked(id) ? 'Remove from library' : 'Save playlist'}
                  >
                    <Ionicons name={isPlaylistLiked(id) ? 'heart' : 'heart-outline'} size={20} color="#E8E8E8" />
                  </Pressable>
                )}
                {owned && (
                  <Pressable onPress={() => setEditing((value) => !value)} style={styles.headerAction}>
                    <Ionicons name={editing ? 'close' : 'create-outline'} size={20} color="#E8E8E8" />
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.hero}>
              <PlaylistArtwork playlist={playlist} size={224} radius={18} />
              <Text style={styles.kicker}>{owned ? 'YOUR PLAYLIST' : 'PLAYLIST'}</Text>
              {editing ? (
                <View style={styles.editBox}>
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Playlist name"
                    placeholderTextColor="#606060"
                    style={styles.input}
                  />
                  <TextInput
                    value={draftDescription}
                    onChangeText={setDraftDescription}
                    placeholder="Description"
                    placeholderTextColor="#606060"
                    multiline
                    style={[styles.input, styles.descriptionInput]}
                  />
                  <View style={styles.editActions}>
                    <Pressable disabled={saving || !draftName.trim()} onPress={() => void saveEdits()} style={styles.saveButton}>
                      {saving ? <ActivityIndicator color="#080808" size="small" /> : <Text style={styles.saveText}>Save changes</Text>}
                    </Pressable>
                    <Pressable onPress={confirmDelete} style={styles.deleteButton}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.title}>{playlistTitle(playlist)}</Text>
                  {!!playlist.description && <Text style={styles.description}>{playlist.description}</Text>}
                  <Text style={styles.meta}>{owner}{count ? ` · ${count} songs` : ''}</Text>
                </>
              )}

              {!editing && (
                <View style={styles.actions}>
                  <Pressable disabled={!songs.length || playing} onPress={() => void playFrom(0)} style={styles.primary}>
                    {playing ? <ActivityIndicator color="#080808" /> : <Ionicons name="play" size={20} color="#080808" />}
                    <Text style={styles.primaryText}>Play</Text>
                  </Pressable>
                  <Pressable disabled={!songs.length || playing} onPress={() => void playFrom(0, true)} style={styles.secondary}>
                    <Ionicons name="shuffle" size={18} color="#EDEDED" />
                    <Text style={styles.secondaryText}>Shuffle</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {!!error && (
              <Pressable onPress={() => void load()} style={styles.errorBox}>
                <Text style={styles.inlineError}>{error}</Text>
                <Text style={styles.retryInline}>Tap to retry</Text>
              </Pressable>
            )}
            <Text style={styles.sectionTitle}>Tracks</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No tracks yet</Text>
            <Text style={styles.emptyBody}>{owned ? 'Add songs from Search or Now Playing.' : 'Harmonia did not return playable tracks.'}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            active={currentSong?.id === item.id}
            onPress={() => void playFrom(index)}
            onMorePress={() => setActionSong(item)}
            trailing={owned ? (
              <Pressable
                disabled={removingSongId != null}
                onPress={() => {
                  Alert.alert('Remove song?', `Remove “${item.name}” from this playlist?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => void removeTrack(item) },
                  ]);
                }}
                style={styles.removeTrack}
              >
                {removingSongId === item.id
                  ? <ActivityIndicator color="#8A8A8A" size="small" />
                  : <Ionicons name="remove-circle-outline" size={20} color="#777" />}
              </Pressable>
            ) : undefined}
          />
        )}
      />
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
      <Ionicons name="chevron-back" size={23} color="#F2F2F2" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  list: { paddingHorizontal: 18, paddingBottom: 150 },
  top: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  kicker: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginTop: 20 },
  title: { color: '#F4F4F4', fontSize: 29, lineHeight: 34, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8, marginTop: 7 },
  description: { color: '#818181', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 310, marginTop: 8 },
  meta: { color: '#6D6D6D', fontSize: 12, textAlign: 'center', marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  primaryText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  secondary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#141414', borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  secondaryText: { color: '#EDEDED', fontSize: 13, fontWeight: '800' },
  editBox: { width: '100%', marginTop: 12, gap: 9 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', backgroundColor: '#111', color: '#F0F0F0', paddingHorizontal: 14, fontSize: 14 },
  descriptionInput: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 9 },
  saveButton: { flex: 1, height: 44, borderRadius: 13, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#080808', fontWeight: '800', fontSize: 12 },
  deleteButton: { height: 44, borderRadius: 13, backgroundColor: '#160E0E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#3A2020', paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#E98787', fontWeight: '800', fontSize: 12 },
  sectionTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: '#F0F0F0', fontSize: 20, fontWeight: '800' },
  errorBody: { color: '#777', textAlign: 'center', marginTop: 7, lineHeight: 20 },
  retry: { marginTop: 18, height: 42, borderRadius: 13, backgroundColor: '#EEE', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#080808', fontWeight: '800' },
  errorBox: { backgroundColor: '#171010', borderRadius: 13, padding: 12, marginBottom: 14 },
  inlineError: { color: '#E58A8A', fontSize: 12 },
  retryInline: { color: '#737373', fontSize: 10, marginTop: 3 },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: '#DDD', fontSize: 16, fontWeight: '800' },
  emptyBody: { color: '#6D6D6D', fontSize: 13, marginTop: 5, textAlign: 'center' },
  removeTrack: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
});

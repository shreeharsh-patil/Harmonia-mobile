import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Playlist, Song } from '@/src/types';

type Props = {
  song: Song | null;
  visible: boolean;
  onClose: () => void;
};

function playlistId(playlist: Playlist) {
  return String(playlist._id || playlist.id || '');
}

export function SongActionsSheet({ song, visible, onClose }: Props) {
  const { token } = useAuth();
  const { playlists, isLiked, toggleLike, addToPlaylist } = useLibrary();
  const { playNext, addToQueue, streamQuality } = usePlayer();
  const { isDownloaded, downloading, downloadSong, removeDownload } = useOffline();
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [busyPlaylist, setBusyPlaylist] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!song) return null;
  const downloaded = isDownloaded(song.id);
  const downloadProgress = downloading[song.id];

  const finish = (callback: () => void, confirmation: string) => {
    callback();
    Haptics.selectionAsync().catch(() => {});
    setMessage(confirmation);
  };

  const requireAccount = () => {
    if (token) return true;
    onClose();
    router.push('/login');
    return false;
  };

  const close = () => {
    setShowPlaylists(false);
    setBusyPlaylist(null);
    setMessage(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Close song actions" style={styles.scrim} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.trackHeader}>
            <TrackArtwork song={song} size={58} radius={11} />
            <View style={styles.trackCopy}>
              <Text numberOfLines={1} style={styles.title}>{song.name}</Text>
              <Text numberOfLines={1} style={styles.artist}>{artistNames(song)}</Text>
            </View>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          {showPlaylists ? (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Add to playlist</Text>
                <Pressable onPress={() => setShowPlaylists(false)} hitSlop={8}>
                  <Text style={styles.back}>Back</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.playlistList} showsVerticalScrollIndicator={false}>
                {playlists.length ? playlists.map((playlist) => {
                  const id = playlistId(playlist);
                  return (
                    <Pressable
                      key={id}
                      disabled={!id || busyPlaylist != null}
                      onPress={async () => {
                        setBusyPlaylist(id);
                        const ok = await addToPlaylist(id, song.id);
                        setBusyPlaylist(null);
                        if (ok) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                          close();
                        } else {
                          setMessage('Could not add this song. Try again.');
                        }
                      }}
                      style={styles.playlistRow}
                    >
                      <View style={styles.playlistMark}><Text style={styles.playlistMarkText}>♫</Text></View>
                      <View style={styles.playlistCopy}>
                        <Text numberOfLines={1} style={styles.playlistName}>{playlist.name}</Text>
                        <Text style={styles.playlistMeta}>{playlist.songCount ?? playlist.songIds?.length ?? 0} songs</Text>
                      </View>
                      {busyPlaylist === id ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.chevron}>›</Text>}
                    </Pressable>
                  );
                }) : <Text style={styles.empty}>Create a playlist in Library first.</Text>}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.actions}>
              <Action label="Play next" detail="Move behind the current track" glyph="↳" onPress={() => finish(() => playNext(song), 'Playing next')} />
              <Action label="Add to queue" detail="Place at the end of the queue" glyph="+" onPress={() => finish(() => addToQueue(song), 'Added to queue')} />
              <Action
                label={isLiked(song.id) ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                detail="Sync with your Harmonia account"
                glyph={isLiked(song.id) ? '♥' : '♡'}
                onPress={() => {
                  if (!requireAccount()) return;
                  void toggleLike(song);
                  close();
                }}
              />
              <Action
                label="Add to playlist"
                detail="Choose one of your playlists"
                glyph="≡"
                onPress={() => {
                  if (requireAccount()) setShowPlaylists(true);
                }}
              />
              <Action
                label={downloaded ? 'Remove download' : 'Download'}
                detail={downloaded ? 'Delete the offline copy' : 'Save using your selected quality'}
                glyph={downloaded ? '×' : '↓'}
                busy={downloadProgress != null}
                onPress={async () => {
                  if (downloaded) await removeDownload(song.id);
                  else await downloadSong(song, streamQuality);
                  close();
                }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Action({ label, detail, glyph, onPress, busy = false }: {
  label: string;
  detail: string;
  glyph: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.actionGlyph}>{busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.actionGlyphText}>{glyph}</Text>}</View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.64)' },
  sheet: { maxHeight: '82%', backgroundColor: '#101010', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2A2A2A', paddingHorizontal: 18, paddingBottom: 28 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#454545', alignSelf: 'center', marginTop: 9, marginBottom: 17 },
  trackHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#272727' },
  trackCopy: { flex: 1, minWidth: 0, marginLeft: 13 },
  title: { color: '#F5F5F5', fontSize: 16, fontWeight: '800' },
  artist: { color: '#858585', fontSize: 13, marginTop: 4 },
  message: { color: '#C7C7C7', fontSize: 12, paddingTop: 11 },
  actions: { paddingTop: 8 },
  action: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  actionGlyph: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#191919', alignItems: 'center', justifyContent: 'center' },
  actionGlyphText: { color: '#E8E8E8', fontSize: 19, fontWeight: '700' },
  actionCopy: { flex: 1, marginLeft: 13 },
  actionLabel: { color: '#ECECEC', fontSize: 15, fontWeight: '700' },
  actionDetail: { color: '#6F6F6F', fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.62 },
  sectionHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#F1F1F1', fontSize: 18, fontWeight: '800' },
  back: { color: '#A0A0A0', fontSize: 13, fontWeight: '700' },
  playlistList: { maxHeight: 330 },
  playlistRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center' },
  playlistMark: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1B1B1B', alignItems: 'center', justifyContent: 'center' },
  playlistMarkText: { color: '#BDBDBD', fontSize: 18 },
  playlistCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  playlistName: { color: '#E6E6E6', fontSize: 14, fontWeight: '700' },
  playlistMeta: { color: '#686868', fontSize: 11, marginTop: 3 },
  chevron: { color: '#666', fontSize: 24, paddingHorizontal: 8 },
  empty: { color: '#777', fontSize: 14, textAlign: 'center', paddingVertical: 36 },
});

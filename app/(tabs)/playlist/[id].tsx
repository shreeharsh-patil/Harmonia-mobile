import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistArtworkUrl, PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { CatalogDetailSkeleton } from '@/src/components/CatalogDetailSkeleton';
import { ArtworkColorHeader } from '@/src/components/ArtworkColorHeader';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  deletePlaylist,
  fetchPlaylistDetails,
  fetchPlaylistSongs,
  removeSongFromPlaylist,
  trackRecentlyPlayedPlaylist,
  updatePlaylist,
} from '@/src/lib/api';
import { playlistTitle } from '@/src/lib/entities';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { sharePlaylist } from '@/src/lib/share';
import { artistNames } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';
import type { Playlist, Song } from '@/src/types';

function getId(playlist?: Playlist | null) {
  return String(playlist?._id || playlist?.id || '');
}

export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  // Web detail pages skip color extraction in battery-saver mode.
  const { batterySaver } = usePreferences();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const {
    playlists: ownedPlaylists,
    refresh,
    isPlaylistLiked,
    togglePlaylistLike,
  } = useLibrary();
  const { currentSong, isPlaying, playSong, togglePlayback } = usePlayer();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const loadGenerationRef = useRef(0);
  const playlistRef = useRef<Playlist | null>(null);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const owned = useMemo(
    () => Boolean(id && ownedPlaylists.some((item) => getId(item) === id)),
    [id, ownedPlaylists]
  );

  const load = useCallback(async (isManualRefresh = false) => {
    const generation = ++loadGenerationRef.current;
    if (!id) {
      // Route params can briefly be unavailable during native transitions.
      // Keep the loading shell instead of flashing a false unavailable state.
      setLoading(true);
      return;
    }

    if (isManualRefresh) {
      setRefreshing(true);
    } else if (!playlistRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const detail = await fetchPlaylistDetails(id, token);
      if (generation !== loadGenerationRef.current) return;

      // Paint the playlist hero as soon as its stable metadata is available.
      // Track providers can be slower or temporarily reject a request; that
      // must not turn a valid Home card into a "Playlist unavailable" screen.
      const initialTracks = Array.isArray(detail.tracks)
        ? detail.tracks
        : Array.isArray((detail as any).songs)
          ? (detail as any).songs
          : [];
      const isCurated = detail.source === 'spotify' || detail.catalogSource === 'bundled' || Boolean(detail.sourceUrl?.includes('spotify')) || Boolean(detail.spotifyId);
      const initialDetail: Playlist = {
        ...detail,
        tracks: initialTracks,
        songs: initialTracks,
        songCount: isCurated ? Math.max(Number(detail.songCount || 0), detail.songIds?.length || 0, initialTracks.length, 50) : Math.max(Number(detail.songCount || 0), detail.songIds?.length || 0, initialTracks.length),
      };
      setPlaylist(initialDetail);
      setDraftName(playlistTitle(initialDetail));
      setDraftDescription(String(initialDetail.description || ''));
      setSongs(initialTracks);

      if (token) {
        void trackRecentlyPlayedPlaylist(token, {
          ...detail,
          songCount: initialDetail.songCount,
        }).catch(() => {});
      }

      try {
        const nextSongs = await fetchPlaylistSongs(detail);
        if (generation !== loadGenerationRef.current) return;
        const enrichedDetail: Playlist = {
          ...detail,
          tracks: nextSongs.length ? nextSongs : initialTracks,
          songs: nextSongs.length ? nextSongs : initialTracks,
          songCount: nextSongs.length || initialTracks.length || detail.songCount || (isCurated ? 50 : 0),
        };
        setPlaylist(enrichedDetail);
        setSongs(nextSongs.length ? nextSongs : initialTracks);
      } catch {
        // Keep the usable metadata and any embedded tracks on screen. Pull to
        // refresh retries provider resolution without breaking navigation.
      }
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this playlist');
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id, token]);

  useEffect(() => {
    setPlaylist(null);
    setSongs([]);
    setActionSong(null);
    setEditing(false);
    setSearchQuery('');
    setIsSearchVisible(false);
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load(false);

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void load(false);
        }
      });

      return () => {
        sub.remove();
      };
    }, [load])
  );

  // Web playlist page washes the header with the artwork's dominant color.
  // Resolution walks many fields and runs regexes; memoize it so 2 Hz progress
  // re-renders do not recompute, and so it exists before the early returns.
  const paletteCover = useMemo(
    () => (playlist ? playlistArtworkUrl(playlist, 64, songs) : ''),
    [playlist, songs]
  );

  const filteredSongs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return songs;
    return songs.filter((s) => {
      const name = String(s.name || s.title || '').toLowerCase();
      const artist = artistNames(s).toLowerCase();
      return name.includes(query) || artist.includes(query);
    });
  }, [searchQuery, songs]);

  const isPlaylistActive = useMemo(() => {
    return Boolean(currentSong && songs.some((s) => s.id === currentSong.id));
  }, [currentSong, songs]);

  const handlePlayToggle = async () => {
    if (!songs.length || playing) return;
    if (isPlaylistActive) {
      await togglePlayback();
      return;
    }
    await playFrom(0, isShuffle);
  };

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
    return (
      <SafeAreaView style={styles.safe}><CatalogDetailSkeleton /></SafeAreaView>
    );
  }

  if (!playlist) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Playlist unavailable</Text>
          <Text style={styles.errorBody}>{error || 'This playlist could not be loaded.'}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const rawOwner =
    typeof playlist.owner === 'string' && playlist.owner
      ? playlist.owner
      : String(
          (playlist as any).ownerName ||
            (playlist as any).userName ||
            (playlist as any).subtitle ||
            (owned ? 'You' : 'Harmonia')
        );

  const owner =
    !rawOwner || rawOwner.trim().toLowerCase() === 'spotify'
      ? (owned ? 'You' : 'Harmonia')
      : rawOwner;

  const isCuratedPlaylist = playlist.source === 'spotify' || playlist.catalogSource === 'bundled' || Boolean(playlist.sourceUrl?.includes('spotify')) || Boolean(playlist.spotifyId);
  const count = songs.length || (isCuratedPlaylist ? 50 : Math.max(Number(playlist.songCount || 0), playlist.songIds?.length || 0));
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  const cleanDescription = (playlist.description || '')
    .replace(/\bon Spotify\b/gi, 'on Harmonia')
    .replace(/\bSpotify\b/gi, 'Harmonia')
    .trim();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ArtworkColorHeader artworkUrl={paletteCover} enabled={!batterySaver} height={330} />

      <FlatList
        data={filteredSongs}
        removeClippedSubviews={true}
        keyExtractor={(item, index) => item.id || String(index)}
        initialNumToRender={SONG_LIST_INITIAL_RENDER}
        maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
        updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
        windowSize={SONG_LIST_WINDOW_SIZE}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: contentBottomInset }]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor="#FFF"
            colors={['#FFF']}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <BackButton />
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => void sharePlaylist(playlist)}
                  style={styles.headerAction}
                  accessibilityLabel="Share playlist"
                >
                  <Ionicons name="share-outline" size={20} color={colors.textStrong} />
                </Pressable>
                {owned ? (
                  <Pressable
                    onPress={() => setEditing((value) => !value)}
                    style={styles.headerAction}
                  >
                    <Ionicons name={editing ? 'close' : 'create-outline'} size={20} color={colors.textStrong} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      void togglePlaylistLike(playlist);
                    }}
                    style={styles.headerAction}
                    accessibilityLabel={isPlaylistLiked(id) ? 'Remove from library' : 'Save playlist'}
                  >
                    <Ionicons
                      name={isPlaylistLiked(id) ? 'heart' : 'heart-outline'}
                      size={20}
                      color={isPlaylistLiked(id) ? colors.danger : colors.textStrong}
                    />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Keep artwork and title separate, matching the native Spotify playlist layout. */}
            <View style={styles.heroSection}>
              <View style={styles.artworkContainer}>
                <PlaylistArtwork playlist={playlist} size={292} radius={4} tracks={songs} />
              </View>

              <View style={styles.heroCopy}>
                <Text numberOfLines={2} style={styles.title}>
                  {playlistTitle(playlist)}
                </Text>
                {editing ? (
                  <View style={styles.editBox}>
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      placeholder="Playlist name"
                      placeholderTextColor={colors.textFaint}
                      style={styles.input}
                    />
                    <TextInput
                      value={draftDescription}
                      onChangeText={setDraftDescription}
                      placeholder="Description"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      style={[styles.input, styles.descriptionInput]}
                    />
                    <View style={styles.editActions}>
                      <Pressable
                        disabled={saving || !draftName.trim()}
                        onPress={() => void saveEdits()}
                        style={styles.saveButton}
                      >
                        {saving ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.saveText}>Save changes</Text>
                        )}
                      </Pressable>
                      <Pressable onPress={confirmDelete} style={styles.deleteButton}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    {!!cleanDescription && (
                      <Text style={styles.description} numberOfLines={2}>
                        {cleanDescription}
                      </Text>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>{owner}</Text>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{count} {count === 1 ? 'song' : 'songs'}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Spotify-style controls: playlist artwork/actions stay left; play stays right. */}
            {!editing && (
              <View style={styles.controlsBar}>
                <Pressable
                  onPress={() => {
                    // playSong synchronously installs the playlist queue before
                    // resolving audio. Do not await its network work here:
                    // Clips can render the first cover immediately.
                    if (songs[0]) void playSong(songs[0], songs);
                    router.push({ pathname: '/clips', params: { playlistId: id } });
                  }}
                  style={({ pressed }) => [styles.controlArtwork, pressed && styles.pressed]}
                  accessibilityLabel="Open Music Clips"
                >
                  <PlaylistArtwork playlist={playlist} size={48} radius={5} tracks={songs} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (owned) setEditing(true);
                    else void togglePlaylistLike(playlist);
                  }}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel={owned ? 'Edit playlist' : isPlaylistLiked(id) ? 'Remove from library' : 'Save playlist'}
                >
                  <Ionicons
                    name={owned || isPlaylistLiked(id) ? 'checkmark' : 'add'}
                    size={27}
                    color={isPlaylistLiked(id) ? colors.accent : colors.textMuted}
                  />
                </Pressable>

                <Pressable
                  onPress={() => setActionSong(songs[0] || null)}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel="Download playlist tracks"
                >
                  <Ionicons name="arrow-down-circle-outline" size={26} color={colors.textMuted} />
                </Pressable>

                <Pressable
                  onPress={() => setIsSearchVisible((value) => !value)}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel="More playlist actions"
                >
                  <Ionicons name="ellipsis-vertical" size={22} color={colors.textMuted} />
                </Pressable>

                <View style={styles.controlsSpacer} />

                <Pressable
                  onPress={() => setIsShuffle((val) => !val)}
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityLabel="Shuffle"
                >
                  <Ionicons
                    name="shuffle"
                    size={25}
                    color={isShuffle ? colors.accent : colors.textMuted}
                  />
                </Pressable>

                <Pressable
                  disabled={!songs.length || playing}
                  onPress={() => void handlePlayToggle()}
                  style={({ pressed }) => [styles.playButtonCircle, pressed && styles.pressed]}
                  accessibilityLabel="Play playlist"
                >
                  {playing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name={isPlaylistActive && isPlaying ? 'pause' : 'play'}
                      size={27}
                      color="#FFFFFF"
                      style={isPlaylistActive && isPlaying ? undefined : { marginLeft: 3 }}
                    />
                  )}
                </Pressable>
              </View>
            )}

            {isSearchVisible && !editing && (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search in playlist"
                  placeholderTextColor={colors.textFaint}
                  style={styles.searchInput}
                  autoFocus
                />
                {!!searchQuery && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                  </Pressable>
                )}
              </View>
            )}

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
          loading || (!songs.length && !error) ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.loadingStateText}>Loading tracks...</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matching tracks' : 'No tracks yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {searchQuery
                  ? `No songs match "${searchQuery}".`
                  : owned
                  ? 'Add songs from Search or Now Playing.'
                  : 'No playable tracks are available in this playlist.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={styles.songRowWrap}>
            <SongRow
              song={item}
              index={index}
              showIndex={true}
              isPlaying={isPlaying && currentSong?.id === item.id}
              active={currentSong?.id === item.id}
              onPress={() => void playFrom(index)}
              onMorePress={() => setActionSong(item)}
              trailing={
                owned ? (
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
                    {removingSongId === item.id ? (
                      <ActivityIndicator color={colors.textFaint} size="small" />
                    ) : (
                      <Ionicons name="remove-circle-outline" size={20} color={colors.textFaint} />
                    )}
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        )}
      />
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
      <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 40 },
  top: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  artworkContainer: {
    width: 292,
    height: 292,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 9,
    overflow: 'hidden',
    borderRadius: 4,
  },
  heroCopy: { alignItems: 'flex-start', width: '100%' },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginBottom: 10,
    width: '100%',
  },
  description: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 2,
    width: '100%',
  },
  metaDot: { color: colors.textFaint, fontSize: 11 },
  metaText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    width: '100%',
    gap: 10,
  },
  controlArtwork: {
    width: 48,
    height: 48,
    borderRadius: 5,
    overflow: 'hidden',
    marginRight: 2,
  },
  playButtonCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsSpacer: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    marginTop: 12,
    gap: 8,
    width: '100%',
  },
  searchInput: {
    flex: 1,
    color: colors.textStrong,
    fontSize: 13,
    paddingVertical: 0,
  },
  editBox: { width: '100%', gap: 10, marginTop: 4 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#121212',
    color: colors.textStrong,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  descriptionInput: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 10 },
  saveButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  deleteButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 6,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: colors.textStrong, fontSize: 20, fontWeight: '800' },
  errorBody: { color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  retry: {
    marginTop: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  inlineError: { color: colors.danger, fontSize: 12 },
  retryInline: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
  loadingState: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingStateText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  removeTrack: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  songRowWrap: { paddingHorizontal: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});

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
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { albumTitle, artistTitle, imageUrl } from '@/src/lib/entities';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { useLocalMusic } from '@/src/providers/LocalMusicProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Song } from '@/src/types';

type LibraryTab = 'playlists' | 'saved' | 'liked' | 'downloads' | 'local' | 'history';

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function LibraryScreen() {
  const { token } = useAuth();
  const {
    playlists,
    likedSongs,
    likedPlaylists,
    likedAlbums,
    likedArtists,
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
  const {
    currentSong,
    playSong,
    history,
    listeningStats,
    clearHistory,
  } = usePlayer();

  const [tab, setTab] = useState<LibraryTab>('playlists');
  const [newPlaylist, setNewPlaylist] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [playlistView, setPlaylistView] = useState<'list' | 'grid'>('list');

  const submitPlaylist = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!newPlaylist.trim() || creating) return;
    setCreating(true);
    const result = await createPlaylist(newPlaylist);
    if (result) {
      setNewPlaylist('');
      const id = String(result._id || result.id || '');
      if (id) router.push({ pathname: '/playlist/[id]', params: { id } });
    }
    setCreating(false);
  };

  const accountGate = (
    <View style={styles.accountGate}>
      <Text style={styles.gateKicker}>HARMONIA ACCOUNT</Text>
      <Text style={styles.gateTitle}>Keep your library in sync.</Text>
      <Text style={styles.gateBody}>Liked songs, saved albums, followed artists and playlists use the same account as Harmonia Web.</Text>
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
          onMorePress={() => setActionSong(item)}
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
          <Pressable onPress={() => void refresh()} style={styles.refresh} accessibilityLabel="Sync library">
            {refreshing ? <ActivityIndicator color="#AAA" size="small" /> : <Ionicons name="refresh" size={20} color="#A0A0A0" />}
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsScroller}>
        {([
          ['playlists', 'Playlists'],
          ['saved', 'Saved'],
          ['liked', 'Liked Songs'],
          ['downloads', `Downloads · ${downloads.length}`],
          ['local', 'On device'],
          ['history', 'History'],
        ] as Array<[LibraryTab, string]>).map(([value, label]) => (
          <Pressable key={value} onPress={() => setTab(value)} style={[styles.chip, tab === value && styles.chipActive]}>
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
                <Pressable disabled={creating || !newPlaylist.trim()} onPress={() => void submitPlaylist()} style={styles.createButton}>
                  {creating ? <ActivityIndicator color="#080808" size="small" /> : <Ionicons name="add" size={22} color="#080808" />}
                </Pressable>
              </View>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.viewToolbar}>
              <View>
                <Text style={styles.viewToolbarLabel}>VIEW</Text>
                <Text style={styles.viewToolbarMeta}>{playlists.length} playlist{playlists.length === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.viewToggle}>
                <Pressable
                  onPress={() => setPlaylistView('list')}
                  style={[styles.viewToggleButton, playlistView === 'list' && styles.viewToggleButtonActive]}
                  accessibilityLabel="List view"
                >
                  <Ionicons name="list" size={18} color={playlistView === 'list' ? '#080808' : '#777'} />
                </Pressable>
                <Pressable
                  onPress={() => setPlaylistView('grid')}
                  style={[styles.viewToggleButton, playlistView === 'grid' && styles.viewToggleButtonActive]}
                  accessibilityLabel="Grid view"
                >
                  <Ionicons name="grid-outline" size={17} color={playlistView === 'grid' ? '#080808' : '#777'} />
                </Pressable>
              </View>
            </View>

            {playlists.length ? (
              playlistView === 'grid' ? (
                <View style={styles.playlistGrid}>
                  {playlists.map((playlist) => {
                    const id = String(playlist._id || playlist.id || '');
                    return (
                      <Pressable
                        key={id || playlist.name}
                        disabled={!id}
                        onPress={() => router.push({ pathname: '/playlist/[id]', params: { id } })}
                        style={({ pressed }) => [styles.playlistGridCard, pressed && styles.pressed]}
                      >
                        <PlaylistArtwork playlist={playlist} size={148} radius={16} />
                        <Text numberOfLines={1} style={styles.playlistGridName}>{playlist.name}</Text>
                        <Text numberOfLines={1} style={styles.playlistGridMeta}>
                          {playlist.description || `${playlist.songCount ?? playlist.songIds?.length ?? 0} songs`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                playlists.map((playlist) => {
                  const id = String(playlist._id || playlist.id || '');
                  return (
                    <Pressable
                      key={id || playlist.name}
                      disabled={!id}
                      onPress={() => router.push({ pathname: '/playlist/[id]', params: { id } })}
                      style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}
                    >
                      <PlaylistArtwork playlist={playlist} size={68} radius={13} />
                      <View style={styles.playlistCopy}>
                        <Text numberOfLines={1} style={styles.playlistName}>{playlist.name}</Text>
                        <Text numberOfLines={1} style={styles.playlistMeta}>{playlist.description || `${playlist.songCount ?? playlist.songIds?.length ?? 0} songs`}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#585858" />
                    </Pressable>
                  );
                })
              )
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No playlists yet</Text>
                <Text style={styles.emptyBody}>Create one here and it will also appear in Harmonia Web.</Text>
              </View>
            )}
            )}
          </ScrollView>
        )
      )}

      {tab === 'saved' && (
        !token ? accountGate : loading ? (
          <View style={styles.center}><ActivityIndicator color="#FFF" /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.savedContent} showsVerticalScrollIndicator={false}>
            {!!error && <Text style={styles.error}>{error}</Text>}

            <SavedSection title="Saved playlists" count={likedPlaylists.length}>
              {likedPlaylists.length ? likedPlaylists.map((playlist, index) => {
                const id = String(playlist.id || playlist._id || '');
                return (
                  <Pressable
                    key={id || `saved-playlist-${index}`}
                    disabled={!id}
                    onPress={() => router.push({ pathname: '/playlist/[id]', params: { id } })}
                    style={styles.savedRow}
                  >
                    <PlaylistArtwork playlist={playlist} size={58} radius={12} />
                    <View style={styles.savedCopy}>
                      <Text numberOfLines={1} style={styles.savedTitle}>{playlist.name}</Text>
                      <Text numberOfLines={1} style={styles.savedMeta}>{playlist.owner || 'Harmonia'}{playlist.songCount ? ` · ${playlist.songCount} songs` : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#555" />
                  </Pressable>
                );
              }) : <SavedEmpty text="Playlists you save on web or mobile appear here." />}
            </SavedSection>

            <SavedSection title="Albums" count={likedAlbums.length}>
              {likedAlbums.length ? likedAlbums.map((album, index) => {
                const id = String(album.id || '');
                const cover = imageUrl(album.image as any);
                return (
                  <Pressable
                    key={id || `album-${index}`}
                    disabled={!id}
                    onPress={() => router.push({ pathname: '/album/[id]', params: { id } })}
                    style={styles.savedRow}
                  >
                    {cover ? <Image source={{ uri: cover }} style={styles.savedImage} contentFit="cover" cachePolicy="memory-disk" /> : <EntityFallback icon="disc-outline" />}
                    <View style={styles.savedCopy}>
                      <Text numberOfLines={1} style={styles.savedTitle}>{albumTitle(album)}</Text>
                      <Text numberOfLines={1} style={styles.savedMeta}>{album.primaryArtists || album.year || 'Album'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#555" />
                  </Pressable>
                );
              }) : <SavedEmpty text="Albums you save in Harmonia appear here." />}
            </SavedSection>

            <SavedSection title="Artists" count={likedArtists.length}>
              {likedArtists.length ? likedArtists.map((artist, index) => {
                const id = String(artist.id || '');
                const cover = imageUrl(artist.image as any);
                return (
                  <Pressable
                    key={id || `artist-${index}`}
                    disabled={!id}
                    onPress={() => router.push({ pathname: '/artist/[id]', params: { id } })}
                    style={styles.savedRow}
                  >
                    {cover ? <Image source={{ uri: cover }} style={[styles.savedImage, styles.roundImage]} contentFit="cover" cachePolicy="memory-disk" /> : <EntityFallback icon="person-outline" round />}
                    <View style={styles.savedCopy}>
                      <Text numberOfLines={1} style={styles.savedTitle}>{artistTitle(artist)}</Text>
                      <Text numberOfLines={1} style={styles.savedMeta}>{artist.followerCount ? `${Number(artist.followerCount).toLocaleString()} followers` : 'Artist'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#555" />
                  </Pressable>
                );
              }) : <SavedEmpty text="Artists you follow in Harmonia appear here." />}
            </SavedSection>
          </ScrollView>
        )
      )}

      {tab === 'liked' && (
        !token ? accountGate : renderSongList(
          likedSongs,
          'No liked songs yet',
          'Like songs from Search or Now Playing and they will stay synchronized with Harmonia Web.',
          (song) => (
            <Pressable onPress={() => void toggleLike(song)} style={styles.rowAction} accessibilityLabel="Unlike song">
              <Ionicons name="heart" size={19} color="#F1F1F1" />
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
            'Open Now Playing → Tools and download a track. Harmonia uses the local copy when available.',
            (song) => (
              <Pressable onPress={() => void removeDownload(song.id)} style={styles.rowAction} accessibilityLabel="Remove download">
                <Ionicons name="trash-outline" size={19} color="#858585" />
              </Pressable>
            )
          )}
        </View>
      )}

      {tab === 'history' && (
        <View style={styles.flex}>
          <View style={styles.historySummary}>
            <HistoryStat value={Math.round(listeningStats.totalSeconds / 60)} label="Minutes" />
            <View style={styles.historyRule} />
            <HistoryStat value={listeningStats.playCount} label="Plays" />
            <View style={styles.historyRule} />
            <HistoryStat value={Object.keys(listeningStats.trackCounts).length} label="Tracks" />
          </View>

          <View style={styles.historyHead}>
            <View>
              <Text style={styles.summaryKicker}>RECENTLY PLAYED</Text>
              <Text style={styles.historyTitle}>Listening history on this phone</Text>
            </View>
            {!!history.length && (
              <Pressable onPress={() => void clearHistory()} style={styles.clearHistory}>
                <Text style={styles.clearHistoryText}>Clear</Text>
              </Pressable>
            )}
          </View>

          <FlatList
            data={history}
            keyExtractor={(item) => item.entryId}
            contentContainerStyle={styles.songList}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No listening history yet</Text>
                <Text style={styles.emptyBody}>Tracks you play in Harmonia will appear here.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <SongRow
                song={item.song}
                active={currentSong?.id === item.song.id}
                onPress={() => void playSong(item.song)}
                trailing={<Text style={styles.historyTime}>{new Date(item.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>}
              />
            )}
          />
        </View>
      )}

      {tab === 'local' && (
        <View style={styles.flex}>
          <View style={styles.localHeader}>
            <View style={styles.localCopy}>
              <Text style={styles.summaryKicker}>LOCAL MUSIC</Text>
              <Text style={styles.localTitle}>{localSongs.length ? `${localSongs.length} tracks on this phone` : 'Play music already on your phone'}</Text>
            </View>
            <Pressable disabled={localLoading} onPress={() => void scanLocalMusic()} style={styles.scanButton}>
              {localLoading ? <ActivityIndicator color="#080808" size="small" /> : <Text style={styles.scanButtonText}>{localSongs.length ? 'Rescan' : 'Scan'}</Text>}
            </Pressable>
          </View>
          {permissionDenied && <Text style={styles.permissionError}>Audio-library permission is required to show music stored on this device.</Text>}
          {renderSongList(localSongs, 'No local tracks loaded', 'Tap Scan to let Harmonia find audio stored on this phone.')}
        </View>
      )}

      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function SavedSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.savedSection}>
      <View style={styles.savedHeader}>
        <Text style={styles.savedHeaderTitle}>{title}</Text>
        <Text style={styles.savedHeaderCount}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function SavedEmpty({ text }: { text: string }) {
  return <Text style={styles.savedEmpty}>{text}</Text>;
}

function EntityFallback({ icon, round = false }: { icon: keyof typeof Ionicons.glyphMap; round?: boolean }) {
  return (
    <View style={[styles.savedImage, styles.entityFallback, round && styles.roundImage]}>
      <Ionicons name={icon} size={24} color="#5B5B5B" />
    </View>
  );
}

function HistoryStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.historyStat}>
      <Text style={styles.historyValue}>{value}</Text>
      <Text style={styles.historyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  tabsScroller: { flexGrow: 0, marginTop: 14, marginBottom: 5 },
  tabs: { gap: 8, paddingHorizontal: 18, paddingVertical: 4 },
  chip: { paddingHorizontal: 15, height: 34, borderRadius: 17, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#EEEEEE' },
  chipText: { color: '#888', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#090909' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 165 },
  savedContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 165 },
  songList: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 165, flexGrow: 1 },
  createBox: { backgroundColor: '#101010', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 14, marginBottom: 18 },
  createTitle: { color: '#777', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  createRow: { flexDirection: 'row', gap: 9 },
  input: { flex: 1, height: 46, borderRadius: 13, backgroundColor: '#181818', color: '#FFF', paddingHorizontal: 14, fontSize: 14 },
  createButton: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  viewToolbar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  viewToolbarLabel: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  viewToolbarMeta: { color: '#8A8A8A', fontSize: 11, marginTop: 3 },
  viewToggle: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 13, backgroundColor: '#111', borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424' },
  viewToggleButton: { width: 36, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  viewToggleButtonActive: { backgroundColor: '#EDEDED' },
  playlistGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 22 },
  playlistGridCard: { width: '48%', minWidth: 0 },
  playlistGridName: { color: '#ECECEC', fontSize: 13, fontWeight: '800', marginTop: 9 },
  playlistGridMeta: { color: '#666', fontSize: 10, lineHeight: 14, marginTop: 3 },
  playlistRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#171717' },
  playlistCopy: { flex: 1, marginLeft: 13, minWidth: 0 },
  playlistName: { color: '#F0F0F0', fontSize: 15, fontWeight: '700' },
  playlistMeta: { color: '#6E6E6E', fontSize: 12, marginTop: 4 },
  savedSection: { marginBottom: 26 },
  savedHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 },
  savedHeaderTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800' },
  savedHeaderCount: { color: '#5D5D5D', fontSize: 11, fontWeight: '700' },
  savedRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#171717' },
  savedImage: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#111' },
  roundImage: { borderRadius: 29 },
  entityFallback: { alignItems: 'center', justifyContent: 'center' },
  savedCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  savedTitle: { color: '#E9E9E9', fontSize: 14, fontWeight: '700' },
  savedMeta: { color: '#6A6A6A', fontSize: 11, marginTop: 3 },
  savedEmpty: { color: '#666', fontSize: 12, lineHeight: 18, paddingVertical: 14 },
  rowAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  historySummary: { marginHorizontal: 18, marginTop: 9, minHeight: 86, borderRadius: 18, backgroundColor: '#101010', borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', flexDirection: 'row', alignItems: 'center' },
  historyStat: { flex: 1, alignItems: 'center' },
  historyValue: { color: '#F1F1F1', fontSize: 21, fontWeight: '800' },
  historyLabel: { color: '#686868', fontSize: 10, fontWeight: '700', marginTop: 3 },
  historyRule: { width: StyleSheet.hairlineWidth, height: 42, backgroundColor: '#292929' },
  historyHead: { marginHorizontal: 18, marginTop: 18, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { color: '#D8D8D8', fontSize: 14, fontWeight: '700', marginTop: 4 },
  clearHistory: { minWidth: 54, height: 34, borderRadius: 11, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  clearHistoryText: { color: '#999', fontSize: 11, fontWeight: '700' },
  historyTime: { color: '#636363', fontSize: 10, fontWeight: '700', paddingHorizontal: 4 },
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { albumTitle, artistTitle, imageUrl } from '@/src/lib/entities';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist } from '@/src/types';

type LibraryTab = 'playlists' | 'albums' | 'artists';
type LibraryViewMode = 'list' | 'grid';

const LIBRARY_VIEW_KEY = 'harmonia.mobile.library-view.v1';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token, user } = useAuth();
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
    createPlaylist,
  } = useLibrary();
  const { currentSong, playSong } = usePlayer();

  const [tab, setTab] = useState<LibraryTab>('playlists');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState('');
  const [creating, setCreating] = useState(false);
  const viewModeMutationRef = useRef(0);

  const gridArtworkSize = Math.max(136, Math.floor((width - 44) / 2));
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  useEffect(() => {
    const generation = viewModeMutationRef.current;
    AsyncStorage.getItem(LIBRARY_VIEW_KEY)
      .then((value) => {
        if (generation !== viewModeMutationRef.current) return;
        if (value === 'list' || value === 'grid') setViewMode(value);
      })
      .catch(() => {});
  }, []);

  const toggleViewMode = () => {
    const next: LibraryViewMode = viewMode === 'list' ? 'grid' : 'list';
    viewModeMutationRef.current += 1;
    setViewMode(next);
    AsyncStorage.setItem(LIBRARY_VIEW_KEY, next).catch(() => {});
  };

  const submitPlaylist = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!newPlaylist.trim() || creating) return;
    setCreating(true);
    try {
      const created = await createPlaylist(newPlaylist);
      if (created) {
        setNewPlaylist('');
        setShowCreate(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();

  const libraryPlaylists = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...playlists, ...likedPlaylists].filter((playlist) => {
      const id = String(playlist.id || playlist._id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const filtered = normalizedQuery
      ? merged.filter((playlist) => String(playlist.name || '').toLowerCase().includes(normalizedQuery))
      : merged;

    const likedCard = {
      id: 'liked-songs',
      _id: 'liked-songs',
      name: 'Liked Songs',
      description: 'Playlist',
      songCount: likedSongs.length,
    } as Playlist;

    return [likedCard, ...filtered];
  }, [likedPlaylists, likedSongs.length, normalizedQuery, playlists]);

  const filteredAlbums = useMemo(
    () => normalizedQuery
      ? likedAlbums.filter((album) => albumTitle(album).toLowerCase().includes(normalizedQuery))
      : likedAlbums,
    [likedAlbums, normalizedQuery]
  );

  const filteredArtists = useMemo(
    () => normalizedQuery
      ? likedArtists.filter((artist) => artistTitle(artist).toLowerCase().includes(normalizedQuery))
      : likedArtists,
    [likedArtists, normalizedQuery]
  );

  const initial = (user?.name || user?.email || 'H').trim().charAt(0).toUpperCase();

  const accountGate = (
    <View style={[styles.accountGate, { paddingBottom: contentBottomInset }]}>
      <Text style={styles.gateTitle}>Your library, everywhere.</Text>
      <Text style={styles.gateBody}>Sign in to keep your liked songs, playlists, saved albums, and followed artists in sync.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.signIn}>
        <Text style={styles.signInText}>Sign in</Text>
      </Pressable>
    </View>
  );

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (id === 'liked-songs') {
      if (likedSongs.length) void playSong(likedSongs[0], likedSongs);
      return;
    }
    if (id) router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  const renderPlaylist = ({ item }: { item: Playlist }) => {
    const id = String(item.id || item._id || '');
    const liked = id === 'liked-songs';
    const count = liked ? likedSongs.length : (item.songCount ?? item.songIds?.length ?? 0);

    if (viewMode === 'list') {
      return (
        <Pressable onPress={() => openPlaylist(item)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
          {liked ? (
            <View style={styles.likedListArtwork}>
              <Ionicons name="heart" size={25} color="#FFF" />
            </View>
          ) : (
            <PlaylistArtwork playlist={item} size={62} radius={2} />
          )}
          <View style={styles.listCopy}>
            <Text numberOfLines={1} style={styles.itemTitle}>{item.name}</Text>
            <Text numberOfLines={1} style={styles.itemMeta}>{liked ? 'Playlist' : `${count} ${count === 1 ? 'song' : 'songs'}`}</Text>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() => openPlaylist(item)}
        style={({ pressed }) => [styles.gridCard, { width: gridArtworkSize }, pressed && styles.pressed]}
      >
        {liked ? (
          <View style={[styles.likedArtwork, { width: gridArtworkSize, height: gridArtworkSize }]}>
            <Ionicons name="heart" size={68} color="#FFF" />
          </View>
        ) : (
          <PlaylistArtwork playlist={item} size={gridArtworkSize} radius={0} />
        )}
        <Text numberOfLines={1} style={styles.itemTitle}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>
          {liked
            ? `Playlist · ${likedSongs.length} ${likedSongs.length === 1 ? 'song' : 'songs'}`
            : `${count} ${count === 1 ? 'song' : 'songs'}`}
        </Text>
      </Pressable>
    );
  };

  const renderAlbum = ({ item }: { item: HarmoniaAlbum }) => {
    const id = String(item.id || '');
    const cover = imageUrl(item.image as any, gridArtworkSize);
    return (
      <Pressable
        disabled={!id}
        onPress={() => id && router.push({ pathname: '/album/[id]', params: { id } })}
        style={({ pressed }) => [styles.gridCard, { width: gridArtworkSize }, pressed && styles.pressed]}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: gridArtworkSize, height: gridArtworkSize }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.entityFallback, { width: gridArtworkSize, height: gridArtworkSize }]}>
            <Ionicons name="disc-outline" size={46} color="#777" />
          </View>
        )}
        <Text numberOfLines={1} style={styles.itemTitle}>{albumTitle(item)}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>{item.primaryArtists || item.year || 'Album'}</Text>
      </Pressable>
    );
  };

  const renderArtist = ({ item }: { item: HarmoniaArtistEntity }) => {
    const id = String(item.id || '');
    const cover = imageUrl(item.image as any, gridArtworkSize);
    return (
      <Pressable
        disabled={!id}
        onPress={() => id && router.push({ pathname: '/artist/[id]', params: { id } })}
        style={({ pressed }) => [styles.gridCard, { width: gridArtworkSize }, pressed && styles.pressed]}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={[styles.artistArtwork, { width: gridArtworkSize, height: gridArtworkSize }]} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.entityFallback, styles.artistArtwork, { width: gridArtworkSize, height: gridArtworkSize }]}>
            <Ionicons name="person-outline" size={46} color="#777" />
          </View>
        )}
        <Text numberOfLines={1} style={styles.itemTitle}>{artistTitle(item)}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>Artist</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} accessibilityLabel="Open profile">
          {user?.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.title}>Your Library</Text>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => {
              setSearchOpen((value) => !value);
              if (searchOpen) setQuery('');
            }}
            style={styles.iconButton}
            accessibilityLabel="Search library"
          >
            <Ionicons name="search-outline" size={29} color="#E6E6E6" />
          </Pressable>
          <Pressable onPress={() => setShowCreate((value) => !value)} style={styles.iconButton} accessibilityLabel="Create playlist">
            <Ionicons name="add" size={34} color="#E6E6E6" />
          </Pressable>
        </View>
      </View>

      {searchOpen && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#777" />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search your library"
            placeholderTextColor="#777"
            style={styles.searchInput}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={19} color="#777" />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.filters}>
        {([
          ['playlists', 'Playlists'],
          ['albums', 'Albums'],
          ['artists', 'Artists'],
        ] as [LibraryTab, string][]).map(([value, label]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            key={value}
            onPress={() => setTab(value)}
            style={[styles.filterChip, tab === value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, tab === value && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {showCreate && (
        <View style={styles.createPanel}>
          <TextInput
            value={newPlaylist}
            onChangeText={setNewPlaylist}
            placeholder="Playlist name"
            placeholderTextColor="#6A6A6A"
            style={styles.createInput}
            onSubmitEditing={() => void submitPlaylist()}
          />
          <Pressable
            disabled={creating || !newPlaylist.trim()}
            onPress={() => void submitPlaylist()}
            style={[styles.createButton, (!newPlaylist.trim() || creating) && styles.createButtonDisabled]}
          >
            {creating ? <ActivityIndicator color="#111" size="small" /> : <Text style={styles.createButtonText}>Create</Text>}
          </Pressable>
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.sortRow}>
        <Pressable onPress={() => void refresh()} style={styles.sortButton} accessibilityLabel="Refresh library">
          {refreshing ? <ActivityIndicator color="#CFCFCF" size="small" /> : <Ionicons name="refresh" size={20} color="#E4E4E4" />}
          <Text style={styles.sortText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={toggleViewMode} style={styles.viewButton} accessibilityLabel={viewMode === 'grid' ? 'Use list view' : 'Use grid view'}>
          <Ionicons name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'} size={28} color="#D3D3D3" />
        </Pressable>
      </View>

      {!token ? accountGate : loading ? (
        <View style={styles.center}><ActivityIndicator color="#FFF" /></View>
      ) : tab === 'playlists' ? (
        <FlatList<Playlist>
          key={`playlists-${viewMode}`}
          data={libraryPlaylists}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={(item, index) => String(item.id || item._id || index)}
          renderItem={renderPlaylist}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFF" />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={SONG_LIST_INITIAL_RENDER}
          maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
          updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
          windowSize={SONG_LIST_WINDOW_SIZE}
          ListEmptyComponent={<LibraryEmpty title="No playlists yet" />}
        />
      ) : tab === 'albums' ? (
        <FlatList<HarmoniaAlbum>
          key="albums-grid"
          data={filteredAlbums}
          numColumns={2}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderAlbum}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={SONG_LIST_INITIAL_RENDER}
          maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
          updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
          windowSize={SONG_LIST_WINDOW_SIZE}
          ListEmptyComponent={<LibraryEmpty title="No saved albums yet" />}
        />
      ) : (
        <FlatList<HarmoniaArtistEntity>
          key="artists-grid"
          data={filteredArtists}
          numColumns={2}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderArtist}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={SONG_LIST_INITIAL_RENDER}
          maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
          updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
          windowSize={SONG_LIST_WINDOW_SIZE}
          ListEmptyComponent={<LibraryEmpty title="No followed artists yet" />}
        />
      )}

      {!!error && <Text numberOfLines={1} style={styles.error}>{error}</Text>}
    </SafeAreaView>
  );
}

function LibraryEmpty({ title }: { title: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>Save something in Harmonia and it will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  topBar: {
    minHeight: 82,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#273047' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  title: { color: '#F7F7F7', fontSize: 30, fontWeight: '900', letterSpacing: -0.9, marginLeft: 14, flex: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    height: 46,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchInput: { flex: 1, color: '#F0F0F0', fontSize: 15, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 18 },
  filterChip: {
    height: 50,
    minWidth: 112,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: '#F0F0F0' },
  filterText: { color: '#D5D5D5', fontSize: 14, fontWeight: '700' },
  filterTextActive: { color: '#111111' },
  createPanel: {
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 9,
  },
  createInput: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: '#181818',
    color: '#F5F5F5',
    paddingHorizontal: 13,
    fontSize: 14,
  },
  createButton: {
    height: 44,
    minWidth: 76,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.45 },
  createButtonText: { color: '#111', fontSize: 13, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#232323' },
  sortRow: {
    height: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sortText: { color: '#DADADA', fontSize: 14, fontWeight: '700' },
  viewButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  gridRow: { justifyContent: 'space-between' },
  gridCard: { marginBottom: 20 },
  likedArtwork: { backgroundColor: '#6266F2', alignItems: 'center', justifyContent: 'center' },
  likedListArtwork: { width: 62, height: 62, backgroundColor: '#6266F2', alignItems: 'center', justifyContent: 'center' },
  artistArtwork: { borderRadius: 999 },
  entityFallback: { backgroundColor: '#202020', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: '#F1F1F1', fontSize: 17, fontWeight: '800', marginTop: 9 },
  itemMeta: { color: '#8B8B8B', fontSize: 14, fontWeight: '500', marginTop: 4 },
  listRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  listCopy: { flex: 1, minWidth: 0, marginLeft: 13 },
  pressed: { opacity: 0.72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 72, alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { color: '#E8E8E8', fontSize: 18, fontWeight: '800' },
  emptyBody: { color: '#737373', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  accountGate: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  gateTitle: { color: '#F2F2F2', fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7 },
  gateBody: { color: '#777', fontSize: 14, lineHeight: 21, marginTop: 10 },
  signIn: { height: 50, marginTop: 22, borderRadius: 15, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  signInText: { color: '#101010', fontSize: 14, fontWeight: '800' },
  error: { position: 'absolute', left: 16, right: 16, bottom: 12, color: '#E89494', fontSize: 11, backgroundColor: '#1A1010', borderRadius: 10, padding: 9 },
});

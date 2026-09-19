import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { LibrarySkeleton } from '@/src/components/LibrarySkeleton';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { albumTitle, artistTitle, entityImageUrl } from '@/src/lib/entities';
import { playlistFreshness } from '@/src/lib/homeSections';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist } from '@/src/types';

type LibraryTab = 'playlists' | 'albums' | 'artists';
type LibraryViewMode = 'list' | 'grid';
// Screen-side freshness window for focus/foreground refreshes; the provider
// gate (loadIfStale) compares against its own last-loaded timestamp.
const LIBRARY_SCREEN_STALE_MS = 60_000;

const LIBRARY_VIEW_KEY = 'harmonia.mobile.library-view.v1';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
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
    refreshIfStale,
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

  useFocusEffect(
    useCallback(() => {
      // Tab focus refreshes only when the library is stale; the provider
      // owns the freshness threshold so pull-to-refresh stays always-fresh.
      refreshIfStale(LIBRARY_SCREEN_STALE_MS);

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refreshIfStale(LIBRARY_SCREEN_STALE_MS);
        }
      });

      return () => {
        sub.remove();
      };
    }, [refreshIfStale])
  );

  const toggleViewMode = () => {
    const next: LibraryViewMode = viewMode === 'list' ? 'grid' : 'list';
    viewModeMutationRef.current += 1;
    setViewMode(next);
    AsyncStorage.setItem(LIBRARY_VIEW_KEY, next).catch(() => {});
  };

  const submitPlaylist = async () => {
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

    const sorted = [...filtered].sort((a, b) => playlistFreshness(b) - playlistFreshness(a));

    const likedCard = {
      id: 'liked-songs',
      _id: 'liked-songs',
      name: 'Liked Songs',
      description: 'Playlist',
      songCount: likedSongs.length,
    } as Playlist;

    return [likedCard, ...sorted];
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
    const rawCount = liked ? likedSongs.length : (item.songCount ?? item.songIds?.length ?? 0);
    const isSpotifyOrCurated = item.source === 'spotify' || item.catalogSource === 'bundled' || Boolean((item as any).sourceUrl?.includes('spotify')) || Boolean(item.spotifyId);
    const count = !liked && rawCount < 35 && isSpotifyOrCurated ? 50 : rawCount;

    if (viewMode === 'list') {
      return (
        <Pressable onPress={() => openPlaylist(item)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
          {liked ? (
            <View style={styles.likedListArtwork}>
              <Ionicons name="heart" size={25} color="#FF3155" />
            </View>
          ) : (
            <PlaylistArtwork playlist={item} size={62} radius={12} />
          )}
          <View style={styles.listCopy}>
            <Text numberOfLines={1} style={styles.itemTitle}>{item.name}</Text>
            <Text numberOfLines={1} style={styles.itemMeta}>{liked ? `Playlist · ${likedSongs.length} ${likedSongs.length === 1 ? 'song' : 'songs'}` : `${count} ${count === 1 ? 'song' : 'songs'}`}</Text>
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
            <Ionicons name="heart" size={68} color="#FF3155" />
          </View>
        ) : (
          <PlaylistArtwork playlist={item} size={gridArtworkSize} radius={12} />
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
    const cover = entityImageUrl(item, gridArtworkSize);
    return (
      <Pressable
        disabled={!id}
        onPress={() => id && router.push({ pathname: '/album/[id]', params: { id } })}
        style={({ pressed }) => [styles.gridCard, { width: gridArtworkSize }, pressed && styles.pressed]}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={[styles.entityArtwork, { width: gridArtworkSize, height: gridArtworkSize }]} contentFit="cover" cachePolicy="memory-disk" />
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
    const cover = entityImageUrl(item, gridArtworkSize);
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
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')} accessibilityLabel="Open profile">
          {user?.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <Image source={require('../../assets/harmonia-icon.png')} style={[styles.avatar, styles.avatarFallback]} contentFit="contain" />
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

      {loading ? (
        <LibrarySkeleton />
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
          removeClippedSubviews={true}
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
          removeClippedSubviews={true}
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
          removeClippedSubviews={true}
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
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#273047' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.55, marginLeft: 12, flex: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  // Web filter pills: rounded-full secondary bg; active filled with primary
  filterChip: {
    height: 34,
    minWidth: 0,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF', fontWeight: '700' },
  createPanel: {
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 9,
  },
  createInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  createButton: {
    height: 44,
    minWidth: 76,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.45 },
  createButtonText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  sortRow: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sortText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  viewButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  gridRow: { justifyContent: 'space-between' },
  gridCard: { marginBottom: 22 },
  likedArtwork: { backgroundColor: '#9D95D8', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  likedListArtwork: { width: 62, height: 62, borderRadius: 12, backgroundColor: '#9D95D8', alignItems: 'center', justifyContent: 'center' },
  artistArtwork: { borderRadius: 999 },
  entityArtwork: { borderRadius: 12 },
  entityFallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 9 },
  itemMeta: { color: colors.muted, fontSize: 12, fontWeight: '400', marginTop: 3 },
  listRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', marginBottom: 4, borderRadius: 12, paddingHorizontal: 2 },
  listCopy: { flex: 1, minWidth: 0, marginLeft: 13 },
  pressed: { opacity: 0.82 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 72, alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  accountGate: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  gateTitle: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.7 },
  gateBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  signIn: { height: 50, marginTop: 22, borderRadius: 999, backgroundColor: colors.textStrong, alignItems: 'center', justifyContent: 'center' },
  signInText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  error: { position: 'absolute', left: 16, right: 16, bottom: 12, color: '#FCA5A5', fontSize: 11, backgroundColor: '#241414', borderRadius: 10, padding: 9 },
});

import * as Haptics from 'expo-haptics';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addSongToPlaylist,
  createPlaylist as createPlaylistApi,
  fetchLibrary,
  toggleLikedEntity,
  toggleLikedSong,
} from '@/src/lib/api';
import { normalizeSong, persistenceSafeSong } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, Song } from '@/src/types';

type LibraryContextValue = {
  playlists: Playlist[];
  likedSongs: Song[];
  likedPlaylists: Playlist[];
  likedAlbums: HarmoniaAlbum[];
  likedArtists: HarmoniaArtistEntity[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isLiked: (songId: string) => boolean;
  toggleLike: (song: Song) => Promise<boolean | null>;
  isPlaylistLiked: (playlistId: string) => boolean;
  isAlbumLiked: (albumId: string) => boolean;
  isArtistLiked: (artistId: string) => boolean;
  togglePlaylistLike: (playlist: Playlist) => Promise<boolean | null>;
  toggleAlbumLike: (album: HarmoniaAlbum) => Promise<boolean | null>;
  toggleArtistLike: (artist: HarmoniaArtistEntity) => Promise<boolean | null>;
  createPlaylist: (name: string) => Promise<Playlist | null>;
  addToPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: PropsWithChildren) {
  const { token } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>([]);
  const [likedAlbums, setLikedAlbums] = useState<HarmoniaAlbum[]>([]);
  const [likedArtists, setLikedArtists] = useState<HarmoniaArtistEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (!token) {
      setPlaylists([]);
      setLikedSongs([]);
      setLikedPlaylists([]);
      setLikedAlbums([]);
      setLikedArtists([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const library = await fetchLibrary(token);
      setPlaylists(library.playlists || []);
      setLikedSongs((library.likedSongs || []).map((song) => persistenceSafeSong(normalizeSong(song as any))));
      setLikedPlaylists(library.likedPlaylists || []);
      setLikedAlbums(library.likedAlbums || []);
      setLikedArtists(library.likedArtists || []);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to sync your library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const likedIds = useMemo(() => new Set(likedSongs.map((song) => song.id)), [likedSongs]);

  const isLiked = useCallback((songId: string) => likedIds.has(String(songId)), [likedIds]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!token) return null;
    const normalized = persistenceSafeSong(normalizeSong(song as any));
    if (!normalized.id) return null;

    const previouslyLiked = likedIds.has(normalized.id);
    setLikedSongs((current) => previouslyLiked
      ? current.filter((item) => item.id !== normalized.id)
      : [normalized, ...current.filter((item) => item.id !== normalized.id)]
    );

    try {
      const result = await toggleLikedSong(token, normalized);
      Haptics.selectionAsync().catch(() => {});
      if (result.liked !== !previouslyLiked) {
        await load(true);
      }
      return result.liked;
    } catch (cause: any) {
      setLikedSongs((current) => previouslyLiked
        ? [normalized, ...current.filter((item) => item.id !== normalized.id)]
        : current.filter((item) => item.id !== normalized.id)
      );
      setError(cause?.message || 'Could not update liked songs');
      return null;
    }
  }, [likedIds, load, token]);

  const likedPlaylistIds = useMemo(
    () => new Set(likedPlaylists.map((item) => String(item.id || item._id || ''))),
    [likedPlaylists]
  );
  const likedAlbumIds = useMemo(
    () => new Set(likedAlbums.map((item) => String(item.id || ''))),
    [likedAlbums]
  );
  const likedArtistIds = useMemo(
    () => new Set(likedArtists.map((item) => String(item.id || ''))),
    [likedArtists]
  );

  const isPlaylistLiked = useCallback((id: string) => likedPlaylistIds.has(String(id)), [likedPlaylistIds]);
  const isAlbumLiked = useCallback((id: string) => likedAlbumIds.has(String(id)), [likedAlbumIds]);
  const isArtistLiked = useCallback((id: string) => likedArtistIds.has(String(id)), [likedArtistIds]);

  const togglePlaylistLike = useCallback(async (playlist: Playlist) => {
    if (!token) return null;
    const id = String(playlist.id || playlist._id || '');
    if (!id) return null;
    const wasLiked = likedPlaylistIds.has(id);
    setLikedPlaylists((current) => wasLiked
      ? current.filter((item) => String(item.id || item._id || '') !== id)
      : [{ ...playlist, id }, ...current.filter((item) => String(item.id || item._id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'playlists', { ...playlist, id });
      if (result.liked !== !wasLiked) await load(true);
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      await load(true);
      setError(cause?.message || 'Could not update saved playlists');
      return null;
    }
  }, [likedPlaylistIds, load, token]);

  const toggleAlbumLike = useCallback(async (album: HarmoniaAlbum) => {
    if (!token) return null;
    const id = String(album.id || '');
    if (!id) return null;
    const wasLiked = likedAlbumIds.has(id);
    setLikedAlbums((current) => wasLiked
      ? current.filter((item) => String(item.id || '') !== id)
      : [{ ...album, id }, ...current.filter((item) => String(item.id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'albums', { ...album, id });
      if (result.liked !== !wasLiked) await load(true);
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      await load(true);
      setError(cause?.message || 'Could not update saved albums');
      return null;
    }
  }, [likedAlbumIds, load, token]);

  const toggleArtistLike = useCallback(async (artist: HarmoniaArtistEntity) => {
    if (!token) return null;
    const id = String(artist.id || '');
    if (!id) return null;
    const wasLiked = likedArtistIds.has(id);
    setLikedArtists((current) => wasLiked
      ? current.filter((item) => String(item.id || '') !== id)
      : [{ ...artist, id }, ...current.filter((item) => String(item.id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'artists', { ...artist, id });
      if (result.liked !== !wasLiked) await load(true);
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      await load(true);
      setError(cause?.message || 'Could not update followed artists');
      return null;
    }
  }, [likedArtistIds, load, token]);

  const createPlaylist = useCallback(async (name: string) => {
    if (!token || !name.trim()) return null;
    try {
      const playlist = await createPlaylistApi(token, name.trim());
      setPlaylists((current) => [playlist, ...current]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return playlist;
    } catch (cause: any) {
      setError(cause?.message || 'Could not create playlist');
      return null;
    }
  }, [token]);

  const addToPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!token) return false;
    try {
      await addSongToPlaylist(token, playlistId, songId);
      setPlaylists((current) => current.map((playlist) => {
        const id = String(playlist._id || playlist.id || '');
        if (id !== playlistId) return playlist;
        const songIds = [...new Set([...(playlist.songIds || []), songId])];
        return { ...playlist, songIds, songCount: songIds.length };
      }));
      Haptics.selectionAsync().catch(() => {});
      return true;
    } catch (cause: any) {
      setError(cause?.message || 'Could not add song to playlist');
      return false;
    }
  }, [token]);

  const value = useMemo<LibraryContextValue>(() => ({
    playlists,
    likedSongs,
    likedPlaylists,
    likedAlbums,
    likedArtists,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
    isLiked,
    toggleLike,
    isPlaylistLiked,
    isAlbumLiked,
    isArtistLiked,
    togglePlaylistLike,
    toggleAlbumLike,
    toggleArtistLike,
    createPlaylist,
    addToPlaylist,
  }), [
    playlists,
    likedSongs,
    likedPlaylists,
    likedAlbums,
    likedArtists,
    loading,
    refreshing,
    error,
    load,
    isLiked,
    toggleLike,
    isPlaylistLiked,
    isAlbumLiked,
    isArtistLiked,
    togglePlaylistLike,
    toggleAlbumLike,
    toggleArtistLike,
    createPlaylist,
    addToPlaylist,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLibrary must be used inside LibraryProvider');
  return value;
}

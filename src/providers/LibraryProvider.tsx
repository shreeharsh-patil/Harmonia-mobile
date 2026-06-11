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
  toggleLikedSong,
} from '@/src/lib/api';
import { normalizeSong, persistenceSafeSong } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import type { Playlist, Song } from '@/src/types';

type LibraryContextValue = {
  playlists: Playlist[];
  likedSongs: Song[];
  likedPlaylists: Playlist[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isLiked: (songId: string) => boolean;
  toggleLike: (song: Song) => Promise<boolean | null>;
  createPlaylist: (name: string) => Promise<Playlist | null>;
  addToPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: PropsWithChildren) {
  const { token } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (!token) {
      setPlaylists([]);
      setLikedSongs([]);
      setLikedPlaylists([]);
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
    loading,
    refreshing,
    error,
    refresh: () => load(true),
    isLiked,
    toggleLike,
    createPlaylist,
    addToPlaylist,
  }), [
    playlists,
    likedSongs,
    likedPlaylists,
    loading,
    refreshing,
    error,
    load,
    isLiked,
    toggleLike,
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

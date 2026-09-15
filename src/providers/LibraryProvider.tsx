import * as Haptics from 'expo-haptics';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const loadGenerationRef = useRef(0);
  const mutationKeysRef = useRef(new Set<string>());
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const load = useCallback(async (manual = false) => {
    const generation = ++loadGenerationRef.current;

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

    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const library = await fetchLibrary(token);
      if (generation !== loadGenerationRef.current) return;

      setPlaylists(library.playlists || []);
      // Keep ephemeral embedded playback candidates in memory. They are stripped
      // only when data is persisted or sent to account storage.
      setLikedSongs((library.likedSongs || []).map((song) => normalizeSong(song as any)));
      setLikedPlaylists(library.likedPlaylists || []);
      setLikedAlbums(library.likedAlbums || []);
      setLikedArtists(library.likedArtists || []);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to sync your library');
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const likedIds = useMemo(() => new Set(likedSongs.map((song) => song.id)), [likedSongs]);

  const isLiked = useCallback((songId: string) => likedIds.has(String(songId)), [likedIds]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!token) return null;
    const normalized = normalizeSong(song as any);
    if (!normalized.id) return null;
    const accountSafeSong = persistenceSafeSong(normalized);
    const mutationKey = `${token}:song:${normalized.id}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    const previouslyLiked = likedIds.has(normalized.id);
    setLikedSongs((current) => previouslyLiked
      ? current.filter((item) => item.id !== normalized.id)
      : [normalized, ...current.filter((item) => item.id !== normalized.id)]
    );

    try {
      const result = await toggleLikedSong(token, accountSafeSong);
      if (tokenRef.current !== token) return null;
      setLikedSongs((current) => result.liked
        ? [normalized, ...current.filter((item) => item.id !== normalized.id)]
        : current.filter((item) => item.id !== normalized.id)
      );
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      if (tokenRef.current !== token) return null;
      setLikedSongs((current) => previouslyLiked
        ? [normalized, ...current.filter((item) => item.id !== normalized.id)]
        : current.filter((item) => item.id !== normalized.id)
      );
      setError(cause?.message || 'Could not update liked songs');
      return null;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
    }
  }, [likedIds, token]);

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
    const mutationKey = `${token}:playlist:${id}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    const wasLiked = likedPlaylistIds.has(id);
    const normalized = { ...playlist, id };
    setLikedPlaylists((current) => wasLiked
      ? current.filter((item) => String(item.id || item._id || '') !== id)
      : [normalized, ...current.filter((item) => String(item.id || item._id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'playlists', normalized);
      if (tokenRef.current !== token) return null;
      setLikedPlaylists((current) => result.liked
        ? [normalized, ...current.filter((item) => String(item.id || item._id || '') !== id)]
        : current.filter((item) => String(item.id || item._id || '') !== id)
      );
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      if (tokenRef.current !== token) return null;
      setLikedPlaylists((current) => wasLiked
        ? [normalized, ...current.filter((item) => String(item.id || item._id || '') !== id)]
        : current.filter((item) => String(item.id || item._id || '') !== id)
      );
      setError(cause?.message || 'Could not update saved playlists');
      return null;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
    }
  }, [likedPlaylistIds, token]);

  const toggleAlbumLike = useCallback(async (album: HarmoniaAlbum) => {
    if (!token) return null;
    const id = String(album.id || '');
    if (!id) return null;
    const mutationKey = `${token}:album:${id}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    const wasLiked = likedAlbumIds.has(id);
    const normalized = { ...album, id };
    setLikedAlbums((current) => wasLiked
      ? current.filter((item) => String(item.id || '') !== id)
      : [normalized, ...current.filter((item) => String(item.id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'albums', normalized);
      if (tokenRef.current !== token) return null;
      setLikedAlbums((current) => result.liked
        ? [normalized, ...current.filter((item) => String(item.id || '') !== id)]
        : current.filter((item) => String(item.id || '') !== id)
      );
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      if (tokenRef.current !== token) return null;
      setLikedAlbums((current) => wasLiked
        ? [normalized, ...current.filter((item) => String(item.id || '') !== id)]
        : current.filter((item) => String(item.id || '') !== id)
      );
      setError(cause?.message || 'Could not update saved albums');
      return null;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
    }
  }, [likedAlbumIds, token]);

  const toggleArtistLike = useCallback(async (artist: HarmoniaArtistEntity) => {
    if (!token) return null;
    const id = String(artist.id || '');
    if (!id) return null;
    const mutationKey = `${token}:artist:${id}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    const wasLiked = likedArtistIds.has(id);
    const normalized = { ...artist, id };
    setLikedArtists((current) => wasLiked
      ? current.filter((item) => String(item.id || '') !== id)
      : [normalized, ...current.filter((item) => String(item.id || '') !== id)]
    );
    try {
      const result = await toggleLikedEntity(token, 'artists', normalized);
      if (tokenRef.current !== token) return null;
      setLikedArtists((current) => result.liked
        ? [normalized, ...current.filter((item) => String(item.id || '') !== id)]
        : current.filter((item) => String(item.id || '') !== id)
      );
      Haptics.selectionAsync().catch(() => {});
      return result.liked;
    } catch (cause: any) {
      if (tokenRef.current !== token) return null;
      setLikedArtists((current) => wasLiked
        ? [normalized, ...current.filter((item) => String(item.id || '') !== id)]
        : current.filter((item) => String(item.id || '') !== id)
      );
      setError(cause?.message || 'Could not update followed artists');
      return null;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
    }
  }, [likedArtistIds, token]);

  const createPlaylist = useCallback(async (name: string) => {
    if (!token || !name.trim()) return null;
    const cleanName = name.trim();
    const mutationKey = `${token}:create-playlist:${cleanName.toLowerCase()}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    try {
      const playlist = await createPlaylistApi(token, cleanName);
      if (tokenRef.current !== token) return null;
      setPlaylists((current) => [playlist, ...current]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return playlist;
    } catch (cause: any) {
      if (tokenRef.current !== token) return null;
      setError(cause?.message || 'Could not create playlist');
      return null;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
    }
  }, [token]);

  const addToPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!token) return false;
    const mutationKey = `${token}:add-to-playlist:${playlistId}:${songId}`;
    if (mutationKeysRef.current.has(mutationKey)) return false;
    mutationKeysRef.current.add(mutationKey);

    try {
      await addSongToPlaylist(token, playlistId, songId);
      if (tokenRef.current !== token) return false;
      setPlaylists((current) => current.map((playlist) => {
        const id = String(playlist._id || playlist.id || '');
        if (id !== playlistId) return playlist;
        const songIds = [...new Set([...(playlist.songIds || []), songId])];
        return { ...playlist, songIds, songCount: songIds.length };
      }));
      Haptics.selectionAsync().catch(() => {});
      return true;
    } catch (cause: any) {
      if (tokenRef.current !== token) return false;
      setError(cause?.message || 'Could not add song to playlist');
      return false;
    } finally {
      mutationKeysRef.current.delete(mutationKey);
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

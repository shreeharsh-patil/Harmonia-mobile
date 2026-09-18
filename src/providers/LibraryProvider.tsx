import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
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
  refreshIfStale: (maxAgeMs: number) => void;
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
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<number>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);
const GUEST_LIBRARY_KEY = 'harmonia.mobile.guest-library.v1';
const LIBRARY_STALE_MS = 60_000;

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
  // Skipping redundant refetches: tab focus and app foreground fire constantly,
  // and each one used to fetch the whole library again even when it was
  // fetched seconds ago. Manual pull-to-refresh always bypasses the gate.
  const lastLoadedAtRef = useRef(0);
  const guestLibraryHydratedRef = useRef(false);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const load = useCallback(async (manual = false) => {
    const generation = ++loadGenerationRef.current;

    if (!token) {
      try {
        const saved = await AsyncStorage.getItem(GUEST_LIBRARY_KEY);
        const guestLibrary = saved ? JSON.parse(saved) : null;
        if (generation !== loadGenerationRef.current) return;
        setPlaylists(Array.isArray(guestLibrary?.playlists) ? guestLibrary.playlists : []);
        setLikedSongs(Array.isArray(guestLibrary?.likedSongs) ? guestLibrary.likedSongs.map((song: any) => normalizeSong(song)) : []);
        setLikedPlaylists(Array.isArray(guestLibrary?.likedPlaylists) ? guestLibrary.likedPlaylists : []);
        setLikedAlbums(Array.isArray(guestLibrary?.likedAlbums) ? guestLibrary.likedAlbums : []);
        setLikedArtists(Array.isArray(guestLibrary?.likedArtists) ? guestLibrary.likedArtists : []);
      } catch {
        if (generation === loadGenerationRef.current) setError('Could not load your on-device library');
      } finally {
        if (generation === loadGenerationRef.current) {
          guestLibraryHydratedRef.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      }
      return;
    }

    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const library = await fetchLibrary(token);
      if (generation !== loadGenerationRef.current) return;

      lastLoadedAtRef.current = Date.now();
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

  const loadIfStale = useCallback(
    (maxAgeMs: number) => {
      if (!tokenRef.current) return;
      if (Date.now() - lastLoadedAtRef.current < maxAgeMs) return;
      void load();
    },
    [load]
  );

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && tokenRef.current) {
        // Foreground returns refresh only when the cached library is old;
        // quick app switches no longer re-fetch and re-render everything.
        loadIfStale(LIBRARY_STALE_MS);
      }
    });
    return () => {
      sub.remove();
    };
  }, [load, loadIfStale]);

  useEffect(() => {
    if (token || !guestLibraryHydratedRef.current) return;
    const snapshot = {
      playlists,
      likedSongs: likedSongs.map((song) => persistenceSafeSong(song)),
      likedPlaylists,
      likedAlbums,
      likedArtists,
    };
    AsyncStorage.setItem(GUEST_LIBRARY_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, [likedAlbums, likedArtists, likedPlaylists, likedSongs, playlists, token]);

  const likedIds = useMemo(() => new Set(likedSongs.map((song) => song.id)), [likedSongs]);

  const isLiked = useCallback((songId: string) => likedIds.has(String(songId)), [likedIds]);

  const toggleLike = useCallback(async (song: Song) => {
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

    if (!token) {
      Haptics.selectionAsync().catch(() => {});
      mutationKeysRef.current.delete(mutationKey);
      return !previouslyLiked;
    }

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
    if (!token) {
      Haptics.selectionAsync().catch(() => {});
      mutationKeysRef.current.delete(mutationKey);
      return !wasLiked;
    }
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
    if (!token) {
      Haptics.selectionAsync().catch(() => {});
      mutationKeysRef.current.delete(mutationKey);
      return !wasLiked;
    }
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
    if (!token) {
      Haptics.selectionAsync().catch(() => {});
      mutationKeysRef.current.delete(mutationKey);
      return !wasLiked;
    }
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
    if (!name.trim()) return null;
    const cleanName = name.trim();
    const mutationKey = `${token}:create-playlist:${cleanName.toLowerCase()}`;
    if (mutationKeysRef.current.has(mutationKey)) return null;
    mutationKeysRef.current.add(mutationKey);

    try {
      if (!token) {
        const playlist: Playlist = {
          id: `local-${Date.now()}`,
          name: cleanName,
          description: 'On this device',
          songCount: 0,
          songIds: [],
          source: 'local',
        };
        setPlaylists((current) => [playlist, ...current]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return playlist;
      }
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
    const mutationKey = `${token}:add-to-playlist:${playlistId}:${songId}`;
    if (mutationKeysRef.current.has(mutationKey)) return false;
    mutationKeysRef.current.add(mutationKey);

    try {
      if (!token) {
        setPlaylists((current) => current.map((playlist) => {
          const id = String(playlist._id || playlist.id || '');
          if (id !== playlistId) return playlist;
          const songIds = [...new Set([...(playlist.songIds || []), songId])];
          return { ...playlist, songIds, songCount: songIds.length };
        }));
        Haptics.selectionAsync().catch(() => {});
        return true;
      }
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

  const addSongsToPlaylist = useCallback(async (playlistId: string, songIds: string[]) => {
    if (!songIds.length) return 0;
    if (!token) {
      setPlaylists((current) => current.map((playlist) => {
        const id = String(playlist._id || playlist.id || '');
        if (id !== playlistId) return playlist;
        const updated = [...new Set([...(playlist.songIds || []), ...songIds])];
        return { ...playlist, songIds: updated, songCount: updated.length };
      }));
      Haptics.selectionAsync().catch(() => {});
      return songIds.length;
    }
    let added = 0;
    for (const songId of songIds) {
      try {
        await addSongToPlaylist(token, playlistId, songId);
        added++;
      } catch {}
    }
    if (added > 0 && tokenRef.current === token) {
      setPlaylists((current) => current.map((playlist) => {
        const id = String(playlist._id || playlist.id || '');
        if (id !== playlistId) return playlist;
        const updated = [...new Set([...(playlist.songIds || []), ...songIds])];
        return { ...playlist, songIds: updated, songCount: updated.length };
      }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    return added;
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
    refreshIfStale: loadIfStale,
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
    addSongsToPlaylist,
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
    loadIfStale,
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
    addSongsToPlaylist,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLibrary must be used inside LibraryProvider');
  return value;
}

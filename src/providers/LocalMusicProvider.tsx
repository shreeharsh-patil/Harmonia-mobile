import {
  getAssetsAsync,
  isAvailableAsync,
  MediaType,
  requestPermissionsAsync,
  SortBy,
} from 'expo-media-library/legacy';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Song } from '@/src/types';

type LocalMusicContextValue = {
  songs: Song[];
  loading: boolean;
  permissionDenied: boolean;
  scan: () => Promise<void>;
};

const LocalMusicContext = createContext<LocalMusicContextValue | null>(null);

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Local track';
}

export function LocalMusicProvider({ children }: PropsWithChildren) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    setPermissionDenied(false);

    try {
      const available = await isAvailableAsync().catch(() => false);
      if (!available) {
        setSongs([]);
        return;
      }

      const permission = await requestPermissionsAsync(false, ['audio']);
      if (permission.status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      const page = await getAssetsAsync({
        mediaType: [MediaType.audio],
        sortBy: [[SortBy.modificationTime, false]],
        first: 200,
      });

      const mapped: Song[] = (page?.assets || []).map((asset) => {
        const title = titleFromFilename(asset.filename);
        return {
          id: `local:${asset.id}`,
          songId: `local:${asset.id}`,
          name: title,
          title,
          primaryArtists: 'On device',
          artists: { primary: [{ name: 'On device' }] },
          album: { name: 'Local Music' },
          duration: asset.duration ? Math.round(asset.duration) : 0,
          image: [],
          source: 'local',
          localUri: asset.uri,
        } as Song;
      });

      setSongs(mapped.filter((song): song is Song => Boolean(song?.id)));
    } catch {
      setSongs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<LocalMusicContextValue>(() => ({
    songs,
    loading,
    permissionDenied,
    scan,
  }), [songs, loading, permissionDenied, scan]);

  return <LocalMusicContext.Provider value={value}>{children}</LocalMusicContext.Provider>;
}

export function useLocalMusic() {
  const value = useContext(LocalMusicContext);
  if (!value) throw new Error('useLocalMusic must be used inside LocalMusicProvider');
  return value;
}

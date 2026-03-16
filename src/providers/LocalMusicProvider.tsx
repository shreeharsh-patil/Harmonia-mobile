import {
  AssetField,
  MediaType,
  Query,
  requestPermissionsAsync,
} from 'expo-media-library';
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
      const permission = await requestPermissionsAsync(false, ['audio']);
      if (permission.status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      const assets = await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.AUDIO)
        .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false })
        .limit(200)
        .exe();

      const mapped = await Promise.all(
        assets.map(async (asset): Promise<Song | null> => {
          try {
            const [filename, uri, durationMs] = await Promise.all([
              asset.getFilename(),
              asset.getUri(),
              asset.getDuration(),
            ]);

            return {
              id: `local:${asset.id}`,
              songId: `local:${asset.id}`,
              name: titleFromFilename(filename),
              title: titleFromFilename(filename),
              primaryArtists: 'On device',
              artists: { primary: [{ name: 'On device' }] },
              album: { name: 'Local Music' },
              duration: durationMs ? Math.round(durationMs / 1000) : 0,
              image: [],
              source: 'local',
              localUri: uri,
            } as Song;
          } catch {
            return null;
          }
        })
      );

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

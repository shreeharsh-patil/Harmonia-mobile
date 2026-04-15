import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
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
import { resolvePlayableSong, type StreamQuality } from '@/src/lib/api';
import { persistenceSafeSong } from '@/src/lib/song';
import type { Song } from '@/src/types';

const DOWNLOADS_KEY = 'harmonia.mobile.downloads.v1';
const DOWNLOAD_DIR = new Directory(Paths.document, 'harmonia-downloads');

export type DownloadedTrack = {
  song: Song;
  uri: string;
  size: number;
  downloadedAt: number;
};

type OfflineContextValue = {
  downloads: DownloadedTrack[];
  downloading: Record<string, number>;
  downloadFailures: Record<string, string>;
  totalBytes: number;
  isDownloaded: (songId: string) => boolean;
  getOfflineUri: (songId: string) => string | null;
  downloadSong: (song: Song, quality?: StreamQuality) => Promise<boolean>;
  removeDownload: (songId: string) => Promise<void>;
  clearDownloads: () => Promise<void>;
  clearDownloadFailure: (songId: string) => void;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'track';
}

export function OfflineProvider({ children }: PropsWithChildren) {
  const [downloads, setDownloads] = useState<DownloadedTrack[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [downloadFailures, setDownloadFailures] = useState<Record<string, string>>({});

  const persist = useCallback(async (next: DownloadedTrack[]) => {
    setDownloads(next);
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as DownloadedTrack[];
        const valid = (Array.isArray(parsed) ? parsed : []).filter((item) => {
          try {
            return Boolean(item?.song?.id && item?.uri && new File(item.uri).exists);
          } catch {
            return false;
          }
        });

        setDownloads(valid);
        if (valid.length !== parsed.length) {
          await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(valid));
        }
      } catch {
        setDownloads([]);
      }
    })();
  }, []);

  const byId = useMemo(
    () => new Map(downloads.map((item) => [String(item.song.id), item])),
    [downloads]
  );

  const isDownloaded = useCallback(
    (songId: string) => byId.has(String(songId)),
    [byId]
  );

  const getOfflineUri = useCallback(
    (songId: string) => byId.get(String(songId))?.uri || null,
    [byId]
  );

  const downloadSong = useCallback(async (
    song: Song,
    quality: StreamQuality = 'maximum'
  ) => {
    const id = String(song.id || '');
    if (!id) return false;
    if (byId.has(id)) return true;
    if (downloading[id] != null) return false;

    setDownloading((current) => ({ ...current, [id]: 0 }));
    setDownloadFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      if (!DOWNLOAD_DIR.exists) DOWNLOAD_DIR.create();

      const resolved = await resolvePlayableSong(song, quality);
      const filename = `${safeName(id)}.m4a`;
      const destination = new File(DOWNLOAD_DIR, filename);
      if (destination.exists) destination.delete();

      const task = File.createDownloadTask(resolved.url, destination, {
        onProgress: ({ bytesWritten, totalBytes }) => {
          const progress = totalBytes > 0 ? bytesWritten / totalBytes : 0;
          setDownloading((current) => ({ ...current, [id]: progress }));
        },
      });

      const output = await task.downloadAsync();
      if (!output?.exists) throw new Error('Download did not complete');

      const entry: DownloadedTrack = {
        song: persistenceSafeSong(resolved.song),
        uri: output.uri,
        size: output.size,
        downloadedAt: Date.now(),
      };

      const next = [entry, ...downloads.filter((item) => item.song.id !== id)];
      await persist(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return true;
    } catch (cause: any) {
      setDownloadFailures((current) => ({
        ...current,
        [id]: cause?.message || 'Download failed. Check your connection and try again.',
      }));
      return false;
    } finally {
      setDownloading((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }, [byId, downloading, downloads, persist]);

  const removeDownload = useCallback(async (songId: string) => {
    const id = String(songId);
    const entry = byId.get(id);
    if (!entry) return;

    try {
      const file = new File(entry.uri);
      if (file.exists) file.delete();
    } catch {}

    await persist(downloads.filter((item) => item.song.id !== id));
    setDownloadFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }, [byId, downloads, persist]);

  const clearDownloads = useCallback(async () => {
    for (const entry of downloads) {
      try {
        const file = new File(entry.uri);
        if (file.exists) file.delete();
      } catch {}
    }
    setDownloadFailures({});
    await persist([]);
    Haptics.selectionAsync().catch(() => {});
  }, [downloads, persist]);

  const clearDownloadFailure = useCallback((songId: string) => {
    const id = String(songId);
    setDownloadFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const totalBytes = useMemo(
    () => downloads.reduce((sum, item) => sum + Math.max(0, item.size || 0), 0),
    [downloads]
  );

  const value = useMemo<OfflineContextValue>(() => ({
    downloads,
    downloading,
    downloadFailures,
    totalBytes,
    isDownloaded,
    getOfflineUri,
    downloadSong,
    removeDownload,
    clearDownloads,
    clearDownloadFailure,
  }), [
    downloads,
    downloading,
    downloadFailures,
    totalBytes,
    isDownloaded,
    getOfflineUri,
    downloadSong,
    removeDownload,
    clearDownloads,
    clearDownloadFailure,
  ]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline must be used inside OfflineProvider');
  return value;
}

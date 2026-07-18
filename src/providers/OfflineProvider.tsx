import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
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
import { resolvePlayableSong, type StreamQuality } from '@/src/lib/api';
import { inferDownloadExtension } from '@/src/lib/downloads';
import { persistenceSafeSong } from '@/src/lib/song';
import type { Song } from '@/src/types';
import { usePreferences } from '@/src/providers/PreferencesProvider';

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
  const { wifiOnlyDownloads, networkType, networkConnected } = usePreferences();
  const [downloads, setDownloads] = useState<DownloadedTrack[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [downloadFailures, setDownloadFailures] = useState<Record<string, string>>({});
  const downloadsRef = useRef<DownloadedTrack[]>([]);
  const activeDownloadsRef = useRef(new Set<string>());
  const activeDownloadTasksRef = useRef(
    new Map<string, ReturnType<typeof File.createDownloadTask>>()
  );
  const cancelledDownloadsRef = useRef(new Set<string>());
  const downloadEpochRef = useRef(0);

  downloadsRef.current = downloads;

  const persist = useCallback(async (next: DownloadedTrack[]) => {
    downloadsRef.current = next;
    setDownloads(next);
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
        if (!raw) return;

        const parsedValue = JSON.parse(raw);
        const parsed: DownloadedTrack[] = Array.isArray(parsedValue)
          ? parsedValue
          : [];
        const valid = parsed.filter((item) => {
          try {
            return Boolean(item?.song?.id && item?.uri && new File(item.uri).exists);
          } catch {
            return false;
          }
        });

        downloadsRef.current = valid;
        setDownloads(valid);
        if (!Array.isArray(parsedValue) || valid.length !== parsed.length) {
          await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(valid));
        }
      } catch {
        downloadsRef.current = [];
        setDownloads([]);
        // A malformed index should be repaired once rather than reparsed and
        // rejected on every app launch.
        await AsyncStorage.removeItem(DOWNLOADS_KEY).catch(() => {});
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
    if (activeDownloadsRef.current.has(id)) return false;

    activeDownloadsRef.current.add(id);
    cancelledDownloadsRef.current.delete(id);
    const downloadEpoch = downloadEpochRef.current;
    setDownloading((current) => ({ ...current, [id]: 0 }));
    setDownloadFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    let destination: File | null = null;

    try {
      if (!networkConnected) {
        throw new Error('Connect to the internet before downloading this track.');
      }
      if (
        wifiOnlyDownloads &&
        networkType !== Network.NetworkStateType.WIFI &&
        networkType !== Network.NetworkStateType.ETHERNET
      ) {
        throw new Error('Wi-Fi-only downloads are enabled. Connect to Wi-Fi and try again.');
      }

      if (!DOWNLOAD_DIR.exists) DOWNLOAD_DIR.create();

      const resolved = await resolvePlayableSong(song, quality);
      if (
        cancelledDownloadsRef.current.has(id) ||
        downloadEpoch !== downloadEpochRef.current
      ) return false;

      const extension = inferDownloadExtension(
        resolved.url,
        resolved.diagnostics?.mimeType,
        resolved.diagnostics?.codec
      );
      const filename = `${safeName(id)}.${extension}`;
      destination = new File(DOWNLOAD_DIR, filename);
      if (destination.exists) destination.delete();

      const task = File.createDownloadTask(resolved.url, destination, {
        ...(resolved.headers ? { headers: resolved.headers } : {}),
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (cancelledDownloadsRef.current.has(id)) return;
          const progress = totalBytes > 0 ? bytesWritten / totalBytes : 0;
          setDownloading((current) => ({ ...current, [id]: progress }));
        },
      });
      activeDownloadTasksRef.current.set(id, task);

      const output = await task.downloadAsync();
      if (
        cancelledDownloadsRef.current.has(id) ||
        downloadEpoch !== downloadEpochRef.current
      ) {
        try {
          if (destination.exists) destination.delete();
        } catch {}
        return false;
      }
      if (!output?.exists) throw new Error('Download did not complete');

      const entry: DownloadedTrack = {
        song: persistenceSafeSong(resolved.song),
        uri: output.uri,
        size: output.size,
        downloadedAt: Date.now(),
      };

      const next = [
        entry,
        ...downloadsRef.current.filter((item) => item.song.id !== id),
      ];
      await persist(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return true;
    } catch (cause: any) {
      try {
        if (destination?.exists) destination.delete();
      } catch {}

      if (!cancelledDownloadsRef.current.has(id)) {
        setDownloadFailures((current) => ({
          ...current,
          [id]: cause?.message || 'Download failed. Check your connection and try again.',
        }));
      }
      return false;
    } finally {
      activeDownloadsRef.current.delete(id);
      activeDownloadTasksRef.current.delete(id);
      cancelledDownloadsRef.current.delete(id);
      setDownloading((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }, [byId, networkConnected, networkType, persist, wifiOnlyDownloads]);

  const removeDownload = useCallback(async (songId: string) => {
    const id = String(songId);
    const entry = byId.get(id);

    if (activeDownloadsRef.current.has(id)) {
      cancelledDownloadsRef.current.add(id);
      activeDownloadTasksRef.current.get(id)?.cancel();
    }

    if (entry) {
      try {
        const file = new File(entry.uri);
        if (file.exists) file.delete();
      } catch {}

      await persist(downloadsRef.current.filter((item) => item.song.id !== id));
    }
    setDownloadFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }, [byId, persist]);

  const clearDownloads = useCallback(async () => {
    // Invalidate every in-flight completion before cancelling native tasks.
    // This closes the small race where a task finishes between cancellation
    // and clearing the persisted index.
    downloadEpochRef.current += 1;

    for (const id of activeDownloadsRef.current) {
      cancelledDownloadsRef.current.add(id);
      activeDownloadTasksRef.current.get(id)?.cancel();
    }

    for (const entry of downloadsRef.current) {
      try {
        const file = new File(entry.uri);
        if (file.exists) file.delete();
      } catch {}
    }
    setDownloading({});
    setDownloadFailures({});
    await persist([]);
    Haptics.selectionAsync().catch(() => {});
  }, [persist]);

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { Platform } from 'react-native';
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
import { PLAYBACK_SNAPSHOT_KEY } from '@/src/config';
import { resolvePlayableSong, type StreamQuality } from '@/src/lib/api';
import {
  albumName,
  artistNames,
  artworkUrl,
  normalizeSong,
  persistenceSafeSong,
} from '@/src/lib/song';
import type { Song } from '@/src/types';
import { useOffline } from '@/src/providers/OfflineProvider';

const PLAYER_SETTINGS_KEY = 'harmonia.mobile.player-settings.v1';
const HISTORY_KEY = 'harmonia.mobile.history.v1';
const LISTENING_STATS_KEY = 'harmonia.mobile.listening-stats.v1';

type PlaybackSnapshot = {
  queue: Song[];
  index: number;
  position: number;
  wasPlaying: boolean;
  savedAt: number;
};

export type SleepTimerMode = 'off' | 'track' | 15 | 30 | 45 | 60;

export type PlaybackHistoryEntry = {
  entryId: string;
  song: Song;
  playedAt: number;
};

export type ListeningStats = {
  totalSeconds: number;
  playCount: number;
  trackCounts: Record<string, number>;
};

type PlayerContextValue = {
  currentSong: Song | null;
  queue: Song[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isLoadingTrack: boolean;
  position: number;
  duration: number;
  error: string | null;
  playbackRate: number;
  streamQuality: StreamQuality;
  sleepTimer: SleepTimerMode;
  sleepRemaining: number;
  history: PlaybackHistoryEntry[];
  listeningStats: ListeningStats;
  clearHistory: () => Promise<void>;
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  playAt: (index: number) => Promise<void>;
  togglePlayback: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
  setStreamQuality: (quality: StreamQuality) => void;
  setSleepTimer: (mode: SleepTimerMode) => void;
  clearError: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { getOfflineUri } = useOffline();
  const player = useAudioPlayer(null, { updateInterval: 500, preferredForwardBufferDuration: 12 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [streamQuality, setStreamQualityState] = useState<StreamQuality>('automatic');
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerMode>('off');
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [history, setHistory] = useState<PlaybackHistoryEntry[]>([]);
  const [listeningStats, setListeningStats] = useState<ListeningStats>({
    totalSeconds: 0,
    playCount: 0,
    trackCounts: {},
  });

  const loadedTrackId = useRef<string | null>(null);
  const restoredPosition = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const lastPersistedSecond = useRef(-1);
  const finishing = useRef(false);
  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);
  const qualityRef = useRef<StreamQuality>('automatic');
  const rateRef = useRef(1);
  const sleepTimerRef = useRef<SleepTimerMode>('off');
  const sleepDeadlineRef = useRef<number | null>(null);

  queueRef.current = queue;
  indexRef.current = currentIndex;

  const currentSong = currentIndex >= 0 ? queue[currentIndex] || null : null;

  const recordHistory = useCallback((song: Song) => {
    const stable = persistenceSafeSong(song);
    setHistory((current) => {
      const next: PlaybackHistoryEntry[] = [
        {
          entryId: `${Date.now()}-${stable.id}`,
          song: stable,
          playedAt: Date.now(),
        },
        ...current,
      ].slice(0, 200);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setListeningStats((current) => {
      const next = { ...current, playCount: current.playCount + 1 };
      AsyncStorage.setItem(LISTENING_STATS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const persistSettings = useCallback((nextRate: number, nextQuality: StreamQuality) => {
    AsyncStorage.setItem(
      PLAYER_SETTINGS_KEY,
      JSON.stringify({ playbackRate: nextRate, streamQuality: nextQuality })
    ).catch(() => {});
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const normalized = Math.max(0.5, Math.min(2, rate));
    rateRef.current = normalized;
    setPlaybackRateState(normalized);
    player.setPlaybackRate(normalized);
    persistSettings(normalized, qualityRef.current);
  }, [persistSettings, player]);

  const setStreamQuality = useCallback((quality: StreamQuality) => {
    qualityRef.current = quality;
    setStreamQualityState(quality);
    persistSettings(rateRef.current, quality);
  }, [persistSettings]);

  const setSleepTimer = useCallback((mode: SleepTimerMode) => {
    sleepTimerRef.current = mode;
    setSleepTimerState(mode);
    if (typeof mode === 'number') {
      sleepDeadlineRef.current = Date.now() + mode * 60_000;
      setSleepRemaining(mode * 60);
    } else {
      sleepDeadlineRef.current = null;
      setSleepRemaining(0);
    }
  }, []);

  const setLockScreenMetadata = useCallback((song: Song) => {
    player.setActiveForLockScreen(
      true,
      {
        title: song.name,
        artist: artistNames(song),
        albumTitle: albumName(song),
        artworkUrl: artworkUrl(song) || undefined,
      },
      {
        showSeekBackward: true,
        showSeekForward: true,
      }
    );
  }, [player]);

  const loadIndex = useCallback(async (index: number, autoplay = true, startPosition = 0) => {
    const target = queueRef.current[index];
    if (!target) return;

    const stable = normalizeSong(target as any);
    setCurrentIndex(index);
    indexRef.current = index;
    setIsLoadingTrack(true);
    setError(null);

    try {
      player.pause();
      const localUri = typeof (stable as any).localUri === 'string' ? String((stable as any).localUri) : null;
      const offlineUri = getOfflineUri(stable.id);
      const resolved = localUri || offlineUri
        ? { song: stable, url: localUri || offlineUri! }
        : await resolvePlayableSong(stable, qualityRef.current);
      const nextQueue = [...queueRef.current];
      nextQueue[index] = persistenceSafeSong(resolved.song);
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      player.replace(resolved.url);
      player.setPlaybackRate(rateRef.current);
      loadedTrackId.current = stable.id;
      restoredPosition.current = 0;
      pendingSeek.current = startPosition > 0 ? startPosition : null;
      setLockScreenMetadata(resolved.song);
      recordHistory(resolved.song);

      if (autoplay) player.play();
    } catch (cause: any) {
      loadedTrackId.current = null;
      setError(cause?.message || 'Unable to play this track');
    } finally {
      setIsLoadingTrack(false);
    }
  }, [getOfflineUri, player, recordHistory, setLockScreenMetadata]);

  const playAt = useCallback(async (index: number) => {
    if (index < 0 || index >= queueRef.current.length) return;
    await loadIndex(index, true, 0);
  }, [loadIndex]);

  const playSong = useCallback(async (song: Song, contextQueue?: Song[]) => {
    const normalized = normalizeSong(song as any);
    const normalizedQueue = (contextQueue?.length ? contextQueue : [normalized])
      .map((item) => persistenceSafeSong(normalizeSong(item as any)))
      .filter((item) => Boolean(item.id));

    let index = normalizedQueue.findIndex((item) => item.id === normalized.id);
    if (index < 0) {
      normalizedQueue.unshift(persistenceSafeSong(normalized));
      index = 0;
    }

    queueRef.current = normalizedQueue;
    indexRef.current = index;
    setQueue(normalizedQueue);
    setCurrentIndex(index);
    await loadIndex(index, true, 0);
  }, [loadIndex]);

  const next = useCallback(async () => {
    const list = queueRef.current;
    if (!list.length) return;
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= list.length) {
      player.pause();
      await player.seekTo(0).catch(() => {});
      return;
    }
    await loadIndex(nextIndex, true, 0);
  }, [loadIndex, player]);

  const previous = useCallback(async () => {
    if (status.currentTime > 3) {
      await player.seekTo(0);
      return;
    }
    const previousIndex = Math.max(0, indexRef.current - 1);
    await loadIndex(previousIndex, true, 0);
  }, [loadIndex, player, status.currentTime]);

  const togglePlayback = useCallback(async () => {
    const song = queueRef.current[indexRef.current];
    if (!song) return;

    if (loadedTrackId.current !== song.id || !status.isLoaded) {
      await loadIndex(indexRef.current, true, restoredPosition.current);
      return;
    }

    if (status.playing) player.pause();
    else player.play();
  }, [loadIndex, player, status.isLoaded, status.playing]);

  const seek = useCallback(async (seconds: number) => {
    const max = status.duration || currentSong?.duration || seconds;
    await player.seekTo(Math.max(0, Math.min(seconds, max)));
  }, [currentSong?.duration, player, status.duration]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});

    if (Platform.OS === 'android') {
      requestNotificationPermissionsAsync().catch(() => {});
    }

    (async () => {
      try {
        const [snapshotRaw, settingsRaw, historyRaw, statsRaw] = await Promise.all([
          AsyncStorage.getItem(PLAYBACK_SNAPSHOT_KEY),
          AsyncStorage.getItem(PLAYER_SETTINGS_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(LISTENING_STATS_KEY),
        ]);

        if (historyRaw) {
          const parsedHistory = JSON.parse(historyRaw);
          if (Array.isArray(parsedHistory)) setHistory(parsedHistory.slice(0, 200));
        }

        if (statsRaw) {
          const parsedStats = JSON.parse(statsRaw);
          setListeningStats({
            totalSeconds: Math.max(0, Number(parsedStats?.totalSeconds || 0)),
            playCount: Math.max(0, Number(parsedStats?.playCount || 0)),
            trackCounts: parsedStats?.trackCounts && typeof parsedStats.trackCounts === 'object'
              ? parsedStats.trackCounts
              : {},
          });
        }

        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          const nextRate = Math.max(0.5, Math.min(2, Number(settings.playbackRate || 1)));
          const validQualities: StreamQuality[] = ['automatic', 'data-saver', 'normal', 'high', 'maximum'];
          const nextQuality = validQualities.includes(settings.streamQuality) ? settings.streamQuality : 'automatic';
          rateRef.current = nextRate;
          qualityRef.current = nextQuality;
          setPlaybackRateState(nextRate);
          setStreamQualityState(nextQuality);
          player.setPlaybackRate(nextRate);
        }

        if (!snapshotRaw) return;
        const snapshot = JSON.parse(snapshotRaw) as PlaybackSnapshot;
        const restoredQueue = Array.isArray(snapshot.queue)
          ? snapshot.queue.map((song) => persistenceSafeSong(normalizeSong(song as any))).filter((song) => song.id)
          : [];
        if (!restoredQueue.length) return;

        const restoredIndex = Math.min(
          Math.max(Number(snapshot.index || 0), 0),
          restoredQueue.length - 1
        );
        queueRef.current = restoredQueue;
        indexRef.current = restoredIndex;
        restoredPosition.current = Math.max(0, Number(snapshot.position || 0));
        setQueue(restoredQueue);
        setCurrentIndex(restoredIndex);
      } catch {
        await AsyncStorage.removeItem(PLAYBACK_SNAPSHOT_KEY).catch(() => {});
      }
    })();
  }, [player]);

  useEffect(() => {
    if (!status.isLoaded || pendingSeek.current == null) return;
    const target = pendingSeek.current;
    pendingSeek.current = null;
    player.seekTo(target).catch(() => {});
  }, [player, status.isLoaded]);

  useEffect(() => {
    if (status.didJustFinish && !finishing.current) {
      finishing.current = true;
      if (sleepTimerRef.current === 'track') {
        player.pause();
        setSleepTimer('off');
        player.seekTo(0).catch(() => {});
        finishing.current = false;
        return;
      }
      void next().finally(() => {
        setTimeout(() => {
          finishing.current = false;
        }, 500);
      });
    }
    if (!status.didJustFinish) finishing.current = false;
  }, [next, player, setSleepTimer, status.didJustFinish]);

  useEffect(() => {
    if (typeof sleepTimer !== 'number') return;
    const tick = () => {
      const deadline = sleepDeadlineRef.current;
      if (!deadline) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSleepRemaining(remaining);
      if (remaining <= 0) {
        player.pause();
        setSleepTimer('off');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [player, setSleepTimer, sleepTimer]);

  useEffect(() => {
    if (!status.playing || !currentSong?.id) return;

    const interval = setInterval(() => {
      setListeningStats((current) => {
        const id = String(currentSong.id);
        const next: ListeningStats = {
          totalSeconds: current.totalSeconds + 10,
          playCount: current.playCount,
          trackCounts: {
            ...current.trackCounts,
            [id]: (current.trackCounts[id] || 0) + 10,
          },
        };
        AsyncStorage.setItem(LISTENING_STATS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }, 10_000);

    return () => clearInterval(interval);
  }, [currentSong?.id, status.playing]);

  useEffect(() => {
    if (!queue.length || currentIndex < 0) return;
    const wholeSecond = Math.floor(status.currentTime || restoredPosition.current || 0);
    if (Math.abs(wholeSecond - lastPersistedSecond.current) < 3 && status.playing) return;
    lastPersistedSecond.current = wholeSecond;

    const snapshot: PlaybackSnapshot = {
      queue: queue.slice(0, 100).map(persistenceSafeSong),
      index: currentIndex,
      position: Math.max(0, status.currentTime || restoredPosition.current || 0),
      wasPlaying: status.playing,
      savedAt: Date.now(),
    };
    AsyncStorage.setItem(PLAYBACK_SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, [currentIndex, queue, status.currentTime, status.playing]);

  useEffect(() => {
    if (status.error) setError(status.error);
  }, [status.error]);

  const value = useMemo<PlayerContextValue>(() => ({
    currentSong,
    queue,
    currentIndex,
    isPlaying: status.playing,
    isBuffering: status.isBuffering,
    isLoadingTrack,
    position: status.currentTime || restoredPosition.current || 0,
    duration: status.duration || currentSong?.duration || 0,
    error,
    playbackRate,
    streamQuality,
    sleepTimer,
    sleepRemaining,
    history,
    listeningStats,
    clearHistory,
    playSong,
    playAt,
    togglePlayback,
    next,
    previous,
    seek,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    clearError: () => setError(null),
  }), [
    currentSong,
    queue,
    currentIndex,
    status.playing,
    status.isBuffering,
    status.currentTime,
    status.duration,
    isLoadingTrack,
    error,
    playbackRate,
    streamQuality,
    sleepTimer,
    sleepRemaining,
    history,
    listeningStats,
    clearHistory,
    playSong,
    playAt,
    togglePlayback,
    next,
    previous,
    seek,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

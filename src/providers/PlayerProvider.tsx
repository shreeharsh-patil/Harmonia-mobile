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
import { resolvePlayableSong } from '@/src/lib/api';
import {
  albumName,
  artistNames,
  artworkUrl,
  normalizeSong,
  persistenceSafeSong,
} from '@/src/lib/song';
import type { Song } from '@/src/types';

type PlaybackSnapshot = {
  queue: Song[];
  index: number;
  position: number;
  wasPlaying: boolean;
  savedAt: number;
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
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  playAt: (index: number) => Promise<void>;
  togglePlayback: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  clearError: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedTrackId = useRef<string | null>(null);
  const restoredPosition = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const lastPersistedSecond = useRef(-1);
  const finishing = useRef(false);
  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);

  queueRef.current = queue;
  indexRef.current = currentIndex;

  const currentSong = currentIndex >= 0 ? queue[currentIndex] || null : null;

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
      const resolved = await resolvePlayableSong(stable);
      const nextQueue = [...queueRef.current];
      nextQueue[index] = persistenceSafeSong(resolved.song);
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      player.replace(resolved.url);
      loadedTrackId.current = stable.id;
      restoredPosition.current = 0;
      pendingSeek.current = startPosition > 0 ? startPosition : null;
      setLockScreenMetadata(resolved.song);

      if (autoplay) player.play();
    } catch (cause: any) {
      loadedTrackId.current = null;
      setError(cause?.message || 'Unable to play this track');
    } finally {
      setIsLoadingTrack(false);
    }
  }, [player, setLockScreenMetadata]);

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
        const raw = await AsyncStorage.getItem(PLAYBACK_SNAPSHOT_KEY);
        if (!raw) return;
        const snapshot = JSON.parse(raw) as PlaybackSnapshot;
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
  }, []);

  useEffect(() => {
    if (!status.isLoaded || pendingSeek.current == null) return;
    const target = pendingSeek.current;
    pendingSeek.current = null;
    player.seekTo(target).catch(() => {});
  }, [player, status.isLoaded]);

  useEffect(() => {
    if (status.didJustFinish && !finishing.current) {
      finishing.current = true;
      void next().finally(() => {
        setTimeout(() => {
          finishing.current = false;
        }, 500);
      });
    }
    if (!status.didJustFinish) finishing.current = false;
  }, [next, status.didJustFinish]);

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
    playSong,
    playAt,
    togglePlayback,
    next,
    previous,
    seek,
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
    playSong,
    playAt,
    togglePlayback,
    next,
    previous,
    seek,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

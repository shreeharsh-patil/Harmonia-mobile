import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  preload,
  clearPreloadedSource,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioSource,
} from 'expo-audio';
import { AppState, Platform } from 'react-native';
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
import { fetchSongSuggestions } from '@/src/lib/api';
import {
  getAudioCandidates,
  getImmediateLocalSource,
  invalidateResolvedStream,
  resolveTrackStream,
  type ResolvedStreamDiagnostics,
  type StreamQuality,
} from '@/src/lib/playback/streamResolver';
import {
  PlaybackErrorType,
  PlaybackPipelineError,
  classifyPlaybackError,
  type PlaybackErrorTypeValue,
} from '@/src/lib/playback/playbackErrors';
import {
  captureRecoveryPosition,
  getPlaybackRecoveryPolicy,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
  nextUntriedCandidateIndex,
} from '@/src/lib/playback/recoveryPolicy';
import {
  createQueueWindow,
  shouldPersistPlaybackSnapshot,
} from '@/src/lib/playback/playbackSnapshot';
import {
  albumName,
  artistNames,
  artworkUrl,
  normalizeSong,
  persistenceSafeSong,
} from '@/src/lib/song';
import type { Song } from '@/src/types';
import { useOfflinePlayback } from '@/src/providers/OfflineProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import {
  createAdaptivePipeline,
  type AdaptivePipelineStatus,
  type PipelineResolvedStream,
} from '@/src/lib/streamPipeline';

const PLAYER_SETTINGS_KEY = 'harmonia.mobile.player-settings.v1';
const HISTORY_KEY = 'harmonia.mobile.history.v1';
const LISTENING_STATS_KEY = 'harmonia.mobile.listening-stats.v1';

function nativeAudioSource(
  url: string,
  headers?: Record<string, string> | null
): AudioSource {
  return headers && Object.keys(headers).length
    ? { uri: url, headers }
    : url;
}

function audioSourceKey(url: string, headers?: Record<string, string> | null) {
  const normalizedHeaders = headers
    ? Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    : [];
  return `${url}|${JSON.stringify(normalizedHeaders)}`;
}

function isExpoGoRuntime() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any).appOwnership === 'expo';
}

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

type PlaybackSnapshot = {
  queue: Song[];
  baseQueue?: Song[];
  index: number;
  position: number;
  wasPlaying: boolean;
  savedAt: number;
};

type LoadTrackOptions = {
  recordHistory?: boolean;
  bypassOffline?: boolean;
  recovery?: boolean;
  recoveryAttempt?: number;
  forceFresh?: boolean;
  excludeProviders?: string[];
  skipAdaptive?: boolean;
  skipEmbedded?: boolean;
  embeddedCandidateIndex?: number;
};

export type SleepTimerMode = 'off' | 'track' | 15 | 30 | 45 | 60;
export type RepeatMode = 'off' | 'all' | 'one';

export type PlaybackEngineState =
  | 'IDLE'
  | 'RESOLVING'
  | 'LOADING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'BUFFERING'
  | 'RECOVERING'
  | 'ERROR';

export type PlaybackHistoryEntry = {
  entryId: string;
  song: Song;
  playedAt: number;
};

export type ListeningStats = {
  totalSeconds: number;
  playCount: number;
  trackCounts: Record<string, number>;
  dailySeconds: Record<string, number>;
};

function emptyListeningStats(): ListeningStats {
  return {
    totalSeconds: 0,
    playCount: 0,
    trackCounts: {},
    dailySeconds: {},
  };
}

function mergeListeningStats(base: ListeningStats, delta: ListeningStats): ListeningStats {
  const trackCounts = { ...base.trackCounts };
  for (const [id, seconds] of Object.entries(delta.trackCounts)) {
    trackCounts[id] = (trackCounts[id] || 0) + Number(seconds || 0);
  }

  const dailySeconds = { ...base.dailySeconds };
  for (const [day, seconds] of Object.entries(delta.dailySeconds)) {
    dailySeconds[day] = (dailySeconds[day] || 0) + Number(seconds || 0);
  }

  return {
    totalSeconds: base.totalSeconds + delta.totalSeconds,
    playCount: base.playCount + delta.playCount,
    trackCounts,
    dailySeconds,
  };
}

function hasListeningStatsDelta(stats: ListeningStats) {
  return Boolean(
    stats.totalSeconds ||
    stats.playCount ||
    Object.keys(stats.trackCounts).length ||
    Object.keys(stats.dailySeconds).length
  );
}

type PersistedPlayerSettings = {
  playbackRate: number;
  streamQuality: StreamQuality;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  radioEnabled: boolean;
  adaptivePipelineEnabled: boolean;
};

export type PlaybackDiagnostics = Omit<ResolvedStreamDiagnostics, 'source'> & {
  source: ResolvedStreamDiagnostics['source'] | 'offline' | 'local';
};

type PlayerContextValue = {
  currentSong: Song | null;
  queue: Song[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isLoadingTrack: boolean;
  error: string | null;
  playbackState: PlaybackEngineState;
  playbackErrorType: PlaybackErrorTypeValue | null;
  playbackRate: number;
  streamQuality: StreamQuality;
  sleepTimer: SleepTimerMode;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  radioEnabled: boolean;
  adaptivePipelineEnabled: boolean;
  adaptivePipelineStatus: AdaptivePipelineStatus;
  pipelineStartQuality: StreamQuality | null;
  pipelineTargetQuality: StreamQuality | null;
  pipelineInitialResolveMs: number | null;
  pipelinePromotionResolveMs: number | null;
  playbackDiagnostics: PlaybackDiagnostics | null;
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  playAt: (index: number) => Promise<void>;
  playNext: (song: Song) => void;
  addToQueue: (song: Song) => void;
  removeQueueItem: (index: number) => void;
  moveQueueItem: (from: number, to: number) => void;
  clearUpcoming: () => void;
  togglePlayback: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
  setStreamQuality: (quality: StreamQuality) => void;
  setSleepTimer: (mode: SleepTimerMode) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  toggleRadio: () => void;
  toggleAdaptivePipeline: () => void;
  clearError: () => void;
};

type PlaybackProgressValue = {
  position: number;
  duration: number;
  sleepRemaining: number;
};

type PlaybackHistoryValue = {
  history: PlaybackHistoryEntry[];
  clearHistory: () => Promise<void>;
};

type ListeningStatsValue = {
  listeningStats: ListeningStats;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);
const PlaybackProgressContext = createContext<PlaybackProgressValue | null>(null);
const PlaybackHistoryContext = createContext<PlaybackHistoryValue | null>(null);
const ListeningStatsContext = createContext<ListeningStatsValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { getOfflineUri } = useOfflinePlayback();
  const { batterySaver, qualityFor, networkConnected } = usePreferences();
  const player = useAudioPlayer(null, { updateInterval: 500, preferredForwardBufferDuration: 18 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackEngineState>('IDLE');
  const [playbackErrorType, setPlaybackErrorType] = useState<PlaybackErrorTypeValue | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [streamQuality, setStreamQualityState] = useState<StreamQuality>('automatic');
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerMode>('off');
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('off');
  const [shuffleEnabled, setShuffleEnabledState] = useState(false);
  const [radioEnabled, setRadioEnabledState] = useState(false);
  const [adaptivePipelineEnabled, setAdaptivePipelineEnabledState] = useState(true);
  const [adaptivePipelineStatus, setAdaptivePipelineStatus] = useState<AdaptivePipelineStatus>('idle');
  const [pipelineStartQuality, setPipelineStartQuality] = useState<StreamQuality | null>(null);
  const [pipelineTargetQuality, setPipelineTargetQuality] = useState<StreamQuality | null>(null);
  const [pipelineInitialResolveMs, setPipelineInitialResolveMs] = useState<number | null>(null);
  const [pipelinePromotionResolveMs, setPipelinePromotionResolveMs] = useState<number | null>(null);
  const [history, setHistory] = useState<PlaybackHistoryEntry[]>([]);
  const [playbackDiagnostics, setPlaybackDiagnostics] = useState<PlaybackDiagnostics | null>(null);
  const [listeningStats, setListeningStats] = useState<ListeningStats>(() => emptyListeningStats());
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');

  const loadedTrackId = useRef<string | null>(null);
  const restoredPosition = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const lastPersistedSecond = useRef(-1);
  const lastPersistedQueueRef = useRef<Song[] | null>(null);
  const lastPersistedQueueIndex = useRef(-1);
  const lastPersistedPlayingRef = useRef(false);
  const finishing = useRef(false);
  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);
  const currentTimeRef = useRef(0);
  const nativePlayingRef = useRef(false);
  const qualityRef = useRef<StreamQuality>('automatic');
  const effectiveQualityRef = useRef<StreamQuality>('automatic');
  const rateRef = useRef(1);
  const sleepTimerRef = useRef<SleepTimerMode>('off');
  const sleepDeadlineRef = useRef<number | null>(null);
  const repeatModeRef = useRef<RepeatMode>('off');
  const shuffleRef = useRef(false);
  const radioRef = useRef(false);
  const adaptivePipelineRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const activeResolutionAbortRef = useRef<AbortController | null>(null);
  const activeProviderRef = useRef<string | null>(null);
  const activeSourceRef = useRef<PlaybackDiagnostics['source'] | null>(null);
  const activeStreamUrlRef = useRef<string | null>(null);
  const failedStreamUrlsRef = useRef<{ trackId: string | null; urls: Set<string> }>({
    trackId: null,
    urls: new Set(),
  });
  const failedProvidersRef = useRef<{ trackId: string | null; providers: Set<string> }>({
    trackId: null,
    providers: new Set(),
  });
  const lastPlaybackErrorRef = useRef<PlaybackPipelineError | null>(null);
  const awaitingNetworkRecoveryRef = useRef(false);
  const unshuffledQueueRef = useRef<Song[]>([]);
  const playbackIntentRef = useRef(false);
  const lastKnownPositionRef = useRef(0);
  const recoveryInFlightRef = useRef(false);
  const qualityReloadRef = useRef<() => Promise<void>>(async () => {});
  const preloadedSourceRef = useRef<{ key: string; source: AudioSource } | null>(null);
  const recoveryStateRef = useRef<{ trackId: string | null; attempts: number }>({
    trackId: null,
    attempts: 0,
  });
  const pendingHistoryRef = useRef<{ trackId: string; song: Song } | null>(null);
  const settingsHydratedRef = useRef(false);
  const pendingSettingsRef = useRef<Partial<PersistedPlayerSettings>>({});
  const settingsWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const historyHydratedRef = useRef(false);
  const statsHydratedRef = useRef(false);
  const pendingHistoryEntriesRef = useRef<PlaybackHistoryEntry[]>([]);
  const pendingStatsDeltaRef = useRef<ListeningStats>(emptyListeningStats());
  const historyClearedBeforeHydrationRef = useRef(false);
  const statsClearedBeforeHydrationRef = useRef(false);
  const historyWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const statsWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const playbackSnapshotWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastStatsPersistedAtRef = useRef(0);
  const lockScreenReadyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    queueRef.current = queue;
    indexRef.current = currentIndex;
  }, [currentIndex, queue]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsForeground(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    currentTimeRef.current = Number(status.currentTime || 0);
    nativePlayingRef.current = Boolean(status.playing);
  }, [status.currentTime, status.playing]);

  const currentSong = currentIndex >= 0 ? queue[currentIndex] || null : null;

  const writeHistorySnapshot = useCallback((next: PlaybackHistoryEntry[]) => {
    historyWriteChainRef.current = historyWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)))
      .catch(() => {});
  }, []);

  const writeListeningStatsSnapshot = useCallback((next: ListeningStats) => {
    lastStatsPersistedAtRef.current = Date.now();
    statsWriteChainRef.current = statsWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(LISTENING_STATS_KEY, JSON.stringify(next)))
      .catch(() => {});
  }, []);

  const addPendingStatsDelta = useCallback((delta: ListeningStats) => {
    pendingStatsDeltaRef.current = mergeListeningStats(
      pendingStatsDeltaRef.current,
      delta
    );
  }, []);

  const recordHistory = useCallback((song: Song) => {
    const stable = persistenceSafeSong(song);
    const now = Date.now();
    const entry: PlaybackHistoryEntry = {
      entryId: `${now}-${stable.id}`,
      song: stable,
      playedAt: now,
    };

    if (!historyHydratedRef.current) {
      pendingHistoryEntriesRef.current = [
        entry,
        ...pendingHistoryEntriesRef.current,
      ].slice(0, 500);
    }

    setHistory((current) => {
      const next = [entry, ...current].slice(0, 500);
      if (historyHydratedRef.current) writeHistorySnapshot(next);
      return next;
    });

    const playDelta: ListeningStats = {
      totalSeconds: 0,
      playCount: 1,
      trackCounts: {},
      dailySeconds: {},
    };
    if (!statsHydratedRef.current) addPendingStatsDelta(playDelta);

    setListeningStats((current) => {
      const next = mergeListeningStats(current, playDelta);
      if (statsHydratedRef.current) writeListeningStatsSnapshot(next);
      return next;
    });
  }, [addPendingStatsDelta, writeHistorySnapshot, writeListeningStatsSnapshot]);

  const clearHistory = useCallback(async () => {
    if (!historyHydratedRef.current) {
      historyClearedBeforeHydrationRef.current = true;
      pendingHistoryEntriesRef.current = [];
    }
    if (!statsHydratedRef.current) {
      statsClearedBeforeHydrationRef.current = true;
      pendingStatsDeltaRef.current = emptyListeningStats();
    }

    setHistory([]);
    setListeningStats(emptyListeningStats());

    historyWriteChainRef.current = historyWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.removeItem(HISTORY_KEY))
      .catch(() => {});
    statsWriteChainRef.current = statsWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.removeItem(LISTENING_STATS_KEY))
      .catch(() => {});

    await Promise.all([
      historyWriteChainRef.current,
      statsWriteChainRef.current,
    ]);
  }, []);

  const currentSettingsSnapshot = useCallback((): PersistedPlayerSettings => ({
    playbackRate: rateRef.current,
    streamQuality: qualityRef.current,
    repeatMode: repeatModeRef.current,
    shuffleEnabled: shuffleRef.current,
    radioEnabled: radioRef.current,
    adaptivePipelineEnabled: adaptivePipelineRef.current,
  }), []);

  const writeSettingsSnapshot = useCallback((snapshot: PersistedPlayerSettings) => {
    settingsWriteChainRef.current = settingsWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(snapshot)))
      .catch(() => {});
  }, []);

  const persistSettings = useCallback((patch: Partial<PersistedPlayerSettings>) => {
    if (!settingsHydratedRef.current) {
      pendingSettingsRef.current = {
        ...pendingSettingsRef.current,
        ...patch,
      };
      return;
    }
    writeSettingsSnapshot(currentSettingsSnapshot());
  }, [currentSettingsSnapshot, writeSettingsSnapshot]);

  const setPlaybackRate = useCallback((rate: number) => {
    const normalized = Math.max(0.5, Math.min(2, rate));
    rateRef.current = normalized;
    setPlaybackRateState(normalized);
    player.setPlaybackRate(normalized);
    persistSettings({ playbackRate: normalized });
  }, [persistSettings, player]);

  const setStreamQuality = useCallback((quality: StreamQuality) => {
    if (quality === qualityRef.current) return;
    qualityRef.current = quality;
    effectiveQualityRef.current = qualityFor(quality);
    setStreamQualityState(quality);
    persistSettings({ streamQuality: quality });
    void qualityReloadRef.current();
  }, [persistSettings, qualityFor]);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const next = modes[(modes.indexOf(repeatModeRef.current) + 1) % modes.length];
    repeatModeRef.current = next;
    setRepeatModeState(next);
    persistSettings({ repeatMode: next });
  }, [persistSettings]);

  const toggleShuffle = useCallback(() => {
    const nextEnabled = !shuffleRef.current;
    shuffleRef.current = nextEnabled;
    setShuffleEnabledState(nextEnabled);

    const current = queueRef.current[indexRef.current];
    if (!current) {
      persistSettings({ shuffleEnabled: nextEnabled });
      return;
    }

    if (nextEnabled) {
      const base = unshuffledQueueRef.current.length
        ? [...unshuffledQueueRef.current]
        : [...queueRef.current];
      // Remove only the selected occurrence. Filtering by id removed every
      // duplicate of the same recording from playlists that intentionally
      // contained it more than once.
      let selectedBaseIndex = base.findIndex((song) => song === current);
      if (selectedBaseIndex < 0) {
        selectedBaseIndex = base.findIndex((song) => song.id === current.id);
      }
      const rest = base.filter((_, index) => index !== selectedBaseIndex);
      for (let i = rest.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const shuffled = [current, ...rest];
      queueRef.current = shuffled;
      indexRef.current = 0;
      setQueue(shuffled);
      setCurrentIndex(0);
    } else {
      const restored = unshuffledQueueRef.current.length
        ? [...unshuffledQueueRef.current]
        : [...queueRef.current];
      const restoredIndex = Math.max(0, restored.findIndex((song) => song.id === current.id));
      queueRef.current = restored;
      indexRef.current = restoredIndex;
      setQueue(restored);
      setCurrentIndex(restoredIndex);
    }

    persistSettings({ shuffleEnabled: nextEnabled });
  }, [persistSettings]);

  const toggleRadio = useCallback(() => {
    const nextEnabled = !radioRef.current;
    radioRef.current = nextEnabled;
    setRadioEnabledState(nextEnabled);
    persistSettings({ radioEnabled: nextEnabled });
  }, [persistSettings]);

  const toggleAdaptivePipeline = useCallback(() => {
    const nextEnabled = !adaptivePipelineRef.current;
    adaptivePipelineRef.current = nextEnabled;
    setAdaptivePipelineEnabledState(nextEnabled);
    if (!nextEnabled) setAdaptivePipelineStatus('idle');
    persistSettings({ adaptivePipelineEnabled: nextEnabled });
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
    if (Platform.OS === 'android' && isExpoGoRuntime()) {
      return;
    }

    const title = String(song.title || song.name || '').trim() || 'Harmonia';
    const artist = artistNames(song).trim();
    const albumTitle = albumName(song).trim();

    try {
      player.setActiveForLockScreen(
        true,
        {
          title,
          artist: artist || undefined,
          albumTitle: albumTitle || undefined,
          artworkUrl: artworkUrl(song, 512) || undefined,
        },
        {
          isLiveStream: false,
          showSeekBackward: true,
          showSeekForward: true,
        }
      );
    } catch {
      // Safe fallback when running in Expo Go or when lock screen notification
      // permissions are pending on the device.
    }
  }, [player]);

  const loadIndex = useCallback(async (
    index: number,
    autoplay = true,
    startPosition = 0,
    options: LoadTrackOptions = {}
  ) => {
    const target = queueRef.current[index];
    if (!target) return false;

    const generation = ++loadGenerationRef.current;
    lockScreenReadyKeyRef.current = null;
    activeResolutionAbortRef.current?.abort();
    const controller = new AbortController();
    activeResolutionAbortRef.current = controller;

    const stable = normalizeSong(target as any);
    const shouldRecordHistory = options.recordHistory !== false;
    const bypassOffline = options.bypassOffline === true;

    if (shouldRecordHistory) {
      // A new explicit play supersedes any previous track that had not yet
      // reached the native-loaded state.
      pendingHistoryRef.current = null;
    } else if (
      pendingHistoryRef.current &&
      pendingHistoryRef.current.trackId !== stable.id
    ) {
      pendingHistoryRef.current = null;
    }

    setCurrentIndex(index);
    indexRef.current = index;
    playbackIntentRef.current = autoplay;
    setIsLoadingTrack(true);
    setError(null);
    setPlaybackErrorType(null);
    setPlaybackState(options.recovery ? 'RECOVERING' : 'RESOLVING');
    setPlaybackDiagnostics(null);
    setPipelineStartQuality(null);
    setPipelineTargetQuality(null);
    setPipelineInitialResolveMs(null);
    setPipelinePromotionResolveMs(null);
    setAdaptivePipelineStatus('starting');

    if (!options.recovery) {
      recoveryStateRef.current = { trackId: stable.id, attempts: 0 };
      failedStreamUrlsRef.current = { trackId: stable.id, urls: new Set() };
      failedProvidersRef.current = { trackId: stable.id, providers: new Set() };
    }

    try {
      player.pause();

      const offlineUri = bypassOffline ? null : getOfflineUri(stable.id);
      const immediate = getImmediateLocalSource(stable, offlineUri);

      let resolved: {
        song: Song;
        url: string;
        diagnostics: ResolvedStreamDiagnostics | null;
        headers: Record<string, string> | null;
      };
      let promotion: Promise<PipelineResolvedStream | null> = Promise.resolve(null);

      if (immediate) {
        resolved = {
          song: stable,
          url: immediate.url,
          diagnostics: null,
          headers: null,
        };
        setAdaptivePipelineStatus('idle');
      } else if (
        adaptivePipelineRef.current &&
        !batterySaver &&
        !options.recovery &&
        !options.skipAdaptive &&
        !options.forceFresh
      ) {
        const plan = await createAdaptivePipeline(stable, effectiveQualityRef.current, {
          signal: controller.signal,
          excludeProviders: options.excludeProviders,
          priority: 'high',
          recoveryAttempt: options.recoveryAttempt,
          skipEmbedded: options.skipEmbedded,
        });

        if (generation !== loadGenerationRef.current || controller.signal.aborted) return false;

        resolved = plan.initial;
        promotion = plan.promotion;
        setPipelineStartQuality(plan.startQuality);
        setPipelineTargetQuality(plan.targetQuality);
        setPipelineInitialResolveMs(plan.initial.resolveMs);
        setAdaptivePipelineStatus(
          plan.startQuality === plan.targetQuality ? 'upgrade-skipped' : 'playing-fast'
        );
      } else {
        const direct = await resolveTrackStream(stable, {
          quality: effectiveQualityRef.current,
          forceFresh: options.forceFresh,
          excludeProviders: options.excludeProviders,
          signal: controller.signal,
          priority: 'high',
          recoveryAttempt: options.recoveryAttempt,
          skipEmbedded: options.skipEmbedded,
          embeddedCandidateIndex: options.embeddedCandidateIndex,
        });

        if (generation !== loadGenerationRef.current || controller.signal.aborted) return false;

        resolved = {
          song: direct.track,
          url: direct.url,
          diagnostics: direct.diagnostics,
          headers: direct.headers,
        };
        setPipelineStartQuality(effectiveQualityRef.current);
        setPipelineTargetQuality(effectiveQualityRef.current);
        setAdaptivePipelineStatus('upgrade-skipped');
      }

      if (generation !== loadGenerationRef.current || controller.signal.aborted) return false;

      const nextQueue = [...queueRef.current];
      // Runtime queue keeps embedded candidates for fast replay/next/previous.
      // AsyncStorage snapshots are sanitized separately below.
      nextQueue[index] = normalizeSong(resolved.song as any);
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      player.replace(nativeAudioSource(resolved.url, resolved.headers));
      activeStreamUrlRef.current = resolved.url;
      player.setPlaybackRate(rateRef.current);
      setPlaybackState('LOADING');

      const diagnostics: PlaybackDiagnostics = immediate
        ? {
            provider: immediate.source === 'local' ? 'Device' : String(stable.provider || stable.source || 'Harmonia'),
            source: immediate.source,
            codec: null,
            bitrate: null,
            quality: null,
            mimeType: null,
            streamHost: 'device',
            resolutionTimeMs: 0,
            cache: 'hit',
            expiresAt: null,
            recoveryAttempt: options.recoveryAttempt ?? null,
          }
        : {
            ...(resolved.diagnostics as ResolvedStreamDiagnostics),
            recoveryAttempt: options.recoveryAttempt ?? resolved.diagnostics?.recoveryAttempt ?? null,
          };

      setPlaybackDiagnostics(diagnostics);
      activeProviderRef.current = diagnostics.provider;
      activeSourceRef.current = diagnostics.source;
      lastPlaybackErrorRef.current = null;
      loadedTrackId.current = stable.id;
      restoredPosition.current = 0;
      lastKnownPositionRef.current = Math.max(0, startPosition);
      pendingSeek.current = startPosition > 0 ? startPosition : null;
      setLockScreenMetadata(resolved.song);
      if (shouldRecordHistory) {
        pendingHistoryRef.current = {
          trackId: stable.id,
          song: normalizeSong(resolved.song as any),
        };
      }

      if (autoplay) {
        player.play();
      }

      if (
        !immediate &&
        adaptivePipelineRef.current &&
        !options.recovery &&
        !options.skipAdaptive &&
        !options.forceFresh
      ) {
        setAdaptivePipelineStatus((current) =>
          current === 'playing-fast' ? 'upgrading' : current
        );

        void promotion
          .then((candidate) => {
            if (
              generation !== loadGenerationRef.current ||
              controller.signal.aborted ||
              !candidate
            ) {
              if (
                generation === loadGenerationRef.current &&
                !controller.signal.aborted &&
                !candidate
              ) {
                setAdaptivePipelineStatus((current) =>
                  current === 'upgrading' ? 'upgrade-skipped' : current
                );
              }
              return;
            }

            const current = queueRef.current[indexRef.current];
            if (!current || current.id !== stable.id) return;

            const resumeAt = Math.max(0, lastKnownPositionRef.current);
            const shouldResume = playbackIntentRef.current;

            player.pause();
            lockScreenReadyKeyRef.current = null;
            player.replace(nativeAudioSource(candidate.url, candidate.headers));
            activeStreamUrlRef.current = candidate.url;
            player.setPlaybackRate(rateRef.current);
            pendingSeek.current = resumeAt;
            restoredPosition.current = resumeAt;
            lastKnownPositionRef.current = resumeAt;

            const upgradedQueue = [...queueRef.current];
            upgradedQueue[indexRef.current] = normalizeSong(candidate.song as any);
            queueRef.current = upgradedQueue;
            setQueue(upgradedQueue);
            setPlaybackDiagnostics(candidate.diagnostics);
            activeProviderRef.current = candidate.diagnostics.provider;
            activeSourceRef.current = candidate.diagnostics.source;
            setPipelinePromotionResolveMs(candidate.resolveMs);
            setLockScreenMetadata(candidate.song);
            setAdaptivePipelineStatus('upgraded');
            setPlaybackState('LOADING');

            if (shouldResume) player.play();
          })
          .catch((cause) => {
            if (generation !== loadGenerationRef.current || controller.signal.aborted) return;
            const typed = classifyPlaybackError(cause);
            if (typed.type !== PlaybackErrorType.REQUEST_ABORTED) {
              setAdaptivePipelineStatus('upgrade-failed');
            }
          });
      }

      return true;
    } catch (cause) {
      const typed = classifyPlaybackError(cause);
      lastPlaybackErrorRef.current = typed;

      if (
        generation === loadGenerationRef.current &&
        typed.type !== PlaybackErrorType.REQUEST_ABORTED
      ) {
        if (typed.provider) {
          if (failedProvidersRef.current.trackId !== stable.id) {
            failedProvidersRef.current = { trackId: stable.id, providers: new Set() };
          }
          failedProvidersRef.current.providers.add(typed.provider.toLowerCase());
        }
        loadedTrackId.current = null;
        setAdaptivePipelineStatus('upgrade-failed');
        setPlaybackErrorType(typed.type);
        setPlaybackState('ERROR');
        setError(
          typed.type === PlaybackErrorType.NETWORK_ERROR
            ? 'Network connection interrupted. Harmonia will retry when possible.'
            : typed.message
        );
      }
      return false;
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoadingTrack(false);
        // Keep the most recent controller referenced after initial resolution.
        // A newer track load aborts it, which also cancels any late quality promotion.
      }
    }
  }, [batterySaver, getOfflineUri, player, setLockScreenMetadata]);

  useEffect(() => {
    const next = qualityFor(streamQuality);
    if (next === effectiveQualityRef.current) return;
    effectiveQualityRef.current = next;
    void qualityReloadRef.current();
  }, [qualityFor, streamQuality]);

  useEffect(() => {
    qualityReloadRef.current = async () => {
      const index = indexRef.current;
      const target = queueRef.current[index];
      if (!target) return;

      const stable = normalizeSong(target as any);
      const offlineUri = getOfflineUri(stable.id);
      if (getImmediateLocalSource(stable, offlineUri)) return;

      const resumeAt = Math.max(
        0,
        Number(currentTimeRef.current || lastKnownPositionRef.current || 0)
      );
      const shouldResume = Boolean(nativePlayingRef.current || playbackIntentRef.current);

      invalidateResolvedStream(stable.id);
      await loadIndex(index, shouldResume, resumeAt, {
        recordHistory: false,
        forceFresh: true,
        skipAdaptive: true,
      });
    };
  }, [getOfflineUri, loadIndex]);

  const playAt = useCallback(async (index: number) => {
    if (index < 0 || index >= queueRef.current.length) return;
    await loadIndex(index, true, 0);
  }, [loadIndex]);

  const playSong = useCallback(async (song: Song, contextQueue?: Song[]) => {
    const normalized = normalizeSong(song as any);
    const normalizedQueue = (contextQueue?.length ? contextQueue : [normalized])
      .map((item) => normalizeSong(item as any))
      .filter((item) => Boolean(item.id));

    let index = normalizedQueue.findIndex((item) => item.id === normalized.id);
    if (index < 0) {
      normalizedQueue.unshift(normalized);
      index = 0;
    }

    unshuffledQueueRef.current = normalizedQueue;
    let playbackQueue = normalizedQueue;
    let playbackIndex = index;

    if (shuffleRef.current && normalizedQueue.length > 1) {
      const selected = normalizedQueue[index];
      const rest = normalizedQueue.filter((_, itemIndex) => itemIndex !== index);
      for (let i = rest.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      playbackQueue = [selected, ...rest];
      playbackIndex = 0;
    }

    queueRef.current = playbackQueue;
    indexRef.current = playbackIndex;
    setQueue(playbackQueue);
    setCurrentIndex(playbackIndex);
    await loadIndex(playbackIndex, true, 0);
  }, [loadIndex]);

  const commitQueue = useCallback((nextQueue: Song[], nextIndex: number) => {
    queueRef.current = nextQueue;
    indexRef.current = nextIndex;
    unshuffledQueueRef.current = nextQueue;
    setQueue(nextQueue);
    setCurrentIndex(nextIndex);
  }, []);

  const playNext = useCallback((song: Song) => {
    const stable = normalizeSong(song as any);
    if (!stable.id) return;

    const list = [...queueRef.current];
    const existingIndex = list.findIndex(
      (item, index) => index !== indexRef.current && item.id === stable.id
    );
    if (existingIndex >= 0) list.splice(existingIndex, 1);
    list.splice(Math.min(Math.max(0, indexRef.current + 1), list.length), 0, stable);
    commitQueue(list, indexRef.current);
  }, [commitQueue]);

  const addToQueue = useCallback((song: Song) => {
    const stable = normalizeSong(song as any);
    if (!stable.id) return;
    commitQueue([...queueRef.current, stable], indexRef.current);
  }, [commitQueue]);

  const removeQueueItem = useCallback((index: number) => {
    // The active item owns the native source, so queue edits never remove it.
    if (index < 0 || index >= queueRef.current.length || index === indexRef.current) return;
    const list = [...queueRef.current];
    list.splice(index, 1);
    commitQueue(list, index < indexRef.current ? indexRef.current - 1 : indexRef.current);
  }, [commitQueue]);

  const moveQueueItem = useCallback((from: number, to: number) => {
    const list = [...queueRef.current];
    if (
      from < 0 || from >= list.length || to < 0 || to >= list.length ||
      from === to || from === indexRef.current || to === indexRef.current
    ) return;

    const activeIndex = indexRef.current;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    let nextActiveIndex = activeIndex;
    if (from < activeIndex && to > activeIndex) nextActiveIndex -= 1;
    else if (from > activeIndex && to < activeIndex) nextActiveIndex += 1;

    commitQueue(list, nextActiveIndex);
  }, [commitQueue]);

  const clearUpcoming = useCallback(() => {
    const current = queueRef.current[indexRef.current];
    if (current) commitQueue([current], 0);
  }, [commitQueue]);

  const next = useCallback(async () => {
    const list = queueRef.current;
    if (!list.length) return;
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= list.length) {
      if (repeatModeRef.current === 'all' && list.length > 0) {
        await loadIndex(0, true, 0);
        return;
      }

      const endGeneration = loadGenerationRef.current;
      const endIndex = indexRef.current;
      const seed = list[endIndex];
      const seedId = String(seed?.id || '');

      if (radioRef.current && seed?.id && !(seed as any).localUri) {
        try {
          const suggestions = await fetchSongSuggestions(seed.id, 20);
          if (
            endGeneration !== loadGenerationRef.current ||
            indexRef.current !== endIndex ||
            String(queueRef.current[endIndex]?.id || '') !== seedId
          ) {
            return;
          }
          if (queueRef.current !== list) {
            // Manual queue edits always win over late Radio suggestions. If the
            // user appended a next track while Radio was resolving, continue
            // directly into that track instead of leaving playback stopped.
            if (queueRef.current[endIndex + 1]) {
              await loadIndex(endIndex + 1, true, 0);
            }
            return;
          }

          const existingIds = new Set(list.map((song) => String(song.id)));
          const additions = suggestions
            .map((song) => normalizeSong(song as any))
            .filter((song) => song.id && !existingIds.has(String(song.id)))
            .slice(0, 12);

          if (additions.length) {
            const extended = [...list, ...additions];
            queueRef.current = extended;
            unshuffledQueueRef.current = extended;
            setQueue(extended);
            await loadIndex(endIndex + 1, true, 0);
            return;
          }
        } catch {
          // Radio is best-effort; a provider failure should never break playback.
        }
      }

      if (
        endGeneration !== loadGenerationRef.current ||
        indexRef.current !== endIndex ||
        String(queueRef.current[endIndex]?.id || '') !== seedId
      ) {
        return;
      }
      if (queueRef.current !== list) {
        if (queueRef.current[endIndex + 1]) {
          await loadIndex(endIndex + 1, true, 0);
        }
        return;
      }

      playbackIntentRef.current = false;
      player.pause();
      await player.seekTo(0).catch(() => {});
      return;
    }
    await loadIndex(nextIndex, true, 0);
  }, [loadIndex, player]);

  const previous = useCallback(async () => {
    if (currentTimeRef.current > 3) {
      await player.seekTo(0);
      currentTimeRef.current = 0;
      lastKnownPositionRef.current = 0;
      return;
    }
    const previousIndex = indexRef.current - 1;
    if (previousIndex < 0 && repeatModeRef.current === 'all' && queueRef.current.length) {
      await loadIndex(queueRef.current.length - 1, true, 0);
      return;
    }
    await loadIndex(Math.max(0, previousIndex), true, 0);
  }, [loadIndex, player]);

  const togglePlayback = useCallback(async () => {
    const song = queueRef.current[indexRef.current];
    if (!song) return;

    if (loadedTrackId.current !== song.id || !status.isLoaded || Boolean(status.error)) {
      playbackIntentRef.current = true;
      recoveryStateRef.current = { trackId: song.id, attempts: 0 };
      const resumeAt = Math.max(restoredPosition.current, lastKnownPositionRef.current);
      const forceFresh = Boolean(status.error);
      if (forceFresh) invalidateResolvedStream(song.id);
      await loadIndex(indexRef.current, true, resumeAt, {
        recordHistory: false,
        forceFresh,
        skipAdaptive: forceFresh,
      });
      return;
    }

    if (status.playing) {
      playbackIntentRef.current = false;
      player.pause();
    } else {
      playbackIntentRef.current = true;
      player.play();
    }
  }, [loadIndex, player, status.error, status.isLoaded, status.playing]);

  const seek = useCallback(async (seconds: number) => {
    const max = status.duration || currentSong?.duration || seconds;
    const target = Math.max(0, Math.min(seconds, max));
    lastKnownPositionRef.current = target;
    await player.seekTo(target);
  }, [currentSong?.duration, player, status.duration]);

  useEffect(() => {
    const restoreGeneration = loadGenerationRef.current;

    // Expo Go cannot register this app's background media service. Retain
    // foreground playback when that native-only setup is unavailable instead
    // of silently leaving the audio session unconfigured.
    const isExpoGo = isExpoGoRuntime();

    setAudioModeAsync(
      isExpoGo
        ? {
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: 'doNotMix',
          }
        : {
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
          }
    ).catch(() =>
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      }).catch(() => {})
    );

    // Expo Go does not include this app's generated media playback service.
    // Requesting its notification permission there attempts to bind that
    // missing service and can poison the foreground player session.
    if (Platform.OS === 'android' && !isExpoGo) {
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

        let storedHistory: PlaybackHistoryEntry[] = [];
        let historyNeedsRepair = false;
        if (historyRaw && !historyClearedBeforeHydrationRef.current) {
          try {
            const parsedHistory = JSON.parse(historyRaw);
            if (Array.isArray(parsedHistory)) {
              storedHistory = parsedHistory
                .filter((entry: any) => entry?.song?.id)
                .slice(0, 500)
                .map((entry: any) => ({
                  entryId: String(entry.entryId || `${entry.playedAt || Date.now()}-${entry.song.id}`),
                  playedAt: Math.max(0, Number(entry.playedAt || Date.now())),
                  song: persistenceSafeSong(normalizeSong(entry.song as any)),
                }));
              historyNeedsRepair = storedHistory.length !== parsedHistory.length;
            } else {
              historyNeedsRepair = true;
            }
          } catch {
            historyNeedsRepair = true;
          }
        }

        const pendingHistory = pendingHistoryEntriesRef.current;
        const pendingEntryIds = new Set(pendingHistory.map((entry) => entry.entryId));
        const mergedHistory = [
          ...pendingHistory,
          ...storedHistory.filter((entry) => !pendingEntryIds.has(entry.entryId)),
        ].slice(0, 500);
        pendingHistoryEntriesRef.current = [];
        historyHydratedRef.current = true;
        setHistory(mergedHistory);

        if (
          historyClearedBeforeHydrationRef.current ||
          historyNeedsRepair ||
          pendingHistory.length
        ) {
          historyClearedBeforeHydrationRef.current = false;
          if (mergedHistory.length) writeHistorySnapshot(mergedHistory);
          else {
            historyWriteChainRef.current = historyWriteChainRef.current
              .catch(() => {})
              .then(() => AsyncStorage.removeItem(HISTORY_KEY))
              .catch(() => {});
          }
        }

        let storedStats = emptyListeningStats();
        let statsNeedsRepair = false;
        if (statsRaw && !statsClearedBeforeHydrationRef.current) {
          try {
            const parsedStats = JSON.parse(statsRaw);
            storedStats = {
              totalSeconds: Math.max(0, Number(parsedStats?.totalSeconds || 0)),
              playCount: Math.max(0, Number(parsedStats?.playCount || 0)),
              trackCounts: parsedStats?.trackCounts && typeof parsedStats.trackCounts === 'object'
                ? parsedStats.trackCounts
                : {},
              dailySeconds: parsedStats?.dailySeconds && typeof parsedStats.dailySeconds === 'object'
                ? parsedStats.dailySeconds
                : {},
            };
          } catch {
            statsNeedsRepair = true;
          }
        }

        const pendingStats = pendingStatsDeltaRef.current;
        const mergedStats = mergeListeningStats(storedStats, pendingStats);
        pendingStatsDeltaRef.current = emptyListeningStats();
        statsHydratedRef.current = true;
        setListeningStats(mergedStats);

        if (
          statsClearedBeforeHydrationRef.current ||
          statsNeedsRepair ||
          hasListeningStatsDelta(pendingStats)
        ) {
          statsClearedBeforeHydrationRef.current = false;
          if (hasListeningStatsDelta(mergedStats)) writeListeningStatsSnapshot(mergedStats);
          else {
            statsWriteChainRef.current = statsWriteChainRef.current
              .catch(() => {})
              .then(() => AsyncStorage.removeItem(LISTENING_STATS_KEY))
              .catch(() => {});
          }
        }

        let rawSettings: Record<string, any> = {};
        if (settingsRaw) {
          try {
            rawSettings = JSON.parse(settingsRaw);
          } catch {
            AsyncStorage.removeItem(PLAYER_SETTINGS_KEY).catch(() => {});
          }
        }
        const validQualities: StreamQuality[] = ['automatic', 'data-saver', 'normal', 'high', 'maximum'];
        const validRepeatModes: RepeatMode[] = ['off', 'all', 'one'];
        const restoredSettings: PersistedPlayerSettings = {
          playbackRate: Math.max(0.5, Math.min(2, Number(rawSettings.playbackRate || 1))),
          streamQuality: validQualities.includes(rawSettings.streamQuality)
            ? rawSettings.streamQuality
            : 'automatic',
          repeatMode: validRepeatModes.includes(rawSettings.repeatMode)
            ? rawSettings.repeatMode
            : 'off',
          shuffleEnabled: Boolean(rawSettings.shuffleEnabled),
          radioEnabled: false,
          adaptivePipelineEnabled: rawSettings.adaptivePipelineEnabled !== false,
        };
        const pendingSettings = pendingSettingsRef.current;
        const mergedSettings: PersistedPlayerSettings = {
          ...restoredSettings,
          ...pendingSettings,
        };
        pendingSettingsRef.current = {};
        settingsHydratedRef.current = true;

        rateRef.current = mergedSettings.playbackRate;
        qualityRef.current = mergedSettings.streamQuality;
        repeatModeRef.current = mergedSettings.repeatMode;
        shuffleRef.current = mergedSettings.shuffleEnabled;
        radioRef.current = mergedSettings.radioEnabled;
        adaptivePipelineRef.current = mergedSettings.adaptivePipelineEnabled;
        setPlaybackRateState(mergedSettings.playbackRate);
        setStreamQualityState(mergedSettings.streamQuality);
        setRepeatModeState(mergedSettings.repeatMode);
        setShuffleEnabledState(mergedSettings.shuffleEnabled);
        setRadioEnabledState(mergedSettings.radioEnabled);
        setAdaptivePipelineEnabledState(mergedSettings.adaptivePipelineEnabled);
        player.setPlaybackRate(mergedSettings.playbackRate);

        if (Object.keys(pendingSettings).length) {
          writeSettingsSnapshot(mergedSettings);
        }

        if (!snapshotRaw || loadGenerationRef.current !== restoreGeneration) return;
        let snapshot: PlaybackSnapshot;
        try {
          snapshot = JSON.parse(snapshotRaw) as PlaybackSnapshot;
        } catch {
          await AsyncStorage.removeItem(PLAYBACK_SNAPSHOT_KEY).catch(() => {});
          return;
        }
        const restoredQueue = Array.isArray(snapshot.queue)
          ? snapshot.queue.map((song) => persistenceSafeSong(normalizeSong(song as any))).filter((song) => song.id)
          : [];
        if (!restoredQueue.length) return;

        const restoredBaseQueue = Array.isArray(snapshot.baseQueue)
          ? snapshot.baseQueue
              .map((song) => persistenceSafeSong(normalizeSong(song as any)))
              .filter((song) => song.id)
          : [];
        const restoredIndex = Math.min(
          Math.max(Number(snapshot.index || 0), 0),
          restoredQueue.length - 1
        );
        unshuffledQueueRef.current = restoredBaseQueue.length
          ? restoredBaseQueue
          : restoredQueue;
        queueRef.current = restoredQueue;
        indexRef.current = restoredIndex;
        restoredPosition.current = Math.max(0, Number(snapshot.position || 0));
        lastKnownPositionRef.current = restoredPosition.current;
        setQueue(restoredQueue);
        setCurrentIndex(restoredIndex);
        setPlaybackState('READY');
      } catch {
        await AsyncStorage.removeItem(PLAYBACK_SNAPSHOT_KEY).catch(() => {});
        if (!historyHydratedRef.current) {
          historyHydratedRef.current = true;
          pendingHistoryEntriesRef.current = [];
        }
        if (!statsHydratedRef.current) {
          statsHydratedRef.current = true;
          pendingStatsDeltaRef.current = emptyListeningStats();
        }
        if (!settingsHydratedRef.current) {
          const pendingSettings = pendingSettingsRef.current;
          settingsHydratedRef.current = true;
          pendingSettingsRef.current = {};
          if (Object.keys(pendingSettings).length) {
            writeSettingsSnapshot(currentSettingsSnapshot());
          }
        }
      }
    })();
  }, [
    currentSettingsSnapshot,
    player,
    writeHistorySnapshot,
    writeListeningStatsSnapshot,
    writeSettingsSnapshot,
  ]);

  useEffect(() => {
    const current = Number(status.currentTime || 0);
    if (
      status.isLoaded &&
      pendingSeek.current == null &&
      Number.isFinite(current) &&
      current >= 0
    ) {
      lastKnownPositionRef.current = current;
    }
  }, [status.currentTime, status.isLoaded]);

  useEffect(() => {
    if (!status.playing || status.error) return;
    const pending = pendingHistoryRef.current;
    if (!pending) return;

    const active = queueRef.current[indexRef.current];
    if (
      loadedTrackId.current !== pending.trackId ||
      String(active?.id || '') !== pending.trackId
    ) {
      return;
    }

    pendingHistoryRef.current = null;
    recordHistory(pending.song);
  }, [recordHistory, status.error, status.playing]);

  useEffect(() => {
    if (!status.isLoaded || pendingSeek.current == null) return;
    const target = pendingSeek.current;
    pendingSeek.current = null;
    lastKnownPositionRef.current = target;
    player.seekTo(target).catch(() => {});
  }, [player, status.isLoaded]);

  useEffect(() => {
    const nativeDuration = Number(status.duration || 0);
    if (
      !currentSong?.id ||
      !status.isLoaded ||
      !Number.isFinite(nativeDuration) ||
      nativeDuration <= 0
    ) {
      return;
    }

    const readyKey = `${currentSong.id}:${Math.round(nativeDuration * 1000)}`;
    if (lockScreenReadyKeyRef.current === readyKey) return;

    // expo-audio can create Android's MediaSession before the replacement
    // source has reported a timeline. Re-register once the native player knows
    // the duration so the system media card gets a real seek range instead of
    // remaining at 0:00 for the whole track.
    setLockScreenMetadata(currentSong);
    lockScreenReadyKeyRef.current = readyKey;
  }, [currentSong, setLockScreenMetadata, status.duration, status.isLoaded]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const releasePreloadedSource = () => {
      const previous = preloadedSourceRef.current;
      preloadedSourceRef.current = null;
      if (previous) clearPreloadedSource(previous.source).catch(() => {});
    };

    const warmNextTrack = async () => {
      if (batterySaver || !isForeground || !networkConnected || !status.playing) {
        releasePreloadedSource();
        return;
      }

      const upcoming = queueRef.current[indexRef.current + 1];
      if (!upcoming?.id) {
        releasePreloadedSource();
        return;
      }

      const stable = normalizeSong(upcoming as any);
      const offlineUri = getOfflineUri(stable.id);
      const immediate = getImmediateLocalSource(stable, offlineUri);
      let url = immediate?.url || null;
      let headers: Record<string, string> | null = null;

      if (!url) {
        try {
          const resolved = await resolveTrackStream(stable, {
            quality: effectiveQualityRef.current,
            signal: controller.signal,
            priority: 'medium',
          });
          url = resolved.url;
          headers = resolved.headers;
        } catch {
          if (!controller.signal.aborted) releasePreloadedSource();
          return;
        }
      }

      if (cancelled || controller.signal.aborted || !url) return;

      const key = audioSourceKey(url, headers);
      if (preloadedSourceRef.current?.key === key) return;

      const source = nativeAudioSource(url, headers);
      const previous = preloadedSourceRef.current;
      preloadedSourceRef.current = { key, source };
      if (previous) {
        clearPreloadedSource(previous.source).catch(() => {});
      }

      preload(source, { preferredForwardBufferDuration: 18 }).catch(() => {
        if (preloadedSourceRef.current?.key === key) preloadedSourceRef.current = null;
      });

      // Warm one additional resolver entry, but do not ask the native decoder
      // to buffer multiple tracks. This keeps next-next transitions responsive
      // without turning prefetch into a battery/data heater.
      const later = queueRef.current[indexRef.current + 2];
      if (later?.id && later.id !== stable.id && !controller.signal.aborted) {
        const laterStable = normalizeSong(later as any);
        const laterOffline = getOfflineUri(laterStable.id);
        if (!getImmediateLocalSource(laterStable, laterOffline)) {
          resolveTrackStream(laterStable, {
            quality: effectiveQualityRef.current,
            signal: controller.signal,
            priority: 'low',
          }).catch(() => {});
        }
      }
    };

    void warmNextTrack();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [batterySaver, currentIndex, getOfflineUri, isForeground, networkConnected, queue, status.playing, streamQuality]);

  useEffect(() => {
    return () => {
      loadGenerationRef.current += 1;
      activeResolutionAbortRef.current?.abort();
      activeResolutionAbortRef.current = null;
      playbackIntentRef.current = false;
      const previous = preloadedSourceRef.current;
      preloadedSourceRef.current = null;
      if (previous) clearPreloadedSource(previous.source).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (status.didJustFinish && !finishing.current) {
      finishing.current = true;
      if (sleepTimerRef.current === 'track') {
        playbackIntentRef.current = false;
        player.pause();
        setSleepTimer('off');
        player.seekTo(0).catch(() => {});
        finishing.current = false;
        return;
      }
      if (repeatModeRef.current === 'one') {
        void loadIndex(indexRef.current, true, 0).finally(() => {
          setTimeout(() => {
            finishing.current = false;
          }, 350);
        });
        return;
      }
      void next().finally(() => {
        setTimeout(() => {
          finishing.current = false;
        }, 500);
      });
    }
    if (!status.didJustFinish) finishing.current = false;
  }, [loadIndex, next, player, setSleepTimer, status.didJustFinish]);

  useEffect(() => {
    if (typeof sleepTimer !== 'number') return;
    const tick = () => {
      const deadline = sleepDeadlineRef.current;
      if (!deadline) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSleepRemaining(remaining);
      if (remaining <= 0) {
        playbackIntentRef.current = false;
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
      const id = String(currentSong.id);
      const day = localDayKey();
      const delta: ListeningStats = {
        totalSeconds: 10,
        playCount: 0,
        trackCounts: { [id]: 10 },
        dailySeconds: { [day]: 10 },
      };

      if (!statsHydratedRef.current) addPendingStatsDelta(delta);

      setListeningStats((current) => {
        const next = mergeListeningStats(current, delta);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 35);
        const cutoffKey = localDayKey(cutoff);
        const dailySeconds = { ...next.dailySeconds };
        for (const key of Object.keys(dailySeconds)) {
          if (key < cutoffKey) delete dailySeconds[key];
        }
        const trimmed = { ...next, dailySeconds };
        if (
          statsHydratedRef.current &&
          Date.now() - lastStatsPersistedAtRef.current >= 30_000
        ) {
          writeListeningStatsSnapshot(trimmed);
        }
        return trimmed;
      });
    }, 10_000);

    return () => clearInterval(interval);
  }, [addPendingStatsDelta, currentSong?.id, status.playing, writeListeningStatsSnapshot]);

  useEffect(() => {
    if (!queue.length || currentIndex < 0) return;

    const wholeSecond = Math.floor(
      status.currentTime || restoredPosition.current || 0
    );
    const queueChanged =
      queue !== lastPersistedQueueRef.current ||
      currentIndex !== lastPersistedQueueIndex.current;
    const playingChanged = status.playing !== lastPersistedPlayingRef.current;

    // The throttle decision lives in playbackSnapshot.ts (unit tested): queue
    // edits and play/pause transitions persist immediately; position-only
    // updates are throttled in every state, otherwise paused ticks would
    // rewrite the queue JSON every 500ms (the write-storm regression).
    if (
      !shouldPersistPlaybackSnapshot({
        queueChanged,
        playingChanged,
        elapsedSeconds: Math.abs(wholeSecond - lastPersistedSecond.current),
      })
    ) {
      return;
    }

    const currentWindow = createQueueWindow(queue, currentIndex, 100);
    if (!currentWindow.items.length || currentWindow.index < 0) return;

    const currentId = String(queue[currentIndex]?.id || '');
    const baseQueue = unshuffledQueueRef.current.length
      ? unshuffledQueueRef.current
      : queue;
    let baseIndex = baseQueue.findIndex(
      (song) => String(song.id || '') === currentId
    );
    if (baseIndex < 0) baseIndex = Math.min(currentIndex, baseQueue.length - 1);
    const baseWindow = createQueueWindow(baseQueue, baseIndex, 100);

    lastPersistedSecond.current = wholeSecond;
    lastPersistedQueueRef.current = queue;
    lastPersistedQueueIndex.current = currentIndex;
    lastPersistedPlayingRef.current = status.playing;

    const snapshot: PlaybackSnapshot = {
      queue: currentWindow.items.map(persistenceSafeSong),
      baseQueue: baseWindow.items.map(persistenceSafeSong),
      index: currentWindow.index,
      position: Math.max(
        0,
        status.currentTime || restoredPosition.current || 0
      ),
      wasPlaying: status.playing,
      savedAt: Date.now(),
    };
    playbackSnapshotWriteChainRef.current = playbackSnapshotWriteChainRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(
        PLAYBACK_SNAPSHOT_KEY,
        JSON.stringify(snapshot)
      ))
      .catch(() => {});
  }, [currentIndex, queue, status.currentTime, status.playing]);

  useEffect(() => {
    if (awaitingNetworkRecoveryRef.current) {
      setPlaybackState('RECOVERING');
      return;
    }
    if (error) {
      setPlaybackState('ERROR');
      return;
    }
    if (isLoadingTrack) return;
    if (status.error) return;

    if (status.isBuffering) {
      setPlaybackState('BUFFERING');
      return;
    }

    if (status.isLoaded) {
      setPlaybackState(status.playing ? 'PLAYING' : 'PAUSED');
      return;
    }

    setPlaybackState(currentSong ? 'READY' : 'IDLE');
  }, [
    currentSong,
    error,
    isLoadingTrack,
    status.error,
    status.isBuffering,
    status.isLoaded,
    status.playing,
  ]);

  useEffect(() => {
    const hasResolutionFailure = Boolean(error && playbackErrorType);
    const hasNativeFailure = Boolean(status.error);
    const trackId = currentSong?.id;
    if (
      (!hasResolutionFailure && !hasNativeFailure) ||
      !trackId ||
      recoveryInFlightRef.current
    ) return;

    if (recoveryStateRef.current.trackId !== trackId) {
      recoveryStateRef.current = { trackId, attempts: 0 };
    }

    if (recoveryStateRef.current.attempts >= MAX_AUTOMATIC_RECOVERY_ATTEMPTS) {
      setPlaybackState('ERROR');
      setError('Harmonia could not recover this track after multiple attempts. Tap play to retry.');
      return;
    }

    let cancelled = false;

    const recover = async () => {
      recoveryInFlightRef.current = true;
      setPlaybackState('RECOVERING');

      let failure = networkConnected
        ? (lastPlaybackErrorRef.current || classifyPlaybackError(status.error))
        : new PlaybackPipelineError(
            PlaybackErrorType.NETWORK_ERROR,
            'Device is offline.'
          );

      if (__DEV__) {
        console.warn('[HarmoniaPlayback] starting recovery', {
          trackId,
          errorType: failure.type,
          provider: activeProviderRef.current,
          source: activeSourceRef.current,
          attempt: recoveryStateRef.current.attempts + 1,
        });
      }

      if (failedStreamUrlsRef.current.trackId !== trackId) {
        failedStreamUrlsRef.current = { trackId, urls: new Set() };
      }
      if (failedProvidersRef.current.trackId !== trackId) {
        failedProvidersRef.current = { trackId, providers: new Set() };
      }
      if (hasNativeFailure && activeStreamUrlRef.current) {
        failedStreamUrlsRef.current.urls.add(activeStreamUrlRef.current);
      }
      if (hasNativeFailure && activeProviderRef.current) {
        failedProvidersRef.current.providers.add(activeProviderRef.current.toLowerCase());
      }

      try {
        while (
          !cancelled &&
          recoveryStateRef.current.trackId === trackId &&
          recoveryStateRef.current.attempts < MAX_AUTOMATIC_RECOVERY_ATTEMPTS
        ) {
          const completedAttempts = recoveryStateRef.current.attempts;
          const recoverySong = queueRef.current[indexRef.current];
          if (!recoverySong || recoverySong.id !== trackId) return;
          const embeddedCandidates = getAudioCandidates(
            recoverySong,
            effectiveQualityRef.current
          );
          const nextEmbeddedCandidateIndex = nextUntriedCandidateIndex(
            embeddedCandidates,
            failedStreamUrlsRef.current.urls
          );
          const hasNextCandidate =
            hasNativeFailure && nextEmbeddedCandidateIndex >= 0;
          const policy = getPlaybackRecoveryPolicy(failure.type, completedAttempts, {
            online: networkConnected,
            hasNextCandidate,
          });

          if (policy.action === 'ignore') return;
          if (policy.action === 'await-user') {
            playbackIntentRef.current = false;
            setPlaybackErrorType(failure.type);
            setPlaybackState('PAUSED');
            return;
          }
          if (policy.action === 'await-online') {
            awaitingNetworkRecoveryRef.current = true;
            setPlaybackErrorType(PlaybackErrorType.NETWORK_ERROR);
            setPlaybackState('RECOVERING');
            setError('Waiting for an internet connection to resume playback…');
            return;
          }
          if (policy.action === 'fail') break;

          awaitingNetworkRecoveryRef.current = false;

          if (policy.delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, policy.delayMs));
          }
          if (cancelled) return;

          recoveryStateRef.current.attempts += 1;
          const attempt = recoveryStateRef.current.attempts;
          const failedProvider = activeProviderRef.current;
          const failedProviders = [...failedProvidersRef.current.providers];

          invalidateResolvedStream(trackId);

          const resumeAt = captureRecoveryPosition(
            currentTimeRef.current,
            lastKnownPositionRef.current,
            restoredPosition.current
          );

          const recovered = await loadIndex(
            indexRef.current,
            playbackIntentRef.current,
            resumeAt,
            {
              recordHistory: false,
              bypassOffline: attempt > 1,
              recovery: true,
              recoveryAttempt: attempt,
              forceFresh: true,
              skipAdaptive: true,
              skipEmbedded: policy.action !== 'next-candidate',
              embeddedCandidateIndex:
                policy.action === 'next-candidate'
                  ? nextEmbeddedCandidateIndex
                  : 0,
              excludeProviders:
                policy.action !== 'next-candidate' &&
                activeSourceRef.current !== 'embedded' &&
                // Give the current source one fresh URL attempt. If native
                // playback rejects it again, move on immediately so a bad CDN
                // cannot consume the complete recovery budget.
                attempt >= 2 &&
                (failedProviders.length ? failedProviders : failedProvider)
                  ? (failedProviders.length ? failedProviders : [failedProvider as string])
                  : [],
            }
          );

          if (cancelled) return;

          if (recovered) {
            lastPlaybackErrorRef.current = null;
            setPlaybackErrorType(null);
            setError(null);
            awaitingNetworkRecoveryRef.current = false;
            return;
          }

          failure = lastPlaybackErrorRef.current || failure;
        }

        if (!cancelled) {
          setPlaybackErrorType(failure.type);
          setPlaybackState('ERROR');
          setError('Harmonia could not recover this track after multiple attempts. Tap play to retry.');
        }
      } finally {
        recoveryInFlightRef.current = false;
      }
    };

    void recover();

    return () => {
      cancelled = true;
    };
  }, [
    currentSong?.id,
    error,
    loadIndex,
    networkConnected,
    playbackErrorType,
    status.error,
  ]);

  const value = useMemo<PlayerContextValue>(() => ({
    currentSong,
    queue,
    currentIndex,
    isPlaying: status.playing,
    isBuffering: status.isBuffering,
    isLoadingTrack,
    error,
    playbackState,
    playbackErrorType,
    playbackRate,
    streamQuality,
    sleepTimer,
    repeatMode,
    shuffleEnabled,
    radioEnabled,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    pipelineStartQuality,
    pipelineTargetQuality,
    pipelineInitialResolveMs,
    pipelinePromotionResolveMs,
    playbackDiagnostics,
    playSong,
    playAt,
    playNext,
    addToQueue,
    removeQueueItem,
    moveQueueItem,
    clearUpcoming,
    togglePlayback,
    next,
    previous,
    seek,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    toggleRepeat,
    toggleShuffle,
    toggleRadio,
    toggleAdaptivePipeline,
    clearError: () => {
      setError(null);
      setPlaybackErrorType(null);
    },
  }), [
    currentSong,
    queue,
    currentIndex,
    status.playing,
    status.isBuffering,
    isLoadingTrack,
    error,
    playbackState,
    playbackErrorType,
    playbackRate,
    streamQuality,
    sleepTimer,
    repeatMode,
    shuffleEnabled,
    radioEnabled,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    pipelineStartQuality,
    pipelineTargetQuality,
    pipelineInitialResolveMs,
    pipelinePromotionResolveMs,
    playbackDiagnostics,
    playSong,
    playAt,
    playNext,
    addToQueue,
    removeQueueItem,
    moveQueueItem,
    clearUpcoming,
    togglePlayback,
    next,
    previous,
    seek,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    toggleRepeat,
    toggleShuffle,
    toggleRadio,
    toggleAdaptivePipeline,
  ]);

  const historyValue = useMemo<PlaybackHistoryValue>(() => ({
    history,
    clearHistory,
  }), [clearHistory, history]);

  const listeningStatsValue = useMemo<ListeningStatsValue>(() => ({
    listeningStats,
  }), [listeningStats]);

  const progressValue = useMemo<PlaybackProgressValue>(() => ({
    position: status.currentTime || restoredPosition.current || 0,
    duration: status.duration || currentSong?.duration || 0,
    sleepRemaining,
  }), [currentSong?.duration, sleepRemaining, status.currentTime, status.duration]);

  return (
    <PlayerContext.Provider value={value}>
      <PlaybackHistoryContext.Provider value={historyValue}>
        <ListeningStatsContext.Provider value={listeningStatsValue}>
          <PlaybackProgressContext.Provider value={progressValue}>
            {children}
          </PlaybackProgressContext.Provider>
        </ListeningStatsContext.Provider>
      </PlaybackHistoryContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

export function usePlaybackProgress() {
  const value = useContext(PlaybackProgressContext);
  if (!value) throw new Error('usePlaybackProgress must be used inside PlayerProvider');
  return value;
}

export function usePlaybackHistory() {
  const value = useContext(PlaybackHistoryContext);
  if (!value) throw new Error('usePlaybackHistory must be used inside PlayerProvider');
  return value;
}

export function useListeningStats() {
  const value = useContext(ListeningStatsContext);
  if (!value) throw new Error('useListeningStats must be used inside PlayerProvider');
  return value;
}

/** @deprecated Prefer the focused history or listening-stats hook to avoid unrelated re-renders. */
export function usePlaybackActivity() {
  return {
    ...usePlaybackHistory(),
    ...useListeningStats(),
  };
}

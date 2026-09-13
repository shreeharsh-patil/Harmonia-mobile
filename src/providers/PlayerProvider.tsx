import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  preload,
  clearPreloadedSource,
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
import { fetchSongSuggestions } from '@/src/lib/api';
import {
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
  getPlaybackRecoveryPolicy,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
} from '@/src/lib/playback/recoveryPolicy';
import {
  albumName,
  artistNames,
  artworkUrl,
  normalizeSong,
  persistenceSafeSong,
} from '@/src/lib/song';
import type { Song } from '@/src/types';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import {
  createAdaptivePipeline,
  type AdaptivePipelineStatus,
  type PipelineResolvedStream,
} from '@/src/lib/streamPipeline';

const PLAYER_SETTINGS_KEY = 'harmonia.mobile.player-settings.v1';
const HISTORY_KEY = 'harmonia.mobile.history.v1';
const LISTENING_STATS_KEY = 'harmonia.mobile.listening-stats.v1';

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

type PlaybackSnapshot = {
  queue: Song[];
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
  position: number;
  duration: number;
  error: string | null;
  playbackState: PlaybackEngineState;
  playbackErrorType: PlaybackErrorTypeValue | null;
  playbackRate: number;
  streamQuality: StreamQuality;
  sleepTimer: SleepTimerMode;
  sleepRemaining: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  radioEnabled: boolean;
  adaptivePipelineEnabled: boolean;
  adaptivePipelineStatus: AdaptivePipelineStatus;
  pipelineStartQuality: StreamQuality | null;
  pipelineTargetQuality: StreamQuality | null;
  pipelineInitialResolveMs: number | null;
  pipelinePromotionResolveMs: number | null;
  history: PlaybackHistoryEntry[];
  listeningStats: ListeningStats;
  playbackDiagnostics: PlaybackDiagnostics | null;
  clearHistory: () => Promise<void>;
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

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { getOfflineUri } = useOffline();
  const { batterySaver, qualityFor, networkConnected } = usePreferences();
  const player = useAudioPlayer(null, { updateInterval: 500, preferredForwardBufferDuration: 12 });
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
  const [radioEnabled, setRadioEnabledState] = useState(true);
  const [adaptivePipelineEnabled, setAdaptivePipelineEnabledState] = useState(true);
  const [adaptivePipelineStatus, setAdaptivePipelineStatus] = useState<AdaptivePipelineStatus>('idle');
  const [pipelineStartQuality, setPipelineStartQuality] = useState<StreamQuality | null>(null);
  const [pipelineTargetQuality, setPipelineTargetQuality] = useState<StreamQuality | null>(null);
  const [pipelineInitialResolveMs, setPipelineInitialResolveMs] = useState<number | null>(null);
  const [pipelinePromotionResolveMs, setPipelinePromotionResolveMs] = useState<number | null>(null);
  const [history, setHistory] = useState<PlaybackHistoryEntry[]>([]);
  const [playbackDiagnostics, setPlaybackDiagnostics] = useState<PlaybackDiagnostics | null>(null);
  const [listeningStats, setListeningStats] = useState<ListeningStats>({
    totalSeconds: 0,
    playCount: 0,
    trackCounts: {},
    dailySeconds: {},
  });

  const loadedTrackId = useRef<string | null>(null);
  const restoredPosition = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const lastPersistedSecond = useRef(-1);
  const finishing = useRef(false);
  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);
  const qualityRef = useRef<StreamQuality>('automatic');
  const effectiveQualityRef = useRef<StreamQuality>('automatic');
  const rateRef = useRef(1);
  const sleepTimerRef = useRef<SleepTimerMode>('off');
  const sleepDeadlineRef = useRef<number | null>(null);
  const repeatModeRef = useRef<RepeatMode>('off');
  const shuffleRef = useRef(false);
  const radioRef = useRef(true);
  const adaptivePipelineRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const activeResolutionAbortRef = useRef<AbortController | null>(null);
  const activeProviderRef = useRef<string | null>(null);
  const lastPlaybackErrorRef = useRef<PlaybackPipelineError | null>(null);
  const awaitingNetworkRecoveryRef = useRef(false);
  const unshuffledQueueRef = useRef<Song[]>([]);
  const playbackIntentRef = useRef(false);
  const lastKnownPositionRef = useRef(0);
  const recoveryInFlightRef = useRef(false);
  const qualityReloadRef = useRef<() => Promise<void>>(async () => {});
  const preloadedSourceRef = useRef<string | null>(null);
  const recoveryStateRef = useRef<{ trackId: string | null; attempts: number }>({
    trackId: null,
    attempts: 0,
  });

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
      ].slice(0, 500);
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

  const persistSettings = useCallback((
    nextRate: number,
    nextQuality: StreamQuality,
    nextRepeat: RepeatMode = repeatModeRef.current,
    nextShuffle: boolean = shuffleRef.current,
    nextRadio: boolean = radioRef.current,
    nextAdaptivePipeline: boolean = adaptivePipelineRef.current
  ) => {
    AsyncStorage.setItem(
      PLAYER_SETTINGS_KEY,
      JSON.stringify({
        playbackRate: nextRate,
        streamQuality: nextQuality,
        repeatMode: nextRepeat,
        shuffleEnabled: nextShuffle,
        radioEnabled: nextRadio,
        adaptivePipelineEnabled: nextAdaptivePipeline,
      })
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
    if (quality === qualityRef.current) return;
    qualityRef.current = quality;
    effectiveQualityRef.current = qualityFor(quality);
    setStreamQualityState(quality);
    persistSettings(rateRef.current, quality);
    void qualityReloadRef.current();
  }, [persistSettings, qualityFor]);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const next = modes[(modes.indexOf(repeatModeRef.current) + 1) % modes.length];
    repeatModeRef.current = next;
    setRepeatModeState(next);
    persistSettings(rateRef.current, qualityRef.current, next, shuffleRef.current);
  }, [persistSettings]);

  const toggleShuffle = useCallback(() => {
    const nextEnabled = !shuffleRef.current;
    shuffleRef.current = nextEnabled;
    setShuffleEnabledState(nextEnabled);

    const current = queueRef.current[indexRef.current];
    if (!current) {
      persistSettings(rateRef.current, qualityRef.current, repeatModeRef.current, nextEnabled);
      return;
    }

    if (nextEnabled) {
      const base = unshuffledQueueRef.current.length
        ? [...unshuffledQueueRef.current]
        : [...queueRef.current];
      const rest = base.filter((song) => song.id !== current.id);
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

    persistSettings(rateRef.current, qualityRef.current, repeatModeRef.current, nextEnabled);
  }, [persistSettings]);

  const toggleRadio = useCallback(() => {
    const nextEnabled = !radioRef.current;
    radioRef.current = nextEnabled;
    setRadioEnabledState(nextEnabled);
    persistSettings(
      rateRef.current,
      qualityRef.current,
      repeatModeRef.current,
      shuffleRef.current,
      nextEnabled
    );
  }, [persistSettings]);

  const toggleAdaptivePipeline = useCallback(() => {
    const nextEnabled = !adaptivePipelineRef.current;
    adaptivePipelineRef.current = nextEnabled;
    setAdaptivePipelineEnabledState(nextEnabled);
    if (!nextEnabled) setAdaptivePipelineStatus('idle');
    persistSettings(
      rateRef.current,
      qualityRef.current,
      repeatModeRef.current,
      shuffleRef.current,
      radioRef.current,
      nextEnabled
    );
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

  const loadIndex = useCallback(async (
    index: number,
    autoplay = true,
    startPosition = 0,
    options: LoadTrackOptions = {}
  ) => {
    const target = queueRef.current[index];
    if (!target) return false;

    const generation = ++loadGenerationRef.current;
    activeResolutionAbortRef.current?.abort();
    const controller = new AbortController();
    activeResolutionAbortRef.current = controller;

    const stable = normalizeSong(target as any);
    const shouldRecordHistory = options.recordHistory !== false;
    const bypassOffline = options.bypassOffline === true;

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
    }

    try {
      player.pause();

      const offlineUri = bypassOffline ? null : getOfflineUri(stable.id);
      const immediate = getImmediateLocalSource(stable, offlineUri);

      let resolved: {
        song: Song;
        url: string;
        diagnostics: ResolvedStreamDiagnostics | null;
      };
      let promotion: Promise<PipelineResolvedStream | null> = Promise.resolve(null);

      if (immediate) {
        resolved = {
          song: stable,
          url: immediate.url,
          diagnostics: null,
        };
        setAdaptivePipelineStatus('idle');
      } else if (
        adaptivePipelineRef.current &&
        !options.recovery &&
        !options.skipAdaptive &&
        !options.forceFresh
      ) {
        const plan = await createAdaptivePipeline(stable, effectiveQualityRef.current, {
          signal: controller.signal,
          excludeProviders: options.excludeProviders,
          recoveryAttempt: options.recoveryAttempt,
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
        });

        if (generation !== loadGenerationRef.current || controller.signal.aborted) return false;

        resolved = {
          song: direct.track,
          url: direct.url,
          diagnostics: direct.diagnostics,
        };
        setPipelineStartQuality(effectiveQualityRef.current);
        setPipelineTargetQuality(effectiveQualityRef.current);
        setAdaptivePipelineStatus('upgrade-skipped');
      }

      if (generation !== loadGenerationRef.current || controller.signal.aborted) return false;

      const nextQueue = [...queueRef.current];
      nextQueue[index] = persistenceSafeSong(resolved.song);
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      player.replace(resolved.url);
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
      lastPlaybackErrorRef.current = null;
      loadedTrackId.current = stable.id;
      restoredPosition.current = 0;
      lastKnownPositionRef.current = Math.max(0, startPosition);
      pendingSeek.current = startPosition > 0 ? startPosition : null;
      setLockScreenMetadata(resolved.song);
      if (shouldRecordHistory) recordHistory(resolved.song);

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
            player.replace(candidate.url);
            player.setPlaybackRate(rateRef.current);
            pendingSeek.current = resumeAt;
            restoredPosition.current = resumeAt;
            lastKnownPositionRef.current = resumeAt;

            const upgradedQueue = [...queueRef.current];
            upgradedQueue[indexRef.current] = persistenceSafeSong(candidate.song);
            queueRef.current = upgradedQueue;
            setQueue(upgradedQueue);
            setPlaybackDiagnostics(candidate.diagnostics);
            activeProviderRef.current = candidate.diagnostics.provider;
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
        if (activeResolutionAbortRef.current === controller) {
          activeResolutionAbortRef.current = null;
        }
      }
    }
  }, [getOfflineUri, player, recordHistory, setLockScreenMetadata]);

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
        Number(status.currentTime || lastKnownPositionRef.current || 0)
      );
      const shouldResume = Boolean(status.playing || playbackIntentRef.current);

      invalidateResolvedStream(stable.id);
      await loadIndex(index, shouldResume, resumeAt, {
        recordHistory: false,
        forceFresh: true,
        skipAdaptive: true,
      });
    };
  }, [getOfflineUri, loadIndex, status.currentTime, status.playing]);

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
    const stable = persistenceSafeSong(normalizeSong(song as any));
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
    const stable = persistenceSafeSong(normalizeSong(song as any));
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

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    commitQueue(list, indexRef.current);
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

      const seed = list[indexRef.current];
      if (radioRef.current && seed?.id && !(seed as any).localUri) {
        try {
          const suggestions = await fetchSongSuggestions(seed.id, 20);
          const existingIds = new Set(list.map((song) => String(song.id)));
          const additions = suggestions
            .map((song) => persistenceSafeSong(normalizeSong(song as any)))
            .filter((song) => song.id && !existingIds.has(String(song.id)))
            .slice(0, 12);

          if (additions.length) {
            const extended = [...list, ...additions];
            queueRef.current = extended;
            unshuffledQueueRef.current = extended;
            setQueue(extended);
            await loadIndex(indexRef.current + 1, true, 0);
            return;
          }
        } catch {
          // Radio is best-effort; a provider failure should never break playback.
        }
      }

      playbackIntentRef.current = false;
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
    const previousIndex = indexRef.current - 1;
    if (previousIndex < 0 && repeatModeRef.current === 'all' && queueRef.current.length) {
      await loadIndex(queueRef.current.length - 1, true, 0);
      return;
    }
    await loadIndex(Math.max(0, previousIndex), true, 0);
  }, [loadIndex, player, status.currentTime]);

  const togglePlayback = useCallback(async () => {
    const song = queueRef.current[indexRef.current];
    if (!song) return;

    if (loadedTrackId.current !== song.id || !status.isLoaded || Boolean(status.error)) {
      playbackIntentRef.current = true;
      recoveryStateRef.current = { trackId: song.id, attempts: 0 };
      const resumeAt = Math.max(restoredPosition.current, lastKnownPositionRef.current);
      await loadIndex(indexRef.current, true, resumeAt);
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
          if (Array.isArray(parsedHistory)) setHistory(parsedHistory.slice(0, 500));
        }

        if (statsRaw) {
          const parsedStats = JSON.parse(statsRaw);
          setListeningStats({
            totalSeconds: Math.max(0, Number(parsedStats?.totalSeconds || 0)),
            playCount: Math.max(0, Number(parsedStats?.playCount || 0)),
            trackCounts: parsedStats?.trackCounts && typeof parsedStats.trackCounts === 'object'
              ? parsedStats.trackCounts
              : {},
            dailySeconds: parsedStats?.dailySeconds && typeof parsedStats.dailySeconds === 'object'
              ? parsedStats.dailySeconds
              : {},
          });
        }

        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          const nextRate = Math.max(0.5, Math.min(2, Number(settings.playbackRate || 1)));
          const validQualities: StreamQuality[] = ['automatic', 'data-saver', 'normal', 'high', 'maximum'];
          const nextQuality = validQualities.includes(settings.streamQuality) ? settings.streamQuality : 'automatic';
          const validRepeatModes: RepeatMode[] = ['off', 'all', 'one'];
          const nextRepeat = validRepeatModes.includes(settings.repeatMode) ? settings.repeatMode : 'off';
          const nextShuffle = Boolean(settings.shuffleEnabled);
          const nextRadio = settings.radioEnabled !== false;
          const nextAdaptivePipeline = settings.adaptivePipelineEnabled !== false;
          rateRef.current = nextRate;
          qualityRef.current = nextQuality;
          repeatModeRef.current = nextRepeat;
          shuffleRef.current = nextShuffle;
          radioRef.current = nextRadio;
          adaptivePipelineRef.current = nextAdaptivePipeline;
          setPlaybackRateState(nextRate);
          setStreamQualityState(nextQuality);
          setRepeatModeState(nextRepeat);
          setShuffleEnabledState(nextShuffle);
          setRadioEnabledState(nextRadio);
          setAdaptivePipelineEnabledState(nextAdaptivePipeline);
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
        unshuffledQueueRef.current = restoredQueue;
        queueRef.current = restoredQueue;
        indexRef.current = restoredIndex;
        restoredPosition.current = Math.max(0, Number(snapshot.position || 0));
        lastKnownPositionRef.current = restoredPosition.current;
        setQueue(restoredQueue);
        setCurrentIndex(restoredIndex);
      } catch {
        await AsyncStorage.removeItem(PLAYBACK_SNAPSHOT_KEY).catch(() => {});
      }
    })();
  }, [player]);

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
    if (!status.isLoaded || pendingSeek.current == null) return;
    const target = pendingSeek.current;
    pendingSeek.current = null;
    lastKnownPositionRef.current = target;
    player.seekTo(target).catch(() => {});
  }, [player, status.isLoaded]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const warmNextTrack = async () => {
      if (batterySaver || !networkConnected) return;
      const upcoming = queueRef.current[indexRef.current + 1];
      if (!upcoming?.id) return;

      const stable = normalizeSong(upcoming as any);
      const offlineUri = getOfflineUri(stable.id);
      const immediate = getImmediateLocalSource(stable, offlineUri);
      let source = immediate?.url || null;

      if (!source) {
        try {
          const resolved = await resolveTrackStream(stable, {
            quality: effectiveQualityRef.current,
            signal: controller.signal,
            priority: 'medium',
          });
          source = resolved.url;
        } catch {
          return;
        }
      }

      if (
        cancelled ||
        controller.signal.aborted ||
        !source ||
        source === preloadedSourceRef.current
      ) {
        return;
      }

      const previous = preloadedSourceRef.current;
      preloadedSourceRef.current = source;
      if (previous) {
        clearPreloadedSource(previous).catch(() => {});
      }

      preload(source, { preferredForwardBufferDuration: 12 }).catch(() => {
        if (preloadedSourceRef.current === source) preloadedSourceRef.current = null;
      });
    };

    void warmNextTrack();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [batterySaver, currentIndex, getOfflineUri, networkConnected, queue, streamQuality]);

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
      setListeningStats((current) => {
        const id = String(currentSong.id);
        const day = localDayKey();
        const dailySeconds = {
          ...(current.dailySeconds || {}),
          [day]: ((current.dailySeconds || {})[day] || 0) + 10,
        };
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 35);
        const cutoffKey = localDayKey(cutoff);
        for (const key of Object.keys(dailySeconds)) {
          if (key < cutoffKey) delete dailySeconds[key];
        }

        const next: ListeningStats = {
          totalSeconds: current.totalSeconds + 10,
          playCount: current.playCount,
          trackCounts: {
            ...current.trackCounts,
            [id]: (current.trackCounts[id] || 0) + 10,
          },
          dailySeconds,
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
    if (error) {
      if (!awaitingNetworkRecoveryRef.current) setPlaybackState('ERROR');
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
    if (!status.error || !currentSong?.id || recoveryInFlightRef.current) return;

    const trackId = currentSong.id;
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
        ? classifyPlaybackError(status.error)
        : new PlaybackPipelineError(
            PlaybackErrorType.NETWORK_ERROR,
            'Device is offline.'
          );

      try {
        while (
          !cancelled &&
          recoveryStateRef.current.trackId === trackId &&
          recoveryStateRef.current.attempts < MAX_AUTOMATIC_RECOVERY_ATTEMPTS
        ) {
          const completedAttempts = recoveryStateRef.current.attempts;
          const policy = getPlaybackRecoveryPolicy(failure.type, completedAttempts, {
            online: networkConnected,
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

          invalidateResolvedStream(trackId);

          const resumeAt = Math.max(
            0,
            Number(status.currentTime || 0),
            lastKnownPositionRef.current,
            restoredPosition.current
          );

          const recovered = await loadIndex(
            indexRef.current,
            playbackIntentRef.current,
            resumeAt,
            {
              recordHistory: false,
              recovery: true,
              recoveryAttempt: attempt,
              forceFresh: true,
              skipAdaptive: true,
              excludeProviders:
                attempt >= 2 && failedProvider
                  ? [failedProvider]
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
    loadIndex,
    networkConnected,
    status.currentTime,
    status.error,
  ]);

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
    playbackState,
    playbackErrorType,
    playbackRate,
    streamQuality,
    sleepTimer,
    sleepRemaining,
    repeatMode,
    shuffleEnabled,
    radioEnabled,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    pipelineStartQuality,
    pipelineTargetQuality,
    pipelineInitialResolveMs,
    pipelinePromotionResolveMs,
    history,
    listeningStats,
    playbackDiagnostics,
    clearHistory,
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
    status.currentTime,
    status.duration,
    isLoadingTrack,
    error,
    playbackState,
    playbackErrorType,
    playbackRate,
    streamQuality,
    sleepTimer,
    sleepRemaining,
    repeatMode,
    shuffleEnabled,
    radioEnabled,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    pipelineStartQuality,
    pipelineTargetQuality,
    pipelineInitialResolveMs,
    pipelinePromotionResolveMs,
    history,
    listeningStats,
    playbackDiagnostics,
    clearHistory,
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

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

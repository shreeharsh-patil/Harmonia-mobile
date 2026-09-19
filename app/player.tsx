import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import YoutubePlayer from 'react-native-youtube-iframe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArtworkRenderer } from '@/src/components/ArtworkRenderer';
import { PlaybackProgressFill } from '@/src/components/PlaybackProgressFill';
import { fetchLyrics, type LyricsResult, type StreamQuality } from '@/src/lib/api';
import { findDirectYouTubeMusicCandidates } from '@/src/lib/playback/youtubeMusicDirect';
import { activeLyricIndex, activeLyricWordIndex, parseLrc, type LyricLine } from '@/src/lib/lyrics';
import { artistNames, artworkUrl, durationLabel } from '@/src/lib/song';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlaybackHistory, usePlaybackProgress, usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';

type Panel = 'none' | 'lyrics' | 'queue' | 'tools';

const PLAYER_FONT = Platform.OS === 'android' ? 'sans-serif' : undefined;
const PLAYER_BACKGROUND_FADE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAIACAYAAACl/81BAAAAmElEQVR42u2XQRKAIAwDA+ML/P9jvTpeuEBN0nBk7LYUSGQAuPEaE5/Ra+ICMLK4VEresRSWm91lcTEc1bRHsuyANmf0ShuGLzReqbq365AdX6xDjtRRA60prBdDuKdOZ71GP3QcmcUKdITNbWIG6rCVLN7AopZOshWVOnNvnRgRNoE/R+GnOe1LnFaCaUPSD4pDVwP9SaUesKAGpjLrUecAAAAASUVORK5CYII=';

const PROGRESS_THUMB_SIZE = 10;
const PROGRESS_THUMB_INSET = PROGRESS_THUMB_SIZE / 2;

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const QUALITY_OPTIONS: { value: StreamQuality; label: string }[] = [
  { value: 'automatic', label: 'Auto' },
  { value: 'data-saver', label: 'Saver' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Max' },
];
const TIMER_OPTIONS: { value: SleepTimerMode; label: string }[] = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
  { value: 'track', label: 'Track' },
  { value: 'off', label: 'Off' },
];

function formatBitrate(value?: number | null) {
  if (!value) return 'Not reported';
  const kbps = value >= 1000 ? Math.round(value / 1000) : Math.round(value);
  return `${kbps} kbps`;
}

function diagnosticSourceLabel(source?: string | null) {
  switch (source) {
    case 'embedded': return 'Embedded';
    case 'jiosaavn': return 'Refreshed catalog';
    case 'backend-search': return 'Harmonia fallback';
    case 'youtube': return 'YouTube Music direct';
    case 'youtube-server': return 'Harmonia YouTube fallback';
    case 'offline': return 'Offline download';
    case 'local': return 'Local device';
    default: return source || 'Not loaded';
  }
}

function DiagnosticsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticsRow}>
      <Text style={styles.diagnosticsKey}>{label}</Text>
      <Text numberOfLines={1} style={styles.diagnosticsValue}>{value}</Text>
    </View>
  );
}

// Measured lyric-line positions feed the auto-scroll anchor. Kept at module
// scope so the memoized LyricLines leaf can record layouts without threading
// a ref through props; cleared whenever the track (or lyrics) changes.
const lyricLineLayouts: { current: Record<number, { y: number; height: number }> } = { current: {} };

// Audio status is intentionally sampled at a modest rate for battery life.
// While the lyrics sheet is visible we interpolate only this small leaf so
// enhanced LRC word timing feels continuous rather than jumping twice a
// second. Nothing behind the sheet is re-rendered by this animation.
function useSmoothLyricPosition(position: number, playing: boolean) {
  const [smoothPosition, setSmoothPosition] = useState(position);
  // Date.now() must not be called directly during render (react-hooks/purity).
  // Initialise with a sentinel; the effect below overwrites it before the
  // first animation frame fires, so the interpolated position is always valid.
  const anchor = useRef({ position, timestamp: 0 });

  useEffect(() => {
    anchor.current = { position, timestamp: Date.now() };
    if (!playing) setSmoothPosition(position);
  }, [position, playing]);

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    let lastUpdate = 0;
    const tick = (timestamp: number) => {
      // 30 fps is visually smooth for karaoke highlighting while keeping the
      // work predictable on lower-end phones.
      if (timestamp - lastUpdate >= 33) {
        const elapsed = Math.max(0, (Date.now() - anchor.current.timestamp) / 1000);
        setSmoothPosition(anchor.current.position + elapsed);
        lastUpdate = timestamp;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return smoothPosition;
}

/**
 * Playback position updates twice per second. This timeline is the only
 * always-visible element that needs position, so it subscribes in a memoized
 * leaf: the rest of the player tree (artwork, controls, queue) no longer
 * re-renders on every audio status tick. The native-driver fill in
 * PlaybackProgressFill animates smoothly between the coarse updates.
 */
const PlaybackTimeline = memo(function PlaybackTimeline({
  progressWidth,
  duration,
  playing,
  onProgressLayout,
  seek,
  positionRef,
}: {
  progressWidth: number;
  duration: number;
  playing: boolean;
  onProgressLayout: (event: LayoutChangeEvent) => void;
  seek: (seconds: number) => Promise<void>;
  positionRef: { current: number };
}) {
  const { position, duration: progressDuration } = usePlaybackProgress();
  const effectiveDuration = progressDuration || duration;
  // Keep the parent's ref fresh without re-rendering it (ref writes are free).
  positionRef.current = position;
  const progress = effectiveDuration > 0 ? Math.max(0, Math.min(1, position / effectiveDuration)) : 0;
  const progressUsableWidth = Math.max(0, progressWidth - PROGRESS_THUMB_SIZE);
  const progressThumbLeft = progress * progressUsableWidth;

  return (
    <>
      <Pressable
        onLayout={onProgressLayout}
        onPress={(event) => {
          const width = Math.max(1, progressWidth);
          const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
          void seek(ratio * effectiveDuration);
        }}
        style={styles.track}
      >
        <PlaybackProgressFill
          progress={progress}
          playing={playing}
          color="#F4F4F4"
          style={[styles.trackBase, { left: PROGRESS_THUMB_INSET, right: PROGRESS_THUMB_INSET }]}
        />
        <View style={[styles.thumb, { left: progressThumbLeft }]} />
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{durationLabel(position)}</Text>
        <Text style={styles.time}>{durationLabel(effectiveDuration)}</Text>
      </View>
    </>
  );
});

/**
 * Single animated lyric line — opacity and scale run on the native thread
 * via Animated.spring, matching Apple Music's characteristic smooth falloff.
 * Lines far from the active one fade toward invisible; the active line sits
 * at full brightness with its words highlighted word-by-word.
 */
const AnimatedLyricLine = memo(function AnimatedLyricLine({
  line,
  index,
  activeLine,
  activeWord,
  onPress,
  onLayout,
}: {
  line: LyricLine;
  index: number;
  activeLine: number;
  activeWord: number;
  onPress: () => void;
  onLayout: (y: number, height: number) => void;
}) {
  const opacityAnim = useRef(new Animated.Value(0.14)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  const active = index === activeLine;
  const distance = activeLine < 0 ? 3 : Math.abs(index - activeLine);

  const targetOpacity = active
    ? 1
    : distance === 1
      ? 0.52
      : distance === 2
        ? 0.28
        : distance === 3
          ? 0.16
          : 0.09;

  const targetScale = active ? 1 : distance === 1 ? 0.99 : 0.975;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacityAnim, {
        toValue: targetOpacity,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
        overshootClamping: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: targetScale,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
        overshootClamping: true,
      }),
    ]).start();
  }, [targetOpacity, targetScale, opacityAnim, scaleAnim]);

  return (
    <Pressable
      onPress={onPress}
      onLayout={(event) => {
        onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height);
      }}
      style={styles.lyricsOverlayLineTap}
    >
      <Animated.Text
        style={[
          styles.lyricsOverlayLine,
          active && styles.lyricsOverlayLineActive,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {line.words?.length
          ? line.words.map((word, wordIndex) => {
              const isPast = active && wordIndex < activeWord;
              const isCurrent = active && wordIndex === activeWord;
              const isPending = active && wordIndex > activeWord;
              return (
                <Text
                  key={`${word.time}-${wordIndex}`}
                  style={[
                    isPending ? styles.lyricsOverlayWordPending : undefined,
                    isPast ? styles.lyricsOverlayWordActive : undefined,
                    isCurrent ? styles.lyricsOverlayWordCurrent : undefined,
                  ]}
                >
                  {word.text}
                </Text>
              );
            })
          : line.text}
      </Animated.Text>
    </Pressable>
  );
});

/**
 * Synced-lyrics line list. Position is consumed here (inside the lyrics
 * overlay only) and the resolved active line is reported upward for the
 * auto-scroll effect, so per-tick karaoke updates never re-render the
 * player behind the overlay.
 */
const LyricLines = memo(function LyricLines({
  lines,
  onLinePress,
  onActiveLineChange,
}: {
  lines: LyricLine[];
  onLinePress: (time: number) => void;
  onActiveLineChange: (index: number) => void;
}) {
  const { position } = usePlaybackProgress();
  const { isPlaying } = usePlayer();
  const smoothPosition = useSmoothLyricPosition(position, isPlaying);
  const activeLine = useMemo(() => activeLyricIndex(lines, smoothPosition), [lines, smoothPosition]);
  const activeWord = useMemo(
    () => activeLyricWordIndex(lines[activeLine], smoothPosition),
    [activeLine, smoothPosition, lines]
  );

  useEffect(() => {
    onActiveLineChange(activeLine);
  }, [activeLine, onActiveLineChange]);

  return (
    <>
      {lines.map((line, index) => (
        <AnimatedLyricLine
          key={`${line.time}-${index}`}
          line={line}
          index={index}
          activeLine={activeLine}
          activeWord={activeWord}
          onPress={() => onLinePress(line.time)}
          onLayout={(y, height) => {
            lyricLineLayouts.current[index] = { y, height };
          }}
        />
      ))}
    </>
  );
});

const SleepTimerState = memo(function SleepTimerState({ sleepTimer }: { sleepTimer: SleepTimerMode }) {
  const { sleepRemaining } = usePlaybackProgress();
  const timerLabel = sleepTimer === 'off'
    ? 'Off'
    : sleepTimer === 'track'
      ? 'After track'
      : sleepRemaining > 0
        ? `${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, '0')}`
        : `${sleepTimer}m`;

  return <Text style={styles.timerState}>{timerLabel}</Text>;
});

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ panel?: string; from?: string }>();
  const { width, height } = useWindowDimensions();
  const { batterySaver, musicVideosEnabled } = usePreferences();
  const { isLiked, toggleLike } = useLibrary();
  const {
    isDownloaded,
    downloading,
    downloadFailures,
    downloadSong,
    removeDownload,
    clearDownloadFailure,
  } = useOffline();
  const {
    currentSong,
    queue,
    currentIndex,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    error,
    playbackState,
    playbackErrorType,
    playbackRate,
    streamQuality,
    playbackDiagnostics,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    pipelineStartQuality,
    pipelineTargetQuality,
    pipelineInitialResolveMs,
    pipelinePromotionResolveMs,
    sleepTimer,
    repeatMode,
    shuffleEnabled,
    togglePlayback,
    previous,
    next,
    seek,
    playAt,
    playNext,
    addToQueue,
    removeQueueItem,
    moveQueueItem,
    clearUpcoming,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    toggleRepeat,
    toggleShuffle,
  } = usePlayer();
  const { history } = usePlaybackHistory();
  const duration = currentSong?.duration || 0;

  const [progressWidth, setProgressWidth] = useState(1);
  const [panel, setPanel] = useState<Panel>('none');
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [hasCanvas, setHasCanvas] = useState(false);
  const [musicVideoId, setMusicVideoId] = useState<string | null>(null);
  const [musicVideoLoading, setMusicVideoLoading] = useState(false);
  const [musicVideoError, setMusicVideoError] = useState<string | null>(null);
  const lyricsScrollRef = useRef<ScrollView>(null);
  const lyricLineLayouts = useRef<Record<number, { y: number; height: number }>>({});
  const [lyricsViewportHeight, setLyricsViewportHeight] = useState(0);
  // Refs for handlers below the early return; kept fresh on every render
  // (including renders past the guard) without re-running hooks conditionally.
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const cover = artworkUrl(currentSong, 360);
  const canvasTrackKey = String(currentSong?.id || currentSong?.songId || '');
  const onCanvasAvailabilityChange = useCallback((available: boolean) => setHasCanvas(available), []);

  useEffect(() => {
    setHasCanvas(false);
  }, [canvasTrackKey]);
  const syncedLines = useMemo(() => parseLrc(lyrics?.syncedLyrics), [lyrics?.syncedLyrics]);
  // Playback position updates twice per second. Computing the active lyric
  // line at the top level re-rendered the whole player tree on every tick;
  // only leaf components consume these values now (see LyricLines and
  // PlaybackTimeline). The parent keeps a ref mirror for the ±10s footer
  // actions, kept fresh by the PlaybackTimeline leaf without re-rendering it.
  const positionRef = useRef(0);
  const musicVideoPausedAudioRef = useRef(false);
  const musicVideoRequestRef = useRef(0);
  const musicVideoFallbackIdsRef = useRef<string[]>([]);
  const playingFromLabel = useMemo(() => {
    const value = Array.isArray(params.from) ? params.from[0] : params.from;
    return String(value || 'Music').trim() || 'Music';
  }, [params.from]);

  const recentQueueSuggestions = useMemo(() => {
    const queued = new Set(queue.map((song) => String(song.id || '')));
    const seen = new Set<string>();
    return history
      .map((entry) => entry.song)
      .filter((song) => {
        const id = String(song?.id || '');
        if (!id || queued.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 5);
  }, [history, queue]);

  useEffect(() => {
    const requested = Array.isArray(params.panel) ? params.panel[0] : params.panel;
    if (requested === 'lyrics' || requested === 'queue' || requested === 'tools') {
      setPanel(requested);
    }
  }, [params.panel]);

  useEffect(() => {
    // A video belongs to a single track. Never carry a matching YouTube video
    // into the next item in the queue.
    musicVideoRequestRef.current += 1;
    setMusicVideoId(null);
    setMusicVideoError(null);
    setMusicVideoLoading(false);
    musicVideoPausedAudioRef.current = false;
    musicVideoFallbackIdsRef.current = [];
  }, [canvasTrackKey]);

  useEffect(() => {
    lyricLineLayouts.current = {};
  }, [currentSong?.id, syncedLines.length]);

  // Active line is resolved inside LyricLines (position lives there now);
  // it reports changes upward so this effect can auto-scroll the viewport.
  const [activeLine, setActiveLine] = useState(-1);
  const onActiveLineChange = useCallback((index: number) => {
    setActiveLine((current) => (current === index ? current : index));
  }, []);

  const onLyricLinePress = useCallback(
    (time: number) => {
      void seekRef.current(time);
    },
    []
  );

  useEffect(() => {
    if (panel !== 'lyrics' || activeLine < 0 || !syncedLines.length) return;
    const timeout = setTimeout(() => {
      const layout = lyricLineLayouts.current[activeLine];
      const anchor = lyricsViewportHeight > 0 ? lyricsViewportHeight * 0.43 : 112;
      const targetY = layout
        ? Math.max(0, layout.y - anchor + layout.height / 2)
        : Math.max(0, activeLine * 82 - 112);

      lyricsScrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [activeLine, panel, syncedLines.length, lyricsViewportHeight]);

  useEffect(() => {
    let active = true;
    if (!currentSong) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLyricsLoading(true);
      setLyrics(null);
      fetchLyrics(currentSong, controller.signal)
        .then((value) => {
          if (active) setLyrics(value);
        })
        .catch((cause: any) => {
          if (active && cause?.name !== 'AbortError') setLyrics(null);
        })
        .finally(() => {
          if (active) setLyricsLoading(false);
        });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [currentSong]);

  if (!currentSong) {
    return (
      <SafeAreaView style={styles.empty}>
        <Pressable onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>⌄</Text>
        </Pressable>
        <Text style={styles.emptyTitle}>Nothing playing</Text>
        <Text style={styles.emptyBody}>Play a song from Home, Search or your Library.</Text>
      </SafeAreaView>
    );
  }

  const compactArtwork = panel === 'queue' || panel === 'tools';
  // Canvas normally owns the full artwork surface. Once a music video has
  // been resolved, it must yield that surface to the YouTube player; otherwise
  // the video state changes successfully but its component never mounts.
  const showCanvasOnly = hasCanvas && panel === 'none' && !musicVideoId;
  const playerContentWidth = Math.max(0, width - 32);
  const artworkSize = compactArtwork ? Math.min(244, playerContentWidth) : playerContentWidth;
  const controlsFixedWidth = 40 + 50 + 64 + 50 + 40;
  const controlGap = Math.max(
    4,
    Math.min(34, (playerContentWidth - controlsFixedWidth) / 4)
  );
  const onProgressLayout = (event: LayoutChangeEvent) => setProgressWidth(event.nativeEvent.layout.width);

  const togglePanel = (value: Panel) => {
    Haptics.selectionAsync().catch(() => {});
    setPanel((current) => current === value ? 'none' : value);
  };

  const handleLike = () => {
    void toggleLike(currentSong);
  };

  const recoverFromMusicVideoError = async () => {
    // A YouTube ID can be restricted for embedding in a region even when the
    // music search result is valid. Try another highly ranked match first.
    const nextVideoId = musicVideoFallbackIdsRef.current.shift();
    if (nextVideoId) {
      setMusicVideoError('Trying another matching video…');
      setMusicVideoId(nextVideoId);
      return;
    }

    // No alternative video is available: restore audio rather than leaving
    // the user in a paused, unusable video state.
    const shouldResumeAudio = musicVideoPausedAudioRef.current;
    musicVideoPausedAudioRef.current = false;
    setMusicVideoId(null);
    setMusicVideoError('This video is unavailable. Switched back to audio.');
    if (shouldResumeAudio && !isPlaying) await togglePlayback();
  };

  const toggleMusicVideo = async () => {
    if (!musicVideosEnabled || musicVideoLoading) return;

    if (musicVideoId) {
      musicVideoRequestRef.current += 1;
      musicVideoFallbackIdsRef.current = [];
      setMusicVideoId(null);
      if (musicVideoPausedAudioRef.current) {
        musicVideoPausedAudioRef.current = false;
        await togglePlayback();
      }
      return;
    }

    setMusicVideoLoading(true);
    setMusicVideoError(null);
    const request = ++musicVideoRequestRef.current;
    try {
      const explicitId = String(currentSong.videoId || currentSong.youtubeId || '').trim();
      const artist = artistNames(currentSong);
      const target = {
        title: currentSong.name,
        artist: /^unknown artist$/i.test(artist) ? undefined : artist,
        duration: currentSong.duration,
      };
      const candidates = /^[A-Za-z0-9_-]{11}$/.test(explicitId)
        ? [{ id: explicitId }]
        : await findDirectYouTubeMusicCandidates(target);
      if (request !== musicVideoRequestRef.current) return;
      const videoIds = [...new Set(candidates.map((match) => match.id).filter(Boolean))];
      if (!videoIds.length) {
        setMusicVideoError('No matching YouTube video found');
        return;
      }

      musicVideoPausedAudioRef.current = isPlaying;
      if (isPlaying) await togglePlayback();
      if (request !== musicVideoRequestRef.current) return;
      musicVideoFallbackIdsRef.current = videoIds.slice(1);
      setMusicVideoId(videoIds[0]);
    } catch {
      if (request === musicVideoRequestRef.current) {
        setMusicVideoError('Could not find a playable YouTube video');
      }
    } finally {
      if (request === musicVideoRequestRef.current) setMusicVideoLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {!!cover && !showCanvasOnly && (
        <Image
          source={{ uri: cover }}
          blurRadius={batterySaver ? 0 : Platform.OS === 'android' ? 6 : 12}
          contentFit="cover"
          style={[StyleSheet.absoluteFill, styles.backdropImage]}
          cachePolicy="memory-disk"
          recyclingKey={String(currentSong.id || cover)}
        />
      )}
      {!showCanvasOnly && <View style={styles.backdropTint} />}
      <Image
        source={{ uri: PLAYER_BACKGROUND_FADE }}
        contentFit="fill"
        style={StyleSheet.absoluteFill}
        cachePolicy="memory"
      />
      <ArtworkRenderer
        song={currentSong}
        size={Math.max(width, height)}
        enableMotion={panel === 'none'}
        isPlaying={isPlaying}
        fullScreen
        canvasOnly
        onCanvasAvailabilityChange={onCanvasAvailabilityChange}
      />
      <View pointerEvents="none" style={styles.canvasTint} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.roundButton} accessibilityLabel="Close player">
            <Ionicons name="chevron-down" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.playingFrom}>Playing from</Text>
            <Text numberOfLines={1} style={styles.album}>{playingFromLabel}</Text>
          </View>
          <Pressable onPress={() => togglePanel('tools')} style={styles.roundButton} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={22} color="#FFF" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.playerScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            panel === 'none' && styles.scrollNowPlaying,
            showCanvasOnly && styles.scrollCanvasOnly,
          ]}
          bounces={false}
        >
          {!showCanvasOnly && (
            <View
              style={[
                styles.artworkWrap,
                panel === 'none' && styles.artworkWrapExpanded,
                compactArtwork && styles.artworkWrapCompact,
              ]}
            >
              {musicVideoId ? (
                <View style={styles.musicVideoFrame}>
                  <YoutubePlayer
                    key={musicVideoId}
                    height={Math.max(200, Math.round(artworkSize * 9 / 16))}
                    width={artworkSize}
                    videoId={musicVideoId}
                    play
                    forceAndroidAutoplay
                    // Loading the player HTML from an opaque `about:blank` origin
                    // makes recent YouTube embeds reject WebViews with error 152-4.
                    // Keep the player local to Harmonia, but give that document a
                    // valid YouTube base URL so the iframe has an accepted origin.
                    useLocalHTML
                    baseUrlOverride="https://www.youtube.com"
                    initialPlayerParams={{
                      controls: true,
                      start: Math.max(0, Math.floor(positionRef.current)),
                      rel: false,
                    }}
                    onError={() => { void recoverFromMusicVideoError(); }}
                    webViewProps={{
                      allowsFullscreenVideo: true,
                      allowsInlineMediaPlayback: true,
                      mediaPlaybackRequiresUserAction: false,
                      javaScriptEnabled: true,
                      domStorageEnabled: true,
                      thirdPartyCookiesEnabled: true,
                    }}
                  />
                </View>
              ) : (
                <ArtworkRenderer
                  song={currentSong}
                  size={artworkSize}
                  radius={14}
                  enableMotion={panel === 'none'}
                  isPlaying={isPlaying}
                  hideArtworkWhenCanvas
                  renderMotion={false}
                  onCanvasAvailabilityChange={onCanvasAvailabilityChange}
                  style={styles.artwork}
                />
              )}
            </View>
          )}

          {musicVideosEnabled && panel === 'none' && (
            <Pressable
              onPress={() => void toggleMusicVideo()}
              disabled={musicVideoLoading}
              style={({ pressed }) => [styles.musicVideoButton, pressed && styles.musicVideoButtonPressed, musicVideoLoading && styles.musicVideoButtonDisabled]}
              accessibilityLabel={musicVideoId ? 'Switch to audio' : 'Switch to music video'}
            >
              {musicVideoLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name={musicVideoId ? 'musical-notes-outline' : 'videocam-outline'} size={17} color="#FFF" />
              )}
              <Text style={styles.musicVideoButtonText}>
                {musicVideoLoading ? 'Finding video…' : musicVideoId ? 'Switch to audio' : 'Switch to video'}
              </Text>
            </Pressable>
          )}
          {!!musicVideoError && <Text style={styles.musicVideoError}>{musicVideoError}</Text>}

          <View style={styles.meta}>
            <View style={styles.metaCopy}>
              <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
              <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
            </View>
            <Pressable onPress={handleLike} style={styles.likeButton} accessibilityLabel={isLiked(currentSong.id) ? 'Unlike song' : 'Like song'}>
              <Ionicons
                name={isLiked(currentSong.id) ? 'heart' : 'heart-outline'}
                size={24}
                color={isLiked(currentSong.id) ? '#EF4444' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
          </View>

          <View style={styles.timeline}>
            <PlaybackTimeline
              progressWidth={progressWidth}
              duration={duration}
              playing={isPlaying}
              onProgressLayout={onProgressLayout}
              seek={seek}
              positionRef={positionRef}
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={[styles.controls, { gap: controlGap }]}>
            <Pressable onPress={toggleShuffle} style={styles.modeControl} accessibilityLabel="Shuffle">
              <Ionicons
                name="shuffle"
                size={22}
                color={shuffleEnabled ? colors.accent : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
            <Pressable onPress={() => void previous()} style={styles.skip} accessibilityLabel="Previous">
              <Ionicons name="play-skip-back" size={34} color="#FFF" />
            </Pressable>
            <Pressable onPress={() => void togglePlayback()} style={styles.play} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isBuffering || isLoadingTrack
                ? <ActivityIndicator color="#080808" size="large" />
                : <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#080808" style={!isPlaying ? styles.playIcon : undefined} />}
            </Pressable>
            <Pressable onPress={() => void next()} style={styles.skip} accessibilityLabel="Next">
              <Ionicons name="play-skip-forward" size={34} color="#FFF" />
            </Pressable>
            <Pressable onPress={toggleRepeat} style={styles.modeControl} accessibilityLabel="Repeat">
              <Ionicons
                name="repeat"
                size={22}
                color={repeatMode !== 'off' ? colors.accent : 'rgba(255,255,255,0.62)'}
              />
              {repeatMode === 'one' && (
                <View style={styles.repeatBadge}><Text style={styles.repeatBadgeText}>1</Text></View>
              )}
            </Pressable>
          </View>

          <View style={styles.secondaryControls}>
            <Pressable
              onPress={() => togglePanel('queue')}
              style={[styles.secondaryControl, panel === 'queue' && styles.secondaryControlActive]}
              accessibilityLabel="Queue"
              hitSlop={12}
            >
              <Ionicons
                name="list"
                size={18}
                color={panel === 'queue' ? '#FFF' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
            <Pressable
              onPress={() => togglePanel('lyrics')}
              style={[styles.secondaryControl, panel === 'lyrics' && styles.secondaryControlActive]}
              accessibilityLabel="Lyrics"
              hitSlop={12}
            >
              <Ionicons
                name="mic-outline"
                size={18}
                color={panel === 'lyrics' ? '#FFF' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
          </View>

          {panel === 'queue' && (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>Up next</Text>
                  <Text style={styles.panelMeta}>{currentIndex + 1} of {queue.length}</Text>
                </View>
                {queue.length > currentIndex + 1 && (
                  <Pressable onPress={clearUpcoming} hitSlop={10}>
                    <Text style={styles.queueClear}>Clear upcoming</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.queueList}>
                {queue.slice(Math.max(0, currentIndex - 1)).map((song, localIndex) => {
                  const actualIndex = Math.max(0, currentIndex - 1) + localIndex;
                  const active = actualIndex === currentIndex;
                  return (
                    <View key={`${song.id}-${actualIndex}`} style={[styles.queueRow, active && styles.queueRowActive]}>
                      <Pressable onPress={() => void playAt(actualIndex)} style={styles.queueMain}>
                        <Text style={styles.queueNumber}>{active ? '▶' : actualIndex + 1}</Text>
                        <View style={styles.queueCopy}>
                          <Text numberOfLines={1} style={[styles.queueTitle, active && styles.queueTitleActive]}>{song.name}</Text>
                          <Text numberOfLines={1} style={styles.queueArtist}>{artistNames(song)}</Text>
                        </View>
                      </Pressable>
                      {!active && (
                        <View style={styles.queueActions}>
                          <Pressable
                            disabled={actualIndex <= currentIndex + 1}
                            onPress={() => moveQueueItem(actualIndex, actualIndex - 1)}
                            hitSlop={8}
                            style={styles.queueAction}
                          >
                            <Text style={[styles.queueActionText, actualIndex <= currentIndex + 1 && styles.queueActionDisabled]}>↑</Text>
                          </Pressable>
                          <Pressable
                            disabled={actualIndex >= queue.length - 1}
                            onPress={() => moveQueueItem(actualIndex, actualIndex + 1)}
                            hitSlop={8}
                            style={styles.queueAction}
                          >
                            <Text style={[styles.queueActionText, actualIndex >= queue.length - 1 && styles.queueActionDisabled]}>↓</Text>
                          </Pressable>
                          <Pressable onPress={() => removeQueueItem(actualIndex)} hitSlop={8} style={styles.queueAction}>
                            <Text style={styles.queueRemove}>×</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {!!recentQueueSuggestions.length && (
                <View style={styles.queueHistory}>
                  <View style={styles.queueHistoryHead}>
                    <Text style={styles.queueHistoryTitle}>Recently played</Text>
                    <Text style={styles.queueHistoryMeta}>Add back to queue</Text>
                  </View>
                  {recentQueueSuggestions.map((song) => (
                    <View key={`recent-${song.id}`} style={styles.queueHistoryRow}>
                      <View style={styles.queueCopy}>
                        <Text numberOfLines={1} style={styles.queueTitle}>{song.name}</Text>
                        <Text numberOfLines={1} style={styles.queueArtist}>{artistNames(song)}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          playNext(song);
                        }}
                        style={styles.queueHistoryButton}
                      >
                        <Text style={styles.queueHistoryButtonText}>Next</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          addToQueue(song);
                        }}
                        style={styles.queueHistoryAdd}
                      >
                        <Text style={styles.queueHistoryAddText}>+</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {panel === 'tools' && (
            <View style={styles.panel}>
              <Pressable
                onPress={() => router.push('/clips')}
                style={styles.clipsShortcut}
                accessibilityLabel="Open Music Clips"
              >
                <View>
                  <Text style={styles.toolLabel}>MUSIC CLIPS</Text>
                  <Text style={styles.clipsShortcutTitle}>Short visual stories matched to your music</Text>
                </View>
                <Ionicons name="play-circle" size={32} color="#1ED760" />
              </Pressable>
              <View style={styles.downloadRow}>
                <View style={styles.downloadCopy}>
                  <Text style={styles.toolLabel}>OFFLINE</Text>
                  <Text style={styles.downloadTitle}>
                    {isDownloaded(currentSong.id) ? 'Downloaded to this phone' : 'Save this track for offline playback'}
                  </Text>
                </View>
                <Pressable
                  disabled={downloading[currentSong.id] != null}
                  onPress={() => {
                    if (isDownloaded(currentSong.id)) {
                      void removeDownload(currentSong.id);
                    } else {
                      clearDownloadFailure(currentSong.id);
                      void downloadSong(currentSong, streamQuality);
                    }
                  }}
                  style={[styles.downloadButton, isDownloaded(currentSong.id) && styles.downloadButtonSaved]}
                >
                  {downloading[currentSong.id] != null
                    ? <ActivityIndicator size="small" color="#080808" />
                    : <Text style={[styles.downloadButtonText, isDownloaded(currentSong.id) && styles.downloadButtonTextSaved]}>
                        {isDownloaded(currentSong.id)
                          ? 'Remove'
                          : downloadFailures[currentSong.id]
                            ? 'Retry'
                            : 'Download'}
                      </Text>}
                </Pressable>
              </View>
              {downloading[currentSong.id] != null && (
                <View style={styles.downloadProgressTrack}>
                  <View style={[styles.downloadProgress, { width: `${Math.max(3, downloading[currentSong.id] * 100)}%` }]} />
                </View>
              )}
              {!!downloadFailures[currentSong.id] && (
                <Text style={styles.downloadError}>{downloadFailures[currentSong.id]}</Text>
              )}
              <Text style={styles.toolLabel}>PLAYBACK SPEED</Text>
              <View style={styles.optionRow}>
                {RATE_OPTIONS.map((rate) => (
                  <Pressable
                    key={rate}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setPlaybackRate(rate);
                    }}
                    style={[styles.option, playbackRate === rate && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, playbackRate === rate && styles.optionTextActive]}>{rate}×</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.toolLabel}>AUDIO QUALITY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                {QUALITY_OPTIONS.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setStreamQuality(item.value);
                    }}
                    style={[styles.option, streamQuality === item.value && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, streamQuality === item.value && styles.optionTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.toolLabelRow}>
                <Text style={styles.toolLabel}>SLEEP TIMER</Text>
                <SleepTimerState sleepTimer={sleepTimer} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                {TIMER_OPTIONS.map((item) => (
                  <Pressable
                    key={String(item.value)}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSleepTimer(item.value);
                    }}
                    style={[styles.option, sleepTimer === item.value && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, sleepTimer === item.value && styles.optionTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.diagnosticsDivider} />
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setDiagnosticsExpanded((value) => !value);
                }}
                style={styles.diagnosticsHeader}
              >
                <View style={styles.diagnosticsHeaderCopy}>
                  <Text style={styles.toolLabel}>ADVANCED</Text>
                  <Text style={styles.diagnosticsTitle}>Playback diagnostics</Text>
                  <Text style={styles.diagnosticsSubtitle}>Technical stream details for troubleshooting</Text>
                </View>
                <Text style={styles.diagnosticsToggle}>{diagnosticsExpanded ? '−' : '+'}</Text>
              </Pressable>

              {diagnosticsExpanded && (
                <View style={styles.diagnosticsList}>
                  <DiagnosticsRow label="Provider" value={playbackDiagnostics?.provider || 'Not reported'} />
                  <DiagnosticsRow label="Source" value={diagnosticSourceLabel(playbackDiagnostics?.source)} />
                  <DiagnosticsRow label="Adaptive pipeline" value={adaptivePipelineEnabled ? adaptivePipelineStatus : 'disabled'} />
                  <DiagnosticsRow
                    label="Pipeline quality"
                    value={pipelineStartQuality && pipelineTargetQuality
                      ? `${pipelineStartQuality} → ${pipelineTargetQuality}`
                      : 'Not active'}
                  />
                  <DiagnosticsRow
                    label="Fast resolve"
                    value={pipelineInitialResolveMs != null ? `${pipelineInitialResolveMs} ms` : 'Not measured'}
                  />
                  <DiagnosticsRow
                    label="Upgrade resolve"
                    value={pipelinePromotionResolveMs != null ? `${pipelinePromotionResolveMs} ms` : 'Not measured'}
                  />
                  <DiagnosticsRow label="Codec" value={playbackDiagnostics?.codec || 'Not reported'} />
                  <DiagnosticsRow label="Bitrate" value={formatBitrate(playbackDiagnostics?.bitrate)} />
                  <DiagnosticsRow label="Resolved quality" value={playbackDiagnostics?.quality || 'Not reported'} />
                  <DiagnosticsRow label="MIME type" value={playbackDiagnostics?.mimeType || 'Not reported'} />
                  <DiagnosticsRow label="Quality preference" value={streamQuality} />
                  <DiagnosticsRow label="Stream host" value={playbackDiagnostics?.streamHost || 'Not loaded'} />
                  <DiagnosticsRow
                    label="Resolution"
                    value={playbackDiagnostics?.resolutionTimeMs != null
                      ? `${playbackDiagnostics.resolutionTimeMs} ms · ${playbackDiagnostics.cache}`
                      : 'Not measured'}
                  />
                  <DiagnosticsRow
                    label="Recovery attempt"
                    value={playbackDiagnostics?.recoveryAttempt
                      ? String(playbackDiagnostics.recoveryAttempt)
                      : 'None'}
                  />
                  <DiagnosticsRow label="Playback state" value={playbackState} />
                  <DiagnosticsRow label="Error type" value={playbackErrorType || 'None'} />
                  <DiagnosticsRow label="Duration" value={durationLabel(durationRef.current)} />
                  <DiagnosticsRow label="Playback rate" value={`${playbackRate}×`} />
                  <DiagnosticsRow
                    label="Queue position"
                    value={queue.length ? `${currentIndex + 1} of ${queue.length}` : 'Not queued'}
                  />
                  <Text style={styles.diagnosticsPrivacy}>
                    Harmonia shows the stream hostname only. Signed URLs, query parameters and session tokens are never displayed here.
                  </Text>
                </View>
              )}
            </View>
          )}

          {panel !== 'none' && panel !== 'lyrics' && (
            <View style={styles.footer}>
              <Pressable onPress={() => void seek(Math.max(0, positionRef.current - 10))} style={styles.secondary}>
                <Text style={styles.secondaryText}>−10</Text>
              </Pressable>
              <Text style={styles.device}>HARMONIA • THIS PHONE</Text>
              <Pressable onPress={() => void seek(Math.min(duration, positionRef.current + 10))} style={styles.secondary}>
                <Text style={styles.secondaryText}>+10</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {panel === 'lyrics' && (
        <View style={styles.lyricsOverlay}>
          {!!cover && (
            <Image
              source={{ uri: cover }}
              blurRadius={batterySaver ? 0 : Platform.OS === 'android' ? 8 : 14}
              contentFit="cover"
              style={[StyleSheet.absoluteFill, styles.lyricsBackdropImage]}
              cachePolicy="memory-disk"
              recyclingKey={`lyrics-bg-${String(currentSong.id || cover)}`}
            />
          )}
          <View pointerEvents="none" style={styles.lyricsBackdropWash} />
          <Image
            pointerEvents="none"
            source={{ uri: PLAYER_BACKGROUND_FADE }}
            contentFit="fill"
            style={[StyleSheet.absoluteFill, styles.lyricsBackdropGradient]}
            cachePolicy="memory"
          />

          <SafeAreaView style={styles.lyricsOverlaySafe}>
            <View style={styles.lyricsGrabberWrap}>
              <Pressable
                onPress={() => togglePanel('lyrics')}
                hitSlop={16}
                accessibilityLabel="Close lyrics"
                style={styles.lyricsGrabberButton}
              >
                <View style={styles.lyricsGrabber} />
              </Pressable>
            </View>

            <View style={styles.lyricsNowPlayingRow}>
              <Pressable
                onPress={() => togglePanel('lyrics')}
                accessibilityLabel="Close lyrics and show artwork"
                style={styles.lyricsSongInfo}
              >
                <ArtworkRenderer
                  song={currentSong}
                  size={64}
                  radius={8}
                  enableMotion={false}
                  style={styles.lyricsArtwork}
                />
                <View style={styles.lyricsSongCopy}>
                  <Text numberOfLines={1} style={styles.lyricsSongTitle}>{currentSong.name}</Text>
                  <Text numberOfLines={1} style={styles.lyricsSongArtist}>{artistNames(currentSong)}</Text>
                </View>
              </Pressable>


              <Pressable
                onPress={() => void togglePlayback()}
                style={styles.lyricsPlayButton}
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              >
                {isBuffering || isLoadingTrack
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFF" style={!isPlaying ? styles.lyricsPlayIcon : undefined} />}
              </Pressable>
            </View>

            <View
              style={styles.lyricsViewport}
              onLayout={(event) => setLyricsViewportHeight(event.nativeEvent.layout.height)}
            >
              {lyricsLoading ? (
                <View style={styles.lyricsOverlayLoading}>
                  {[70, 55, 85, 45, 80, 60, 90, 50, 75].map((widthValue, index) => (
                    <View
                      key={`${widthValue}-${index}`}
                      style={[
                        styles.lyricsOverlaySkeleton,
                        { width: `${widthValue}%`, opacity: 0.9 - index * 0.09 },
                      ]}
                    />
                  ))}
                </View>
              ) : syncedLines.length ? (
                <ScrollView
                  ref={lyricsScrollRef}
                  style={styles.lyricsOverlayScroll}
                  contentContainerStyle={styles.lyricsOverlayContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <LyricLines
                    lines={syncedLines}
                    onLinePress={onLyricLinePress}
                    onActiveLineChange={onActiveLineChange}
                  />
                </ScrollView>
              ) : lyrics?.plainLyrics ? (
                <ScrollView
                  style={styles.lyricsOverlayScroll}
                  contentContainerStyle={styles.lyricsPlainContent}
                  showsVerticalScrollIndicator={false}
                >
                  {lyrics.plainLyrics
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, index) => (
                      <View key={`${index}-${line}`} style={styles.lyricsPlainPill}>
                        <Text style={styles.lyricsPlainPillText}>{line}</Text>
                      </View>
                    ))}
                </ScrollView>
              ) : (
                <View style={styles.lyricsOverlayEmpty}>
                  <Ionicons name="mic-outline" size={72} color="rgba(255,255,255,0.22)" />
                  <Text style={styles.lyricsOverlayEmptyTitle}>No lyrics available</Text>
                  <Text style={styles.lyricsOverlayEmptyBody}>Enjoy the music!</Text>
                </View>
              )}

            </View>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  backdropImage: { opacity: 0.94, transform: [{ scale: 1.55 }] },
  backdropTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.08)' },
  canvasTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' },
  safe: { flex: 1, paddingHorizontal: 16 },
  playerScroll: { flex: 1 },
  scroll: { paddingBottom: 8 },
  scrollNowPlaying: { flexGrow: 1 },
  scrollCanvasOnly: { justifyContent: 'flex-end', paddingBottom: 28 },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { alignItems: 'center', flex: 1, paddingHorizontal: 12 },
  playingFrom: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '600', fontFamily: PLAYER_FONT },
  album: { color: 'rgba(255,255,255,0.60)', fontSize: 12, fontWeight: '500', fontFamily: PLAYER_FONT, marginTop: 1, maxWidth: 210 },
  artworkWrap: { minHeight: 404, justifyContent: 'center', alignItems: 'center', paddingTop: 20, paddingBottom: 26 },
  artworkWrapExpanded: { flexGrow: 1, minHeight: 430, paddingTop: 30, paddingBottom: 48 },
  artworkWrapCompact: { minHeight: 275, paddingTop: 8, paddingBottom: 12, flexGrow: 0 },
  lyricsOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: '#15110F',
  },
  lyricsBackdropImage: {
    opacity: 1,
    transform: [{ scale: 1.48 }],
  },
  lyricsBackdropWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,5,4,0.10)',
  },
  lyricsBackdropGradient: {
    opacity: 0.9,
  },
  lyricsOverlaySafe: { flex: 1 },
  lyricsGrabberWrap: { alignItems: 'center', paddingTop: 7, paddingBottom: 1 },
  lyricsGrabberButton: {
    width: 72,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsGrabber: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.36)',
  },
  lyricsNowPlayingRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 14,
  },
  lyricsSongInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  lyricsArtwork: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  lyricsSongCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  lyricsSongTitle: {
    color: '#FFF',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    fontFamily: PLAYER_FONT,
    letterSpacing: -0.25,
  },
  lyricsSongArtist: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: PLAYER_FONT,
    marginTop: 2,
  },
  lyricsPlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  lyricsPlayIcon: { marginLeft: 2 },
  lyricsViewport: { flex: 1, position: 'relative', overflow: 'hidden' },
  lyricsOverlayScroll: { flex: 1 },
  lyricsOverlayContent: {
    // Large breathing room lets the active phrase settle near the center,
    // matching Apple Music's focused lyrics rhythm.
    paddingTop: 128,
    paddingBottom: 244,
    paddingHorizontal: 24,
  },
  lyricsOverlayLineTap: {
    minHeight: 84,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  lyricsOverlayLine: {
    width: '100%',
    color: '#FFF',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '750' as any,
    fontFamily: PLAYER_FONT,
    letterSpacing: -0.5,
    textAlign: 'left',
  },
  lyricsOverlayLineActive: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '850' as any,
    letterSpacing: -0.65,
  },
  // Word-by-word highlight states (inside the active line only)
  // pending  → text will light up soon — muted
  // active   → already spoken — full brightness
  // current  → the word being spoken right now — bright + glow
  lyricsOverlayWordPending: { color: 'rgba(255,255,255,0.40)' },
  lyricsOverlayWordActive: { color: '#FFF' },
  lyricsOverlayWordCurrent: {
    color: '#FFF',
    textShadowColor: 'rgba(255,255,255,0.60)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  lyricsOverlayLoading: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 32,
    gap: 20,
    paddingHorizontal: 24,
  },
  lyricsOverlaySkeleton: {
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  lyricsPlainContent: {
    paddingTop: 92,
    paddingBottom: 190,
    paddingHorizontal: 24,
    gap: 14,
  },
  lyricsPlainPill: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  lyricsPlainPillText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    fontFamily: PLAYER_FONT,
    letterSpacing: -0.2,
  },
  lyricsOverlayEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 80,
  },
  lyricsOverlayEmptyTitle: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: PLAYER_FONT,
    marginTop: 16,
  },
  lyricsOverlayEmptyBody: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: PLAYER_FONT,
    textAlign: 'center',
    marginTop: 6,
  },
  artwork: {
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  musicVideoFrame: {
    width: '100%',
    minHeight: 200,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  musicVideoButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    marginTop: -10,
    marginBottom: 6,
  },
  musicVideoButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700', fontFamily: PLAYER_FONT },
  musicVideoButtonPressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  musicVideoButtonDisabled: { opacity: 0.65 },
  clipsShortcut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 14, marginBottom: 16, backgroundColor: 'rgba(30,215,96,0.12)', borderWidth: 1, borderColor: 'rgba(30,215,96,0.26)' },
  clipsShortcutTitle: { color: '#FFF', fontSize: 14, fontWeight: '700', maxWidth: 230 },
  musicVideoError: { color: '#FCA5A5', fontSize: 12, textAlign: 'center', marginTop: -2, marginBottom: 6 },
  meta: { paddingTop: 12, flexDirection: 'row', alignItems: 'center' },
  metaCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  likeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800', fontFamily: PLAYER_FONT, letterSpacing: -0.35 },
  artist: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontFamily: PLAYER_FONT, marginTop: 3 },
  timeline: { paddingTop: 14 },
  track: { height: 22, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  thumb: { position: 'absolute', width: PROGRESS_THUMB_SIZE, height: PROGRESS_THUMB_SIZE, borderRadius: PROGRESS_THUMB_INSET, backgroundColor: '#FFF' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A8A', textAlign: 'center', marginTop: 9, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
  modeControl: { width: 40, height: 50, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 50, height: 56, alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  playIcon: { marginLeft: 3 },
  repeatBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: { color: '#07120B', fontSize: 8, fontWeight: '900' },
  secondaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 0,
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  secondaryControl: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryControlActive: { opacity: 1 },
  panel: {
    minHeight: 178,
    borderRadius: 20,
    backgroundColor: 'rgba(31,31,31,0.90)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 16,
    marginBottom: 18,
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  panelTitle: { color: '#F2F2F2', fontSize: 20, fontWeight: '800', fontFamily: PLAYER_FONT },
  panelMeta: { color: '#707070', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  panelLoading: { height: 120, justifyContent: 'center' },
  panelEmpty: { color: '#777', fontSize: 14, paddingVertical: 38, textAlign: 'center' },
  lyricsScroll: { maxHeight: 310 },
  lyrics: { gap: 10, paddingBottom: 18 },
  lyricTap: { minHeight: 38, justifyContent: 'center' },
  lyricLine: { color: 'rgba(255,255,255,0.34)', fontSize: 22, lineHeight: 28, fontWeight: '700', fontFamily: PLAYER_FONT },
  lyricWord: { color: 'rgba(255,255,255,0.34)' },
  lyricWordActive: { color: '#FFF' },
  lyricActive: { color: '#FFF', fontSize: 28, lineHeight: 34, fontWeight: '800', fontFamily: PLAYER_FONT },
  plainLyrics: { color: 'rgba(255,255,255,0.82)', fontSize: 20, lineHeight: 29, fontWeight: '650' as any, fontFamily: PLAYER_FONT },
  queueList: { gap: 4 },
  queueRow: { minHeight: 58, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  queueRowActive: { backgroundColor: 'rgba(255,255,255,0.09)' },
  queueMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  queueNumber: { width: 28, color: '#686868', fontSize: 11, fontWeight: '700' },
  queueCopy: { flex: 1, minWidth: 0 },
  queueTitle: { color: '#D8D8D8', fontSize: 14, fontWeight: '700' },
  queueTitleActive: { color: '#FFF' },
  queueArtist: { color: '#6F6F6F', fontSize: 11, marginTop: 2 },
  queueClear: { color: '#A8A8A8', fontSize: 12, fontWeight: '700' },
  queueActions: { flexDirection: 'row', alignItems: 'center' },
  queueAction: { width: 32, height: 42, alignItems: 'center', justifyContent: 'center' },
  queueActionText: { color: '#AFAFAF', fontSize: 17, fontWeight: '700' },
  queueActionDisabled: { color: '#3E3E3E' },
  queueRemove: { color: '#B8B8B8', fontSize: 22, fontWeight: '400', marginTop: -2 },
  queueHistory: { marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#252525' },
  queueHistoryHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  queueHistoryTitle: { color: '#DCDCDC', fontSize: 13, fontWeight: '800' },
  queueHistoryMeta: { color: '#5E5E5E', fontSize: 9, fontWeight: '700' },
  queueHistoryRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1B1B1B' },
  queueHistoryButton: { height: 32, borderRadius: 10, backgroundColor: '#1A1A1A', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  queueHistoryButtonText: { color: '#BDBDBD', fontSize: 10, fontWeight: '800' },
  queueHistoryAdd: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAEAEA', alignItems: 'center', justifyContent: 'center', marginLeft: 7 },
  queueHistoryAddText: { color: '#080808', fontSize: 19, fontWeight: '800', lineHeight: 21 },
  downloadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 8 },
  downloadCopy: { flex: 1, minWidth: 0 },
  downloadTitle: { color: '#D7D7D7', fontSize: 13, lineHeight: 18, marginTop: -4 },
  downloadButton: { height: 38, borderRadius: 12, backgroundColor: '#EFEFEF', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  downloadButtonSaved: { backgroundColor: 'rgba(255,255,255,0.08)' },
  downloadButtonText: { color: '#080808', fontSize: 11, fontWeight: '800' },
  downloadButtonTextSaved: { color: '#D0D0D0' },
  downloadProgressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 },
  downloadProgress: { height: 3, borderRadius: 2, backgroundColor: '#EEE' },
  downloadError: { color: '#DE8585', fontSize: 11, lineHeight: 16, marginBottom: 14 },
  toolLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toolLabel: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 2, marginBottom: 9 },
  timerState: { color: '#A8A8A8', fontSize: 11, fontVariant: ['tabular-nums'] },
  optionRow: { flexDirection: 'row', gap: 7, paddingBottom: 16 },
  option: { minWidth: 54, height: 36, borderRadius: 12, paddingHorizontal: 11, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  optionActive: { backgroundColor: '#EFEFEF' },
  optionText: { color: '#A1A1A1', fontSize: 11, fontWeight: '700' },
  optionTextActive: { color: '#080808' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 2, paddingBottom: 16 },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: { color: '#D7D7D7', fontSize: 13, fontWeight: '750' as any, marginTop: -4 },
  featureDetail: { color: '#696969', fontSize: 10, lineHeight: 15, marginTop: 3 },
  featureButton: { width: 52, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  featureButtonActive: { backgroundColor: '#EFEFEF' },
  featureButtonText: { color: '#999', fontSize: 11, fontWeight: '800' },
  featureButtonTextActive: { color: '#080808' },
  diagnosticsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.09)', marginTop: 2, marginBottom: 14 },
  diagnosticsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diagnosticsHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  diagnosticsTitle: { color: '#E2E2E2', fontSize: 14, fontWeight: '750' as any, marginTop: -4 },
  diagnosticsSubtitle: { color: '#6E6E6E', fontSize: 11, lineHeight: 16, marginTop: 3 },
  diagnosticsToggle: { width: 30, textAlign: 'center', color: '#BDBDBD', fontSize: 23, fontWeight: '400' },
  diagnosticsList: { marginTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 5 },
  diagnosticsRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  diagnosticsKey: { color: '#737373', fontSize: 11 },
  diagnosticsValue: { color: '#C7C7C7', fontSize: 11, fontWeight: '650' as any, flexShrink: 1, textAlign: 'right' },
  diagnosticsPrivacy: { color: '#555', fontSize: 9, lineHeight: 14, marginTop: 9 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  secondary: { width: 46, height: 38, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#A0A0A0', fontWeight: '700', fontSize: 13 },
  device: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  empty: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 24 },
  close: { position: 'absolute', top: 56, left: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFF', fontSize: 28 },
  emptyTitle: { color: '#FFF', fontSize: 25, fontWeight: '800' },
  emptyBody: { color: '#888', fontSize: 15, marginTop: 8, textAlign: 'center' },
});

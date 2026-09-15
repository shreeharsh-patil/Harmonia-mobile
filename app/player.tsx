import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArtworkRenderer } from '@/src/components/ArtworkRenderer';
import { fetchLyrics, type LyricsResult, type StreamQuality } from '@/src/lib/api';
import { activeLyricIndex, activeLyricWordIndex, parseLrc } from '@/src/lib/lyrics';
import { artistNames, artworkUrl, durationLabel } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlaybackHistory, usePlaybackProgress, usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { colors } from '@/src/theme';

type Panel = 'none' | 'lyrics' | 'queue' | 'tools';

const PLAYER_FONT = Platform.OS === 'android' ? 'sans-serif' : undefined;

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

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ panel?: string; from?: string }>();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
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
    radioEnabled,
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
    toggleRadio,
  } = usePlayer();
  const { history } = usePlaybackHistory();
  const { position, duration, sleepRemaining } = usePlaybackProgress();

  const [progressWidth, setProgressWidth] = useState(1);
  const [panel, setPanel] = useState<Panel>('none');
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const lyricsScrollRef = useRef<ScrollView>(null);

  const cover = artworkUrl(currentSong, 360);
  const syncedLines = useMemo(() => parseLrc(lyrics?.syncedLyrics), [lyrics?.syncedLyrics]);
  const activeLine = useMemo(() => activeLyricIndex(syncedLines, position), [syncedLines, position]);
  const activeWord = useMemo(
    () => activeLyricWordIndex(syncedLines[activeLine], position),
    [activeLine, position, syncedLines]
  );
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
    if (panel !== 'lyrics' || activeLine < 0 || !syncedLines.length) return;
    const timeout = setTimeout(() => {
      lyricsScrollRef.current?.scrollTo({
        y: Math.max(0, activeLine * 48 - 96),
        animated: true,
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [activeLine, panel, syncedLines.length]);

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

  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  const compactArtwork = panel === 'queue' || panel === 'tools';
  const playerContentWidth = Math.max(0, width - 32);
  const artworkSize = Math.min(compactArtwork ? 244 : 380, playerContentWidth);
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
    if (!token) {
      router.push('/login');
      return;
    }
    void toggleLike(currentSong);
  };

  const timerLabel = sleepTimer === 'off'
    ? 'Off'
    : sleepTimer === 'track'
      ? 'After track'
      : sleepRemaining > 0
        ? `${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, '0')}`
        : `${sleepTimer}m`;

  const shareDiagnostics = async () => {
    const lines = [
      'Harmonia playback diagnostics',
      `Track: ${currentSong.name} — ${artistNames(currentSong)}`,
      `Provider: ${playbackDiagnostics?.provider || 'Not reported'}`,
      `Source: ${diagnosticSourceLabel(playbackDiagnostics?.source)}`,
      `Codec: ${playbackDiagnostics?.codec || 'Not reported'}`,
      `Bitrate: ${formatBitrate(playbackDiagnostics?.bitrate)}`,
      `Quality: ${playbackDiagnostics?.quality || streamQuality}`,
      `Adaptive pipeline: ${adaptivePipelineEnabled ? adaptivePipelineStatus : 'disabled'}`,
      `Playback state: ${playbackState}`,
      `Error type: ${playbackErrorType || 'None'}`,
      `Queue: ${queue.length ? `${currentIndex + 1} of ${queue.length}` : 'Not queued'}`,
      '',
      'Private stream URLs and tokens are not included.',
    ];

    await Share.share({
      title: 'Harmonia playback diagnostics',
      message: lines.join('\n'),
    });
  };

  return (
    <View style={styles.root}>
      {!!cover && (
        <Image
          source={{ uri: cover }}
          blurRadius={72}
          contentFit="cover"
          style={[StyleSheet.absoluteFill, styles.backdropImage]}
          cachePolicy="memory-disk"
          recyclingKey={String(currentSong.id || cover)}
        />
      )}
      <View style={styles.backdropTopWash} />
      <View style={styles.backdropMiddleWash} />
      <View style={styles.backdropBottomWash} />

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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          bounces={false}
        >
          <View style={[styles.artworkWrap, compactArtwork && styles.artworkWrapCompact]}>
            {panel === 'lyrics' ? (
              <View style={styles.lyricsStage}>
                <View style={styles.lyricsStageHeader}>
                  <View>
                    <Text style={styles.lyricsStageTitle}>Lyrics</Text>
                    <Text style={styles.lyricsStageProvider}>{lyrics?.lyricsProvider || 'Harmonia'}</Text>
                  </View>
                  <Pressable onPress={() => togglePanel('lyrics')} hitSlop={10} accessibilityLabel="Close lyrics">
                    <Ionicons name="close" size={22} color="rgba(255,255,255,0.78)" />
                  </Pressable>
                </View>

                {lyricsLoading ? (
                  <View style={styles.lyricsStageLoading}>
                    {[82, 64, 91, 70, 86].map((widthValue, index) => (
                      <View
                        key={widthValue}
                        style={[styles.lyricsStageSkeleton, { width: `${widthValue}%`, opacity: 1 - index * 0.12 }]}
                      />
                    ))}
                  </View>
                ) : syncedLines.length ? (
                  <ScrollView
                    ref={lyricsScrollRef}
                    style={styles.lyricsStageScroll}
                    contentContainerStyle={styles.lyricsStageContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {syncedLines.map((line, index) => {
                      const active = index === activeLine;
                      return (
                        <Pressable
                          key={`${line.time}-${index}`}
                          onPress={() => void seek(line.time)}
                          style={styles.lyricTap}
                        >
                          <Text style={[styles.lyricLine, active && styles.lyricActive]}>
                            {line.words?.length
                              ? line.words.map((word, wordIndex) => (
                                  <Text
                                    key={`${word.time}-${wordIndex}`}
                                    style={[
                                      styles.lyricWord,
                                      active && wordIndex <= activeWord && styles.lyricWordActive,
                                    ]}
                                  >
                                    {word.text}
                                  </Text>
                                ))
                              : line.text}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : lyrics?.plainLyrics ? (
                  <ScrollView
                    style={styles.lyricsStageScroll}
                    contentContainerStyle={styles.lyricsStageContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.plainLyrics}>{lyrics.plainLyrics}</Text>
                  </ScrollView>
                ) : (
                  <View style={styles.lyricsStageEmpty}>
                    <Ionicons name="mic-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.lyricsStageEmptyTitle}>No lyrics found</Text>
                    <Text style={styles.lyricsStageEmptyBody}>Lyrics may not be available for this release yet.</Text>
                  </View>
                )}
              </View>
            ) : (
              <ArtworkRenderer
                song={currentSong}
                size={artworkSize}
                radius={0}
                enableMotion={panel === 'none'}
                style={styles.artwork}
              />
            )}
          </View>

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
            <Pressable
              onLayout={onProgressLayout}
              onPress={(event) => void seek((event.nativeEvent.locationX / progressWidth) * duration)}
              style={styles.track}
            >
              <View style={styles.trackBase} />
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
              <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
            </Pressable>
            <View style={styles.times}>
              <Text style={styles.time}>{durationLabel(position)}</Text>
              <Text style={styles.time}>{durationLabel(duration)}</Text>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={[styles.controls, { gap: controlGap }]}>
            <Pressable onPress={toggleShuffle} style={styles.modeControl} accessibilityLabel="Shuffle">
              <Ionicons
                name="shuffle"
                size={24}
                color={shuffleEnabled ? colors.accent : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
            <Pressable onPress={() => void previous()} style={styles.skip} accessibilityLabel="Previous">
              <Ionicons name="play-skip-back" size={42} color="#FFF" />
            </Pressable>
            <Pressable onPress={() => void togglePlayback()} style={styles.play} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isBuffering || isLoadingTrack
                ? <ActivityIndicator color="#080808" size="large" />
                : <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color="#080808" style={!isPlaying ? styles.playIcon : undefined} />}
            </Pressable>
            <Pressable onPress={() => void next()} style={styles.skip} accessibilityLabel="Next">
              <Ionicons name="play-skip-forward" size={42} color="#FFF" />
            </Pressable>
            <Pressable onPress={toggleRepeat} style={styles.modeControl} accessibilityLabel="Repeat">
              <Ionicons
                name="repeat"
                size={24}
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
                <Text style={styles.timerState}>{timerLabel}</Text>
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

              <View style={styles.featureRow}>
                <View style={styles.featureCopy}>
                  <Text style={styles.toolLabel}>HARMONIA RADIO</Text>
                  <Text style={styles.featureTitle}>Keep the music going</Text>
                  <Text style={styles.featureDetail}>Automatically add related tracks when your queue reaches the end.</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    toggleRadio();
                  }}
                  style={[styles.featureButton, radioEnabled && styles.featureButtonActive]}
                  accessibilityLabel={radioEnabled ? 'Turn Harmonia Radio off' : 'Turn Harmonia Radio on'}
                >
                  <Text style={[styles.featureButtonText, radioEnabled && styles.featureButtonTextActive]}>
                    {radioEnabled ? 'On' : 'Off'}
                  </Text>
                </Pressable>
              </View>

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
                  <DiagnosticsRow label="Duration" value={durationLabel(duration)} />
                  <DiagnosticsRow label="Playback rate" value={`${playbackRate}×`} />
                  <DiagnosticsRow
                    label="Queue position"
                    value={queue.length ? `${currentIndex + 1} of ${queue.length}` : 'Not queued'}
                  />
                  <Text style={styles.diagnosticsPrivacy}>
                    Harmonia shows the stream hostname only. Signed URLs, query parameters and session tokens are never displayed here.
                  </Text>
                  <Pressable
                    onPress={() => void shareDiagnostics()}
                    style={styles.shareDiagnostics}
                    accessibilityLabel="Share playback diagnostics"
                  >
                    <Text style={styles.shareDiagnosticsText}>Share diagnostics</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {panel !== 'none' && (
            <View style={styles.footer}>
              <Pressable onPress={() => void seek(Math.max(0, position - 10))} style={styles.secondary}>
                <Text style={styles.secondaryText}>−10</Text>
              </Pressable>
              <Text style={styles.device}>HARMONIA • THIS PHONE</Text>
              <Pressable onPress={() => void seek(Math.min(duration, position + 10))} style={styles.secondary}>
                <Text style={styles.secondaryText}>+10</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  backdropImage: { opacity: 0.66, transform: [{ scale: 1.46 }] },
  backdropTopWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' },
  backdropMiddleWash: { position: 'absolute', left: 0, right: 0, top: '34%', bottom: '32%', backgroundColor: 'rgba(0,0,0,0.46)' },
  backdropBottomWash: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%', backgroundColor: 'rgba(0,0,0,0.82)' },
  safe: { flex: 1, paddingHorizontal: 16 },
  scroll: { paddingBottom: 16 },
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
  artworkWrapCompact: { minHeight: 275, paddingTop: 8, paddingBottom: 12 },
  lyricsStage: { width: '100%', height: 380, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4 },
  lyricsStageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  lyricsStageTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', fontFamily: PLAYER_FONT },
  lyricsStageProvider: { color: 'rgba(255,255,255,0.46)', fontSize: 9, fontWeight: '700', fontFamily: PLAYER_FONT, textTransform: 'uppercase', letterSpacing: 0.9, marginTop: 2 },
  lyricsStageScroll: { flex: 1 },
  lyricsStageContent: { paddingTop: 54, paddingBottom: 130, gap: 15 },
  lyricsStageLoading: { flex: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 4 },
  lyricsStageSkeleton: { height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.13)' },
  lyricsStageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  lyricsStageEmptyTitle: { color: 'rgba(255,255,255,0.72)', fontSize: 18, fontWeight: '800', fontFamily: PLAYER_FONT, marginTop: 12 },
  lyricsStageEmptyBody: { color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 18, fontFamily: PLAYER_FONT, textAlign: 'center', marginTop: 5 },
  artwork: {
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  meta: { paddingTop: 16, flexDirection: 'row', alignItems: 'center' },
  metaCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  likeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800', fontFamily: PLAYER_FONT, letterSpacing: -0.35 },
  artist: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontFamily: PLAYER_FONT, marginTop: 3 },
  timeline: { paddingTop: 16 },
  track: { height: 22, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#F4F4F4', left: 0 },
  thumb: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF', marginLeft: -5 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A8A', textAlign: 'center', marginTop: 9, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 14, paddingBottom: 8 },
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
    marginBottom: 4,
    paddingHorizontal: 8,
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
  shareDiagnostics: { height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  shareDiagnosticsText: { color: '#CFCFCF', fontSize: 11, fontWeight: '800' },
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

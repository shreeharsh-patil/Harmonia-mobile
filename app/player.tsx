import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
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
import { albumName, artistNames, artworkUrl, durationLabel } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlaybackActivity, usePlaybackProgress, usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';
import { useOffline } from '@/src/providers/OfflineProvider';

type Panel = 'none' | 'lyrics' | 'queue' | 'tools';

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
  const params = useLocalSearchParams<{ panel?: string }>();
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
  const { history } = usePlaybackActivity();
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
    if (panel !== 'lyrics' || !currentSong) return;

    const controller = new AbortController();
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

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentSong, panel]);

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
  const compactArtwork = panel !== 'none';
  const playerContentWidth = Math.max(0, width - 32);
  const artworkSize = Math.min(compactArtwork ? 244 : 360, playerContentWidth);
  const controlsFixedWidth = 42 + 52 + 74 + 52 + 42;
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
          blurRadius={28}
          contentFit="cover"
          style={[StyleSheet.absoluteFill, styles.backdropImage]}
          cachePolicy="memory-disk"
          recyclingKey={String(currentSong.id || cover)}
        />
      )}
      <View style={styles.backdropTint} />
      <View style={styles.backdropFade} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.roundButton} accessibilityLabel="Close player">
            <Ionicons name="chevron-down" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.playingFrom}>Playing from</Text>
            <Text numberOfLines={1} style={styles.album}>{albumName(currentSong) || 'Harmonia'}</Text>
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
            <ArtworkRenderer
              song={currentSong}
              size={artworkSize}
              radius={14}
              enableMotion={panel === 'none'}
              style={styles.artwork}
            />
          </View>

          <View style={styles.meta}>
            <View style={styles.metaCopy}>
              <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
              <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
            </View>
            <Pressable onPress={handleLike} style={styles.likeButton} accessibilityLabel={isLiked(currentSong.id) ? 'Unlike song' : 'Like song'}>
              <Ionicons
                name={isLiked(currentSong.id) ? 'heart' : 'heart-outline'}
                size={25}
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
                color={shuffleEnabled ? '#4ADE80' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
            <Pressable onPress={() => void previous()} style={styles.skip} accessibilityLabel="Previous">
              <Ionicons name="play-skip-back" size={38} color="#FFF" />
            </Pressable>
            <Pressable onPress={() => void togglePlayback()} style={styles.play} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isBuffering || isLoadingTrack
                ? <ActivityIndicator color="#080808" size="large" />
                : <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#080808" style={!isPlaying ? styles.playIcon : undefined} />}
            </Pressable>
            <Pressable onPress={() => void next()} style={styles.skip} accessibilityLabel="Next">
              <Ionicons name="play-skip-forward" size={38} color="#FFF" />
            </Pressable>
            <Pressable onPress={toggleRepeat} style={styles.modeControl} accessibilityLabel="Repeat">
              <Ionicons
                name="repeat"
                size={24}
                color={repeatMode !== 'off' ? '#4ADE80' : 'rgba(255,255,255,0.62)'}
              />
              {repeatMode === 'one' && (
                <View style={styles.repeatBadge}><Text style={styles.repeatBadgeText}>1</Text></View>
              )}
            </Pressable>
          </View>

          <View style={styles.secondaryControls}>
            <Pressable
              onPress={() => togglePanel('queue')}
              style={styles.secondaryControl}
              accessibilityLabel="Queue"
            >
              <Ionicons
                name="list-outline"
                size={22}
                color={panel === 'queue' ? '#FFF' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
            <Pressable
              onPress={() => togglePanel('lyrics')}
              style={styles.secondaryControl}
              accessibilityLabel="Lyrics"
            >
              <Ionicons
                name="mic-outline"
                size={21}
                color={panel === 'lyrics' ? '#FFF' : 'rgba(255,255,255,0.62)'}
              />
            </Pressable>
          </View>

          {panel === 'lyrics' && (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Lyrics</Text>
                <Text style={styles.panelMeta}>{lyrics?.lyricsProvider || 'Harmonia'}</Text>
              </View>
              {lyricsLoading ? (
                <View style={styles.panelLoading}><ActivityIndicator color="#FFF" /></View>
              ) : syncedLines.length ? (
                <ScrollView
                  ref={lyricsScrollRef}
                  style={styles.lyricsScroll}
                  contentContainerStyle={styles.lyrics}
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
                <Text style={styles.plainLyrics}>{lyrics.plainLyrics}</Text>
              ) : (
                <Text style={styles.panelEmpty}>No lyrics found for this track.</Text>
              )}
            </View>
          )}

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

          <View style={styles.footer}>
            <Pressable onPress={() => void seek(Math.max(0, position - 10))} style={styles.secondary}>
              <Text style={styles.secondaryText}>−10</Text>
            </Pressable>
            <Text style={styles.device}>HARMONIA • THIS PHONE</Text>
            <Pressable onPress={() => void seek(Math.min(duration, position + 10))} style={styles.secondary}>
              <Text style={styles.secondaryText}>+10</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  backdropImage: { opacity: 0.48, transform: [{ scale: 1.18 }] },
  backdropTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,5,0.64)' },
  backdropFade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.14)' },
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
  playingFrom: { color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: '700' },
  album: { color: 'rgba(255,255,255,0.56)', fontSize: 13, fontWeight: '500', marginTop: 2, maxWidth: 210 },
  artworkWrap: { minHeight: 408, justifyContent: 'center', alignItems: 'center', paddingTop: 20, paddingBottom: 34 },
  artworkWrapCompact: { minHeight: 275, paddingTop: 8, paddingBottom: 12 },
  artwork: {
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  },
  meta: { paddingTop: 20, flexDirection: 'row', alignItems: 'center' },
  metaCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  likeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.35 },
  artist: { color: 'rgba(255,255,255,0.62)', fontSize: 16, marginTop: 4 },
  timeline: { paddingTop: 22 },
  track: { height: 22, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#F4F4F4', left: 0 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF', marginLeft: -6 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A8A', textAlign: 'center', marginTop: 9, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 18, paddingBottom: 12 },
  modeControl: { width: 42, height: 56, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 52, height: 64, alignItems: 'center', justifyContent: 'center' },
  play: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  playIcon: { marginLeft: 3 },
  repeatBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ADE80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: { color: '#07120B', fontSize: 8, fontWeight: '900' },
  secondaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 12,
  },
  secondaryControl: {
    width: 46,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    minHeight: 178,
    borderRadius: 20,
    backgroundColor: 'rgba(12,12,12,0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.11)',
    padding: 16,
    marginBottom: 18,
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  panelTitle: { color: '#F2F2F2', fontSize: 18, fontWeight: '800' },
  panelMeta: { color: '#707070', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  panelLoading: { height: 120, justifyContent: 'center' },
  panelEmpty: { color: '#777', fontSize: 14, paddingVertical: 38, textAlign: 'center' },
  lyricsScroll: { maxHeight: 310 },
  lyrics: { gap: 10, paddingBottom: 18 },
  lyricTap: { minHeight: 38, justifyContent: 'center' },
  lyricLine: { color: '#777', fontSize: 18, lineHeight: 23, fontWeight: '650' as any },
  lyricWord: { color: '#777' },
  lyricWordActive: { color: '#FFF' },
  lyricActive: { color: '#FFF', fontSize: 24, lineHeight: 29, fontWeight: '800' },
  plainLyrics: { color: '#CFCFCF', fontSize: 17, lineHeight: 25 },
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
  empty: { flex: 1, backgroundColor: '#090909', alignItems: 'center', justifyContent: 'center', padding: 24 },
  close: { position: 'absolute', top: 56, left: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFF', fontSize: 28 },
  emptyTitle: { color: '#FFF', fontSize: 25, fontWeight: '800' },
  emptyBody: { color: '#888', fontSize: 15, marginTop: 8, textAlign: 'center' },
});

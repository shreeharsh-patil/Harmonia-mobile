import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { fetchLyrics, type LyricsResult, type StreamQuality } from '@/src/lib/api';
import { activeLyricIndex, parseLrc } from '@/src/lib/lyrics';
import { albumName, artistNames, artworkUrl, durationLabel } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';

type Panel = 'none' | 'lyrics' | 'queue' | 'tools';

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
const QUALITY_OPTIONS: Array<{ value: StreamQuality; label: string }> = [
  { value: 'automatic', label: 'Auto' },
  { value: 'data-saver', label: 'Saver' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Max' },
];
const TIMER_OPTIONS: Array<{ value: SleepTimerMode; label: string }> = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
  { value: 'track', label: 'Track' },
  { value: 'off', label: 'Off' },
];

export default function PlayerScreen() {
  const { token } = useAuth();
  const { isLiked, toggleLike } = useLibrary();
  const {
    currentSong,
    queue,
    currentIndex,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    position,
    duration,
    error,
    playbackRate,
    streamQuality,
    sleepTimer,
    sleepRemaining,
    togglePlayback,
    previous,
    next,
    seek,
    playAt,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
  } = usePlayer();

  const [progressWidth, setProgressWidth] = useState(1);
  const [panel, setPanel] = useState<Panel>('none');
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const cover = artworkUrl(currentSong);
  const syncedLines = useMemo(() => parseLrc(lyrics?.syncedLyrics), [lyrics?.syncedLyrics]);
  const activeLine = useMemo(() => activeLyricIndex(syncedLines, position), [syncedLines, position]);

  useEffect(() => {
    let active = true;
    if (panel !== 'lyrics' || !currentSong) return;

    setLyricsLoading(true);
    setLyrics(null);
    fetchLyrics(currentSong)
      .then((value) => {
        if (active) setLyrics(value);
      })
      .finally(() => {
        if (active) setLyricsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentSong?.id, panel]);

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

  return (
    <View style={styles.root}>
      {!!cover && (
        <ImageBackground
          source={{ uri: cover }}
          blurRadius={42}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          imageStyle={styles.backdropImage}
        />
      )}
      <View style={styles.backdropTint} />
      <View style={styles.backdropFade} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.roundButton}>
            <Text style={styles.down}>⌄</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.playingFrom}>NOW PLAYING</Text>
            <Text numberOfLines={1} style={styles.album}>{albumName(currentSong) || 'Harmonia'}</Text>
          </View>
          <Pressable onPress={handleLike} style={styles.roundButton}>
            <Text style={[styles.heart, isLiked(currentSong.id) && styles.heartActive]}>
              {isLiked(currentSong.id) ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          bounces={false}
        >
          <View style={[styles.artworkWrap, compactArtwork && styles.artworkWrapCompact]}>
            <TrackArtwork
              song={currentSong}
              size={compactArtwork ? 244 : 330}
              radius={compactArtwork ? 20 : 25}
              style={styles.artwork}
            />
          </View>

          <View style={styles.meta}>
            <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
            <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
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
              <Text style={styles.time}>-{durationLabel(Math.max(0, duration - position))}</Text>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.controls}>
            <Pressable onPress={() => void previous()} style={styles.skip}>
              <Text style={styles.skipText}>|‹</Text>
            </Pressable>
            <Pressable onPress={() => void togglePlayback()} style={styles.play}>
              {isBuffering || isLoadingTrack
                ? <ActivityIndicator color="#080808" size="large" />
                : <Text style={styles.playText}>{isPlaying ? 'Ⅱ' : '▶'}</Text>}
            </Pressable>
            <Pressable onPress={() => void next()} style={styles.skip}>
              <Text style={styles.skipText}>›|</Text>
            </Pressable>
          </View>

          <View style={styles.panelTabs}>
            <Pressable onPress={() => togglePanel('lyrics')} style={[styles.panelTab, panel === 'lyrics' && styles.panelTabActive]}>
              <Text style={[styles.panelTabText, panel === 'lyrics' && styles.panelTabTextActive]}>Lyrics</Text>
            </Pressable>
            <Pressable onPress={() => togglePanel('queue')} style={[styles.panelTab, panel === 'queue' && styles.panelTabActive]}>
              <Text style={[styles.panelTabText, panel === 'queue' && styles.panelTabTextActive]}>Queue · {queue.length}</Text>
            </Pressable>
            <Pressable onPress={() => togglePanel('tools')} style={[styles.panelTab, panel === 'tools' && styles.panelTabActive]}>
              <Text style={[styles.panelTabText, panel === 'tools' && styles.panelTabTextActive]}>Tools</Text>
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
                <View style={styles.lyrics}>
                  {syncedLines.slice(Math.max(0, activeLine - 2), activeLine + 5).map((line, index) => {
                    const actualIndex = Math.max(0, activeLine - 2) + index;
                    const active = actualIndex === activeLine;
                    return (
                      <Pressable key={`${line.time}-${actualIndex}`} onPress={() => void seek(line.time)}>
                        <Text style={[styles.lyricLine, active && styles.lyricActive]}>{line.text}</Text>
                      </Pressable>
                    );
                  })}
                </View>
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
                <Text style={styles.panelTitle}>Up next</Text>
                <Text style={styles.panelMeta}>{currentIndex + 1} of {queue.length}</Text>
              </View>
              <View style={styles.queueList}>
                {queue.slice(Math.max(0, currentIndex - 1), currentIndex + 8).map((song, localIndex) => {
                  const actualIndex = Math.max(0, currentIndex - 1) + localIndex;
                  const active = actualIndex === currentIndex;
                  return (
                    <Pressable
                      key={`${song.id}-${actualIndex}`}
                      onPress={() => void playAt(actualIndex)}
                      style={[styles.queueRow, active && styles.queueRowActive]}
                    >
                      <Text style={styles.queueNumber}>{active ? '▶' : actualIndex + 1}</Text>
                      <View style={styles.queueCopy}>
                        <Text numberOfLines={1} style={[styles.queueTitle, active && styles.queueTitleActive]}>{song.name}</Text>
                        <Text numberOfLines={1} style={styles.queueArtist}>{artistNames(song)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {panel === 'tools' && (
            <View style={styles.panel}>
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
  backdropImage: { opacity: 0.34, transform: [{ scale: 1.16 }] },
  backdropTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,5,0.70)' },
  backdropFade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.18)' },
  safe: { flex: 1, paddingHorizontal: 20 },
  scroll: { paddingBottom: 20 },
  header: { height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(20,20,20,0.76)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  down: { color: '#FFF', fontSize: 26, marginTop: -7 },
  heart: { color: '#D5D5D5', fontSize: 23 },
  heartActive: { color: '#FFF' },
  headerCopy: { alignItems: 'center', flex: 1, paddingHorizontal: 12 },
  playingFrom: { color: '#828282', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  album: { color: '#D3D3D3', fontSize: 12, fontWeight: '700', marginTop: 3, maxWidth: 190 },
  artworkWrap: { minHeight: 390, justifyContent: 'center', alignItems: 'center' },
  artworkWrapCompact: { minHeight: 275 },
  artwork: {
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  },
  meta: { paddingTop: 10 },
  title: { color: '#FFF', fontSize: 25, fontWeight: '800', letterSpacing: -0.7 },
  artist: { color: '#A3A3A3', fontSize: 16, marginTop: 5 },
  timeline: { paddingTop: 24 },
  track: { height: 20, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#F4F4F4', left: 0 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF', marginLeft: -6 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  time: { color: '#8A8A8A', fontSize: 11, fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A8A', textAlign: 'center', marginTop: 9, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34, paddingVertical: 24 },
  skip: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFF', fontSize: 31, fontWeight: '700', letterSpacing: -5 },
  play: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#080808', fontSize: 28, fontWeight: '900' },
  panelTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  panelTab: {
    flex: 1,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(18,18,18,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTabActive: { backgroundColor: '#EDEDED', borderColor: '#EDEDED' },
  panelTabText: { color: '#9A9A9A', fontSize: 11, fontWeight: '800' },
  panelTabTextActive: { color: '#080808' },
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
  lyrics: { gap: 10 },
  lyricLine: { color: '#777', fontSize: 18, lineHeight: 23, fontWeight: '650' as any },
  lyricActive: { color: '#FFF', fontSize: 24, lineHeight: 29, fontWeight: '800' },
  plainLyrics: { color: '#CFCFCF', fontSize: 17, lineHeight: 25 },
  queueList: { gap: 4 },
  queueRow: { minHeight: 52, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  queueRowActive: { backgroundColor: 'rgba(255,255,255,0.09)' },
  queueNumber: { width: 28, color: '#686868', fontSize: 11, fontWeight: '700' },
  queueCopy: { flex: 1, minWidth: 0 },
  queueTitle: { color: '#D8D8D8', fontSize: 14, fontWeight: '700' },
  queueTitleActive: { color: '#FFF' },
  queueArtist: { color: '#6F6F6F', fontSize: 11, marginTop: 2 },
  toolLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toolLabel: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 2, marginBottom: 9 },
  timerState: { color: '#A8A8A8', fontSize: 11, fontVariant: ['tabular-nums'] },
  optionRow: { flexDirection: 'row', gap: 7, paddingBottom: 16 },
  option: { minWidth: 54, height: 36, borderRadius: 12, paddingHorizontal: 11, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  optionActive: { backgroundColor: '#EFEFEF' },
  optionText: { color: '#A1A1A1', fontSize: 11, fontWeight: '700' },
  optionTextActive: { color: '#080808' },
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

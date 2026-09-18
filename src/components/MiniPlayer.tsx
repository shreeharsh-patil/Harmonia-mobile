import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { PlaybackProgressFill } from '@/src/components/PlaybackProgressFill';
import { artistNames, artworkUrl } from '@/src/lib/song';
import { useArtworkPalette } from '@/src/lib/palette';
import { usePlaybackProgress, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import { usePreferences } from '@/src/providers/PreferencesProvider';

export const MINI_PLAYER_HEIGHT = 60;
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_MIN_BOTTOM = 0;
export const TAB_BAR_TO_MINI_GAP = 6;
export const TAB_CONTENT_EXTRA_GAP = 18;

export function getTabContentBottomInset(bottomInset: number, hasMiniPlayer: boolean) {
  const safeBottom = Math.max(bottomInset, TAB_BAR_MIN_BOTTOM);
  return safeBottom +
    TAB_BAR_HEIGHT +
    TAB_BAR_TO_MINI_GAP +
    (hasMiniPlayer ? MINI_PLAYER_HEIGHT + TAB_BAR_TO_MINI_GAP : 0) +
    TAB_CONTENT_EXTRA_GAP;
}

// Web mini-player renders three tiny primary-colored equalizer bars next to
// the title that animate only while playing (animate-eq-bar-1/2/3).
function EqBars({ playing }: { playing: boolean }) {
  const bars = useRef([
    new Animated.Value(2.5),
    new Animated.Value(5),
    new Animated.Value(3.5),
  ]).current;

  useEffect(() => {
    if (!playing) {
      bars[0].setValue(2.5);
      bars[1].setValue(5);
      bars[2].setValue(3.5);
      return;
    }

    const makeLoop = (delay: number, base: number, peak: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(bars[base], {
            toValue: peak,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(bars[base], {
            toValue: 2,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
        { resetBeforeIteration: false }
      );

    const loops = [
      makeLoop(0, 0, 9),
      makeLoop(140, 1, 9.5),
      makeLoop(280, 2, 8),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [playing, bars]);

  return (
    <View style={styles.eqRow}>
      {bars.map((value, index) => (
        <Animated.View key={index} style={[styles.eqBar, { height: value }]} />
      ))}
    </View>
  );
}

export function MiniPlayer() {
  const pathname = usePathname();
  const { batterySaver } = usePreferences();
  const {
    currentSong,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    togglePlayback,
    next,
  } = usePlayer();
  // Web mini-player tints the floating card with the artwork's dominant
  // color (fallback rgb(40,40,40)). Extraction is skipped in battery saver.
  const { dominantRgb } = useArtworkPalette(batterySaver ? null : currentSong, 64);
  const [tintR, tintG, tintB] = batterySaver ? [40, 40, 40] : dominantRgb;

  if (!currentSong) return null;

  const playingFrom = pathname.includes('/search')
    ? 'Search Results'
    : pathname.includes('/library')
      ? 'Your Library'
      : pathname.includes('/catalog')
        ? 'Discover'
        : 'Music';

  const openPlayer = (panel?: 'lyrics') => {
    router.push({
      pathname: '/player',
      params: {
        from: playingFrom,
        ...(panel ? { panel } : {}),
      },
    });
  };

  return (
    // Web mobile mini-player: a floating rounded card tinted by the artwork's
    // dominant color (dominantColor fallback rgb(30,30,30)).
    <View
      style={[
        styles.shell,
        batterySaver
          ? null
          : { backgroundColor: `rgb(${tintR}, ${tintG}, ${tintB})` },
      ]}
    >
      {!!artworkUrl(currentSong, 96) && (
        <Image
          source={{ uri: artworkUrl(currentSong, 96) }}
          style={styles.ambientArtwork}
          contentFit="cover"
          blurRadius={batterySaver ? 0 : 14}
          cachePolicy="memory-disk"
          recyclingKey={`mini-bg-${String(currentSong.id || artworkUrl(currentSong, 96))}`}
        />
      )}
      <View pointerEvents="none" style={styles.ambientWash} />

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Now Playing for ${currentSong.name}`}
          onPress={() => openPlayer()}
          style={styles.info}
        >
          <TrackArtwork song={currentSong} size={40} radius={4} />
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
              <EqBars playing={isPlaying} />
            </View>
            <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lyrics"
          onPress={() => openPlayer('lyrics')}
          style={styles.smallControl}
        >
          <Ionicons name="mic-outline" size={16} color="rgba(255,255,255,0.65)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => void togglePlayback()}
          style={styles.playControl}
        >
          {isBuffering || isLoadingTrack
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color="#FFF" />}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next"
          onPress={() => void next()}
          style={styles.nextControl}
        >
          <Ionicons name="play-skip-forward" size={28} color="#FFF" />
        </Pressable>
      </View>

      <MiniPlayerProgress playing={isPlaying} />
    </View>
  );
}

function MiniPlayerProgress({ playing }: { playing: boolean }) {
  const { position, duration } = usePlaybackProgress();
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View style={styles.progressTrack}>
      <PlaybackProgressFill progress={progress} playing={playing} color="#FFF" style={styles.progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  ambientArtwork: {
    ...StyleSheet.absoluteFill,
    opacity: 0.55,
    transform: [{ scale: 1.55 }],
  },
  ambientWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12,12,12,0.42)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  copy: { flex: 1, marginLeft: 9, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eqRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 1.5,
    height: 10,
    width: 10,
  },
  eqBar: {
    width: 1.5,
    borderRadius: 1,
    backgroundColor: colors.accentBright,
  },
  title: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 17,
    flexShrink: 1,
  },
  artist: { color: 'rgba(255,255,255,0.70)', fontSize: 12, marginTop: 1, lineHeight: 14 },
  smallControl: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  playControl: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  nextControl: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  progressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progress: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, height: 2 },
});

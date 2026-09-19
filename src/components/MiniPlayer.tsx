import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type ComponentProps, useEffect, useMemo, useRef } from 'react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { PlaybackProgressFill } from '@/src/components/PlaybackProgressFill';
import { artistNames, artworkUrl } from '@/src/lib/song';
import { useArtworkPalette } from '@/src/lib/palette';
import { useAudioOutputRoute } from '@/src/lib/audioRoute';
import { usePlaybackProgress, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import { usePreferences } from '@/src/providers/PreferencesProvider';

export const MINI_PLAYER_HEIGHT = 74;
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_MIN_BOTTOM = 0;
// Keep the mini player visually attached to the translucent navigation dock.
// The reference treats both controls as one continuous playback surface.
export const TAB_BAR_TO_MINI_GAP = 0;
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
// Bars animate with scaleY on the native driver — height layout animations
// would run on the JS thread and stutter while audio is playing.
const EQ_BAR_HEIGHTS = [2.5, 5, 3.5];
function EqBars({ playing }: { playing: boolean }) {
  const bars = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  useEffect(() => {
    if (!playing) {
      bars[0].setValue(1);
      bars[1].setValue(1);
      bars[2].setValue(1);
      return;
    }

    const makeLoop = (delay: number, bar: number, peakScale: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(bars[bar], {
            toValue: peakScale,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bars[bar], {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        { resetBeforeIteration: false }
      );

    const loops = [
      makeLoop(0, 0, EQ_BAR_HEIGHTS[0] === 0 ? 1 : 9 / EQ_BAR_HEIGHTS[0]),
      makeLoop(140, 1, EQ_BAR_HEIGHTS[1] === 0 ? 1 : 9.5 / EQ_BAR_HEIGHTS[1]),
      makeLoop(280, 2, EQ_BAR_HEIGHTS[2] === 0 ? 1 : 8 / EQ_BAR_HEIGHTS[2]),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [playing, bars]);

  return (
    <View style={styles.eqRow}>
      {bars.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.eqBar,
            { height: EQ_BAR_HEIGHTS[index] },
            // transformOrigin keeps bars anchored to the row baseline so the
            // scaleY pulse grows upward, like the original height animation.
            { transform: [{ scaleY: value }], transformOrigin: 'bottom' },
          ]}
        />
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
  const paletteSong = batterySaver ? null : currentSong;
  const { dominantRgb } = useArtworkPalette(paletteSong, 64);
  const audioRoute = useAudioOutputRoute();
  const [tintR, tintG, tintB] = batterySaver ? [40, 40, 40] : dominantRgb;
  // artworkUrl walks many fields and runs regexes; compute it once per song
  // instead of three times per render (this component re-renders at 2 Hz
  // while playing via the progress context).
  const ambientArtworkUrl = useMemo(
    () => (currentSong ? artworkUrl(currentSong, 96) : ''),
    [currentSong]
  );

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
      {!!ambientArtworkUrl && (
        <Image
          source={{ uri: ambientArtworkUrl }}
          style={styles.ambientArtwork}
          contentFit="cover"
          blurRadius={batterySaver ? 0 : Platform.OS === 'android' ? 5 : 10}
          cachePolicy="memory-disk"
          recyclingKey={`mini-bg-${String(currentSong.id || ambientArtworkUrl)}`}
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
          <TrackArtwork song={currentSong} size={48} radius={5} />
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
              <EqBars playing={isPlaying && !batterySaver} />
            </View>
            <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
            <View style={styles.routeRow}>
              <Ionicons name={audioRouteIcon(audioRoute.kind)} size={12} color={colors.accentBright} />
              <Text numberOfLines={1} style={styles.routeName}>{audioRoute.name}</Text>
            </View>
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

function audioRouteIcon(kind: ReturnType<typeof useAudioOutputRoute>['kind']): ComponentProps<typeof Ionicons>['name'] {
  switch (kind) {
    case 'bluetooth': return 'bluetooth' as const;
    case 'wired': return 'headset-outline' as const;
    case 'external': return 'volume-high-outline' as const;
    case 'phone': return 'phone-portrait-outline' as const;
    default: return 'volume-high-outline' as const;
  }
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
    borderRadius: 10,
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
    paddingVertical: 7,
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
  artist: { color: 'rgba(255,255,255,0.70)', fontSize: 11, marginTop: 1, lineHeight: 13 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, minWidth: 0 },
  routeName: { flexShrink: 1, color: colors.accentBright, fontSize: 11, lineHeight: 13, fontWeight: '700' },
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

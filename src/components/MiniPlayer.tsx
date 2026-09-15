import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames, artworkUrl } from '@/src/lib/song';
import { usePlaybackProgress, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';

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

export function MiniPlayer() {
  const {
    currentSong,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    togglePlayback,
    next,
  } = usePlayer();

  if (!currentSong) return null;

  const cover = artworkUrl(currentSong, 96);

  return (
    <View style={styles.shell}>
      {!!cover && (
        <Image
          source={{ uri: cover }}
          style={styles.ambientArtwork}
          contentFit="cover"
          blurRadius={28}
          cachePolicy="memory-disk"
          recyclingKey={`mini-bg-${String(currentSong.id || cover)}`}
        />
      )}
      <View pointerEvents="none" style={styles.ambientWash} />

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Now Playing for ${currentSong.name}`}
          onPress={() => router.push('/player')}
          style={styles.info}
        >
          <TrackArtwork song={currentSong} size={42} radius={4} />
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
            <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lyrics"
          onPress={() => router.push({ pathname: '/player', params: { panel: 'lyrics' } })}
          style={styles.smallControl}
        >
          <Ionicons name="mic-outline" size={16} color="rgba(255,255,255,0.68)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => void togglePlayback()}
          style={styles.playControl}
        >
          {isBuffering || isLoadingTrack
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name={isPlaying ? 'pause' : 'play'} size={29} color={colors.textStrong} />}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next"
          onPress={() => void next()}
          style={styles.nextControl}
        >
          <Ionicons name="play-skip-forward" size={28} color={colors.textStrong} />
        </Pressable>
      </View>

      <MiniPlayerProgress />
    </View>
  );
}

function MiniPlayerProgress() {
  const { position, duration } = usePlaybackProgress();
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
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
    ...StyleSheet.absoluteFillObject,
    opacity: 0.72,
    transform: [{ scale: 1.55 }],
  },
  ambientWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,15,0.48)',
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
  title: { color: '#FFF', fontWeight: '600', fontSize: 13, lineHeight: 17 },
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
  progress: { height: 2, backgroundColor: '#FFF' },
});

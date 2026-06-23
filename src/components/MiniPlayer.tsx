import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { usePlaybackProgress, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';

export const MINI_PLAYER_HEIGHT = 64;

export function MiniPlayer() {
  const {
    currentSong,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    togglePlayback,
    next,
  } = usePlayer();
  const { position, duration } = usePlaybackProgress();

  if (!currentSong) return null;
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View style={styles.shell}>
      <View style={styles.progressTrack}>
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/player')} style={styles.info}>
          <TrackArtwork song={currentSong} size={46} radius={11} />
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>{currentSong.name}</Text>
            <Text numberOfLines={1} style={styles.artist}>{artistNames(currentSong)}</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => void togglePlayback()}
          style={styles.control}
        >
          {isBuffering || isLoadingTrack
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color={colors.textStrong} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={() => void next()} style={styles.control}>
          <Ionicons name="play-skip-forward" size={21} color={colors.textStrong} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: 'rgba(10,10,10,0.98)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  progressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  progress: { height: 2, backgroundColor: colors.accent },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  copy: { flex: 1, marginLeft: 10, minWidth: 0 },
  title: { color: colors.text, fontWeight: '700', fontSize: 14 },
  artist: { color: colors.muted, fontSize: 12, marginTop: 2 },
  control: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
});

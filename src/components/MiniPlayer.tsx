import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';

export const MINI_PLAYER_HEIGHT = 64;

export function MiniPlayer() {
  const {
    currentSong,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    togglePlayback,
    next,
    position,
    duration,
  } = usePlayer();

  if (!currentSong) return null;
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View style={styles.shell}>
      <View style={styles.progressTrack}>
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/player')} style={styles.info}>
          <TrackArtwork song={currentSong} size={46} radius={9} />
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
            : <Text style={styles.controlText}>{isPlaying ? 'Ⅱ' : '▶'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={() => void next()} style={styles.control}>
          <Text style={styles.nextText}>›|</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: '#151515',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2A',
  },
  progressTrack: { height: 2, backgroundColor: '#252525' },
  progress: { height: 2, backgroundColor: '#F2F2F2' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  copy: { flex: 1, marginLeft: 10, minWidth: 0 },
  title: { color: '#F5F5F5', fontWeight: '700', fontSize: 14 },
  artist: { color: '#8D8D8D', fontSize: 12, marginTop: 2 },
  control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controlText: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  nextText: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: -3 },
});

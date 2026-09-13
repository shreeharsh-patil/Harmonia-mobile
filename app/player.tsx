import { useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { albumName, artistNames, durationLabel } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';

export default function PlayerScreen() {
  const {
    currentSong,
    isPlaying,
    isBuffering,
    isLoadingTrack,
    position,
    duration,
    error,
    togglePlayback,
    previous,
    next,
    seek,
  } = usePlayer();
  const [progressWidth, setProgressWidth] = useState(1);

  if (!currentSong) {
    return (
      <SafeAreaView style={styles.empty}>
        <Pressable onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>⌄</Text></Pressable>
        <Text style={styles.emptyTitle}>Nothing playing</Text>
        <Text style={styles.emptyBody}>Play a song from Home, Search or your Library.</Text>
      </SafeAreaView>
    );
  }

  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  const onProgressLayout = (event: LayoutChangeEvent) => setProgressWidth(event.nativeEvent.layout.width);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.roundButton}>
          <Text style={styles.down}>⌄</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.playingFrom}>NOW PLAYING</Text>
          <Text numberOfLines={1} style={styles.album}>{albumName(currentSong) || 'Harmonia'}</Text>
        </View>
        <View style={styles.roundButton}><Text style={styles.more}>•••</Text></View>
      </View>

      <View style={styles.artworkWrap}>
        <TrackArtwork song={currentSong} size={330} radius={24} style={styles.artwork} />
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

      <View style={styles.footer}>
        <Pressable onPress={() => void seek(Math.max(0, position - 10))} style={styles.secondary}>
          <Text style={styles.secondaryText}>−10</Text>
        </Pressable>
        <Text style={styles.device}>HARMONIA • THIS PHONE</Text>
        <Pressable onPress={() => void seek(Math.min(duration, position + 10))} style={styles.secondary}>
          <Text style={styles.secondaryText}>+10</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090909', paddingHorizontal: 22 },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  down: { color: '#FFF', fontSize: 26, marginTop: -7 },
  more: { color: '#D8D8D8', fontSize: 16, letterSpacing: 2 },
  headerCopy: { alignItems: 'center', flex: 1, paddingHorizontal: 12 },
  playingFrom: { color: '#656565', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  album: { color: '#CFCFCF', fontSize: 12, fontWeight: '700', marginTop: 3, maxWidth: 190 },
  artworkWrap: { flex: 1, minHeight: 330, justifyContent: 'center', alignItems: 'center' },
  artwork: { maxWidth: '100%' },
  meta: { paddingTop: 14 },
  title: { color: '#FFF', fontSize: 25, fontWeight: '800', letterSpacing: -0.7 },
  artist: { color: '#969696', fontSize: 16, marginTop: 5 },
  timeline: { paddingTop: 28 },
  track: { height: 18, justifyContent: 'center' },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#F4F4F4', left: 0 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF', marginLeft: -6 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  time: { color: '#717171', fontSize: 11, fontVariant: ['tabular-nums'] },
  error: { color: '#FF7777', textAlign: 'center', marginTop: 10, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34, paddingVertical: 28 },
  skip: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFF', fontSize: 31, fontWeight: '700', letterSpacing: -5 },
  play: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#080808', fontSize: 29, fontWeight: '900' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  secondary: { width: 46, height: 38, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#A0A0A0', fontWeight: '700', fontSize: 13 },
  device: { color: '#575757', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  empty: { flex: 1, backgroundColor: '#090909', alignItems: 'center', justifyContent: 'center', padding: 24 },
  close: { position: 'absolute', top: 56, left: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFF', fontSize: 28 },
  emptyTitle: { color: '#FFF', fontSize: 25, fontWeight: '800' },
  emptyBody: { color: '#888', fontSize: 15, marginTop: 8, textAlign: 'center' },
});

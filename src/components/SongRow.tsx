import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import type { Song } from '@/src/types';

export function SongRow({
  song,
  onPress,
  active = false,
  trailing,
}: {
  song: Song;
  onPress: () => void;
  active?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <TrackArtwork song={song} size={52} radius={10} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, active && styles.active]}>{song.name}</Text>
        <Text numberOfLines={1} style={styles.artist}>{artistNames(song)}</Text>
      </View>
      {trailing ?? <Text style={styles.play}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0, marginLeft: 12 },
  title: { color: '#ECECEC', fontSize: 15, fontWeight: '700' },
  active: { color: '#FFF' },
  artist: { color: '#777', fontSize: 13, marginTop: 4 },
  play: { color: '#676767', fontSize: 26, paddingHorizontal: 8 },
  pressed: { opacity: 0.65 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import type { Song } from '@/src/types';

export function SongRow({
  song,
  onPress,
  active = false,
  trailing,
  onMorePress,
}: {
  song: Song;
  onPress: () => void;
  active?: boolean;
  trailing?: React.ReactNode;
  onMorePress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <TrackArtwork song={song} size={52} radius={10} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, active && styles.active]}>{song.name}</Text>
        <Text numberOfLines={1} style={styles.artist}>{artistNames(song)}</Text>
      </View>
      {trailing}
      {onMorePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${song.name}`}
          onPress={(event) => {
            event.stopPropagation();
            onMorePress();
          }}
          hitSlop={6}
          style={styles.more}
        >
          <Text style={styles.moreText}>•••</Text>
        </Pressable>
      ) : trailing == null ? <Text style={styles.play}>›</Text> : null}
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
  more: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#888', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  pressed: { opacity: 0.65 },
});

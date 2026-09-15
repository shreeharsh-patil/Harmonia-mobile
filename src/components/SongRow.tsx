import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.name || 'song'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
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
          <Ionicons name="ellipsis-horizontal" size={21} color="#A3A3A3" />
        </Pressable>
      ) : trailing == null ? <Ionicons name="chevron-forward" size={18} color="#6F6F6F" style={styles.play} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0, marginLeft: 12 },
  title: { color: '#ECECEC', fontSize: 15, fontWeight: '700' },
  active: { color: '#A78BFA' },
  artist: { color: '#8A8A8A', fontSize: 13, marginTop: 4 },
  play: { marginHorizontal: 10 },
  more: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});

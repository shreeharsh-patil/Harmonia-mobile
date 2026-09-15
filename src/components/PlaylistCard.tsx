import { Pressable, StyleSheet, Text } from 'react-native';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import type { Playlist } from '@/src/types';

export function PlaylistCard({
  playlist,
  onPress,
  size = 148,
}: {
  playlist: Playlist;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width: size }, pressed && styles.pressed]}
    >
      <PlaylistArtwork playlist={playlist} size={size} radius={16} />
      <Text numberOfLines={1} style={styles.title}>{playlist.name || playlist.title || 'Playlist'}</Text>
      <Text numberOfLines={1} style={styles.subtitle}>
        {playlist.subtitle || playlist.owner || (playlist.songCount ? `${playlist.songCount} songs` : 'Harmonia')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginRight: 14 },
  title: { color: '#F3F3F3', fontSize: 14, fontWeight: '700', marginTop: 9 },
  subtitle: { color: '#777', fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});

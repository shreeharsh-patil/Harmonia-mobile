import { Pressable, StyleSheet, Text } from 'react-native';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import type { Playlist } from '@/src/types';

export function PlaylistCard({
  playlist,
  onPress,
  size = 140,
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
      <PlaylistArtwork playlist={playlist} size={size} radius={8} />
      <Text numberOfLines={1} style={styles.title}>
        {playlist.name || playlist.title || 'Playlist'}
      </Text>
      {!!(playlist.songCount || playlist.subtitle || playlist.owner) && (
        <Text numberOfLines={1} style={styles.subtitle}>
          {playlist.songCount
            ? `${playlist.songCount} songs`
            : playlist.subtitle || playlist.owner}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginRight: 16 },
  title: {
    color: '#E8E8E8',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 9,
    paddingHorizontal: 1,
  },
  subtitle: {
    color: '#808080',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    marginTop: 2,
    paddingHorizontal: 1,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});

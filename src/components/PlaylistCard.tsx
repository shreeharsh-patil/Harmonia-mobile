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
  const name = playlist.name || playlist.title || 'Playlist';
  const songCount = Number(playlist.songCount || 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width: size }, pressed && styles.pressed]}
    >
      <PlaylistArtwork playlist={playlist} size={size} radius={8} />
      <Text numberOfLines={1} style={styles.title}>
        {name}
      </Text>
      {!!(playlist.songCount || playlist.subtitle || playlist.owner) && (
        <Text numberOfLines={1} style={styles.subtitle}>
          {songCount
            ? `${songCount} ${songCount === 1 ? 'song' : 'songs'}`
            : playlist.subtitle || playlist.owner}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginRight: 14 },
  title: {
    color: '#E8E8E8',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 9,
    paddingHorizontal: 1,
  },
  subtitle: {
    color: '#8B8B8B',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
    paddingHorizontal: 1,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});

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
  const songCount = Math.max(Number(playlist.songCount || 0), playlist.songIds?.length || 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width: size }, pressed && styles.pressed]}
    >
      <PlaylistArtwork playlist={playlist} size={size} radius={12} />
      <Text numberOfLines={1} style={styles.title}>
        {name}
      </Text>
      {!!(songCount || playlist.subtitle || playlist.owner) && (
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
  card: { marginRight: 14, borderRadius: 16 },
  title: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 9,
    paddingHorizontal: 1,
  },
  subtitle: {
    color: '#A2A2A2',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    marginTop: 2,
    paddingHorizontal: 1,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
});

import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  const { width } = useWindowDimensions();
  const name = playlist.name || playlist.title || 'Playlist';
  const songCount = Math.max(Number(playlist.songCount || 0), playlist.songIds?.length || 0);

  // Keep Home playlist rails dense like Harmonia Web on mobile: roughly three
  // complete covers remain visible at once, while still honoring smaller sizes.
  const responsiveSize = Math.max(108, Math.floor((width - 54) / 3));
  const cardSize = Math.min(size, responsiveSize);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width: cardSize }, pressed && styles.pressed]}
    >
      <View style={styles.artworkWrap}>
        <PlaylistArtwork playlist={playlist} size={cardSize} radius={8} />
      </View>

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
  card: {
    marginRight: 14,
    borderRadius: 10,
  },
  artworkWrap: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#181818',
  },
  title: {
    color: '#E6E8EE',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 10,
    paddingHorizontal: 1,
  },
  subtitle: {
    color: '#9B9B9B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 3,
    paddingHorizontal: 1,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
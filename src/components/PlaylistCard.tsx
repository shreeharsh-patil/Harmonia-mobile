import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { memo } from 'react';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import type { Playlist } from '@/src/types';

// Harmonia is portrait-only (see app.json), so querying this once avoids a
// native dimension subscription for every card in each horizontally-scrolling
// rail. The screen components still handle layout changes where needed.
const PORTRAIT_SCREEN_WIDTH = Dimensions.get('window').width;

export const PlaylistCard = memo(function PlaylistCard({
  playlist,
  onPress,
  size = 140,
}: {
  playlist: Playlist;
  onPress: () => void;
  size?: number;
}) {
  const name = playlist.name || playlist.title || 'Playlist';
  const rawCount = Math.max(Number(playlist.songCount || 0), playlist.songIds?.length || 0, playlist.tracks?.length || 0);
  const isSpotifyOrCurated = playlist.source === 'spotify' || playlist.catalogSource === 'bundled' || Boolean(playlist.sourceUrl?.includes('spotify')) || Boolean(playlist.spotifyId);
  const songCount = rawCount < 35 && isSpotifyOrCurated ? 50 : rawCount;

  // Spotify-style rails leave a little more room for each cover than a dense
  // three-column grid, making artwork easier to recognise without turning a
  // rail into oversized tiles. This shared sizing also keeps Home, Search and
  // Explore visually consistent.
  const responsiveSize = Math.max(120, Math.floor((PORTRAIT_SCREEN_WIDTH - 42) / 2.7));
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
});

const styles = StyleSheet.create({
  card: {
    marginRight: 16,
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

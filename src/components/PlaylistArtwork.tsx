import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { Playlist } from '@/src/types';

function playlistArtwork(playlist: Playlist) {
  const image = playlist.image;
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && image.length) {
    const sorted = [...image].sort((a, b) => {
      const score = (value?: string) => Number(String(value || '').match(/\d+/)?.[0] || 0);
      return score(b.quality) - score(a.quality);
    });
    return sorted[0]?.url || '';
  }
  return '';
}

export function PlaylistArtwork({
  playlist,
  size,
  radius = 16,
}: {
  playlist: Playlist;
  size: number;
  radius?: number;
}) {
  const url = playlistArtwork(playlist);
  if (!url) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
        <Text style={[styles.icon, { fontSize: size * 0.25 }]}>♫</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#151515' }}
      contentFit="cover"
      transition={140}
      cachePolicy="memory-disk"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#171717',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: '#6F6F6F', fontWeight: '800' },
});

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { artworkUrl, bestArtworkUrl, normalizeArtworkUrl, normalizeSong } from '@/src/lib/song';
import type { Playlist, Song } from '@/src/types';

function isPlaceholderArtwork(url: string) {
  const normalized = String(url || '').trim().toLowerCase();
  return !normalized ||
    normalized.endsWith('/default-playlist-image.png') ||
    normalized.startsWith('data:image/svg+xml');
}

function playlistArtwork(playlist: Playlist, targetSize: number) {
  const raw = playlist as any;
  for (const field of [
    raw.spotifyImages,
    raw.image,
    raw.images,
    raw.cover,
    raw.coverUrl,
    raw.coverImage,
    raw.thumbnail,
    raw.thumbnailUrl,
    raw.artwork,
    raw.imageUrl,
  ]) {
    const url = bestArtworkUrl(field, targetSize);
    if (url && !isPlaceholderArtwork(url)) return url;
  }

  // Web Harmonia derives a playlist cover from its tracks when the stored
  // playlist image is missing/default. Do the same on mobile.
  const tracks = [
    ...(Array.isArray(raw.tracks) ? raw.tracks : []),
    ...(Array.isArray(raw.songs) ? raw.songs : []),
    ...(Array.isArray(raw.sourceTracks) ? raw.sourceTracks : []),
  ] as Song[];

  for (const track of tracks) {
    const url = artworkUrl(normalizeSong(track as any), targetSize);
    if (url) return normalizeArtworkUrl(url);
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
  const url = playlistArtwork(playlist, size);
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

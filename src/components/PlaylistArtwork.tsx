import { memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { artworkUrl, bestArtworkUrl, normalizeArtworkUrl, normalizeSong } from '@/src/lib/song';
import type { Playlist, Song } from '@/src/types';

function isPlaceholderArtwork(url: string) {
  const normalized = String(url || '').trim().toLowerCase();
  return !normalized ||
    normalized.endsWith('/default-playlist-image.png') ||
    normalized.endsWith('/def-playlist-image.jpg') ||
    normalized.startsWith('data:image/svg+xml');
}

export function playlistArtworkUrl(playlist: Playlist, targetSize: number, extraTracks?: Song[]) {
  const raw = playlist as any;
  for (const field of [
    // Match the web client's shared artwork resolver: an explicit Spotify
    // image is the canonical identity, before provider/catalog artwork.
    raw.spotifyImages,
    raw.spotifyImage,
    raw.image,
    raw.images,
    raw.collageImages,
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
    ...(Array.isArray(extraTracks) ? extraTracks : []),
    ...(Array.isArray(raw.tracks) ? raw.tracks : []),
    ...(Array.isArray(raw.songs) ? raw.songs : []),
    ...(Array.isArray(raw.sourceTracks) ? raw.sourceTracks : []),
  ] as Song[];

  for (const track of tracks) {
    const url = artworkUrl(normalizeSong(track as any), targetSize);
    if (url && !isPlaceholderArtwork(url)) return normalizeArtworkUrl(url);
  }

  return '';
}

export function getPlaylistCollageUrls(playlist: Playlist, extraTracks?: Song[]): string[] {
  const raw = playlist as any;
  if (Array.isArray(raw.collageImages) && raw.collageImages.length >= 4) {
    const valid = raw.collageImages.filter((u: any) => typeof u === 'string' && !isPlaceholderArtwork(u));
    if (valid.length >= 4) return valid.slice(0, 4);
  }

  const tracks = [
    ...(Array.isArray(extraTracks) ? extraTracks : []),
    ...(Array.isArray(raw.tracks) ? raw.tracks : []),
    ...(Array.isArray(raw.songs) ? raw.songs : []),
    ...(Array.isArray(raw.sourceTracks) ? raw.sourceTracks : []),
  ] as Song[];

  const seen = new Set<string>();
  const tiles: string[] = [];

  for (const track of tracks) {
    const url = artworkUrl(normalizeSong(track as any), 300);
    if (!url || isPlaceholderArtwork(url) || seen.has(url)) continue;
    seen.add(url);
    tiles.push(url);
    if (tiles.length === 4) break;
  }

  return tiles;
}

export const PlaylistArtwork = memo(function PlaylistArtwork({
  playlist,
  size,
  radius = 16,
  tracks,
}: {
  playlist: Playlist;
  size: number;
  radius?: number;
  tracks?: Song[];
}) {
  const raw = playlist as any;
  const singleUrl = playlistArtworkUrl(playlist, size, tracks);
  const collageTiles = useMemo(() => getPlaylistCollageUrls(playlist, tracks), [playlist, tracks]);
  // Spotify changes the CDN URL when a playlist cover is updated. Keep those
  // covers out of the long-lived disk cache, so the next Home refresh paints
  // the provider's newest thumbnail instead of an earlier catalog image.
  const isSpotifyPlaylist = String(raw.source || raw.sourceType || '').toLowerCase().includes('spotify') ||
    String(raw.sourceUrl || '').includes('open.spotify.com/playlist/');
  const artworkCachePolicy = isSpotifyPlaylist ? 'memory' : 'memory-disk';

  // If a collage of 4 unique images is available and there is no dedicated high-res cover
  const showCollage = !singleUrl && collageTiles.length >= 4;

  if (showCollage) {
    const half = Math.floor(size / 2);
    return (
      <View
        style={[
          styles.collageContainer,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <View style={styles.collageRow}>
          <Image
            source={{ uri: collageTiles[0] }}
            style={{ width: half, height: half }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={String(raw?._id || playlist.id || collageTiles[0])}
          />
          <Image
            source={{ uri: collageTiles[1] }}
            style={{ width: half, height: half }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={String(raw?._id || playlist.id || collageTiles[1])}
          />
        </View>
        <View style={styles.collageRow}>
          <Image
            source={{ uri: collageTiles[2] }}
            style={{ width: half, height: half }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={String(raw?._id || playlist.id || collageTiles[2])}
          />
          <Image
            source={{ uri: collageTiles[3] }}
            style={{ width: half, height: half }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={String(raw?._id || playlist.id || collageTiles[3])}
          />
        </View>
      </View>
    );
  }

  if (!singleUrl) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
        <Text style={[styles.icon, { fontSize: size * 0.25 }]}>♫</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: singleUrl }}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#151515' }}
      contentFit="cover"
      transition={140}
      cachePolicy={artworkCachePolicy}
      recyclingKey={singleUrl}
    />
  );
});

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#171717',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: '#6F6F6F', fontWeight: '800' },
  collageContainer: {
    overflow: 'hidden',
    backgroundColor: '#151515',
    flexDirection: 'column',
  },
  collageRow: {
    flexDirection: 'row',
  },
});

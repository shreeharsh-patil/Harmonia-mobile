import { bestArtworkUrl } from '@/src/lib/song';
import type { HarmoniaAlbum, HarmoniaArtistEntity, HarmoniaImage, Playlist } from '@/src/types';

export function imageUrl(
  value?: HarmoniaImage[] | string | { url?: string; width?: number; height?: number }[] | null,
  targetSize = 0
) {
  return bestArtworkUrl(value, targetSize);
}

/**
 * Resolve artwork for catalog entities while preserving Spotify artwork as the
 * preferred identity image. Songs and playlists already do this; albums and
 * artists use this helper so their cards behave the same way.
 */
export function entityImageUrl(entity: unknown, targetSize = 0) {
  if (!entity || typeof entity !== 'object') return '';
  const raw = entity as Record<string, unknown>;

  for (const field of [
    raw.spotifyImages,
    raw.spotifyImage,
    raw.images,
    raw.image,
    raw.cover,
    raw.coverUrl,
    raw.coverImage,
    raw.thumbnail,
    raw.thumbnailUrl,
  ]) {
    const url = bestArtworkUrl(field, targetSize);
    if (url) return url;
  }

  return '';
}

export function albumTitle(album?: HarmoniaAlbum | null) {
  return String(album?.name || album?.title || 'Album');
}

export function artistTitle(artist?: HarmoniaArtistEntity | null) {
  return String(artist?.name || artist?.title || 'Artist');
}

export function playlistTitle(playlist?: Playlist | null) {
  return String(playlist?.name || playlist?.title || 'Playlist');
}

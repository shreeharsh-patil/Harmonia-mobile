import { bestArtworkUrl } from '@/src/lib/song';
import type { HarmoniaAlbum, HarmoniaArtistEntity, HarmoniaImage, Playlist } from '@/src/types';

export function imageUrl(
  value?: HarmoniaImage[] | string | Array<{ url?: string; width?: number; height?: number }> | null,
  targetSize = 0
) {
  return bestArtworkUrl(value, targetSize);
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

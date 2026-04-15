import type { HarmoniaAlbum, HarmoniaArtistEntity, HarmoniaImage, Playlist } from '@/src/types';

export function imageUrl(value?: HarmoniaImage[] | string | Array<{ url?: string }> | null) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value) || !value.length) return '';
  const ranked = [...value].sort((a: any, b: any) => {
    const size = (item: any) => Number(String(item?.quality || item?.width || '').match(/\d+/)?.[0] || 0);
    return size(b) - size(a);
  });
  return String((ranked[0] as any)?.url || '');
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

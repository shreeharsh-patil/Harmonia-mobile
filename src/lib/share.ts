import { Share } from 'react-native';
import { albumTitle, artistTitle, playlistTitle } from '@/src/lib/entities';
import { artistNames } from '@/src/lib/song';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, Song } from '@/src/types';

type SpotifyKind = 'track' | 'album' | 'artist' | 'playlist';

function publicSpotifyUrl(kind: SpotifyKind, entity: Record<string, unknown>) {
  const explicitUrl = String(
    entity.sourceUrl || entity.source_url || entity.spotifyUrl || entity.externalUrl || ''
  ).trim();

  try {
    const parsed = new URL(explicitUrl);
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'open.spotify.com' &&
      parsed.pathname.startsWith(`/${kind}/`)
    ) {
      return parsed.toString();
    }
  } catch {
    // An absent or malformed source URL is not shared.
  }

  const spotifyId = String(entity.spotifyId || '').trim();
  return spotifyId
    ? `https://open.spotify.com/${kind}/${encodeURIComponent(spotifyId)}`
    : undefined;
}

function shareMessage(title: string, subtitle?: string, url?: string) {
  return [subtitle ? `${title} — ${subtitle}` : title, url].filter(Boolean).join('\n');
}

export async function shareSong(song: Song) {
  const title = song.name || song.title || 'Song';
  const artist = artistNames(song);
  const url = publicSpotifyUrl('track', song as Record<string, unknown>);
  await Share.share({ title, message: shareMessage(title, artist, url) });
}

export async function shareAlbum(album: HarmoniaAlbum) {
  const title = albumTitle(album);
  await Share.share({
    title,
    message: shareMessage(title, undefined, publicSpotifyUrl('album', album)),
  });
}

export async function shareArtist(artist: HarmoniaArtistEntity) {
  const title = artistTitle(artist);
  await Share.share({
    title,
    message: shareMessage(title, undefined, publicSpotifyUrl('artist', artist)),
  });
}

export async function sharePlaylist(playlist: Playlist) {
  const title = playlistTitle(playlist);
  await Share.share({
    title,
    message: shareMessage(title, undefined, publicSpotifyUrl('playlist', playlist)),
  });
}

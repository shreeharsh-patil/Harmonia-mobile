import { Share } from 'react-native';
import { albumTitle, artistTitle, playlistTitle } from '@/src/lib/entities';
import { artistNames } from '@/src/lib/song';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, Song } from '@/src/types';

type SpotifyKind = 'track' | 'album' | 'artist' | 'playlist';

const HARMONIA_SHARE_SCHEME = 'harmonia://share/song';

function cleanShareText(value: unknown, limit: number) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function harmoniaSongUrl(song: Song, mode: 'song' | 'lyrics' = 'song') {
  const raw = song as Record<string, unknown>;
  const id = cleanShareText(raw.id || raw.songId || raw.sourceId || raw.spotifyId, 180);
  const title = cleanShareText(song.name || song.title, 120);
  const artist = cleanShareText(artistNames(song), 160);
  const params = [
    `mode=${encodeURIComponent(mode)}`,
    title ? `title=${encodeURIComponent(title)}` : '',
    artist ? `artist=${encodeURIComponent(artist)}` : '',
  ].filter(Boolean).join('&');

  // This is deliberately an app link, never a stream, backend, or provider
  // URL. The recipient returns directly to Harmonia when it is installed.
  return `${HARMONIA_SHARE_SCHEME}/${encodeURIComponent(id || 'unknown')}?${params}`;
}

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
  const title = cleanShareText(song.name || song.title || 'Song', 120);
  const artist = cleanShareText(artistNames(song), 160);
  await Share.share({
    title: `Listen to ${title} on Harmonia`,
    message: [
      'HARMONIA',
      `🎵 ${title}`,
      artist,
      'Listen in Harmonia',
      harmoniaSongUrl(song),
    ].filter(Boolean).join('\n'),
  });
}

export async function shareLyrics(song: Song, lyric?: string | null) {
  const title = cleanShareText(song.name || song.title || 'Song', 120);
  const artist = cleanShareText(artistNames(song), 160);
  const line = cleanShareText(lyric, 280);
  await Share.share({
    title: `Lyrics from ${title}`,
    message: [
      'HARMONIA LYRICS',
      line ? `“${line}”` : `Lyrics from ${title}`,
      `— ${title}${artist ? ` · ${artist}` : ''}`,
      'Open in Harmonia',
      harmoniaSongUrl(song, 'lyrics'),
    ].filter(Boolean).join('\n'),
  });
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

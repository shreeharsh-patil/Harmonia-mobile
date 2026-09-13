import type { HarmoniaArtist, HarmoniaImage, Song } from '@/src/types';

function decode(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function normalizeSong(input: Record<string, any>): Song {
  const id = String(input.id || input.songId || input.sourceId || input.videoId || '');
  const name = decode(String(input.name || input.songName || input.title || 'Unknown track'));

  let artists = input.artists;
  if (Array.isArray(artists)) {
    artists = { primary: artists };
  }

  return {
    ...input,
    id,
    songId: id,
    name,
    title: input.title || name,
    artists,
  } as Song;
}

export function artistNames(song?: Song | null) {
  if (!song) return 'Unknown artist';

  const artists = song.artists;
  if (Array.isArray(artists)) {
    const names = artists.map((artist: HarmoniaArtist) => artist?.name).filter(Boolean);
    if (names.length) return names.join(', ');
  }

  if (artists && !Array.isArray(artists) && Array.isArray(artists.primary)) {
    const names = artists.primary.map((artist: HarmoniaArtist) => artist?.name).filter(Boolean);
    if (names.length) return names.join(', ');
  }

  return decode(String(song.primaryArtists || song.artist || 'Unknown artist'));
}

function pickImage(images?: HarmoniaImage[] | string) {
  if (!images) return '';
  if (typeof images === 'string') return images;
  if (!Array.isArray(images) || images.length === 0) return '';

  const ranked = [...images].sort((a, b) => {
    const number = (value?: string) => Number(String(value || '').match(/\d+/)?.[0] || 0);
    return number(b.quality) - number(a.quality);
  });
  return ranked[0]?.url || '';
}

export function artworkUrl(song?: Song | null) {
  if (!song) return '';
  const direct = pickImage(song.image);
  if (direct) return direct;
  if (song.cover) return String(song.cover);
  if (Array.isArray(song.spotifyImages) && song.spotifyImages.length) {
    return song.spotifyImages[0]?.url || '';
  }
  if (song.album && typeof song.album === 'object') {
    return pickImage(song.album.image);
  }
  return '';
}

export function albumName(song?: Song | null) {
  if (!song?.album) return '';
  if (typeof song.album === 'string') return decode(song.album);
  return decode(String(song.album.name || song.album.title || ''));
}

export function durationLabel(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const TEMPORARY_STREAM_FIELDS = new Set([
  'downloadUrl',
  'streamUrl',
  'stream_url',
  'audioUrl',
  'audio_url',
  'mediaUrl',
  'media_url',
  'playbackUrl',
  'resolvedUrl',
  'signedUrl',
]);

const TEMPORARY_STREAM_HOSTS = ['googlevideo.com', 'saavncdn.com'];

export function isTemporaryStreamUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return false;
  if (/^(blob:|data:audio\/)/i.test(value)) return true;

  try {
    const parsed = new URL(value, 'https://harmonia.local');
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return TEMPORARY_STREAM_HOSTS.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`)
    ) ||
      /\.(mp3|m4a|mp4|aac|ogg|opus|webm|flac|wav)$/i.test(path) ||
      path.includes('/api/yt-stream') ||
      path.includes('/api/stream-track') ||
      path.includes('/api/proxy/audio') ||
      path.includes('/api/stream') ||
      parsed.searchParams.has('expire') ||
      parsed.searchParams.has('expires') ||
      parsed.searchParams.has('expiresAt') ||
      parsed.searchParams.has('signature') ||
      parsed.searchParams.has('sig') ||
      parsed.searchParams.has('token');
  } catch {
    return false;
  }
}

export function persistenceSafeSong(song: Song): Song {
  if (!song || typeof song !== 'object') return song;

  const stable: Record<string, any> = {};
  for (const [key, value] of Object.entries(song as Record<string, any>)) {
    if (TEMPORARY_STREAM_FIELDS.has(key)) continue;
    if (key === 'url' && isTemporaryStreamUrl(value)) continue;
    stable[key] = value;
  }

  return stable as Song;
}

export function persistenceSafeQueue(queue: Song[]) {
  return Array.isArray(queue)
    ? queue.map(persistenceSafeSong).filter((song) => Boolean(song?.id))
    : [];
}

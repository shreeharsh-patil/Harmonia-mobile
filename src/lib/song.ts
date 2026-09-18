import type { HarmoniaArtist, Song } from '@/src/types';

function decode(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function normalizeArtist(value: any): HarmoniaArtist | null {
  if (typeof value === 'string') {
    const name = decode(value);
    return name ? { name } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const name = decode(String(value.name || value.title || ''));
  return name ? { ...value, name } as HarmoniaArtist : null;
}

function normalizeArtistArray(values: any[]) {
  return values.map(normalizeArtist).filter(Boolean) as HarmoniaArtist[];
}

export function normalizeSong(input: Record<string, any>): Song {
  const id = String(
    input.id ||
    input.songId ||
    input.sourceId ||
    input._id ||
    input.spotifyId ||
    input.saavnId ||
    input.jiosaavnId ||
    input.videoId ||
    input.youtubeId ||
    ''
  );
  const name = decode(String(input.name || input.songName || input.title || 'Unknown track'));

  let artists = input.artists;
  if (Array.isArray(artists)) {
    artists = { primary: normalizeArtistArray(artists) };
  } else if (artists && typeof artists === 'object' && Array.isArray(artists.primary)) {
    artists = { ...artists, primary: normalizeArtistArray(artists.primary) };
  }

  return {
    ...input,
    id,
    songId: String(input.songId || id),
    name,
    title: decode(String(input.title || name)),
    artists,
  } as Song;
}

export function artistNames(song?: Song | null) {
  if (!song) return 'Unknown artist';

  const nameOf = (artist: any) =>
    decode(typeof artist === 'string' ? artist : String(artist?.name || artist?.title || ''));

  const artists = song.artists;
  if (Array.isArray(artists)) {
    const names = artists.map(nameOf).filter(Boolean);
    if (names.length) return names.join(', ');
  }

  if (artists && !Array.isArray(artists) && Array.isArray(artists.primary)) {
    const names = artists.primary.map(nameOf).filter(Boolean);
    if (names.length) return names.join(', ');
  }

  return decode(String(song.primaryArtists || song.artist || 'Unknown artist'));
}

export function normalizeArtworkUrl(value: unknown) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  const normalized = trimmed
    .replace(/^http:\/\//i, 'https://')
    .replace(
      /^https:\/\/image-cdn-[^.]+\.spotifycdn\.com\/image\//i,
      'https://i.scdn.co/image/'
    );

  // A catalog image may occasionally contain an upstream HTML error body
  // instead of a URL. Do not pass it to expo-image as an artwork source.
  if (/[<>\r\n]/.test(normalized)) return '';
  if (/^(https?|file|content):\/\/\S+$/i.test(normalized)) return normalized;
  if (/^data:image\//i.test(normalized)) return normalized;
  return '';
}

function imageScore(image: any) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || width || 0);
  if (width && height) return width * height;

  const quality = String(image?.quality || '').toLowerCase();
  const dimensions = quality.match(/(\d{2,4})\s*x\s*(\d{2,4})/);
  if (dimensions) return Number(dimensions[1]) * Number(dimensions[2]);

  const number = Number(quality.replace(/\D/g, ''));
  return Number.isFinite(number) ? number : 0;
}

export function bestArtworkUrl(value: any, targetSize = 0) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeArtworkUrl(value);

  const values = Array.isArray(value) ? value : [value];
  const candidates = values
    .map((image: any) => {
      if (typeof image === 'string') return { url: normalizeArtworkUrl(image) };
      if (!image || typeof image !== 'object') return null;
      const url = image.url || image.src || image.link || image.href;
      const normalized = normalizeArtworkUrl(url);
      return normalized ? { ...image, url: normalized } : null;
    })
    .filter(Boolean) as any[];

  if (!candidates.length) return '';

  const sorted = [...candidates].sort((a, b) => imageScore(a) - imageScore(b));
  if (targetSize > 0) {
    const targetArea = targetSize * targetSize;
    return (sorted.find((image) => imageScore(image) >= targetArea) || sorted[sorted.length - 1]).url;
  }
  return sorted[sorted.length - 1].url;
}

export function artworkUrl(song?: Song | null, targetSize = 0) {
  if (!song) return '';
  const raw = song as any;

  // Match Harmonia Web priority: Spotify identity artwork first, then provider
  // artwork, album artwork, and finally legacy/fallback fields.
  const spotify = bestArtworkUrl(raw.spotifyImages, targetSize);
  if (spotify) return spotify;

  for (const field of [raw.image, raw.images]) {
    const direct = bestArtworkUrl(field, targetSize);
    if (direct) return direct;
  }

  if (raw.album && typeof raw.album === 'object') {
    for (const field of [
      raw.album.image,
      raw.album.images,
      raw.album.cover,
      raw.album.coverArt,
      raw.album.cover_image,
    ]) {
      const albumArtwork = bestArtworkUrl(field, targetSize);
      if (albumArtwork) return albumArtwork;
    }
  }

  for (const field of [
    raw.cover,
    raw.coverUrl,
    raw.coverImage,
    raw.thumbnail,
    raw.thumbnailUrl,
    raw.thumbnails,
    raw.artwork,
    raw.albumArt,
    raw.imageUrl,
    raw.img,
    raw.picture,
    raw.more_info?.image,
    raw.more_info?.thumbnail,
  ]) {
    const fallback = bestArtworkUrl(field, targetSize);
    if (fallback) return fallback;
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

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

export function persistenceSafeSong(song: Song): Song {
  const {
    downloadUrl: _downloadUrl,
    streamUrl: _streamUrl,
    stream_url: _streamUrl2,
    audioUrl: _audioUrl,
    audio_url: _audioUrl2,
    mediaUrl: _mediaUrl,
    media_url: _mediaUrl2,
    playbackUrl: _playbackUrl,
    resolvedUrl: _resolvedUrl,
    signedUrl: _signedUrl,
    ...stable
  } = song as Record<string, any>;

  if (typeof stable.url === 'string' && /(?:googlevideo|saavncdn|\/api\/(?:yt-stream|stream|proxy\/audio))/i.test(stable.url)) {
    delete stable.url;
  }

  return stable as Song;
}

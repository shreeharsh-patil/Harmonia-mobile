import type { HarmoniaImage, Playlist, Song } from '@/src/types';
import { normalizeSong } from '@/src/lib/song';
import {
  searchDirectJioSaavn,
  type DirectSaavnSearchTrack,
  type DirectSaavnTrack,
} from '@/src/lib/playback/jiosaavnDirect';

function directTrackToSong(track: DirectSaavnTrack | DirectSaavnSearchTrack): Song {
  return normalizeSong({
    id: track.id,
    songId: track.id,
    sourceId: track.id,
    saavnId: track.id,
    name: track.title,
    title: track.title,
    artist: track.artists.join(', '),
    primaryArtists: track.artists.join(', '),
    album: track.album || undefined,
    duration: track.duration || undefined,
    image: track.image ? [{ quality: '500x500', url: track.image }] : [],
    downloadUrl: 'candidates' in track ? track.candidates : [],
    source: 'jiosaavn',
    provider: 'jiosaavn',
  } as any);
}

export function parseSpotifyId(urlOrId?: string | null): { type: 'playlist' | 'album' | 'track'; id: string } | null {
  if (!urlOrId) return null;
  const str = String(urlOrId).trim();

  // Spotify URI format: spotify:playlist:xxx, spotify:album:xxx, spotify:track:xxx
  const uriMatch = str.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]{15,35})/i);
  if (uriMatch) {
    return { type: uriMatch[1].toLowerCase() as any, id: uriMatch[2] };
  }

  // Spotify Web URL format
  const webMatch = str.match(
    /spotify\.com\/(?:[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?\/|intl-[a-zA-Z]{2,4}\/)?(?:embed\/)?(playlist|album|track)\/([a-zA-Z0-9]{15,35})/i
  );
  if (webMatch) {
    return { type: webMatch[1].toLowerCase() as any, id: webMatch[2] };
  }

  // Raw alphanumeric Spotify ID
  if (/^[a-zA-Z0-9]{22}$/.test(str) || str.startsWith('37i9dQ')) {
    return { type: 'playlist', id: str };
  }

  return null;
}

function decodeHtmlEntities(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function splitArtists(artistData: any): { name: string }[] {
  if (!artistData) return [{ name: 'Unknown Artist' }];
  const artists: { name: string }[] = [];
  const rawList = Array.isArray(artistData) ? artistData : [artistData];
  rawList.forEach((item) => {
    const decoded = decodeHtmlEntities(typeof item === 'string' ? item : item.name || '');
    const parts = decoded.split(/\s*&\s*|\s*,\s*|\s+feat\.\s+|\s+ft\.\s+/i);
    parts.forEach((p) => {
      const clean = p.trim();
      if (clean.length > 0) artists.push({ name: clean });
    });
  });
  return artists.length > 0 ? artists : [{ name: 'Unknown Artist' }];
}

export function normalizeSpotifyImages(...values: any[]): HarmoniaImage[] {
  const candidates = values.flatMap((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.sources)) return value.sources;
    return [value];
  });
  const seen = new Set<string>();

  const images: { url: string; width?: number; height?: number }[] = [];
  for (const image of candidates) {
    const url = typeof image === 'string'
      ? image
      : image?.url || image?.src || image?.link || '';
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const width = Number(image?.width || image?.maxWidth || 0);
    const height = Number(image?.height || image?.maxHeight || width || 0);
    images.push({
      url: String(url).replace(/^http:\/\//i, 'https://'),
      width: width || undefined,
      height: height || undefined,
    });
  }

  images.sort((a, b) => ((a.width || 0) * (a.height || 0)) - ((b.width || 0) * (b.height || 0)));

  return images.map((image, index) => ({
    quality: images.length === 1 || index === images.length - 1
      ? '500x500'
      : index === 0
        ? '50x50'
        : '150x150',
    url: image.url,
  }));
}

export const trackArtworkCache = new Map<string, string>();

export async function resolveTrackArtwork(
  trackId: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (!trackId) return null;
  const cleanId = trackId.startsWith('spotify:track:')
    ? trackId.split(':')[2]
    : trackId;
  const cached = trackArtworkCache.get(cleanId);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${encodeURIComponent(cleanId)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: signal || AbortSignal.timeout(3500),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const thumb = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null;
    if (thumb) {
      trackArtworkCache.set(cleanId, thumb);
      return thumb;
    }
  } catch {}
  return null;
}

const SPOTIFY_OEMBED_CONCURRENCY = 6;

/**
 * Resolve artwork for a list of Spotify track IDs with a worker pool (matching Harmonia Web client).
 */
export async function getSpotifyTrackArtworkMap(
  trackIds: string[],
  signal?: AbortSignal
): Promise<Map<string, HarmoniaImage[]>> {
  const uniqueIds = [...new Set((trackIds || []).filter(Boolean))];
  const artworkById = new Map<string, HarmoniaImage[]>();
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(SPOTIFY_OEMBED_CONCURRENCY, uniqueIds.length) },
    async () => {
      while (cursor < uniqueIds.length) {
        if (signal?.aborted) break;
        const trackId = uniqueIds[cursor++];
        const cleanId = trackId.startsWith('spotify:track:') ? trackId.split(':')[2] : trackId;
        const thumb = await resolveTrackArtwork(cleanId, signal);
        if (thumb) {
          const images = normalizeSpotifyImages(thumb);
          artworkById.set(trackId, images);
          artworkById.set(cleanId, images);
        }
      }
    }
  );

  await Promise.all(workers);
  return artworkById;
}

/**
 * Web client's canonical artwork validator (matches lib/playlist-track-resolution.js):
 * Detects if any artwork is missing or if multiple tracks share the identical
 * cover URL (which indicates an accidental playlist-cover fallback).
 * Automatically resolves missing or duplicated covers using Spotify's official oEmbed.
 */
export async function ensureCanonicalSpotifyArtwork(
  tracks: Song[],
  signal?: AbortSignal
): Promise<Song[]> {
  const artworkUsage = new Map<string, Set<string>>();

  for (const track of tracks) {
    const raw = track as any;
    const images = raw.spotifyImages || raw.image || [];
    const artworkUrl = images[images.length - 1]?.url || images[0]?.url;
    if (!artworkUrl) continue;
    const ids = artworkUsage.get(artworkUrl) || new Set<string>();
    ids.add(String(track.spotifyId || track.id));
    artworkUsage.set(artworkUrl, ids);
  }

  const idsToResolve = tracks
    .filter((track) => {
      const raw = track as any;
      const images = raw.spotifyImages || raw.image || [];
      const artworkUrl = images[images.length - 1]?.url || images[0]?.url;
      return !artworkUrl || (artworkUsage.get(artworkUrl)?.size || 0) > 1;
    })
    .map((track) => String(track.spotifyId || track.id));

  if (idsToResolve.length === 0) return tracks;

  const artworkById = await getSpotifyTrackArtworkMap(idsToResolve, signal);
  return tracks.map((track) => {
    const sid = String(track.spotifyId || track.id);
    const images = artworkById.get(sid);
    if (images && images.length) {
      return {
        ...track,
        image: images,
        spotifyImages: images,
      };
    }
    return track;
  });
}

export interface DirectSpotifyPlaylistResult {
  details: {
    id: string;
    name: string;
    description?: string;
    image: HarmoniaImage[];
    owner?: string;
    totalTracks: number;
  };
  tracks: Song[];
}

export async function fetchDirectSpotifyPlaylist(
  idOrUrl: string,
  signal?: AbortSignal
): Promise<DirectSpotifyPlaylistResult | null> {
  const parsed = parseSpotifyId(idOrUrl);
  const spotifyId = parsed ? parsed.id : idOrUrl;
  if (!spotifyId) return null;

  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(spotifyId)}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: signal || AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;

    const nextData = JSON.parse(match[1]);
    const pageProps = nextData.props?.pageProps;
    if (!pageProps || pageProps.status === 404) return null;

    const entity = pageProps.state?.data?.entity || pageProps.data?.entity || pageProps.entity;
    if (!entity) return null;

    const playlistImages = normalizeSpotifyImages(
      entity.visualIdentity?.image,
      entity.coverArt?.sources,
      entity.images,
      entity.image
    );

    const rawTrackList: any[] = Array.isArray(entity.trackList) ? entity.trackList : [];

    const tracks: Song[] = rawTrackList.map((t, idx) => {
      const uri = String(t.uri || '');
      const trackId = uri.startsWith('spotify:track:') ? uri.split(':')[2] : String(t.id || `spotify-${idx}`);
      let artists = splitArtists(t.subtitle || t.artists || 'Unknown Artist');
      const trackTitle = decodeHtmlEntities(t.title || t.name || 'Unknown Track');
      const cachedArt = trackArtworkCache.get(trackId);
      const trackImages = normalizeSpotifyImages(
        t.visualIdentity?.image,
        t.coverArt?.sources,
        t.images,
        t.image,
        cachedArt ? [{ url: cachedArt }] : []
      );

      return normalizeSong({
        id: trackId,
        spotifyId: trackId,
        name: trackTitle,
        title: trackTitle,
        primaryArtists: artists.map((a) => a.name).join(', '),
        artists: { primary: artists },
        duration: Math.round(Number(t.duration || 0) / 1000) || 0,
        image: trackImages,
        source: 'spotify',
        downloadUrl: t.audioPreview?.url ? [{ quality: '320kbps', url: t.audioPreview.url }] : [],
      });
    }).filter((t) => Boolean(t.name && t.name !== 'Unknown Track'));

    const resolvedTracks = await ensureCanonicalSpotifyArtwork(tracks, signal);

    return {
      details: {
        id: spotifyId,
        name: decodeHtmlEntities(entity.name || entity.title || 'Spotify Playlist'),
        description: decodeHtmlEntities(entity.description || (entity.subtitle ? `By ${entity.subtitle}` : undefined)),
        image: playlistImages,
        owner: entity.subtitle || entity.owner?.name,
        totalTracks: resolvedTracks.length,
      },
      tracks: resolvedTracks,
    };
  } catch {
    return null;
  }
}

/**
 * Ensures any playlist has at least `targetMin` (default 30) songs by:
 * 1. Scraping direct Spotify embed tracks if it's a Spotify playlist or has a Spotify ID/URL.
 * 2. Augmenting with search results from JioSaavn if the playlist has fewer than targetMin songs.
 */
export async function populateSpotifyPlaylistSongs(
  playlist: Playlist,
  existingSongs: Song[] = [],
  targetMin = 30
): Promise<Song[]> {
  const current = [...existingSongs];
  const seenIds = new Set(current.map((s) => String(s.id)));
  const seenKeys = new Set(
    current.map((s) => `${(s.name || '').toLowerCase()}|${(s.primaryArtists || '').toLowerCase()}`)
  );

  const id = String(playlist.id || playlist._id || '').trim();
  const sourceUrl = String(playlist.sourceUrl || (playlist as any).source_url || (playlist as any).spotifyUrl || '');

  // 1. If we have fewer than targetMin and it has a Spotify identifier, fetch direct Spotify tracks
  if (current.length < targetMin) {
    const parsed = parseSpotifyId(sourceUrl || id);
    if (parsed && parsed.type === 'playlist') {
      const directSpotify = await fetchDirectSpotifyPlaylist(parsed.id);
      if (directSpotify?.tracks?.length) {
        for (const track of directSpotify.tracks) {
          const key = `${(track.name || '').toLowerCase()}|${(track.primaryArtists || '').toLowerCase()}`;
          if (!seenIds.has(String(track.id)) && !seenKeys.has(key)) {
            seenIds.add(String(track.id));
            seenKeys.add(key);
            current.push(track);
          }
        }
      }
    }
  }

  // 2. If still fewer than targetMin songs, search popular/trending tracks by playlist title or genre
  if (current.length < targetMin) {
    const query = String(playlist.name || playlist.title || '').trim();
    if (query) {
      const searchResults = await searchDirectJioSaavn(query, { limit: targetMin * 2 });
      for (const track of searchResults) {
        const song = directTrackToSong(track);
        const key = `${(song.name || '').toLowerCase()}|${(song.primaryArtists || '').toLowerCase()}`;
        if (!seenIds.has(String(song.id)) && !seenKeys.has(key)) {
          seenIds.add(String(song.id));
          seenKeys.add(key);
          current.push(song);
          if (current.length >= targetMin) break;
        }
      }
    }
  }

  return current;
}

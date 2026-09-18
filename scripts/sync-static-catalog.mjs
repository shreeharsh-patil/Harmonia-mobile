import { gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const OWNER = 'shreeharsh-patil';
const REPO = 'Harmonia-Spotify-Downloader';
const REF = process.env.HARMONIA_CATALOG_GITHUB_REF || 'main';
const CATALOG_PATH = 'web-app/harmonia-webclient/data/music-feed-static.json.gz';
const DEFAULT_PUBLIC_SOURCE =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}/${CATALOG_PATH}`;
const DEFAULT_PRIVATE_SOURCE =
  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CATALOG_PATH}?ref=${encodeURIComponent(REF)}`;
const DEFAULT_LOCAL_SOURCE = path.join(
  process.cwd(),
  'Harmonia-Spotify-Downloader-main',
  ...CATALOG_PATH.split('/')
);

const token = String(process.env.HARMONIA_CATALOG_GITHUB_TOKEN || '').trim();
const configuredSourceUrl = String(process.env.HARMONIA_CATALOG_SOURCE_URL || '').trim();
const configuredLocalSource = String(process.env.HARMONIA_CATALOG_SOURCE_PATH || '').trim();
const localSourcePath = configuredLocalSource
  ? path.resolve(configuredLocalSource)
  : DEFAULT_LOCAL_SOURCE;
const sourceUrl = configuredSourceUrl || (token ? DEFAULT_PRIVATE_SOURCE : DEFAULT_PUBLIC_SOURCE);
const required = process.argv.includes('--required');
const outputPath = path.join(process.cwd(), 'assets', 'catalog', 'harmonia-catalog.json');

function hasUsableCheckedInCatalog() {
  if (!existsSync(outputPath)) return false;
  try {
    const snapshot = JSON.parse(readFileSync(outputPath, 'utf8'));
    return Array.isArray(snapshot?.sections) && snapshot.sections.length > 0;
  } catch {
    return false;
  }
}

function text(value) {
  return String(value || '').trim();
}

function imageArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string'
        ? { quality: 'default', url: item }
        : item?.url ? { quality: item.quality || 'default', url: item.url } : null)
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [{ quality: 'default', url: value.trim() }];
  }
  return [];
}

function artistNames(raw) {
  const primary = raw?.artists?.primary;
  if (Array.isArray(primary) && primary.length) {
    return primary
      .map((item) => typeof item === 'string' ? item : item?.name)
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(raw?.artists) && raw.artists.length) {
    return raw.artists
      .map((item) => typeof item === 'string' ? item : item?.name)
      .filter(Boolean)
      .join(', ');
  }
  return text(raw?.primaryArtists || raw?.artist || raw?.subtitle);
}

function compactSong(raw, providerId, spotifyId) {
  const id = text(providerId || raw?.sourceId || raw?.saavnId || raw?.id);
  if (!id) return null;

  const image = imageArray(raw?.image);
  const cover = text(raw?.cover || raw?.coverImage || raw?.thumbnail || image.at(-1)?.url);
  const primaryArtists = artistNames(raw);
  const album = typeof raw?.album === 'string'
    ? { name: raw.album }
    : raw?.album && typeof raw.album === 'object'
      ? {
          id: text(raw.album.id),
          name: text(raw.album.name || raw.album.title),
          image: imageArray(raw.album.image),
        }
      : undefined;

  return {
    id,
    sourceId: id,
    saavnId: id,
    ...(spotifyId ? { spotifyId, spotifyTrackId: spotifyId } : {}),
    name: text(raw?.name || raw?.title) || 'Untitled Track',
    ...(primaryArtists ? { primaryArtists } : {}),
    ...(raw?.artists ? { artists: raw.artists } : {}),
    ...(album?.name ? { album } : {}),
    ...(image.length ? { image } : {}),
    ...(cover ? { cover } : {}),
    duration: Number(raw?.duration || (raw?.duration_ms ? Math.round(raw.duration_ms / 1000) : 0)) || 0,
    language: text(raw?.language),
    playCount: Number(raw?.playCount || raw?.play_count || 0) || 0,
    source: text(raw?.source) || 'jiosaavn',
  };
}

function spotifyId(value) {
  const id = text(value);
  return /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
}

let compressed = null;
let snapshotSource = sourceUrl;

if (!configuredSourceUrl && existsSync(localSourcePath)) {
  compressed = readFileSync(localSourcePath);
  snapshotSource = path.relative(process.cwd(), localSourcePath).replaceAll('\\', '/');
  console.log(`[catalog] using local source ${snapshotSource}`);
} else {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: token ? 'application/vnd.github.raw+json' : 'application/octet-stream',
      'User-Agent': 'Harmonia-Mobile-Catalog-Sync/1.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.ok) {
    compressed = Buffer.from(await response.arrayBuffer());
  } else {
    const hint = response.status === 404 && !token
      ? ' The source repository is private; configure HARMONIA_CATALOG_GITHUB_TOKEN with read-only Contents access.'
      : '';
    const message = `Catalog download failed: HTTP ${response.status}.${hint}`;
    if (required && !hasUsableCheckedInCatalog()) throw new Error(message);
    console.warn(`[catalog] ${message} Keeping the checked-in catalog asset.`);
  }
}

if (compressed) {
  const parsed = JSON.parse(gunzipSync(compressed).toString('utf8').replace(/^\uFEFF/, ''));
  const rawSections = Array.isArray(parsed?.data?.sections)
    ? parsed.data.sections
    : Array.isArray(parsed?.sections)
      ? parsed.sections
      : Array.isArray(parsed)
        ? parsed
        : [];

  const globalSpotifyToProvider = new Map();
  for (const section of rawSections) {
    for (const playlist of section?.playlists || []) {
      const trackMap = playlist?.trackMap || {};
      for (const [sid, pid] of Object.entries(trackMap instanceof Map ? Object.fromEntries(trackMap) : trackMap)) {
        if (spotifyId(sid) && text(pid)) globalSpotifyToProvider.set(sid, text(pid));
      }
    }
  }

  const songMap = new Map();
  let playlistCount = 0;

  const sections = rawSections.map((section) => {
    const playlists = (section?.playlists || []).map((playlist) => {
      const localTrackMap = playlist?.trackMap instanceof Map
        ? Object.fromEntries(playlist.trackMap)
        : (playlist?.trackMap || {});

      const resolveId = (value) => {
        const rawId = text(value);
        if (!rawId) return '';
        return spotifyId(rawId)
          ? text(localTrackMap[rawId] || globalSpotifyToProvider.get(rawId))
          : rawId;
      };

      const resolvedSongIds = [];
      const seenIds = new Set();
      const addId = (value) => {
        const resolved = resolveId(value);
        if (resolved && !seenIds.has(resolved)) {
          seenIds.add(resolved);
          resolvedSongIds.push(resolved);
        }
        return resolved;
      };

      for (const rawId of playlist?.songIds || []) addId(rawId);

      const candidates = [
        ...(Array.isArray(playlist?.songs) ? playlist.songs : []),
        ...(Array.isArray(playlist?.tracks) ? playlist.tracks : []),
      ];

      for (const rawSong of candidates) {
        const rawId = text(rawSong?.id || rawSong?.sourceId || rawSong?.saavnId);
        const sid = spotifyId(rawSong?.spotifyId || rawSong?.spotifyTrackId || rawId);
        const providerId = addId(
          rawSong?.sourceId ||
          rawSong?.saavnId ||
          (sid ? localTrackMap[sid] || globalSpotifyToProvider.get(sid) : rawId)
        );
        if (!providerId) continue;

        const compact = compactSong(rawSong, providerId, sid || undefined);
        if (!compact) continue;

        const current = songMap.get(providerId);
        if (!current) {
          songMap.set(providerId, compact);
        } else {
          if (!current.primaryArtists && compact.primaryArtists) current.primaryArtists = compact.primaryArtists;
          if ((!current.image || current.image.length === 0) && compact.image?.length) current.image = compact.image;
          if (!current.cover && compact.cover) current.cover = compact.cover;
          if (!current.album?.name && compact.album?.name) current.album = compact.album;
          if (!current.spotifyId && compact.spotifyId) {
            current.spotifyId = compact.spotifyId;
            current.spotifyTrackId = compact.spotifyTrackId;
          }
        }
      }

      playlistCount += 1;
      const spotifyImages = imageArray(playlist?.spotifyImages);
      const image = imageArray(playlist?.image);
      return {
        id: text(playlist?._id || playlist?.id),
        _id: text(playlist?._id || playlist?.id),
        name: text(playlist?.name || playlist?.title) || 'Untitled Playlist',
        description: text(playlist?.description),
        image: image.length ? image : spotifyImages,
        ...(spotifyImages.length ? { spotifyImages } : {}),
        songCount: Number(playlist?.songCount || resolvedSongIds.length || candidates.length || 0) || 0,
        songIds: resolvedSongIds,
        source: text(playlist?.source) || 'spotify',
        catalogSource: 'bundled',
        sourceUrl: text(playlist?.sourceUrl),
        collageImages: Array.isArray(playlist?.collageImages)
          ? playlist.collageImages.filter(Boolean).map(String)
          : [],
      };
    }).filter((playlist) => playlist.id && playlist.name);

    return {
      id: text(section?._id || section?.id),
      _id: text(section?._id || section?.id),
      name: text(section?.name) || 'Music',
      genreId: text(section?.genreId),
      genreName: text(section?.genreName),
      playlists,
    };
  }).filter((section) => section.id && section.playlists.length > 0);

  const snapshot = {
    schemaVersion: 1,
    source: 'Harmonia-Spotify-Downloader',
    sourceUrl: snapshotSource,
    generatedAt: new Date().toISOString(),
    stats: {
      sections: sections.length,
      playlists: playlistCount,
      songs: songMap.size,
    },
    sections,
    songs: [...songMap.values()],
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(snapshot));
  console.log(
    `[catalog] synced ${snapshot.stats.sections} sections, ${snapshot.stats.playlists} playlists, ${snapshot.stats.songs} songs -> ${path.relative(process.cwd(), outputPath)}`
  );
}

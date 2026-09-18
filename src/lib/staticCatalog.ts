import type {
  HarmoniaAlbum,
  HarmoniaArtistEntity,
  MusicSection,
  Playlist,
  SearchPayload,
  Song,
} from '@/src/types';

type StaticCatalogSnapshot = {
  schemaVersion: number;
  source?: string;
  generatedAt?: string | null;
  stats?: { sections?: number; playlists?: number; songs?: number };
  sections?: (MusicSection & { genreId?: string; genreName?: string })[];
  songs?: Song[];
};

type StaticCatalogIndex = {
  snapshot: StaticCatalogSnapshot;
  sections: (MusicSection & { genreId?: string; genreName?: string })[];
  songs: Song[];
  songById: Map<string, Song>;
  playlistById: Map<string, Playlist>;
};

let catalogIndex: StaticCatalogIndex | null = null;

function getCatalogIndex(): StaticCatalogIndex {
  if (catalogIndex) return catalogIndex;

  // The checked-in fallback can contain thousands of playlists. Loading and
  // indexing it during module evaluation blocks the React Native JS thread on
  // every launch, even when the database feed is healthy. Parse it only when a
  // remote request actually needs the offline fallback.
  const snapshot = require('../../assets/catalog/harmonia-catalog.json') as StaticCatalogSnapshot;
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const songs = Array.isArray(snapshot.songs) ? snapshot.songs : [];
  const songById = new Map(
    songs
      .filter((song) => song?.id)
      .map((song) => [String(song.id), song] as const)
  );
  const playlistById = new Map<string, Playlist>();

  for (const section of sections) {
    for (const playlist of section.playlists || []) {
      const id = String(playlist.id || playlist._id || '').trim();
      if (id && !playlistById.has(id)) playlistById.set(id, playlist);
    }
  }

  catalogIndex = { snapshot, sections, songs, songById, playlistById };
  return catalogIndex;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleBase(value: unknown) {
  return normalizeText(
    String(value || '')
      .replace(/\s*\(?\[?\s*from\s+.+?[\)\]]/gi, '')
      .replace(/\s+-\s+from\s+.+$/i, '')
  );
}

function artistText(song: Song) {
  if (song.primaryArtists) return song.primaryArtists;
  if (song.artist) return song.artist;
  if (Array.isArray(song.artists)) {
    return song.artists.map((artist) => artist?.name).filter(Boolean).join(', ');
  }
  if (Array.isArray(song.artists?.primary)) {
    return song.artists.primary.map((artist) => artist?.name).filter(Boolean).join(', ');
  }
  return '';
}

function albumName(song: Song) {
  return typeof song.album === 'string'
    ? song.album
    : String(song.album?.name || song.album?.title || '');
}

function scoreSong(song: Song, query: string) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  if (!queryTokens.length) return 0;

  const rawTitle = song.name || song.title || '';
  const normalizedTitle = normalizeText(rawTitle);
  const baseTitle = titleBase(rawTitle);
  const artists = normalizeText(artistText(song));
  const album = normalizeText(albumName(song));

  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 1000;
  else if (baseTitle === normalizedQuery) score += 950;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 750;
  else if (normalizedTitle.includes(normalizedQuery)) score += 550;

  const combined = new Set(
    [normalizedTitle, baseTitle, artists, album]
      .join(' ')
      .split(' ')
      .filter(Boolean)
  );
  const hits = queryTokens.filter((token) => combined.has(token)).length;
  if (hits === queryTokens.length) score += 420;
  else if (hits > 0) score += (hits / queryTokens.length) * 220;

  if (artists === normalizedQuery) score += 500;
  else if (artists.includes(normalizedQuery)) score += 180;

  if (album === normalizedQuery) score += 260;
  else if (album.includes(normalizedQuery)) score += 90;

  const popularity = Math.log10(Math.max(1, Number(song.playCount || 0)));
  return score + Math.min(popularity * 4, 40);
}

function scorePlaylist(playlist: Playlist, query: string) {
  const normalizedQuery = normalizeText(query);
  const name = normalizeText(playlist.name || playlist.title);
  const description = normalizeText(playlist.description);
  if (!normalizedQuery || !name) return 0;

  let score = 0;
  if (name === normalizedQuery) score += 1000;
  else if (name.startsWith(normalizedQuery)) score += 700;
  else if (name.includes(normalizedQuery)) score += 500;
  if (description.includes(normalizedQuery)) score += 120;
  return score;
}

function deriveAlbums(matchedSongs: Song[], query: string, limit: number): HarmoniaAlbum[] {
  const normalizedQuery = normalizeText(query);
  const seen = new Set<string>();
  const result: HarmoniaAlbum[] = [];

  for (const song of matchedSongs) {
    const album = typeof song.album === 'object' && song.album ? song.album : null;
    const name = albumName(song);
    const identity = String(album?.id || normalizeText(name));
    if (!identity || !name || seen.has(identity)) continue;
    if (!normalizeText(name).includes(normalizedQuery)) continue;
    seen.add(identity);
    result.push({
      ...(album || {}),
      id: album?.id || identity,
      name,
      title: name,
      image: album?.image || song.image,
      primaryArtists: artistText(song),
      type: 'album',
    });
    if (result.length >= limit) break;
  }
  return result;
}

function deriveArtists(matchedSongs: Song[], query: string, limit: number): HarmoniaArtistEntity[] {
  const normalizedQuery = normalizeText(query);
  const seen = new Set<string>();
  const result: HarmoniaArtistEntity[] = [];

  for (const song of matchedSongs) {
    const rawArtists: { id?: string; name: string; image?: any }[] = Array.isArray(song.artists)
      ? song.artists
      : Array.isArray(song.artists?.primary)
        ? song.artists.primary
        : artistText(song).split(',').map((name) => ({ name: name.trim() }));

    for (const artist of rawArtists) {
      const name = String(artist?.name || '').trim();
      const normalized = normalizeText(name);
      if (!name || !normalized || seen.has(normalized) || !normalized.includes(normalizedQuery)) continue;
      seen.add(normalized);
      result.push({
        id: artist?.id || normalized,
        name,
        title: name,
        image: artist?.image || song.image,
        type: 'artist',
      });
      if (result.length >= limit) return result;
    }
  }
  return result;
}

export function hasBundledCatalog() {
  const { sections, songs } = getCatalogIndex();
  return sections.length > 0 && songs.length > 0;
}

export function getStaticCatalogStats() {
  const { snapshot, sections, playlistById, songById } = getCatalogIndex();
  return {
    generatedAt: snapshot.generatedAt || null,
    sections: sections.length,
    playlists: playlistById.size,
    songs: songById.size,
  };
}

export function getStaticHomeSections(): MusicSection[] {
  const { sections } = getCatalogIndex();
  if (!sections.length) return [];
  return sections.filter((section) => Boolean(section?.playlists && section.playlists.length > 0));
}

export function findStaticPlaylist(id: string): Playlist | null {
  const { playlistById, songById } = getCatalogIndex();
  const cleanId = String(id || '').trim();
  const playlist = playlistById.get(cleanId);
  if (!playlist) return null;

  const tracks = (playlist.songIds || [])
    .map((songId) => songById.get(String(songId)))
    .filter(Boolean) as Song[];

  return {
    ...playlist,
    id: String(playlist.id || playlist._id || cleanId),
    _id: String(playlist._id || playlist.id || cleanId),
    tracks,
    songCount: Number(playlist.songCount || playlist.songIds?.length || tracks.length || 0),
    catalogSource: 'bundled',
  };
}

export function getStaticSongs(ids: string[]) {
  const { songById } = getCatalogIndex();
  return ids
    .map((id) => songById.get(String(id)))
    .filter(Boolean) as Song[];
}

export function searchStaticCatalog(query: string, limit = 30): SearchPayload {
  const { songs, playlistById } = getCatalogIndex();
  const cleanQuery = String(query || '').trim();
  const empty = { total: 0, start: 0, results: [] };
  if (!cleanQuery || !songs.length) {
    return {
      topQuery: empty,
      songs: empty,
      albums: empty,
      artists: empty,
      playlists: empty,
    } as SearchPayload;
  }

  const rankedSongs = songs
    .map((song) => ({ song, score: scoreSong(song, cleanQuery) }))
    .filter((item) => item.score > 100)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.song);

  const rankedPlaylists = [...playlistById.values()]
    .map((playlist) => ({ playlist, score: scorePlaylist(playlist, cleanQuery) }))
    .filter((item) => item.score > 100)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(20, limit))
    .map((item) => item.playlist);

  const albums = deriveAlbums(rankedSongs, cleanQuery, Math.min(20, limit));
  const artists = deriveArtists(rankedSongs, cleanQuery, Math.min(20, limit));

  const exactSong = rankedSongs.find(
    (song) => titleBase(song.name || song.title) === normalizeText(cleanQuery)
  );

  const topResult = exactSong || rankedSongs[0] || artists[0] || albums[0] || rankedPlaylists[0];

  return {
    topQuery: {
      total: topResult ? 1 : 0,
      start: 0,
      results: topResult ? [topResult] : [],
    },
    songs: { total: rankedSongs.length, start: 0, results: rankedSongs },
    albums: { total: albums.length, start: 0, results: albums },
    artists: { total: artists.length, start: 0, results: artists },
    playlists: { total: rankedPlaylists.length, start: 0, results: rankedPlaylists },
  };
}

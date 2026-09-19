import type { MusicSection, Playlist } from '@/src/types';

const HOME_SHELF_SPECS = [
  { label: 'Popular Hindi Playlists', title: 'popular hindi playlists', genre: 'hindi' },
  { label: 'New & Trending', title: 'new trending', genre: 'hindi' },
  { label: 'Bollywood Romance', title: 'bollywood romance' },
  { label: '90s Love & Nostalgia', title: 'popular 90s playlists', genre: 'decades' },
  { label: 'Chill & Sad', title: 'chill sad' },
  { label: 'Popular Punjabi Playlists', title: 'popular punjabi playlists', genre: 'punjabi' },
  { label: 'Popular Telugu Playlists', title: 'popular telugu playlists', genre: 'telugu' },
  { label: 'Popular Party Playlists', title: 'popular party playlists', genre: 'hindi' },
  { label: 'Dance & Electronic', title: 'popular dance electronic playlists', genre: 'dance electronic' },
  { label: 'English Top Hits', title: 'top hits', genre: 'english' },
  { label: 'English New & Trending', title: 'new trending', genre: 'english' },
  { label: 'Global Pop Hits', title: 'pop hits', genre: 'english' },
  { label: 'Pop Essentials', title: 'all things pop', genre: 'pop' },
] as const;

function shelfKey(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Home intentionally shows a concise, music-first collection instead of all
 * bundled catalog sections. These shelves mirror the curated Hindi, English,
 * romance, chill, party, and pop rows supplied with Harmonia's Spotify feed.
 */
export function selectHomeShelves(sections: MusicSection[] = []) {
  const used = new Set<MusicSection>();

  return HOME_SHELF_SPECS.flatMap((spec) => {
    const desiredGenre = 'genre' in spec ? spec.genre : '';
    const candidates = sections
      .filter((section) => !used.has(section) && shelfKey(section.name) === spec.title)
      .sort((a, b) => {
        const aGenre = desiredGenre !== '' && shelfKey((a as any).genreName) === desiredGenre ? 1 : 0;
        const bGenre = desiredGenre !== '' && shelfKey((b as any).genreName) === desiredGenre ? 1 : 0;
        return bGenre - aGenre || (b.playlists?.length || 0) - (a.playlists?.length || 0);
      });
    const chosen = candidates[0];
    if (!chosen) return [];
    used.add(chosen);
    const reversePopularPlaylists = spec.label.toLowerCase().startsWith('popular ');
    return [{
      ...chosen,
      name: spec.label,
      playlists: reversePopularPlaylists ? [...(chosen.playlists || [])].reverse() : chosen.playlists,
    }];
  });
}

function isSpotifyPlaylist(playlist: Playlist) {
  const raw = playlist as any;
  const source = String(
    playlist.source || raw.sourceType || raw.provider || ''
  ).toLowerCase();
  const sourceUrl = String(
    raw.sourceUrl || raw.source_url || raw.spotifyUrl || ''
  ).toLowerCase();
  const images = [
    ...(Array.isArray(playlist.image) ? playlist.image : []),
    ...(Array.isArray(raw.spotifyImages) ? raw.spotifyImages : []),
  ];
  const hasSpotifyImage = images.some((img: any) =>
    typeof img?.url === 'string' && img.url.includes('scdn.co')
  );
  return source.includes('spotify') || sourceUrl.includes('open.spotify.com/playlist/') || hasSpotifyImage;
}

function parseTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function playlistFreshness(playlist: Playlist) {
  const raw = playlist as any;
  for (const value of [
    raw.updatedAt,
    raw.lastUpdated,
    raw.modifiedAt,
    raw.publishedAt,
    raw.releaseDate,
    raw.createdAt,
  ]) {
    const timestamp = parseTimestamp(value);
    if (timestamp > 0) return timestamp;
  }

  // Mongo ObjectIds encode their creation time in the first four bytes. The
  // current playlist feed does not expose createdAt, so this keeps newer DB
  // records ahead of old snapshot entries without guessing from their titles.
  const objectId = String(playlist._id || playlist.id || '').trim();
  if (/^[a-f0-9]{24}$/i.test(objectId)) {
    return Number.parseInt(objectId.slice(0, 8), 16) * 1000;
  }

  return 0;
}

export function latestHomePlaylists(sections: MusicSection[], limit = 20) {
  const seen = new Set<string>();
  const candidates: { playlist: Playlist; index: number; freshness: number }[] = [];
  let index = 0;

  for (const section of sections) {
    for (const playlist of section.playlists || []) {
      const id = String(playlist.id || playlist._id || '').trim();
      const name = String(playlist.name || playlist.title || '').trim().toLowerCase();
      const key = id || name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ playlist, index, freshness: playlistFreshness(playlist) });
      index += 1;
    }
  }

  return candidates
    .sort((a, b) => b.freshness - a.freshness || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ playlist }) => playlist);
}

function newestFirst(playlists: Playlist[]) {
  return playlists
    .map((playlist, index) => ({ playlist, index, freshness: playlistFreshness(playlist) }))
    .sort((a, b) => b.freshness - a.freshness || a.index - b.index)
    .map(({ playlist }) => playlist);
}

function mergeSpotifyPlaylists(primary: Playlist[], secondary: Playlist[], limit = 100) {
  const merged: Playlist[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const playlist of [...primary, ...secondary]) {
    const id = String(playlist.id || playlist._id || '').trim();
    const name = String(playlist.name || playlist.title || '').toLowerCase().trim();
    if ((id && seenIds.has(id)) || (name && seenNames.has(name))) continue;
    if (id) seenIds.add(id);
    if (name) seenNames.add(name);
    merged.push(playlist);
    if (merged.length >= limit) break;
  }

  return merged;
}

export function selectDatabaseSpotifySections(remote: MusicSection[] = []) {
  const selected = new Map<string, MusicSection>();

  for (const section of remote) {
    const id = String(section.id || section._id || '').trim();
    const name = String(section.name || '').trim();
    const key = name.toLowerCase() || id;
    if (!key) continue;

    const spotifyPlaylists = (section.playlists || []).filter(isSpotifyPlaylist);
    if (!spotifyPlaylists.length) continue;

    const current = selected.get(key);
    selected.set(key, {
      ...section,
      id: current?.id || section.id,
      _id: current?._id || section._id,
      name,
      playlists: newestFirst(mergeSpotifyPlaylists(
        current?.playlists || [],
        spotifyPlaylists,
        Number.MAX_SAFE_INTEGER
      )).slice(0, 100),
    });
  }

  return [...selected.values()];
}

function normalizeSectionKey(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/^english\s+/i, '')
    .replace(/\s*&\s*charts/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function mergeHomeSections(
  base: MusicSection[] = [],
  remote: MusicSection[] = []
): MusicSection[] {
  if (!remote.length) return base;
  if (!base.length) return remote;

  const remoteById = new Map<string, MusicSection>();
  const remoteByKey = new Map<string, MusicSection>();

  for (const sec of remote) {
    const id = String(sec.id || sec._id || '').trim();
    if (id) remoteById.set(id, sec);

    const key = normalizeSectionKey(sec.name);
    if (key) remoteByKey.set(key, sec);
  }

  const merged: MusicSection[] = [];
  const usedRemote = new Set<MusicSection>();

  for (const baseSec of base) {
    const id = String(baseSec.id || baseSec._id || '').trim();
    const key = normalizeSectionKey(baseSec.name);

    const remoteMatch =
      (id ? remoteById.get(id) : undefined) ||
      (key ? remoteByKey.get(key) : undefined);

    if (remoteMatch) {
      usedRemote.add(remoteMatch);
      merged.push({
        ...baseSec,
        id: remoteMatch.id || baseSec.id,
        _id: remoteMatch._id || baseSec._id,
        name: baseSec.name || remoteMatch.name,
        playlists: newestFirst(mergeSpotifyPlaylists(
          remoteMatch.playlists || [],
          baseSec.playlists || []
        )),
      });
    } else {
      merged.push({
        ...baseSec,
        playlists: newestFirst(baseSec.playlists || []),
      });
    }
  }

  for (const remoteSec of remote) {
    if (!usedRemote.has(remoteSec)) {
      merged.push(remoteSec);
    }
  }

  return merged;
}

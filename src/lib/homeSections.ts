import type { MusicSection, Playlist } from '@/src/types';

function playlistIdentity(playlist: Playlist) {
  return String(playlist.id || playlist._id || '').trim() ||
    String(playlist.name || playlist.title || '').trim().toLowerCase();
}

function isSpotifyPlaylist(playlist: Playlist) {
  const raw = playlist as any;
  const source = String(
    playlist.source || raw.sourceType || raw.provider || ''
  ).toLowerCase();
  const sourceUrl = String(
    raw.sourceUrl || raw.source_url || raw.spotifyUrl || ''
  ).toLowerCase();
  return source.includes('spotify') || sourceUrl.includes('open.spotify.com/playlist/');
}

function mergeSpotifyPlaylists(primary: Playlist[], secondary: Playlist[]) {
  const merged: Playlist[] = [];
  const seen = new Set<string>();

  for (const playlist of [...primary, ...secondary]) {
    const key = playlistIdentity(playlist);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(playlist);
    if (merged.length >= 100) break;
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
      playlists: mergeSpotifyPlaylists(
        current?.playlists || [],
        spotifyPlaylists
      ),
    });
  }

  return [...selected.values()];
}

import { Share } from 'react-native';
import { HARMONIA_API_URL } from '@/src/config';
import { albumTitle, artistTitle, playlistTitle } from '@/src/lib/entities';
import { artistNames } from '@/src/lib/song';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, Song } from '@/src/types';

function searchUrl(query: string) {
  return `${HARMONIA_API_URL}/music/search?query=${encodeURIComponent(query)}`;
}

export async function shareSong(song: Song) {
  const title = song.name || song.title || 'Song';
  const artist = artistNames(song);
  const url = song.spotifyId
    ? `https://open.spotify.com/track/${song.spotifyId}`
    : searchUrl([title, artist].filter(Boolean).join(' '));
  await Share.share({ title, message: `${title}${artist ? ` — ${artist}` : ''}\n${url}` });
}

export async function shareAlbum(album: HarmoniaAlbum) {
  const title = albumTitle(album);
  await Share.share({ title, message: `${title}\n${searchUrl(title)}` });
}

export async function shareArtist(artist: HarmoniaArtistEntity) {
  const title = artistTitle(artist);
  await Share.share({ title, message: `${title}\n${searchUrl(title)}` });
}

export async function sharePlaylist(playlist: Playlist) {
  const title = playlistTitle(playlist);
  const id = String(playlist._id || playlist.id || '');
  const url = id ? `${HARMONIA_API_URL}/music/playlists/${encodeURIComponent(id)}` : searchUrl(title);
  await Share.share({ title, message: `${title}\n${url}` });
}

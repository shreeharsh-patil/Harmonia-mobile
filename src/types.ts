export type HarmoniaImage = {
  quality?: string;
  url: string;
};

export type HarmoniaArtist = {
  id?: string;
  name: string;
  role?: string;
  image?: HarmoniaImage[];
};

export type HarmoniaAlbum = {
  id?: string;
  name?: string;
  title?: string;
  image?: HarmoniaImage[];
};

export type DownloadSource = {
  quality?: string;
  url: string;
  codec?: string;
  mimeType?: string;
};

export type Song = {
  id: string;
  name: string;
  title?: string;
  songId?: string;
  artists?: { primary?: HarmoniaArtist[] } | HarmoniaArtist[];
  primaryArtists?: string;
  artist?: string;
  album?: HarmoniaAlbum | string;
  duration?: number;
  image?: HarmoniaImage[] | string;
  cover?: string;
  spotifyImages?: Array<{ url: string; width?: number; height?: number }>;
  downloadUrl?: DownloadSource[];
  source?: string;
  provider?: string;
  videoId?: string;
  youtubeId?: string;
  language?: string;
  playCount?: number;
  releaseDate?: string;
  [key: string]: unknown;
};

export type Playlist = {
  id?: string;
  _id?: string;
  name: string;
  title?: string;
  image?: HarmoniaImage[] | string;
  description?: string;
  songCount?: number;
  songIds?: string[];
  tracks?: Song[];
  owner?: string;
  subtitle?: string;
  source?: string;
  [key: string]: unknown;
};

export type MusicSection = {
  id?: string;
  _id?: string;
  name: string;
  playlists: Playlist[];
};

export type HarmoniaUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string;
};

export type SearchCategory<T> = {
  total: number;
  start?: number;
  results: T[];
};

export type SearchPayload = {
  topQuery: SearchCategory<Song | Playlist>;
  songs: SearchCategory<Song>;
  albums: SearchCategory<Record<string, unknown>>;
  artists: SearchCategory<Record<string, unknown>>;
  playlists: SearchCategory<Playlist>;
};

export type LibraryPayload = {
  playlists: Playlist[];
  likedSongs: Song[];
  likedPlaylists: Playlist[];
};

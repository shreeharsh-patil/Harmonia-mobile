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
  image?: HarmoniaImage[] | string;
  artists?: { primary?: HarmoniaArtist[] } | HarmoniaArtist[];
  primaryArtists?: string;
  year?: string | number;
  releaseDate?: string;
  songCount?: number;
  songs?: Song[];
  type?: string;
  [key: string]: unknown;
};

export type HarmoniaArtistEntity = HarmoniaArtist & {
  title?: string;
  image?: HarmoniaImage[] | string;
  followerCount?: number | string;
  isVerified?: boolean;
  dominantLanguage?: string;
  dominantType?: string;
  topSongs?: Song[];
  songs?: Song[];
  albums?: HarmoniaAlbum[];
  type?: string;
  [key: string]: unknown;
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
  spotifyImages?: { url: string; width?: number; height?: number }[];
  downloadUrl?: DownloadSource[];
  source?: string;
  provider?: string;
  videoId?: string;
  youtubeId?: string;
  spotifyId?: string;
  spotifyUri?: string;
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
  spotifyId?: string;
  sourceUrl?: string;
  spotifyImages?: { url: string; width?: number; height?: number }[];
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
  topQuery: SearchCategory<Song | Playlist | HarmoniaAlbum | HarmoniaArtistEntity>;
  songs: SearchCategory<Song>;
  albums: SearchCategory<HarmoniaAlbum>;
  artists: SearchCategory<HarmoniaArtistEntity>;
  playlists: SearchCategory<Playlist>;
};

export type LibraryPayload = {
  playlists: Playlist[];
  likedSongs: Song[];
  likedPlaylists: Playlist[];
  likedAlbums: HarmoniaAlbum[];
  likedArtists: HarmoniaArtistEntity[];
};

export type RecommendedMix = Playlist & {
  _mixId?: string;
  mixIndex?: number;
  sourceType?: string;
  sourceId?: string | null;
  generatedAt?: string;
  expiresAt?: string;
};

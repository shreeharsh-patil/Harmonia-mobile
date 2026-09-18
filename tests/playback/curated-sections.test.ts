import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_SECTIONS_CACHE_KEY,
  CURATED_SECTIONS_CACHE_TTL_MS,
  chooseUniqueArtwork,
  clearCuratedSectionsMemoryCache,
  fetchLiveMusicSections,
  normalizeCuratedPlaylist,
  normalizeCuratedSections,
  normalizeImageUrls,
  playlistIdentity,
  readCuratedSectionsCache,
  saveCuratedSectionsCache,
} from '../../src/lib/curatedSections';

test('normalizeImageUrls extracts and normalizes URLs from strings, arrays, and objects', () => {
  assert.deepEqual(normalizeImageUrls('https://image-cdn-ak.spotifycdn.com/image/ab67706f00000002810d3464499e998c3faf8b9e'), [
    'https://i.scdn.co/image/ab67706f00000002810d3464499e998c3faf8b9e',
  ]);

  assert.deepEqual(
    normalizeImageUrls([
      'https://lineup-images.scdn.co/ab67706c0000da84f6357206f8b543f81fb11a59',
      { url: 'https://mosaic.scdn.co/300/ab67616d00001e0205043a74b708ade6d006ba0c' },
    ]),
    [
      'https://i.scdn.co/image/ab67706c0000bebbf6357206f8b543f81fb11a59',
      'https://mosaic.scdn.co/640/ab67616d0000b27305043a74b708ade6d006ba0c',
    ]
  );
});

test('playlistIdentity follows the priority: spotifyId -> sourceUrl -> _id -> id', () => {
  assert.equal(
    playlistIdentity({ spotifyId: 'spot-1', sourceUrl: 'https://spotify/p1', _id: 'mongo-1', id: 'id-1' }),
    'spot-1'
  );
  assert.equal(
    playlistIdentity({ sourceUrl: 'https://spotify/p1', _id: 'mongo-1', id: 'id-1' }),
    'https://spotify/p1'
  );
  assert.equal(
    playlistIdentity({ _id: 'mongo-1', id: 'id-1' }),
    'mongo-1'
  );
  assert.equal(
    playlistIdentity({ id: 'id-1' }),
    'id-1'
  );
});

test('chooseUniqueArtwork prevents duplicate thumbnails across playlists in a section', () => {
  const usedArtwork = new Set<string>();

  const playlistA = {
    image: 'https://i.scdn.co/image/art-1',
    images: ['https://i.scdn.co/image/art-alt-1'],
  };
  const playlistB = {
    image: 'https://i.scdn.co/image/art-1', // duplicate of A
    images: ['https://i.scdn.co/image/art-alt-2'],
  };
  const playlistC = {
    image: 'https://i.scdn.co/image/art-1', // duplicate of A
    images: ['https://i.scdn.co/image/art-alt-2'], // duplicate of B
  };

  const artA = chooseUniqueArtwork(playlistA, usedArtwork);
  const artB = chooseUniqueArtwork(playlistB, usedArtwork);
  const artC = chooseUniqueArtwork(playlistC, usedArtwork);

  assert.equal(artA, 'https://i.scdn.co/image/art-1');
  assert.equal(artB, 'https://i.scdn.co/image/art-alt-2');
  // When all candidates are exhausted, returns empty string so default artwork is used instead of another playlist's
  assert.equal(artC, '');
});

test('normalizeCuratedSections normalizes fields, removes section duplicates, and discards empty sections', () => {
  const rawSections = [
    {
      _id: 'sec-1',
      name: 'Bollywood Romance',
      genreId: 'genre-romance',
      genreName: 'Romance',
      order: 1,
      playlists: [
        {
          _id: 'p-1',
          spotifyId: 'spot-1',
          name: 'Romance Hindi',
          description: 'Top romance tracks',
          image: 'https://i.scdn.co/image/img-1',
          songIds: ['s1', 's2', 's3'],
          sourceType: 'spotify',
          sourceUrl: 'https://open.spotify.com/playlist/spot-1',
        },
        {
          _id: 'p-1-dup',
          spotifyId: 'spot-1', // duplicate identity
          name: 'Romance Hindi (Duplicate)',
          image: 'https://i.scdn.co/image/img-2',
        },
        {
          _id: 'p-2',
          spotifyId: 'spot-2',
          name: 'Love Ballads',
          image: 'https://i.scdn.co/image/img-3',
          songCount: 25,
        },
      ],
    },
    {
      _id: 'sec-empty',
      name: 'Empty Section',
      playlists: [],
    },
  ];

  const normalized = normalizeCuratedSections(rawSections);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].name, 'Bollywood Romance');
  assert.equal(normalized[0].genreName, 'Romance');
  assert.equal(normalized[0].playlists.length, 2);
  assert.equal(normalized[0].playlists[0].spotifyId, 'spot-1');
  assert.equal(normalized[0].playlists[0].songCount, 3);
  assert.equal(normalized[0].playlists[1].spotifyId, 'spot-2');
  assert.equal(normalized[0].playlists[1].songCount, 25);
});

test('curated sections are cached in memory and AsyncStorage with 30-minute TTL', async () => {
  clearCuratedSectionsMemoryCache();

  const mockSections = [
    {
      id: 'sec-test',
      _id: 'sec-test',
      name: 'Chill',
      playlists: [
        {
          id: 'p-chill',
          name: 'Chill Hits',
          image: [{ quality: '500x500', url: 'https://i.scdn.co/image/chill' }],
        },
      ],
    },
  ];

  await saveCuratedSectionsCache(mockSections as any);

  const cached = await readCuratedSectionsCache();
  assert.equal(cached.isFresh, true);
  assert.equal(cached.data.length, 1);
  assert.equal(cached.data[0].name, 'Chill');
});

test('fetchLiveMusicSections uses primary /api/curated-music?source=live-v12 and falls back to /api/sections?includePlaylists=true&source=live-v12', async () => {
  clearCuratedSectionsMemoryCache();
  const previousApiUrl = process.env.EXPO_PUBLIC_HARMONIA_API_URL;
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  process.env.EXPO_PUBLIC_HARMONIA_API_URL = 'https://backend.test';

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'https://backend.test/api/curated-music?source=live-v12') {
      // Simulate primary endpoint returning 500
      return Response.json({ success: false, data: [] }, { status: 500 });
    }

    if (url === 'https://backend.test/api/sections?includePlaylists=true&source=live-v12') {
      // Secondary fallback succeeds
      return Response.json({
        success: true,
        data: [
          {
            _id: 'sec-fb',
            name: 'Workout',
            playlists: [
              {
                _id: 'p-fit',
                spotifyId: 'spot-fit',
                name: 'Workout Beats',
                image: 'https://i.scdn.co/image/fit',
                songIds: ['s1', 's2'],
              },
            ],
          },
        ],
      });
    }

    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  };

  try {
    const sections = await fetchLiveMusicSections({ forceRefresh: true });
    assert.equal(sections.length, 1);
    assert.equal(sections[0].name, 'Workout');
    assert.equal(sections[0].playlists[0].name, 'Workout Beats');
    assert.ok(requestedUrls.includes('https://backend.test/api/curated-music?source=live-v12'));
    assert.ok(requestedUrls.includes('https://backend.test/api/sections?includePlaylists=true&source=live-v12'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_HARMONIA_API_URL;
    else process.env.EXPO_PUBLIC_HARMONIA_API_URL = previousApiUrl;
    clearCuratedSectionsMemoryCache();
  }
});

test('fetchPlaylistSongs hydrates tracks and resolves IDs via /api/spotify-playlists/:id using trackMap', async () => {
  const previousApiUrl = process.env.EXPO_PUBLIC_HARMONIA_API_URL;
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  process.env.EXPO_PUBLIC_HARMONIA_API_URL = 'https://backend.test';

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'https://backend.test/api/spotify-playlists/mongo-db-playlist-1') {
      return Response.json({
        success: true,
        data: {
          _id: 'mongo-db-playlist-1',
          name: 'Bollywood Romance',
          trackMap: {
            'spotify-track-1': 'saavn-track-mapped-1',
            'spotify-track-2': 'saavn-track-mapped-2',
          },
          tracks: [
            {
              id: 'spotify-track-1',
              title: 'Tum Hi Ho',
              artist: 'Arijit Singh',
            },
            {
              id: 'spotify-track-2',
              title: 'Kesariya',
              artist: 'Arijit Singh',
            },
          ],
        },
      });
    }

    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  };

  try {
    const { fetchPlaylistSongs } = await import('../../src/lib/api');
    const songs = await fetchPlaylistSongs({
      id: 'mongo-db-playlist-1',
      name: 'Bollywood Romance',
      source: 'spotify',
    });

    assert.equal(songs.length, 2);
    assert.equal(songs[0].id, 'saavn-track-mapped-1');
    assert.equal(songs[0].name, 'Tum Hi Ho');
    assert.equal(songs[1].id, 'saavn-track-mapped-2');
    assert.equal(songs[1].name, 'Kesariya');
    assert.ok(requestedUrls.includes('https://backend.test/api/spotify-playlists/mongo-db-playlist-1'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_HARMONIA_API_URL;
    else process.env.EXPO_PUBLIC_HARMONIA_API_URL = previousApiUrl;
  }
});

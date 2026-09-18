import test from 'node:test';
import assert from 'node:assert/strict';

test('home sections prefer every Spotify playlist returned by the database', async () => {
  const { selectDatabaseSpotifySections } = await import('../../src/lib/homeSections');
  const sections = selectDatabaseSpotifySections([
    {
      id: 'db-romance',
      name: 'Bollywood Romance',
      playlists: [
        { id: 'spotify-1', name: 'Love One', source: 'spotify' },
        { id: 'spotify-2', name: 'Love Two', sourceType: 'spotify' },
        { id: 'jio-1', name: 'Provider fallback', source: 'jiosaavn' },
      ],
    },
    {
      id: 'db-hits',
      name: 'English Top Hits',
      playlists: [
        {
          id: 'spotify-3',
          name: 'Top Hits',
          sourceUrl: 'https://open.spotify.com/playlist/spotify-3',
        },
      ],
    },
  ] as any);

  assert.deepEqual(sections.map((section) => section.name), [
    'Bollywood Romance',
    'English Top Hits',
  ]);
  assert.deepEqual(
    sections.flatMap((section) => section.playlists.map((playlist) => playlist.id)),
    ['spotify-1', 'spotify-2', 'spotify-3']
  );
});

test('playlist loading continues to catalog details when summary song IDs do not resolve', async () => {
  const previousApiUrl = process.env.EXPO_PUBLIC_HARMONIA_API_URL;
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];

  process.env.EXPO_PUBLIC_HARMONIA_API_URL = 'https://catalog.test';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);

    if (url.startsWith('https://catalog.test/api/songs?')) {
      return Response.json({ success: true, data: [] });
    }
    if (url.includes('jiosaavn.com/api.php')) {
      return Response.json({});
    }
    if (url === 'https://catalog.test/api/playlists/catalog-playlist') {
      return Response.json({
        success: true,
        data: {
          // The public API includes this compatibility field even when the
          // playable catalog tracks live in `tracks`.
          songs: [],
          tracks: [{
            id: 'recovered-track',
            name: 'Recovered track',
            artist: 'Harmonia',
          }],
        },
      });
    }

    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  };

  try {
    const { fetchPlaylistSongs } = await import('../../src/lib/api');
    const songs = await fetchPlaylistSongs({
      id: 'catalog-playlist',
      name: 'Catalog playlist',
      songIds: ['unresolved-summary-id'],
    });

    assert.deepEqual(songs.map((song) => song.id), ['recovered-track']);
    assert.ok(requests.includes('https://catalog.test/api/playlists/catalog-playlist'));
    assert.equal(
      requests.filter((url) => url.startsWith('https://catalog.test/api/songs?')).length,
      1,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_HARMONIA_API_URL;
    else process.env.EXPO_PUBLIC_HARMONIA_API_URL = previousApiUrl;
  }
});

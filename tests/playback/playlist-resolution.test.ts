import test from 'node:test';
import assert from 'node:assert/strict';

test('Home pins the requested Spotify catalog shelves in listening order', async () => {
  const { selectHomeShelves } = await import('../../src/lib/homeSections');
  const section = (name: string, genreName: string) => ({
    name,
    genreName,
    playlists: [{ id: `${name}-${genreName}`, name: `${name} playlist` }],
  });
  const shelves = selectHomeShelves([
    section('Top Hits', 'English'),
    section('All Things Pop', 'Pop'),
    section('Pop Hits', 'English'),
    section('New & Trending', 'English'),
    section('Popular Dance/Electronic playlists', 'Dance/Electronic'),
    section('Popular Party playlists', 'Hindi'),
    section('Popular Telugu playlists', 'Telugu'),
    section('Popular Punjabi playlists', 'Punjabi'),
    section('Chill & Sad', 'Hindi'),
    section('Popular 90s playlists', 'Decades'),
    section('Bollywood Romance', 'Hindi'),
    section('New & Trending', 'Hindi'),
    section('Popular Hindi Playlists', 'Hindi'),
  ] as any);

  assert.deepEqual(shelves.map((shelf) => shelf.name), [
    'Popular Hindi Playlists',
    'New & Trending',
    'Bollywood Romance',
    '90s Love & Nostalgia',
    'Chill & Sad',
    'Popular Punjabi Playlists',
    'Popular Telugu Playlists',
    'Popular Party Playlists',
    'Dance & Electronic',
    'English Top Hits',
    'English New & Trending',
    'Pop Essentials',
  ]);
});

test('Home shows the last catalog item first in Popular playlist shelves', async () => {
  const { selectHomeShelves } = await import('../../src/lib/homeSections');
  const [shelf] = selectHomeShelves([
    {
      name: 'Popular Hindi Playlists',
      genreName: 'Hindi',
      playlists: [{ id: 'first', name: 'First' }, { id: 'last', name: 'Last' }],
    },
  ] as any);

  assert.deepEqual(shelf.playlists.map((playlist) => playlist.id), ['last', 'first']);
});

test('Bollywood Romance uses the reference Spotify playlists and artwork order', async () => {
  const { selectHomeShelves } = await import('../../src/lib/homeSections');
  const [shelf] = selectHomeShelves([
    {
      id: 'older-romance', name: 'Bollywood Romance', genreName: 'Hindi',
      playlists: [{ id: 'generic', name: 'Generic romance' }],
    },
    {
      id: '6a04102c17b699631f90592a', name: 'Bollywood Romance', genreName: 'Hindi',
      playlists: [
        { id: 'latest', name: 'Latest Love Tunes' },
        { id: 'mush', name: 'Bollywood Mush' },
        { id: 'winter', name: 'Winter of Love' },
        { id: '2000s', name: "00's Love Hits" },
      ],
    },
  ] as any);

  assert.deepEqual(shelf.playlists.map((playlist) => playlist.id), ['mush', '2000s', 'winter', 'latest']);
});

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

test('home playlist rails put the newest database records first', async () => {
  const { selectDatabaseSpotifySections } = await import('../../src/lib/homeSections');
  const [section] = selectDatabaseSpotifySections([
    {
      id: 'latest',
      name: 'Latest Playlists',
      playlists: [
        {
          _id: '650000000000000000000001',
          name: 'Older playlist',
          source: 'spotify',
          updatedAt: '2025-01-10T00:00:00.000Z',
        },
        {
          _id: '660000000000000000000001',
          name: 'Newest playlist',
          source: 'spotify',
          updatedAt: '2026-08-10T00:00:00.000Z',
        },
        {
          _id: '640000000000000000000001',
          name: 'Middle playlist',
          source: 'spotify',
          updatedAt: '2026-02-10T00:00:00.000Z',
        },
      ],
    },
  ] as any);

  assert.deepEqual(
    section.playlists.map((playlist) => playlist.name),
    ['Newest playlist', 'Middle playlist', 'Older playlist']
  );
});

test('Home exposes a deduplicated latest-playlists rail before category sections', async () => {
  const { latestHomePlaylists } = await import('../../src/lib/homeSections');
  const playlists = latestHomePlaylists([
    {
      name: 'First section',
      playlists: [
        { id: 'shared', name: 'Shared', source: 'spotify', updatedAt: '2026-02-01' },
        { id: 'older', name: 'Older', source: 'spotify', updatedAt: '2025-01-01' },
      ],
    },
    {
      name: 'Second section',
      playlists: [
        { id: 'newest', name: 'Newest', source: 'spotify', updatedAt: '2026-09-01' },
        { id: 'shared', name: 'Shared duplicate', source: 'spotify', updatedAt: '2026-08-01' },
      ],
    },
  ] as any, 3);

  assert.deepEqual(playlists.map((playlist) => playlist.id), ['newest', 'shared', 'older']);
});

test('mergeHomeSections preserves base curated sections while prepending remote Spotify playlists', async () => {
  const { mergeHomeSections } = await import('../../src/lib/homeSections');
  const base = [
    {
      id: 'sec-1',
      name: 'Popular Hindi Playlists',
      playlists: [{ id: 'p-hindi-1', name: 'Hindi Hits' }],
    },
    {
      id: 'sec-2',
      name: 'Bollywood Romance',
      playlists: [{ id: 'p-romance-1', name: 'Old Romance' }],
    },
    {
      id: 'sec-3',
      name: 'Dance Hits',
      playlists: [{ id: 'p-dance-1', name: 'Dance Floor' }],
    },
  ];

  const remote = [
    {
      id: 'rem-2',
      name: 'Bollywood Romance',
      playlists: [
        { id: 'p-romance-spotify', name: 'Spotify Romance', source: 'spotify' },
        { id: 'p-romance-1', name: 'Old Romance' },
      ],
    },
    {
      id: 'rem-extra',
      name: 'Extra Global',
      playlists: [{ id: 'p-extra-1', name: 'Global Hits' }],
    },
  ];

  const merged = mergeHomeSections(base as any, remote as any);

  assert.deepEqual(merged.map((s) => s.name), [
    'Popular Hindi Playlists',
    'Bollywood Romance',
    'Dance Hits',
    'Extra Global',
  ]);

  const romance = merged.find((s) => s.name === 'Bollywood Romance');
  assert.ok(romance);
  assert.deepEqual(
    romance.playlists.map((p) => p.id),
    ['p-romance-spotify', 'p-romance-1']
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

test('Browse all uses current catalog artwork at an appropriate resolution', async () => {
  const { browseCatalogCoverImages } = await import('../../src/lib/browseCatalog');
  const covers = browseCatalogCoverImages([
    {
      id: 'latest-releases',
      name: 'The best new releases',
      playlists: [
        {
          id: 'fresh-playlist',
          name: 'Fresh this week',
          image: [
            { quality: '64x64', url: 'https://cdn.test/fresh-64.jpg' },
            { quality: '640x640', url: 'https://cdn.test/fresh-640.jpg' },
          ],
        },
      ],
    },
    {
      id: 'current-hits',
      name: 'Today’s Hits',
      playlists: [
        { id: 'hits', name: 'Hits', image: 'https://cdn.test/hits.jpg' },
      ],
    },
  ] as any);

  assert.equal(covers['new-releases'], 'https://cdn.test/fresh-640.jpg');
  assert.equal(covers.english, 'https://cdn.test/hits.jpg');
  assert.equal(covers.charts, undefined);
  assert.equal(covers.gaming, undefined);
});

test('featured search categories use their own selected Spotify catalog covers', async () => {
  const { browseCatalogCoverImages } = await import('../../src/lib/browseCatalog');
  const covers = browseCatalogCoverImages([
    {
      id: 'hindi', name: 'Popular Hindi Playlists', playlists: [
        { id: 'hindi-cover', name: 'Hot Hits Hindi', image: 'https://cdn.test/hindi-cover.jpg' },
        { id: 'hindi-default', name: '90s Love Hits', image: 'https://cdn.test/hindi-default.jpg' },
      ],
    },
    {
      id: 'new', name: 'New & Trending', playlists: [
        { id: 'new-default', name: 'Trending Bollywood', image: 'https://cdn.test/new-default.jpg' },
        { id: 'new-cover', name: 'New Releases Hindi', image: 'https://cdn.test/new-cover.jpg' },
      ],
    },
    {
      id: 'pop', name: 'Pop Hits', playlists: [
        { id: 'pop-default', name: 'All Things Pop', image: 'https://cdn.test/pop-default.jpg' },
        { id: 'pop-cover', name: 'Pop Rising', image: 'https://cdn.test/pop-cover.jpg' },
      ],
    },
  ] as any);

  assert.equal(covers.hindi, 'https://cdn.test/hindi-cover.jpg');
  assert.equal(covers['new-releases'], 'https://cdn.test/new-cover.jpg');
  assert.equal(covers.pop, 'https://cdn.test/pop-cover.jpg');
});

test('every Search catalog has a current Spotify thumbnail fallback', async () => {
  const { BROWSE_CATALOGS } = await import('../../src/lib/browseCatalog');

  assert.equal(BROWSE_CATALOGS.length, 42);
  assert.deepEqual(
    BROWSE_CATALOGS.slice(0, 6).map((catalog) => catalog.name),
    ['Hindi', 'English', 'New Releases', 'Punjabi', 'Summer', 'English Sad']
  );
  assert.ok(BROWSE_CATALOGS.every((catalog) => !/radio/i.test(catalog.name)));
  assert.ok(BROWSE_CATALOGS.every((catalog) =>
    new URL(catalog.coverImage).hostname.endsWith('scdn.co')
 ));
});

test('fetchHomeSections returns all catalog sections from Top Hits to Japanese comics', async () => {
  const { fetchHomeSections } = await import('../../src/lib/api');
  const sections = await fetchHomeSections({ forceRefresh: true });

  assert.ok(sections.length >= 200, `Expected >= 200 sections, got ${sections.length}`);
  assert.equal(sections[0].name, 'Top Hits');
  assert.equal(sections[sections.length - 1].name, 'Japanese comics & sub-culture');
});

test('Spotify playlist and song thumbnails are normalized and upgraded to highest resolution', async () => {
  const { bestArtworkUrl, normalizeArtworkUrl } = await import('../../src/lib/song');

  assert.equal(
    normalizeArtworkUrl('https://image-cdn-ak.spotifycdn.com/image/ab67706f00000002810d3464499e998c3faf8b9e'),
    'https://i.scdn.co/image/ab67706f00000002810d3464499e998c3faf8b9e'
  );
  assert.equal(
    normalizeArtworkUrl('https://lineup-images.scdn.co/ab67706c0000da84f6357206f8b543f81fb11a59'),
    'https://i.scdn.co/image/ab67706c0000bebbf6357206f8b543f81fb11a59'
  );
  assert.equal(
    normalizeArtworkUrl('https://mosaic.scdn.co/300/ab67616d00001e0205043a74b708ade6d006ba0c'),
    'https://mosaic.scdn.co/640/ab67616d0000b27305043a74b708ade6d006ba0c'
  );

  const playlistCover = bestArtworkUrl(
    [{ quality: 'default', url: 'https://image-cdn-fa.spotifycdn.com/image/ab67706c0000da84f6357206f8b543f81fb11a59' }],
    140
  );
  assert.equal(
    playlistCover,
    'https://i.scdn.co/image/ab67706c0000bebbf6357206f8b543f81fb11a59'
  );
});

test('fetchPlaylistSongs syncs live Spotify playlists via scrape endpoint when available', async () => {
  const previousApiUrl = process.env.EXPO_PUBLIC_HARMONIA_API_URL;
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];

  process.env.EXPO_PUBLIC_HARMONIA_API_URL = 'https://sync.test';
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);

    if (url === 'https://sync.test/api/scrape-playlist') {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.playlistUrl, 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
      return Response.json({
        success: true,
        data: {
          title: "Today's Top Hits",
          tracks: Array.from({ length: 50 }, (_, i) => ({
            id: `spotify-live-track-${i + 1}`,
            name: `Live Hit ${i + 1}`,
            artist: 'Top Artist',
          })),
        },
      });
    }

    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  };

  try {
    const { fetchPlaylistSongs } = await import('../../src/lib/api');
    const songs = await fetchPlaylistSongs({
      id: '37i9dQZF1DXcBWIGoYBM5M',
      name: "Today's Top Hits",
      source: 'spotify',
      sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      songIds: ['sparse-cached-id'],
    });

    assert.equal(songs.length, 50, `Requests were: ${JSON.stringify(requests)}`);
    assert.equal(songs[0].id, 'spotify-live-track-1');
    assert.equal(songs[49].id, 'spotify-live-track-50');
    assert.ok(requests.includes('https://sync.test/api/scrape-playlist'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_HARMONIA_API_URL;
    else process.env.EXPO_PUBLIC_HARMONIA_API_URL = previousApiUrl;
  }
});

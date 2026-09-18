import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import CryptoJS from 'crypto-js';
import {
  StreamResolver,
  createHarmoniaProviders,
  getAudioCandidates,
  getImmediateLocalSource,
  isValidAudioUrl,
} from '../../src/lib/playback/streamResolver';
import {
  ResolvedStreamMemoryCache,
  getStreamExpiresAt,
} from '../../src/lib/playback/streamCache';
import { ProviderHealthManager } from '../../src/lib/playback/providerHealth';
import {
  captureRecoveryPosition,
  getPlaybackRecoveryPolicy,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
  nextUntriedCandidateIndex,
} from '../../src/lib/playback/recoveryPolicy';
import {
  PlaybackErrorType,
  classifyPlaybackError,
} from '../../src/lib/playback/playbackErrors';
import { maskStreamUrl } from '../../src/lib/playback/streamDiagnostics';
import {
  artistNames,
  artworkUrl,
  normalizeSong,
  persistenceSafeSong,
} from '../../src/lib/song';
import {
  fetchDirectJioSaavnTracks,
  searchDirectJioSaavn,
  searchDirectJioSaavnAlbums,
  searchDirectJioSaavnArtists,
} from '../../src/lib/playback/jiosaavnDirect';
import {
  resolveDirectYouTubeMusicTrack,
  searchDirectYouTubeMusic,
} from '../../src/lib/playback/youtubeMusicDirect';
import type { Song } from '../../src/types';

function song(overrides: Record<string, any> = {}): Song {
  return {
    id: 'song-1',
    songId: 'song-1',
    name: 'Test Song',
    title: 'Test Song',
    artist: 'Test Artist',
    ...overrides,
  } as Song;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function encryptedSaavnUrl(url: string) {
  const key = CryptoJS.enc.Utf8.parse('38346591');
  const encrypted = CryptoJS.DES.encrypt(url, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

function waitForAbort(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_, reject) => {
    const fail = () => {
      const error = new Error('request aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });
}

function saavnDetails(id: string, url: string, options: { supports320?: boolean; title?: string } = {}) {
  return {
    [id]: {
      id,
      title: options.title || 'Fresh',
      image: 'https://c.saavncdn.com/001/cover-150x150.jpg',
      more_info: {
        album: 'Album',
        duration: '180',
        encrypted_media_url: encryptedSaavnUrl(url),
        '320kbps': options.supports320 === false ? 'false' : 'true',
        artistMap: {
          primary_artists: [{ id: 'artist-1', name: 'Artist' }],
        },
      },
    },
  };
}

test('catalog batches retry only provider-omitted song ids', async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const ids = new URL(String(input)).searchParams.get('pids') || '';
    calls.push(ids);
    if (ids === 'song-a,song-b') {
      return json(saavnDetails('song-a', 'https://aac.saavncdn.com/a_160.mp4'));
    }
    if (ids === 'song-b') {
      return json(saavnDetails('song-b', 'https://aac.saavncdn.com/b_160.mp4'));
    }
    return json({});
  };

  const tracks = await fetchDirectJioSaavnTracks(['song-a', 'song-b'], { fetchImpl });

  assert.deepEqual(tracks.map((track) => track.id), ['song-a', 'song-b']);
  assert.deepEqual(calls, ['song-a,song-b', 'song-b']);
});

test('1 embedded audio is selected without a network request', async () => {
  let requests = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async () => {
      requests += 1;
      throw new Error('network must not be called');
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });
  const result = await resolver.resolve(song({
    source: 'jiosaavn',
    downloadUrl: [{ url: 'https://cdn.test/audio.m4a', quality: '160kbps', bitrate: 160 }],
  }), { quality: 'normal' });

  assert.equal(result.source, 'embedded');
  assert.equal(result.url, 'https://cdn.test/audio.m4a');
  assert.equal(requests, 0);
});

test('2 quality selection honors saver/normal/high/maximum ceilings', () => {
  const track = song({
    downloadUrl: [
      { url: 'https://cdn.test/96.m4a', quality: '96kbps', bitrate: 96 },
      { url: 'https://cdn.test/160.m4a', quality: '160kbps', bitrate: 160 },
      { url: 'https://cdn.test/320.m4a', quality: '320kbps', bitrate: 320 },
      { url: 'https://cdn.test/lossless.flac', quality: 'lossless', codec: 'FLAC' },
    ],
  });

  assert.match(getAudioCandidates(track, 'data-saver')[0].url, /96/);
  assert.match(getAudioCandidates(track, 'normal')[0].url, /160/);
  assert.match(getAudioCandidates(track, 'high')[0].url, /320/);
  assert.match(getAudioCandidates(track, 'maximum')[0].url, /lossless/);
});

test('3 dedicated stream fallback does not use the account backend', async () => {
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async () => { throw new Error('unexpected fetch'); },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });
  const result = await resolver.resolve(song({
    id: 'dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    source: 'youtube',
  }));

  assert.equal(result.url, 'https://stream.test/api/yt-stream?id=dQw4w9WgXcQ');
  assert.equal(result.provider, 'youtube-server');
  assert.equal(result.source, 'youtube-server');
});

test('4 JioSaavn refresh resolves directly on-device at requested quality', async () => {
  const calls: string[] = [];
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      assert.match(url, /jiosaavn\.com\/api\.php/);
      return json(saavnDetails(
        'jio-1',
        'https://aac.saavncdn.com/001/fresh_96.mp4?Expires=9999999999',
      ));
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({ id: 'jio-1', source: 'jiosaavn' }), {
    quality: 'high',
  });

  assert.match(result.url, /_320\.mp4/);
  assert.equal(result.source, 'jiosaavn');
  assert.equal(calls.length, 1);
  assert.ok(calls.every((value) => !value.includes('catalog.test/api/songs')));
});

test('5 direct JioSaavn failure falls through to optional backend-search', async () => {
  const calls: string[] = [];
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('jiosaavn.com/api.php')) return json({ error: 'provider down' }, 500);
      if (url.includes('/api/stream-track')) {
        return json({
          streamUrl: 'https://piped.test/audio.webm?token=secret',
          mimeType: 'audio/webm',
          supportsStreaming: true,
        });
      }
      return json({}, 404);
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({ id: 'jio-fail', source: 'jiosaavn' }));

  assert.equal(result.source, 'backend-search');
  assert.equal(result.provider, 'backend-search');
  assert.ok(calls.some((value) => value.includes('jiosaavn.com/api.php')));
  assert.ok(calls.some((value) => value.includes('/api/stream-track')));
});

test('6 metadata-only Spotify tracks try direct JioSaavn before backend fallback', async () => {
  let saavnSearchCalls = 0;
  let streamCalls = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('jiosaavn.com/api.php')) {
        saavnSearchCalls += 1;
        return json({ results: [] });
      }
      assert.match(url, /stream-track/);
      streamCalls += 1;
      return json({
        streamUrl: 'https://media.test/playable.opus',
        mimeType: 'audio/ogg',
        supportsStreaming: true,
      });
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });
  const result = await resolver.resolve(song({ id: 'spotify-1', source: 'spotify' }));

  assert.equal(result.source, 'backend-search');
  assert.equal(saavnSearchCalls, 1);
  assert.equal(streamCalls, 1);
});

test('Spotify tracks with a title but no artist still resolve by recording title', async () => {
  const queries: string[] = [];
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      queries.push(url.searchParams.get('q') || '');
      return json({
        results: [{
          id: 'B6d7Dnf9',
          title: 'KALYANI (with Shreya Ghoshal) - Remix',
          image: 'https://c.saavncdn.com/475/cover-150x150.jpg',
          more_info: {
            album: 'KALYANI',
            duration: '269',
            encrypted_media_url: encryptedSaavnUrl(
              'https://aac.saavncdn.com/475/kalyani_160.mp4'
            ),
            '320kbps': 'true',
            artistMap: {
              primary_artists: [{ id: 'artist-1', name: 'ARJN' }],
            },
          },
        }],
      });
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({
    id: '2y8mkajKikV5S1PRCMQ5WL',
    songId: '2y8mkajKikV5S1PRCMQ5WL',
    name: 'KALYANI (with Shreya Ghoshal) - Remix',
    title: 'KALYANI (with Shreya Ghoshal) - Remix',
    source: 'spotify',
    artist: undefined,
    primaryArtists: undefined,
    artists: undefined,
  }), { quality: 'normal', priority: 'high' });

  assert.equal(result.source, 'jiosaavn');
  assert.match(result.url, /kalyani_160\.mp4/);
  assert.deepEqual(queries, ['KALYANI Remix']);
});

test('7 expired resolved-stream cache entries are rejected', () => {
  let now = 1_000_000;
  const cache = new ResolvedStreamMemoryCache<any>(300, () => now);
  cache.set('a', 'high', {
    trackId: 'a',
    url: 'https://cdn.test/a.m4a',
    expiresAt: now + 40_000,
  });
  assert.equal(cache.get('a', 'high'), null);
});

test('8 fresh resolved-stream cache entries are reused', async () => {
  let resolves = 0;
  const resolver = new StreamResolver([
    {
      id: 'embedded',
      canResolve: () => true,
      resolve: async (track) => {
        resolves += 1;
        return { url: 'https://cdn.test/cache.m4a', track, provider: 'direct' };
      },
    },
  ], {
    healthManager: new ProviderHealthManager(),
  });

  const first = await resolver.resolve(song(), { quality: 'normal' });
  const second = await resolver.resolve(song(), { quality: 'normal' });
  assert.equal(first.cache, 'miss');
  assert.equal(second.cache, 'hit');
  assert.equal(resolves, 1);
});

test('9 persistence strips every temporary stream capability', () => {
  const stable = persistenceSafeSong(song({
    downloadUrl: [{ url: 'https://saavncdn.com/a.m4a' }],
    streamUrl: 'https://googlevideo.com/a?expire=999&sig=x',
    stream_url: 'https://x.test/a',
    audioUrl: 'https://x.test/b',
    audio_url: 'https://x.test/c',
    mediaUrl: 'https://x.test/d',
    media_url: 'https://x.test/e',
    playbackUrl: 'https://x.test/f',
    resolvedUrl: 'https://x.test/g',
    signedUrl: 'https://x.test/h',
    url: 'https://harmonia.test/api/yt-stream?id=dQw4w9WgXcQ',
  })) as any;

  for (const key of [
    'downloadUrl', 'streamUrl', 'stream_url', 'audioUrl', 'audio_url',
    'mediaUrl', 'media_url', 'playbackUrl', 'resolvedUrl', 'signedUrl', 'url',
  ]) {
    assert.equal(key in stable, false, key);
  }
  assert.equal(stable.id, 'song-1');
});

test('10 restored stable metadata re-resolves instead of reusing an old signed URL', async () => {
  const restored = persistenceSafeSong(song({
    id: 'restore-1',
    source: 'jiosaavn',
    streamUrl: 'https://saavncdn.com/old.m4a?token=expired',
  }));
  let calls = 0;
  const resolver = new StreamResolver([
    {
      id: 'jiosaavn',
      canResolve: () => true,
      resolve: async (track) => {
        calls += 1;
        return { url: 'https://saavncdn.com/fresh.m4a', track, provider: 'jiosaavn' };
      },
    },
  ], { healthManager: new ProviderHealthManager() });

  const result = await resolver.resolve(restored);
  assert.equal(calls, 1);
  assert.match(result.url, /fresh/);
});

test('11 playback source has a generation/abort guard against stale async results', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /loadGenerationRef\.current/);
  assert.match(source, /activeResolutionAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /generation !== loadGenerationRef\.current/);
  assert.match(source, /controller\.signal\.aborted/);
});

test('12 recovery position keeps the furthest known playback point', () => {
  assert.equal(captureRecoveryPosition(132, 134, 130), 134);
  assert.equal(captureRecoveryPosition(undefined, -1, 0), 0);
});

test('13 provider fallback policy is bounded', () => {
  assert.equal(MAX_AUTOMATIC_RECOVERY_ATTEMPTS, 3);
  assert.equal(
    getPlaybackRecoveryPolicy(PlaybackErrorType.STREAM_URL_EXPIRED, 3).action,
    'fail'
  );
});

test('14 network retry count cannot become infinite', () => {
  const actions = [0, 1, 2, 3, 4].map((attempt) =>
    getPlaybackRecoveryPolicy(PlaybackErrorType.NETWORK_ERROR, attempt).action
  );
  assert.deepEqual(actions.slice(0, 3), [
    'refresh-stream',
    'refresh-stream',
    'refresh-stream',
  ]);
  assert.equal(actions[3], 'fail');
  assert.equal(actions[4], 'fail');
});

test('15 local songs resolve immediately without a network provider', () => {
  const immediate = getImmediateLocalSource(song({
    localUri: 'file:///music/local.mp3',
  }), null);
  assert.deepEqual(immediate, {
    url: 'file:///music/local.mp3',
    source: 'local',
  });
});

test('16 downloaded songs resolve immediately without a network provider', () => {
  const immediate = getImmediateLocalSource(song(), 'file:///downloads/song.m4a');
  assert.deepEqual(immediate, {
    url: 'file:///downloads/song.m4a',
    source: 'offline',
  });
});

test('17 native preloading stays on one track while resolver warms one extra candidate', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /queueRef\.current\[indexRef\.current \+ 1\]/);
  assert.match(source, /queueRef\.current\[indexRef\.current \+ 2\]/);
  assert.match(source, /preferredForwardBufferDuration: 18/);
  assert.match(source, /priority: 'low'/);
  assert.match(source, /clearPreloadedSource/);
});

test('18 quality switching preserves current position and forces fresh resolution', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /const resumeAt = Math\.max\(/);
  assert.match(source, /invalidateResolvedStream\(stable\.id\)/);
  assert.match(source, /forceFresh: true/);
  assert.match(source, /skipAdaptive: true/);
});

test('19 failed playback automatically refreshes the current stream', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /invalidateResolvedStream\(trackId\)/);
  assert.match(source, /recoveryAttempt: attempt/);
  assert.match(source, /excludeProviders:/);
});

test('20 background audio and lock-screen integration remain enabled', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /shouldPlayInBackground: true/);
  assert.match(source, /playsInSilentMode: true/);
  assert.match(source, /interruptionMode: 'doNotMix'/);
  assert.match(source, /setActiveForLockScreen/);
  assert.match(source, /showSeekBackward: true/);
  assert.match(source, /showSeekForward: true/);
  assert.match(source, /Platform\.OS === 'android' && !isExpoGo/);
});

test('21 obvious webpage URLs are rejected as audio candidates', () => {
  assert.equal(isValidAudioUrl('https://open.spotify.com/track/abc'), false);
  assert.equal(isValidAudioUrl('https://youtube.com/watch?v=dQw4w9WgXcQ'), false);
  assert.equal(isValidAudioUrl('https://www.jiosaavn.com/song/foo/bar'), false);
  assert.equal(isValidAudioUrl('https://cdn.test/song.m4a'), true);
});

test('22 provider health enters cooldown after repeated failures and later recovers', () => {
  let now = 1000;
  const health = new ProviderHealthManager({
    failureThreshold: 3,
    cooldownMs: 1000,
    now: () => now,
  });
  health.recordFailure('youtube');
  health.recordFailure('youtube');
  assert.equal(health.isAvailable('youtube'), true);
  health.recordFailure('youtube');
  assert.equal(health.isAvailable('youtube'), false);
  now += 1001;
  assert.equal(health.isAvailable('youtube'), true);
  health.recordSuccess('youtube', 120);
  assert.equal(health.get('youtube').consecutiveFailures, 0);
});

test('explicit playback probes a provider even while speculative work is cooling down', async () => {
  let calls = 0;
  const health = new ProviderHealthManager({ failureThreshold: 1, cooldownMs: 60_000 });
  health.recordFailure('jiosaavn');

  const resolver = new StreamResolver([{
    id: 'jiosaavn',
    canResolve: () => true,
    resolve: async (track) => {
      calls += 1;
      return {
        url: 'https://aac.saavncdn.com/001/recovered_160.mp4',
        track,
        provider: 'jiosaavn',
      };
    },
  }], { healthManager: health });

  const result = await resolver.resolve(song({ source: 'jiosaavn' }), {
    priority: 'high',
    forceFresh: true,
  });

  assert.equal(calls, 1);
  assert.equal(result.provider, 'jiosaavn');
  assert.equal(health.get('jiosaavn').consecutiveFailures, 0);
});

test('23 stream expiry honors provider expiry and safety-aware cache freshness', () => {
  const now = 1_000_000;
  const providerExpirySeconds = Math.floor((now + 90_000) / 1000);
  const expiry = getStreamExpiresAt(
    `https://googlevideo.com/a?expire=${providerExpirySeconds}`,
    now
  );
  assert.ok(expiry <= now + 90_000);
});

test('24 diagnostics never expose signed query parameters', () => {
  assert.equal(
    maskStreamUrl('https://rr1---sn.test.googlevideo.com/videoplayback?expire=1&sig=secret&token=x'),
    'https://rr1---sn.test.googlevideo.com/videoplayback'
  );
});


test('25 data saver selects 96 kbps when available', () => {
  const candidates = getAudioCandidates(song({
    downloadUrl: [
      { url: 'https://saavncdn.com/320.m4a', quality: '320kbps' },
      { url: 'https://saavncdn.com/96.m4a', quality: '96kbps' },
      { url: 'https://saavncdn.com/160.m4a', quality: '160kbps' },
    ],
  }), 'data-saver');
  assert.match(candidates[0].url, /96/);
});

test('26 normal selects 160 kbps when available', () => {
  const candidates = getAudioCandidates(song({
    downloadUrl: [
      { url: 'https://saavncdn.com/96.m4a', quality: '96kbps' },
      { url: 'https://saavncdn.com/320.m4a', quality: '320kbps' },
      { url: 'https://saavncdn.com/160.m4a', quality: '160kbps' },
    ],
  }), 'normal');
  assert.match(candidates[0].url, /160/);
});

test('27 high selects 320 kbps when available', () => {
  const candidates = getAudioCandidates(song({
    downloadUrl: [
      { url: 'https://saavncdn.com/96.m4a', quality: '96kbps' },
      { url: 'https://saavncdn.com/160.m4a', quality: '160kbps' },
      { url: 'https://saavncdn.com/320.m4a', quality: '320kbps' },
    ],
  }), 'high');
  assert.match(candidates[0].url, /320/);
});

test('28 duplicate embedded URLs are removed', () => {
  const candidates = getAudioCandidates(song({
    downloadUrl: [
      { url: 'https://saavncdn.com/same.m4a', quality: '160kbps' },
      { url: 'https://saavncdn.com/same.m4a', quality: '160kbps' },
    ],
    streamUrl: 'https://saavncdn.com/same.m4a',
  }), 'normal');
  assert.equal(candidates.length, 1);
});

test('29 JioSaavn webpages are rejected while Saavn CDN audio is accepted', () => {
  assert.equal(isValidAudioUrl('https://www.jiosaavn.com/song/example/abc'), false);
  assert.equal(isValidAudioUrl('https://www.jiosaavn.com/album/example/abc'), false);
  assert.equal(isValidAudioUrl('https://www.jiosaavn.com/artist/example/abc'), false);
  assert.equal(isValidAudioUrl('https://aac.saavncdn.com/001/example_160.mp4'), true);
});

test('30 JioSaavn catalog resolution stays ahead of YouTube fallback', async () => {
  let youtubeCalls = 0;
  let jioCalls = 0;

  const resolver = new StreamResolver([
    {
      id: 'embedded',
      canResolve: () => false,
      resolve: async () => { throw new Error('not used'); },
    },
    {
      id: 'youtube',
      canResolve: () => true,
      resolve: async (track) => {
        youtubeCalls += 1;
        return {
          url: 'https://harmonia.test/api/yt-stream?id=dQw4w9WgXcQ',
          track,
          provider: 'youtube',
        };
      },
    },
    {
      id: 'jiosaavn',
      canResolve: () => true,
      resolve: async (track) => {
        jioCalls += 1;
        return {
          url: 'https://saavncdn.com/preferred_160.m4a',
          track,
          provider: 'jiosaavn',
          quality: '160kbps',
          bitrate: 160000,
        };
      },
    },
    {
      id: 'backend-search',
      canResolve: () => true,
      resolve: async () => { throw new Error('fallback should not run'); },
    },
  ], { healthManager: new ProviderHealthManager() });

  const result = await resolver.resolve(song({
    id: 'saavn-1',
    source: 'jiosaavn',
    youtubeId: 'dQw4w9WgXcQ',
  }), { quality: 'normal' });

  assert.equal(result.source, 'jiosaavn');
  assert.equal(jioCalls, 1);
  assert.equal(youtubeCalls, 0);
});

test('31 forceFresh JioSaavn resolution requests a fresh direct stream', async () => {
  let calls = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://stream.test',
    fetchImpl: async (input) => {
      const url = String(input);
      if (!url.includes('jiosaavn.com/api.php')) throw new Error('unexpected fallback');
      calls += 1;
      return json(saavnDetails(
        'fresh-jio',
        `https://aac.saavncdn.com/001/fresh-${calls}_96.mp4?Expires=9999999999`,
        { title: 'Fresh Jio' },
      ));
    },
  });
  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });
  const target = song({ id: 'fresh-jio', source: 'jiosaavn' });

  const first = await resolver.resolve(target, {
    quality: 'normal',
    skipEmbedded: true,
  });
  const second = await resolver.resolve(target, {
    quality: 'normal',
    forceFresh: true,
    skipEmbedded: true,
  });

  assert.equal(calls, 2);
  assert.match(first.url, /fresh-1_160/);
  assert.match(second.url, /fresh-2_160/);
});

test('32 recovery retries alternate embedded candidates before provider fallback', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /hasNextCandidate/);
  assert.match(source, /embeddedCandidateIndex:/);
  assert.match(source, /skipEmbedded: policy\.action !== 'next-candidate'/);
  assert.match(source, /attempt >= 3/);
});

test('33 recovery backoff is immediate, then 500 ms, then 1500 ms', () => {
  assert.equal(
    getPlaybackRecoveryPolicy(PlaybackErrorType.STREAM_URL_EXPIRED, 0).delayMs,
    0
  );
  assert.equal(
    getPlaybackRecoveryPolicy(PlaybackErrorType.STREAM_URL_EXPIRED, 1).delayMs,
    500
  );
  assert.equal(
    getPlaybackRecoveryPolicy(PlaybackErrorType.STREAM_URL_EXPIRED, 2).delayMs,
    1500
  );
});


test('34 direct YouTube Music remains available without a Harmonia API', async () => {
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async () => { throw new Error('not resolving in this assertion'); },
  });
  const youtube = providers.find((provider) => provider.id === 'youtube');
  const youtubeServer = providers.find((provider) => provider.id === 'youtube-server');

  const target = song({
    id: 'dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    source: 'youtube',
  });

  assert.equal(Boolean(youtube?.canResolve(target, {})), true);
  assert.equal(Boolean(youtubeServer?.canResolve(target, {})), false);
});


test('35 direct JioSaavn catalog search works without Harmonia API', async () => {
  const results = await searchDirectJioSaavn('Test Song', {
    limit: 5,
    fetchImpl: async (input) => {
      assert.match(String(input), /jiosaavn\.com\/api\.php/);
      return json({
        results: [{
          id: 'search-1',
          title: 'Test Song',
          image: 'https://c.saavncdn.com/001/cover-150x150.jpg',
          more_info: {
            album: 'Test Album',
            duration: '210',
            artistMap: {
              primary_artists: [{ id: 'artist-1', name: 'Test Artist' }],
            },
          },
        }],
      });
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'search-1');
  assert.equal(results[0].title, 'Test Song');
  assert.deepEqual(results[0].artists, ['Test Artist']);
  assert.match(results[0].image || '', /500x500/);
});


test('36 direct JioSaavn album and artist search work without Harmonia API', async () => {
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('search.getAlbumResults')) {
      return json({
        results: [{
          id: 'album-1',
          title: 'Test Album',
          year: '2026',
          image: 'https://c.saavncdn.com/001/album-150x150.jpg',
          more_info: {
            artistMap: {
              primary_artists: [{ id: 'artist-1', name: 'Test Artist' }],
            },
          },
        }],
      });
    }
    if (url.includes('search.getArtistResults')) {
      return json({
        results: [{
          id: 'artist-1',
          name: 'Test Artist',
          role: 'Music',
          image: 'https://c.saavncdn.com/001/artist-150x150.jpg',
        }],
      });
    }
    return json({}, 404);
  };

  const [albums, artists] = await Promise.all([
    searchDirectJioSaavnAlbums('Test', { fetchImpl, limit: 5 }),
    searchDirectJioSaavnArtists('Test', { fetchImpl, limit: 5 }),
  ]);

  assert.equal(albums[0]?.id, 'album-1');
  assert.equal(albums[0]?.title, 'Test Album');
  assert.deepEqual(albums[0]?.artists, ['Test Artist']);
  assert.match(albums[0]?.image || '', /500x500/);

  assert.equal(artists[0]?.id, 'artist-1');
  assert.equal(artists[0]?.name, 'Test Artist');
  assert.match(artists[0]?.image || '', /500x500/);
});

test('37 player progress is isolated from the main player context', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /const PlaybackProgressContext = createContext/);
  assert.match(source, /export function usePlaybackProgress\(\)/);
  assert.doesNotMatch(
    source.match(/const value = useMemo<PlayerContextValue>[\s\S]*?const progressValue/)?.[0] || '',
    /position: status\.currentTime/
  );
});


test('38 direct YouTube Music player resolution keeps required media headers', async () => {
  const calls: string[] = [];
  const result = await resolveDirectYouTubeMusicTrack('dQw4w9WgXcQ', {
    quality: 'normal',
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('sw.js_data')) {
        return new Response(')]}\'\n["Cg' + 'A'.repeat(44) + '"]', { status: 200 });
      }

      if (url.includes('/youtubei/v1/player')) {
        return json({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            adaptiveFormats: [{
              url: 'https://rr1---sn.test.googlevideo.com/videoplayback?expire=9999999999&c=ANDROID_MUSIC&cver=8.39.42',
              mimeType: 'audio/webm; codecs="opus"',
              bitrate: 158000,
            }],
          },
          videoDetails: {
            videoId: 'dQw4w9WgXcQ',
            title: 'Direct Track',
            author: 'Direct Artist',
            lengthSeconds: '212',
            thumbnail: {
              thumbnails: [{ url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }],
            },
          },
        });
      }

      if (url.includes('googlevideo.com')) {
        assert.equal((init?.headers as Record<string, string>)?.['User-Agent']?.includes('youtube.music'), true);
        assert.equal((init?.headers as Record<string, string>)?.Range, 'bytes=0-131071');
        return new Response('', { status: 206 });
      }

      return json({}, 404);
    },
  });

  assert.ok(result);
  assert.equal(result?.id, 'dQw4w9WgXcQ');
  assert.equal(result?.codec, 'opus');
  assert.equal(result?.mimeType, 'audio/webm');
  assert.equal(result?.bitrate, 158000);
  assert.ok(result?.headers['User-Agent']);
  assert.ok(calls.some((url) => url.includes('/youtubei/v1/player')));
  assert.ok(calls.some((url) => url.includes('googlevideo.com')));
});

test('39 direct YouTube Music search extracts playable track identity', async () => {
  const results = await searchDirectYouTubeMusic('Test Artist Test Song', {
    limit: 5,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('sw.js_data')) {
        return new Response(')]}\'\n["Cg' + 'B'.repeat(44) + '"]', { status: 200 });
      }
      assert.match(url, /music\.youtube\.com\/youtubei\/v1\/search/);
      return json({
        contents: {
          sectionListRenderer: {
            contents: [{
              musicShelfRenderer: {
                contents: [{
                  musicResponsiveListItemRenderer: {
                    playlistItemData: { videoId: 'abcdefghijk' },
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Test Song' }] },
                        },
                      },
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: {
                            runs: [{
                              text: 'Test Artist',
                              navigationEndpoint: {
                                browseEndpoint: {
                                  browseId: 'UC123456789',
                                  browseEndpointContextSupportedConfigs: {
                                    browseEndpointContextMusicConfig: {
                                      pageType: 'MUSIC_PAGE_TYPE_ARTIST',
                                    },
                                  },
                                },
                              },
                            }, { text: ' • ' }, { text: '3:30' }],
                          },
                        },
                      },
                    ],
                    thumbnail: {
                      musicThumbnailRenderer: {
                        thumbnail: {
                          thumbnails: [{ url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' }],
                        },
                      },
                    },
                  },
                }],
              },
            }],
          },
        },
      });
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'abcdefghijk');
  assert.equal(results[0].title, 'Test Song');
  assert.deepEqual(results[0].artists, ['Test Artist']);
  assert.equal(results[0].duration, 210);
});

test('40 resolver uses direct YouTube before the optional Harmonia YouTube server', async () => {
  let directPlayerCalls = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://harmonia.test',
    fetchImpl: async (input) => {
      const url = String(input);

      if (url.includes('jiosaavn.com/api.php')) return json({ results: [] });
      if (url.includes('sw.js_data')) {
        return new Response(')]}\'\n["Cg' + 'C'.repeat(44) + '"]', { status: 200 });
      }
      if (url.includes('/youtubei/v1/search')) {
        return json({ contents: {} });
      }
      if (url.includes('/youtubei/v1/player')) {
        directPlayerCalls += 1;
        return json({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            adaptiveFormats: [{
              url: 'https://rr2---sn.test.googlevideo.com/videoplayback?expire=9999999999&c=ANDROID_MUSIC',
              mimeType: 'audio/mp4; codecs="mp4a.40.2"',
              bitrate: 128000,
            }],
          },
          videoDetails: {
            title: 'Test Song',
            author: 'Test Artist',
            lengthSeconds: '180',
          },
        });
      }
      if (url.includes('googlevideo.com')) return new Response('', { status: 206 });
      throw new Error('server fallback must not be fetched');
    },
  });

  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({
    id: 'dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    source: 'youtube',
  }), { quality: 'normal' });

  assert.equal(result.source, 'youtube');
  assert.equal(result.provider, 'youtube');
  assert.equal(result.headers?.['User-Agent']?.includes('youtube.music'), true);
  assert.equal(directPlayerCalls, 1);
});

test('41 direct YouTube refusal falls through to Harmonia server when configured', async () => {
  const providers = createHarmoniaProviders({
    streamApiBase: 'https://harmonia.test',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('sw.js_data')) {
        return new Response(')]}\'\n["Cg' + 'D'.repeat(44) + '"]', { status: 200 });
      }
      if (url.includes('/youtubei/v1/player')) {
        return json({
          playabilityStatus: {
            status: 'LOGIN_REQUIRED',
            reason: 'Sign in to confirm your age',
          },
        });
      }
      return json({}, 404);
    },
  });

  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({
    id: 'dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    source: 'youtube',
  }));

  assert.equal(result.source, 'youtube-server');
  assert.equal(result.url, 'https://harmonia.test/api/yt-stream?id=dQw4w9WgXcQ');
});


test('42 YouTube-identified songs still prefer a JioSaavn metadata match', async () => {
  let youtubeCalls = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('jiosaavn.com/api.php')) {
        return json({
          results: [{
            id: 'jio-youtube-match',
            title: 'Test Song',
            image: 'https://c.saavncdn.com/001/cover-150x150.jpg',
            more_info: {
              album: 'Album',
              duration: '180',
              encrypted_media_url: encryptedSaavnUrl(
                'https://aac.saavncdn.com/001/match_96.mp4?Expires=9999999999'
              ),
              '320kbps': 'true',
              artistMap: {
                primary_artists: [{ id: 'artist-1', name: 'Test Artist' }],
              },
            },
          }],
        });
      }
      if (url.includes('youtube')) youtubeCalls += 1;
      return json({}, 404);
    },
  });

  const resolver = new StreamResolver(providers, {
    healthManager: new ProviderHealthManager(),
  });

  const result = await resolver.resolve(song({
    id: 'dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    source: 'youtube',
    name: 'Test Song',
    title: 'Test Song',
    artist: 'Test Artist',
    duration: 180,
  }), { quality: 'normal' });

  assert.equal(result.source, 'jiosaavn');
  assert.equal(youtubeCalls, 0);
});


test('39 JioSaavn playback matching preserves Harmonia catalog identity', async () => {
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async (input) => {
      const url = String(input);
      if (!url.includes('search.getResults')) throw new Error('unexpected request');

      return json({
        results: [{
          id: 'saavn-match-1',
          title: 'Canonical Song',
          image: 'https://c.saavncdn.com/001/cover-150x150.jpg',
          more_info: {
            album: 'Provider Album',
            duration: '200',
            encrypted_media_url: encryptedSaavnUrl(
              'https://aac.saavncdn.com/001/provider_96.mp4?Expires=9999999999'
            ),
            '320kbps': 'true',
            artistMap: {
              primary_artists: [{ id: 'artist-1', name: 'Canonical Artist' }],
            },
          },
        }],
      });
    },
  });

  const jio = providers.find((provider) => provider.id === 'jiosaavn');
  assert.ok(jio);

  const original = song({
    id: 'harmonia-catalog-id',
    songId: 'harmonia-catalog-id',
    name: 'Canonical Song',
    title: 'Canonical Song',
    artist: 'Canonical Artist',
    source: 'harmonia',
    provider: 'harmonia',
    spotifyId: '0123456789ABCDEFGHIJKL',
    image: [{ quality: '500x500', url: 'https://harmonia.test/canonical.jpg' }],
    duration: 200,
  });

  const resolved = await jio!.resolve(original, {
    quality: 'normal',
  });

  assert.ok(resolved.track);
  const resolvedTrack = resolved.track!;
  assert.equal(resolvedTrack.id, 'harmonia-catalog-id');
  assert.equal(resolvedTrack.songId, 'harmonia-catalog-id');
  assert.equal((resolvedTrack as any).saavnId, 'saavn-match-1');
  assert.equal((resolvedTrack as any).jiosaavnId, 'saavn-match-1');
  assert.equal((resolvedTrack as any).playbackProvider, 'jiosaavn');
  assert.equal(resolvedTrack.source, 'harmonia');
  assert.equal(resolvedTrack.provider, 'harmonia');
  assert.equal(resolvedTrack.spotifyId, '0123456789ABCDEFGHIJKL');
  assert.deepEqual(resolvedTrack.image, original.image);
  assert.equal(resolved.provider, 'jiosaavn');
  assert.match(resolved.url, /provider_160/);
});


test('40 stale JioSaavn ids fall back to recording matching', async () => {
  let detailCalls = 0;
  let searchCalls = 0;
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('song.getDetails')) {
        detailCalls += 1;
        return json({});
      }
      if (url.includes('search.getResults')) {
        searchCalls += 1;
        return json({
          results: [{
            id: 'fresh-saavn-id',
            title: 'Stale Source Song',
            image: 'https://c.saavncdn.com/001/cover-150x150.jpg',
            more_info: {
              duration: '180',
              encrypted_media_url: encryptedSaavnUrl(
                'https://aac.saavncdn.com/001/fresh_96.mp4?Expires=9999999999'
              ),
              '320kbps': 'true',
              artistMap: {
                primary_artists: [{ id: 'artist-1', name: 'Source Artist' }],
              },
            },
          }],
        });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const jio = providers.find((provider) => provider.id === 'jiosaavn');
  assert.ok(jio);

  const resolved = await jio!.resolve(song({
    id: 'stale-catalog-id',
    songId: 'stale-catalog-id',
    name: 'Stale Source Song',
    artist: 'Source Artist',
    source: 'jiosaavn',
    duration: 180,
  }), { quality: 'normal' });

  assert.equal(detailCalls, 1);
  assert.equal(searchCalls, 1);
  assert.ok(resolved.track);
  const recoveredTrack = resolved.track!;
  assert.equal(recoveredTrack.id, 'stale-catalog-id');
  assert.equal((recoveredTrack as any).saavnId, 'fresh-saavn-id');
  assert.match(resolved.url, /fresh_160/);
});


test('43 decode failures prefer another embedded candidate like Harmonia Web', () => {
  assert.equal(
    getPlaybackRecoveryPolicy(
      PlaybackErrorType.AUDIO_DECODING_ERROR,
      0,
      { hasNextCandidate: true }
    ).action,
    'next-candidate'
  );
});

test('provider source errors try each unfailed quality candidate', () => {
  const candidates = [
    { url: 'https://aac.saavncdn.com/kalyani_320.mp4' },
    { url: 'https://aac.saavncdn.com/kalyani_160.mp4' },
    { url: 'https://aac.saavncdn.com/kalyani_96.mp4' },
  ];
  const failed = new Set([candidates[2].url]);

  assert.equal(nextUntriedCandidateIndex(candidates, failed), 0);
  assert.equal(
    getPlaybackRecoveryPolicy(PlaybackErrorType.PROVIDER_ERROR, 0, {
      hasNextCandidate: true,
    }).action,
    'next-candidate'
  );

  failed.add(candidates[0].url);
  assert.equal(nextUntriedCandidateIndex(candidates, failed), 1);
  failed.add(candidates[1].url);
  assert.equal(nextUntriedCandidateIndex(candidates, failed), -1);
  assert.equal(
    classifyPlaybackError(new Error('Android player failed: Source error')).type,
    PlaybackErrorType.PROVIDER_ERROR
  );
});

test('44 resolver can select the next embedded candidate during recovery', async () => {
  const resolver = new StreamResolver(createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async () => { throw new Error('network must not be called'); },
  }), { healthManager: new ProviderHealthManager() });

  const target = song({
    downloadUrl: [
      { url: 'https://cdn.test/160.m4a', quality: '160kbps', bitrate: 160 },
      { url: 'https://cdn.test/96.m4a', quality: '96kbps', bitrate: 96 },
    ],
  });

  const result = await resolver.resolve(target, {
    quality: 'normal',
    forceFresh: true,
    embeddedCandidateIndex: 1,
  });

  assert.equal(result.source, 'embedded');
  assert.match(result.url, /96\.m4a/);
});

test('45 normalization preserves string artist names and alternate stable ids', () => {
  const normalized = normalizeSong({
    _id: 'mongo-track-id',
    name: 'Encoded &amp; Song',
    artists: ['Artist One', { name: 'Artist Two' }],
  } as any);

  assert.equal(normalized.id, 'mongo-track-id');
  assert.equal(normalized.songId, 'mongo-track-id');
  assert.equal(normalized.name, 'Encoded & Song');
  assert.equal(artistNames(normalized), 'Artist One, Artist Two');
});

test('46 artwork follows Harmonia Web priority and selects the sharp Spotify image', () => {
  const normalized = normalizeSong({
    id: 'art-track',
    name: 'Artwork Song',
    artist: 'Artist',
    spotifyImages: [
      {
        url: 'http://image-cdn-ak.spotifycdn.com/image/small',
        width: 64,
        height: 64,
      },
      {
        url: 'http://image-cdn-ak.spotifycdn.com/image/large',
        width: 640,
        height: 640,
      },
    ],
    image: [{ quality: '500x500', url: 'https://provider.test/cover.jpg' }],
  } as any);

  assert.equal(artworkUrl(normalized), 'https://i.scdn.co/image/large');
});

test('47 provider timeouts remain fallback failures instead of caller cancellations', async () => {
  const saavn = await searchDirectJioSaavn('timeout test', {
    timeoutMs: 5,
    fetchImpl: async (_input, init) => waitForAbort(init?.signal),
  });
  assert.deepEqual(saavn, []);

  let timedYouTubeRequests = 0;
  const youtube = await searchDirectYouTubeMusic('timeout test', {
    timeoutMs: 5,
    fetchImpl: async (input, init) => {
      if (String(input).includes('/sw.js_data')) {
        return new Response('', { status: 200 });
      }
      timedYouTubeRequests += 1;
      return waitForAbort(init?.signal);
    },
  });
  assert.deepEqual(youtube, []);
  assert.equal(timedYouTubeRequests, 1);
});

test('48 caller cancellation still stops direct providers immediately', async () => {
  const controller = new AbortController();
  const pending = searchDirectJioSaavn('cancel test', {
    timeoutMs: 1_000,
    signal: controller.signal,
    fetchImpl: async (_input, init) => waitForAbort(init?.signal),
  });
  controller.abort();
  await assert.rejects(pending, (error: any) => error?.name === 'AbortError');

  const youtubeController = new AbortController();
  const youtubePending = searchDirectYouTubeMusic('cancel test', {
    timeoutMs: 1_000,
    signal: youtubeController.signal,
    fetchImpl: async (_input, init) => waitForAbort(init?.signal),
  });
  youtubeController.abort();
  await assert.rejects(
    youtubePending,
    (error: any) => error?.name === 'AbortError'
  );
});

test('49 embedded candidates infer CDN bitrate and honor the requested ceiling', () => {
  const target = song({
    downloadUrl: [
      { url: 'https://aac.saavncdn.com/001/song_96.mp4?token=a' },
      { url: 'https://aac.saavncdn.com/001/song_320.mp4?token=b' },
      { url: 'https://aac.saavncdn.com/001/song_160.mp4?token=c' },
    ],
  });

  const normal = getAudioCandidates(target, 'normal');
  const maximum = getAudioCandidates(target, 'maximum');

  assert.match(normal[0].url, /_160\.mp4/);
  assert.equal(normal[0].bitrate, 160000);
  assert.match(maximum[0].url, /_320\.mp4/);
  assert.equal(maximum[0].bitrate, 320000);
});

test('50 playback defaults favor high cellular quality with a larger forward buffer', async () => {
  const preferences = await readFile('src/providers/PreferencesProvider.tsx', 'utf8');
  const player = await readFile('src/providers/PlayerProvider.tsx', 'utf8');

  assert.match(preferences, /cellularQuality: 'high'/);
  assert.match(player, /preferredForwardBufferDuration: 18/);
});

test('51 JioSaavn does not label an unknown CDN URL as 320kbps', async () => {
  const providers = createHarmoniaProviders({
    streamApiBase: '',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('song.getDetails')) {
        return json(saavnDetails(
          'unknown-quality-id',
          'https://aac.saavncdn.com/001/tokenized-audio.mp4?Expires=9999999999',
          { supports320: true }
        ));
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const jio = providers.find((provider) => provider.id === 'jiosaavn');
  assert.ok(jio);

  const resolved = await jio!.resolve(song({
    id: 'unknown-quality-id',
    songId: 'unknown-quality-id',
    source: 'jiosaavn',
  }), { quality: 'maximum' });

  assert.equal(resolved.bitrate, null);
  assert.equal(resolved.quality, 'unknown');
});


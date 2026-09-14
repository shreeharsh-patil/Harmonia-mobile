import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferDownloadExtension } from '../../src/lib/downloads';
import { MetadataMemoryCache } from '../../src/lib/playback/streamCache';

test('download extension follows actual resolved media container', () => {
  assert.equal(inferDownloadExtension('https://cdn.test/audio', 'audio/webm', 'opus'), 'webm');
  assert.equal(inferDownloadExtension('https://cdn.test/audio.mp3', null, null), 'mp3');
  assert.equal(inferDownloadExtension('https://cdn.test/audio.flac', null, null), 'flac');
  assert.equal(inferDownloadExtension('https://cdn.test/audio.mp4', 'audio/mp4', null), 'm4a');
});

test('live player queue preserves embedded audio while persisted snapshots sanitize it', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');

  assert.match(
    source,
    /const normalizedQueue = \(contextQueue\?\.length[\s\S]*?\.map\(\(item\) => normalizeSong\(item as any\)\)/
  );
  assert.match(source, /nextQueue\[index\] = normalizeSong\(resolved\.song as any\)/);
  assert.match(source, /const currentWindow = createQueueWindow\(queue, currentIndex, 100\)/);
  assert.match(source, /queue: currentWindow\.items\.map\(persistenceSafeSong\)/);
});

test('legacy playback history is sanitized during hydration', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /sanitizedHistory/);
  assert.match(source, /persistenceSafeSong\(normalizeSong\(entry\.song as any\)\)/);
});

test('auth keeps cached sessions on transient failures and clears rejected credentials', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  assert.match(source, /readCachedUser\(\)/);
  assert.match(source, /cause instanceof ApiError/);
  assert.match(source, /cause\.status === 401 \|\| cause\.status === 403/);
  assert.match(source, /writeCachedUser\(result\.user\)/);
});

test('social auth always releases its busy state when the browser closes', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  assert.match(
    source,
    /signInWithProvider[\s\S]*?finally \{[\s\S]*?setAuthenticating\(false\)/
  );
});

test('API requests have a bounded timeout and preserve caller cancellation', async () => {
  const source = await readFile('src/lib/api.ts', 'utf8');
  assert.match(source, /DEFAULT_API_TIMEOUT_MS = 15_000/);
  assert.match(source, /parentSignal\?\.addEventListener\('abort'/);
  assert.match(source, /Request timed out\. Check your connection and try again\./);
  assert.match(source, /parentSignal\?\.aborted \|\| cause\?\.name === 'AbortError'/);
});

test('library responses are generation guarded against account-switch races', async () => {
  const source = await readFile('src/providers/LibraryProvider.tsx', 'utf8');
  assert.match(source, /loadGenerationRef/);
  assert.match(source, /generation !== loadGenerationRef\.current/);
});

test('offline download mutations use live refs instead of stale closures', async () => {
  const source = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  assert.match(source, /downloadsRef/);
  assert.match(source, /activeDownloadsRef/);
  assert.match(source, /downloadsRef\.current\.filter/);
  assert.match(source, /activeDownloadsRef\.current\.delete\(id\)/);
});

test('home feed does not let stale account requests overwrite newer state', async () => {
  const source = await readFile('app/(tabs)/index.tsx', 'utf8');
  assert.match(source, /loadGenerationRef/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /generation !== loadGenerationRef\.current/);
});

test('OAuth deep links dedupe one-time mobile tickets', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  assert.match(source, /activeTicketRef/);
  assert.match(source, /completedTicketsRef/);
  assert.match(source, /completedTicketsRef\.current\.has\(ticket\)/);
  assert.match(source, /completedTicketsRef\.current\.add\(ticket\)/);
});

test('detail routes ignore stale navigation responses', async () => {
  const paths = [
    'app/album/[id].tsx',
    'app/artist/[id].tsx',
    'app/playlist/[id].tsx',
    'app/mix/[id].tsx',
  ];

  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /loadGenerationRef/);
    assert.match(source, /loadGenerationRef\.current/);
  }
});

test('Canvas lookup cleanup cannot clear newer artwork state', async () => {
  const source = await readFile('src/components/ArtworkRenderer.tsx', 'utf8');
  assert.match(source, /let active = true/);
  assert.match(source, /if \(!active\) return/);
  assert.match(source, /if \(!active \|\| cause\?\.name === 'AbortError'\) return/);
  assert.match(source, /active = false/);
  assert.match(source, /controller\.abort\(\)/);
});

test('clearing downloads cancels in-flight download tasks', async () => {
  const source = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  assert.match(source, /activeDownloadTasksRef/);
  assert.match(source, /cancelledDownloadsRef/);
  assert.match(source, /activeDownloadTasksRef\.current\.get\(id\)\?\.cancel\(\)/);
  assert.match(source, /cancelledDownloadsRef\.current\.has\(id\)/);
});

test('player hydration and radio continuation are generation guarded', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /restoreGeneration = loadGenerationRef\.current/);
  assert.match(source, /loadGenerationRef\.current !== restoreGeneration/);
  assert.match(source, /endGeneration = loadGenerationRef\.current/);
  assert.match(source, /endGeneration !== loadGenerationRef\.current/);
});



test('radio suggestions fall back to local catalog and direct JioSaavn when backend is absent', async () => {
  const source = await readFile('src/lib/api.ts', 'utf8');
  assert.match(source, /if \(HAS_HARMONIA_API\) \{[\s\S]*?Radio should survive account\/catalog backend outages/);
  assert.match(source, /searchStaticCatalog\(query, candidateLimit\)/);
  assert.match(source, /searchDirectJioSaavn\(query, \{ limit: candidateLimit \}\)/);
  assert.match(source, /diversifySuggestions\(seed, candidates/);
});

test('search UI no longer downgrades backend-free discovery to song-only copy', async () => {
  const source = await readFile('app/(tabs)/search.tsx', 'utf8');
  assert.match(source, /placeholder="Songs, artists, albums, playlists"/);
  assert.match(source, /Bundled Harmonia discovery plus direct JioSaavn/);
});


test('Wi-Fi-only downloads are persisted and enforced before stream resolution', async () => {
  const prefs = await readFile('src/providers/PreferencesProvider.tsx', 'utf8');
  const offline = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  const settings = await readFile('app/settings.tsx', 'utf8');

  assert.match(prefs, /wifiOnlyDownloads: boolean/);
  assert.match(prefs, /setWifiOnlyDownloadsState/);
  assert.match(prefs, /persist\(\{ wifiOnlyDownloads: enabled \}\)/);

  assert.match(offline, /wifiOnlyDownloads &&/);
  assert.match(offline, /NetworkStateType\.WIFI/);
  assert.match(offline, /NetworkStateType\.ETHERNET/);
  assert.match(offline, /Wi-Fi-only downloads are enabled/);

  assert.match(settings, /title="Wi-Fi-only downloads"/);
  assert.match(settings, /setWifiOnlyDownloads\(!wifiOnlyDownloads\)/);
});


test('direct provider headers reach native playback and offline downloads', async () => {
  const player = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  const offline = await readFile('src/providers/OfflineProvider.tsx', 'utf8');

  assert.match(player, /nativeAudioSource\(resolved\.url, resolved\.headers\)/);
  assert.match(player, /nativeAudioSource\(candidate\.url, candidate\.headers\)/);
  assert.match(player, /headers = resolved\.headers/);

  assert.match(offline, /resolved\.headers \? \{ headers: resolved\.headers \}/);
});

test('YouTube direct fallback keeps canonical Harmonia identity', async () => {
  const source = await readFile('src/lib/playback/streamResolver.ts', 'utf8');

  assert.match(source, /Preserve Harmonia\/Spotify identity/);
  assert.match(source, /videoId: match\.id/);
  assert.match(source, /youtubeId: match\.id/);
  assert.doesNotMatch(
    source.match(/const detailed = normalizeSong\(\{[\s\S]*?\} as any\);/)?.[0] || '',
    /id: match\.id/
  );
});


test('listening history records only after native playback actually starts', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /pendingHistoryRef/);
  assert.match(source, /if \(!status\.playing \|\| status\.error\) return/);
  assert.match(source, /pendingHistoryRef\.current = null;[\s\S]*?recordHistory\(pending\.song\)/);
});


test('library mutations dedupe rapid repeated toggles without whole-library refresh races', async () => {
  const source = await readFile('src/providers/LibraryProvider.tsx', 'utf8');
  assert.match(source, /mutationKeysRef = useRef\(new Set<string>\(\)\)/);
  assert.match(source, /tokenRef = useRef\(token\)/);
  assert.match(source, /tokenRef\.current !== token/);
  assert.match(source, /mutationKey = `song:\$\{normalized\.id\}`/);
  assert.match(source, /mutationKey = `playlist:\$\{id\}`/);
  assert.match(source, /mutationKey = `album:\$\{id\}`/);
  assert.match(source, /mutationKey = `artist:\$\{id\}`/);
  assert.match(source, /mutationKey = `create-playlist:\$\{cleanName\.toLowerCase\(\)\}`/);
  assert.match(source, /mutationKey = `add-to-playlist:\$\{playlistId\}:\$\{songId\}`/);
  assert.match(source, /mutationKeysRef\.current\.has\(mutationKey\)/);
  assert.match(source, /finally \{[\s\S]*?mutationKeysRef\.current\.delete\(mutationKey\)/);
});

test('clearing downloads invalidates completions that race native task cancellation', async () => {
  const source = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  assert.match(source, /downloadEpochRef = useRef\(0\)/);
  assert.match(source, /const downloadEpoch = downloadEpochRef\.current/);
  assert.match(source, /downloadEpoch !== downloadEpochRef\.current/);
  assert.match(source, /downloadEpochRef\.current \+= 1/);
});

test('Explore ignores stale account and refresh responses after rerender or navigation', async () => {
  const source = await readFile('app/explore.tsx', 'utf8');
  assert.match(source, /loadGenerationRef = useRef\(0\)/);
  assert.match(source, /const generation = \+\+loadGenerationRef\.current/);
  assert.match(source, /generation !== loadGenerationRef\.current/);
  assert.match(source, /loadGenerationRef\.current \+= 1/);
});

test('radio continuation never overwrites a queue edited while suggestions are in flight', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  const guards = source.match(/queueRef\.current !== list/g) || [];
  assert.ok(guards.length >= 2);
  assert.match(source, /queueRef\.current\[endIndex \+ 1\]/);
  assert.match(source, /await loadIndex\(endIndex \+ 1, true, 0\)/);
});


test('invalidated in-flight metadata cannot repopulate the cache', async () => {
  const cache = new MetadataMemoryCache<string>();
  let resolveLoader!: (value: string) => void;
  const first = cache.getOrLoad(
    'track',
    () => new Promise<string>((resolve) => {
      resolveLoader = resolve;
    })
  );

  cache.invalidate('track');
  resolveLoader('stale');
  assert.equal(await first, 'stale');
  assert.equal(cache.get('track'), null);

  assert.equal(await cache.getOrLoad('track', async () => 'fresh'), 'fresh');
  assert.equal(cache.get('track'), 'fresh');
});


test('account refresh cannot overwrite or clear a newer session', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  assert.match(source, /tokenRef = useRef\(token\)/);
  assert.match(source, /const refreshToken = token/);
  assert.match(source, /tokenRef\.current !== refreshToken/);
  assert.match(source, /tokenRef\.current === refreshToken/);
});

test('preferences merge early user changes over asynchronous hydration', async () => {
  const source = await readFile('src/providers/PreferencesProvider.tsx', 'utf8');
  assert.match(source, /hydratedRef = useRef\(false\)/);
  assert.match(source, /pendingChangesRef/);
  assert.match(source, /const merged: StoredPreferences = \{[\s\S]*?\.\.\.restored,[\s\S]*?\.\.\.pending/);
  assert.match(source, /if \(!hydratedRef\.current\)/);
  assert.match(source, /writeChainRef/);
});

test('recent searches reject stale hydration and serialize storage writes', async () => {
  const source = await readFile('app/(tabs)/search.tsx', 'utf8');
  assert.match(source, /recentSearchesRef/);
  assert.match(source, /recentMutationRef/);
  assert.match(source, /generation !== recentMutationRef\.current/);
  assert.match(source, /recentWriteChainRef/);
  assert.match(source, /recentMutationRef\.current \+= 1/);
});

test('app update checks cannot hang indefinitely', async () => {
  const source = await readFile('src/lib/updates.ts', 'utf8');
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /clearTimeout\(timeout\)/);
});

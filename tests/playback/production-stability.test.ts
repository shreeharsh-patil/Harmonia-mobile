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
  assert.match(source, /storedHistory = parsedHistory/);
  assert.match(source, /persistenceSafeSong\(normalizeSong\(entry\.song as any\)\)/);
  assert.match(source, /const mergedHistory = \[/);
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
  assert.match(
    source,
    /catch \(cause: any\) \{[\s\S]*?if \(parentSignal\?\.aborted\)[\s\S]*?if \(timedOut && cause\?\.name === 'AbortError'\)/
  );
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

test('home quick access refreshes and preserves recently played playlist metadata', async () => {
  const home = await readFile('app/(tabs)/index.tsx', 'utf8');
  const playlist = await readFile('app/(tabs)/playlist/[id].tsx', 'utf8');
  const api = await readFile('src/lib/api.ts', 'utf8');

  assert.match(home, /const refreshRecentPlaylistsSilently = useCallback/);
  assert.match(home, /useFocusEffect\([\s\S]*?refreshRecentPlaylistsSilently/);
  assert.match(playlist, /trackRecentlyPlayedPlaylist\(token, \{[\s\S]*?\.\.\.detail/);
  assert.match(api, /const name = String\(item\.name \|\| item\.playlistName \|\| item\.title/);
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
    'app/(tabs)/album/[id].tsx',
    'app/(tabs)/artist/[id].tsx',
    'app/(tabs)/playlist/[id].tsx',
    'app/(tabs)/mix/[id].tsx',
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
  assert.match(source, /if \((?:HAS_HARMONIA_API|hasHarmoniaApi\(\))\) \{[\s\S]*?Radio should survive account\/catalog backend outages/);
  assert.match(source, /searchStaticCatalog\(query, candidateLimit\)/);
  assert.match(source, /searchDirectJioSaavn\(query, \{ limit: candidateLimit \}\)/);
  assert.match(source, /diversifySuggestions\(seed, candidates/);
});

test('search UI keeps full Harmonia discovery and opens dedicated catalog cards', async () => {
  const source = await readFile('app/(tabs)/search.tsx', 'utf8');
  const catalogs = await readFile('src/lib/browseCatalog.ts', 'utf8');
  assert.ok(source.includes('placeholder="What do you want to listen to?"'));
  assert.match(source, /BROWSE_CATALOGS/);
  assert.doesNotMatch(source, />Browse all</);
  assert.match(source, /pathname: '\/catalog\/\[id\]'/);
  assert.doesNotMatch(catalogs, /name: 'Live Radio'/);
  assert.doesNotMatch(catalogs, /id: 'radio'/);
  assert.match(catalogs, /name: 'Rock'/);
  assert.match(source, /BROWSE_CATALOGS\.map/);
  assert.doesNotMatch(source, /showAllCategories/);
  assert.match(source, /height: 112/);
  assert.match(source, /searchMusic\(trimmed, 30, controller\.signal\)/);
});

test('browse catalogs use grouped shelves, working Show all routes, and bounded caching', async () => {
  const catalog = await readFile('app/(tabs)/catalog/[id]/index.tsx', 'utf8');
  const section = await readFile('app/(tabs)/catalog/[id]/section/[sectionId].tsx', 'utf8');
  const tabs = await readFile('app/(tabs)/_layout.tsx', 'utf8');
  const data = await readFile('src/lib/browseCatalog.ts', 'utf8');

  assert.match(catalog, /backgroundColor: catalog\.color/);
  assert.match(catalog, />Show all</);
  assert.match(catalog, /pathname: '\/catalog\/\[id\]\/section\/\[sectionId\]'/);
  assert.match(section, /numColumns=\{2\}/);
  assert.match(tabs, /name="catalog" options=\{\{ href: null \}\}/);
  assert.match(data, /Promise\.allSettled/);
  assert.match(data, /CATALOG_TTL_MS/);
  assert.match(data, /catalogRequests/);
});

test('bottom navigation excludes the removed Create tab', async () => {
  const source = await readFile('app/(tabs)/_layout.tsx', 'utf8');
  assert.doesNotMatch(source, /name="create"/);
  assert.doesNotMatch(source, /title: 'Create'/);
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
  assert.match(source, /mutationKey = `\$\{token\}:song:\$\{normalized\.id\}`/);
  assert.match(source, /mutationKey = `\$\{token\}:playlist:\$\{id\}`/);
  assert.match(source, /mutationKey = `\$\{token\}:album:\$\{id\}`/);
  assert.match(source, /mutationKey = `\$\{token\}:artist:\$\{id\}`/);
  assert.match(source, /mutationKey = `\$\{token\}:create-playlist:\$\{cleanName\.toLowerCase\(\)\}`/);
  assert.match(source, /mutationKey = `\$\{token\}:add-to-playlist:\$\{playlistId\}:\$\{songId\}`/);
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

test('search terms are never stored or displayed as search history', async () => {
  const source = await readFile('app/(tabs)/search.tsx', 'utf8');
  assert.match(source, /AsyncStorage\.removeItem\(RECENT_SEARCHES_KEY\)/);
  assert.doesNotMatch(source, /AsyncStorage\.setItem\(RECENT_SEARCHES_KEY/);
  assert.doesNotMatch(source, /AsyncStorage\.getItem\(RECENT_SEARCHES_KEY/);
  assert.doesNotMatch(source, /Recent searches/);
});

test('app update checks cannot hang indefinitely', async () => {
  const source = await readFile('src/lib/updates.ts', 'utf8');
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /clearTimeout\(timeout\)/);
});


test('player settings preserve live changes made before storage hydration finishes', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /settingsHydratedRef = useRef\(false\)/);
  assert.match(source, /pendingSettingsRef/);
  assert.match(source, /const mergedSettings: PersistedPlayerSettings = \{[\s\S]*?\.\.\.restoredSettings,[\s\S]*?\.\.\.pendingSettings/);
  assert.match(source, /persistSettings\(\{ playbackRate: normalized \}\)/);
  assert.match(source, /persistSettings\(\{ streamQuality: quality \}\)/);
  assert.match(source, /settingsWriteChainRef/);
});

test('player history and listening stats merge live activity over startup hydration', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /historyHydratedRef = useRef\(false\)/);
  assert.match(source, /statsHydratedRef = useRef\(false\)/);
  assert.match(source, /pendingHistoryEntriesRef/);
  assert.match(source, /pendingStatsDeltaRef/);
  assert.match(source, /const mergedHistory = \[/);
  assert.match(source, /const mergedStats = mergeListeningStats\(storedStats, pendingStats\)/);
  assert.match(source, /historyClearedBeforeHydrationRef/);
  assert.match(source, /statsClearedBeforeHydrationRef/);
  assert.match(source, /historyWriteChainRef/);
  assert.match(source, /statsWriteChainRef/);
});

test('corrupt player persistence is repaired per key instead of aborting all hydration', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /AsyncStorage\.removeItem\(HISTORY_KEY\)/);
  assert.match(source, /AsyncStorage\.removeItem\(LISTENING_STATS_KEY\)/);
  assert.match(source, /AsyncStorage\.removeItem\(PLAYER_SETTINGS_KEY\)/);
  assert.match(source, /let snapshot: PlaybackSnapshot/);
});


test('offline index hydration cannot overwrite downloads started during app startup', async () => {
  const source = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  assert.match(source, /downloadsMutationRef = useRef\(0\)/);
  assert.match(source, /const hydrationGeneration = downloadsMutationRef\.current/);
  assert.match(source, /downloadsMutationRef\.current !== hydrationGeneration/);
  assert.match(source, /downloadsMutationRef\.current \+= 1/);
  assert.match(source, /downloadsWriteChainRef/);
});


test('library mutation locks are isolated per authenticated account', async () => {
  const source = await readFile('src/providers/LibraryProvider.tsx', 'utf8');
  const scopedKeys = source.match(/const mutationKey = `\$\{token\}:/g) || [];
  assert.ok(scopedKeys.length >= 6);
});


test('corrupt preferences are repaired without leaving rejected write promises', async () => {
  const source = await readFile('src/providers/PreferencesProvider.tsx', 'utf8');
  assert.match(source, /try \{[\s\S]*?JSON\.parse\(raw\)/);
  assert.match(source, /AsyncStorage\.removeItem\(PREFS_KEY\)/);
  assert.match(source, /writeChainRef\.current = writeChainRef\.current[\s\S]*?\.catch\(\(\) => \{\}\)/);
});

test('player settings persistence handles storage failures after ordered writes', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /settingsWriteChainRef\.current = settingsWriteChainRef\.current[\s\S]*?\.catch\(\(\) => \{\}\)/);
});


test('playlist artwork falls back through web-compatible fields and track artwork', async () => {
  const source = await readFile('src/components/PlaylistArtwork.tsx', 'utf8');
  assert.match(source, /raw\.spotifyImages/);
  assert.match(source, /raw\.coverImage/);
  assert.match(source, /raw\.thumbnailUrl/);
  assert.match(source, /raw\.sourceTracks/);
  assert.match(source, /artworkUrl\(normalizeSong\(track as any\), targetSize\)/);
});

test('native recovery tracks failed stream URLs before retrying candidates', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /failedStreamUrlsRef/);
  assert.match(source, /failedStreamUrlsRef\.current\.urls\.add/);
  assert.match(source, /getAudioCandidates\(/);
  assert.match(source, /nextEmbeddedCandidateIndex/);
});


test('embedded CDN failure does not blacklist the fresh provider fallback', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /failedStreamUrlsRef/);
  assert.match(source, /failedProvidersRef/);
  assert.match(source, /failedProviders\.length/);
});


test('tab screens share dynamic bottom insets with the floating mini player', async () => {
  const mini = await readFile('src/components/MiniPlayer.tsx', 'utf8');
  assert.match(mini, /export function getTabContentBottomInset/);
  assert.match(mini, /TAB_BAR_HEIGHT/);
  assert.match(mini, /MINI_PLAYER_HEIGHT/);

  for (const path of [
    'app/(tabs)/index.tsx',
    'app/(tabs)/search.tsx',
    'app/(tabs)/library.tsx',
    'app/(tabs)/profile.tsx',
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /getTabContentBottomInset/);
    assert.match(source, /useSafeAreaInsets/);
  }
});

test('stack detail screens reserve the real bottom safe area instead of tab-player padding', async () => {
  for (const path of [
    'app/(tabs)/album/[id].tsx',
    'app/(tabs)/artist/[id].tsx',
    'app/(tabs)/playlist/[id].tsx',
    'app/(tabs)/mix/[id].tsx',
    'app/settings.tsx',
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /edges=\{\['top', 'bottom'\]\}/);
  }

  for (const path of [
    'app/(tabs)/album/[id].tsx',
    'app/(tabs)/artist/[id].tsx',
    'app/(tabs)/playlist/[id].tsx',
    'app/(tabs)/mix/[id].tsx',
  ]) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /paddingBottom: 150/);
  }
});

test('song action sheet applies the device bottom inset', async () => {
  const source = await readFile('src/components/SongActionsSheet.tsx', 'utf8');
  assert.match(source, /useSafeAreaInsets/);
  assert.match(source, /Math\.max\(28, insets\.bottom \+ 16\)/);
});

test('artwork rendering requests size-appropriate images', async () => {
  const trackArtwork = await readFile('src/components/TrackArtwork.tsx', 'utf8');
  const player = await readFile('app/player.tsx', 'utf8');
  const provider = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  const entities = await readFile('src/lib/entities.ts', 'utf8');

  assert.match(trackArtwork, /artworkUrl\(song, size\)/);
  assert.match(player, /artworkUrl\(currentSong, 360\)/);
  assert.match(provider, /artworkUrl\(song, 512\)/);
  assert.match(entities, /bestArtworkUrl\(value, targetSize\)/);
});

test('library view hydration cannot overwrite an early user toggle', async () => {
  const source = await readFile('app/(tabs)/library.tsx', 'utf8');
  assert.match(source, /viewModeMutationRef/);
  assert.match(source, /generation !== viewModeMutationRef\.current/);
  assert.match(source, /viewModeMutationRef\.current \+= 1/);
  assert.match(source, /finally \{[\s\S]*?setCreating\(false\)/);
});


test('cached authenticated sessions unblock cold start before account refresh', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  assert.match(source, /if \(cachedUser\) \{[\s\S]*?setUser\(cachedUser\);[\s\S]*?setLoading\(false\)/);
  assert.match(source, /const result = await fetchMe\(saved\)/);
});

test('inactive tabs freeze and defer mounting until visited', async () => {
  const source = await readFile('app/(tabs)/_layout.tsx', 'utf8');
  assert.match(source, /lazy: true/);
  assert.match(source, /freezeOnBlur: true/);
});

test('large music lists use bounded render batches', async () => {
  const tuning = await readFile('src/lib/listPerformance.ts', 'utf8');
  assert.match(tuning, /SONG_LIST_INITIAL_RENDER/);
  assert.match(tuning, /SONG_LIST_BATCH_SIZE/);
  assert.match(tuning, /SONG_LIST_WINDOW_SIZE/);

  for (const path of [
    'app/(tabs)/search.tsx',
    'app/(tabs)/library.tsx',
    'app/(tabs)/album/[id].tsx',
    'app/(tabs)/artist/[id].tsx',
    'app/(tabs)/playlist/[id].tsx',
    'app/(tabs)/mix/[id].tsx',
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /initialNumToRender=\{SONG_LIST_INITIAL_RENDER\}/);
    assert.match(source, /maxToRenderPerBatch=\{SONG_LIST_BATCH_SIZE\}/);
    assert.match(source, /windowSize=\{SONG_LIST_WINDOW_SIZE\}/);
  }
});

test('library playlists are virtualized instead of mapped inside a vertical ScrollView', async () => {
  const source = await readFile('app/(tabs)/library.tsx', 'utf8');
  assert.match(source, /<FlatList<Playlist>/);
  assert.match(source, /numColumns=\{viewMode === 'grid' \? 2 : 1\}/);
  assert.doesNotMatch(source, /playlists\.map\(\(playlist\)/);
});

test('library playlists, albums, and artists remain virtualized as they grow', async () => {
  const source = await readFile('app/(tabs)/library.tsx', 'utf8');
  assert.match(source, /<FlatList<Playlist>/);
  assert.match(source, /<FlatList<HarmoniaAlbum>/);
  assert.match(source, /<FlatList<HarmoniaArtistEntity>/);
  assert.match(source, /windowSize=\{SONG_LIST_WINDOW_SIZE\}/);
});

test('artwork and Canvas avoid unnecessary decode and lookup work', async () => {
  const track = await readFile('src/components/TrackArtwork.tsx', 'utf8');
  const playlist = await readFile('src/components/PlaylistArtwork.tsx', 'utf8');
  const canvas = await readFile('src/components/ArtworkRenderer.tsx', 'utf8');
  const player = await readFile('app/player.tsx', 'utf8');

  assert.match(track, /memo\(function TrackArtwork/);
  assert.match(track, /recyclingKey=/);
  assert.match(playlist, /memo\(function PlaylistArtwork/);
  assert.match(playlist, /recyclingKey=/);
  assert.match(canvas, /songRef\.current/);
  assert.doesNotMatch(canvas, /reduceMotion, song\]\)/);
  assert.match(player, /import \{ Image \} from 'expo-image'/);
  assert.match(player, /recyclingKey=\{String\(currentSong\.id \|\| cover\)\}/);
});

test('lyrics use logarithmic timing lookup instead of rescanning each tick', async () => {
  const source = await readFile('src/lib/lyrics.ts', 'utf8');
  assert.match(source, /while \(low <= high\)/);
  assert.match(source, /const middle = low \+ Math\.floor/);
  assert.match(source, /lastTimedIndexAtOrBefore\(lines/);
  assert.match(source, /lastTimedIndexAtOrBefore\(words/);
});


test('lyrics overlay uses one artwork-driven gradient and measured line positions', async () => {
  const source = await readFile('app/player.tsx', 'utf8');

  assert.match(source, /lyricLineLayouts/);
  assert.match(source, /lyricsViewportHeight \* 0\.43/);
  assert.match(source, /event\.nativeEvent\.layout\.height/);
  assert.match(source, /blurRadius=\{batterySaver \? 0 : Platform\.OS === 'android' \? 8 : 14\}/);
  assert.match(source, /source=\{\{ uri: PLAYER_BACKGROUND_FADE \}\}/);
  assert.match(source, /lyricsBackdropGradient/);
  assert.match(source, /distance === 3/);
  assert.doesNotMatch(source, /lyricsBackdropBottomWash/);
  assert.doesNotMatch(source, /styles\.lyricsTopFade|styles\.lyricsBottomFade/);
  assert.doesNotMatch(source, /activeLine \* 82 - 112,[\s\S]*animated: true/);
  assert.doesNotMatch(source, /textShadowRadius: shadowRadius/);
});


test('Canvas fully unmounts when motion is disabled and proxy work is bounded', async () => {
  const renderer = await readFile('src/components/ArtworkRenderer.tsx', 'utf8');
  const canvas = await readFile('src/lib/canvas.ts', 'utf8');

  assert.match(renderer, /!!canvasUrl && enableMotion && foreground && !batterySaver && !reduceMotion/);
  assert.match(renderer, /active=\{foreground && isPlaying\}/);
  assert.match(renderer, /!enableMotion \|\| !isPlaying/);
  assert.match(canvas, /CANVAS_TIMEOUT_MS = 10_000/);
  assert.match(canvas, /const controller = new AbortController\(\)/);
  assert.match(canvas, /signal: controller\.signal/);
  assert.match(canvas, /clearTimeout\(timeout\)/);
  assert.match(canvas, /removeEventListener\('abort', abortFromParent\)/);
});

test('lyrics requests abort when the panel or track changes and cannot hang forever', async () => {
  const api = await readFile('src/lib/api.ts', 'utf8');
  const player = await readFile('app/player.tsx', 'utf8');

  assert.match(api, /LYRICS_TIMEOUT_MS = 10_000/);
  assert.match(api, /fetchLyricsJson<T>/);
  assert.match(api, /fetchLyrics\(song: Song, signal\?: AbortSignal\)/);
  assert.match(api, /parentSignal\?\.removeEventListener\('abort', abortFromParent\)/);
  assert.match(player, /const controller = new AbortController\(\)/);
  assert.match(player, /fetchLyrics\(currentSong, controller\.signal\)/);
  assert.match(player, /controller\.abort\(\)/);
});

test('Spotify import cannot navigate backward after its screen has unmounted', async () => {
  const source = await readFile('app/import-playlist.tsx', 'utf8');
  assert.match(source, /navigationTimerRef/);
  assert.match(source, /clearTimeout\(navigationTimerRef\.current\)/);
  assert.match(source, /return \(\) => \{/);
  assert.match(source, /navigationTimerRef\.current = setTimeout/);
});

test('native next-track preload releases stale buffers when no longer useful', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(source, /const releasePreloadedSource = \(\) =>/);
  assert.match(source, /if \(batterySaver \|\| !isForeground \|\| !networkConnected \|\| !status\.playing\) \{[\s\S]*?releasePreloadedSource\(\)/);
  assert.match(source, /if \(!upcoming\?\.id\) \{[\s\S]*?releasePreloadedSource\(\)/);
  assert.match(source, /preloadedSourceRef\.current = null/);
  assert.match(source, /if \(previous\) clearPreloadedSource\(previous\.source\)/);
});


test('settings no longer exposes a search-history control', async () => {
  const source = await readFile('app/settings.tsx', 'utf8');
  assert.doesNotMatch(source, /Clear recent searches/);
  assert.doesNotMatch(source, /RECENT_SEARCHES_KEY/);
});


test('Spotify Canvas bypasses Harmonia backend and persists device-side results', async () => {
  const config = await readFile('src/config.ts', 'utf8');
  const canvas = await readFile('src/lib/canvas.ts', 'utf8');

  assert.match(config, /EXPO_PUBLIC_SPOTIFY_CANVAS_API_URL/);
  assert.match(canvas, /HAS_SPOTIFY_CANVAS_API/);
  assert.match(canvas, /SPOTIFY_CANVAS_API_URL/);
  assert.match(canvas, /harmonia\.mobile\.spotify-canvas\.v1/);
  assert.match(canvas, /AsyncStorage\.getItem\(CANVAS_CACHE_KEY\)/);
  assert.match(canvas, /AsyncStorage\.setItem\(CANVAS_CACHE_KEY/);
  assert.match(canvas, /\?trackId=/);
  assert.doesNotMatch(canvas, /api\/proxy\/spotify-canvas/);
  assert.doesNotMatch(canvas, /HARMONIA_API_URL/);
});


test('player persistence batches background-safe storage work instead of writing every few seconds', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(
    source,
    /shouldPersistPlaybackSnapshot\(\{[\s\S]*?elapsedSeconds: Math\.abs\(wholeSecond - lastPersistedSecond\.current\)/
  );
  assert.match(source, /playbackSnapshotWriteChainRef\.current = playbackSnapshotWriteChainRef\.current/);
});

test('high-frequency listening activity uses focused subscriptions', async () => {
  const provider = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(provider, /type PlaybackHistoryValue/);
  assert.match(provider, /type ListeningStatsValue/);
  assert.match(provider, /PlaybackHistoryContext/);
  assert.match(provider, /ListeningStatsContext/);
  assert.match(provider, /export function usePlaybackHistory\(\)/);
  assert.match(provider, /export function useListeningStats\(\)/);
  assert.match(provider, /export function usePlaybackActivity\(\)/);

  for (const path of [
    'app/player.tsx',
    'app/replay.tsx',
    'app/settings.tsx',
    'app/explore.tsx',
    'app/(tabs)/index.tsx',
  ]) {
    const consumer = await readFile(path, 'utf8');
    assert.match(consumer, /usePlaybackHistory/);
  }

  for (const path of [
    'app/replay.tsx',
    'app/(tabs)/profile.tsx',
  ]) {
    const consumer = await readFile(path, 'utf8');
    assert.match(consumer, /useListeningStats/);
  }

  const library = await readFile('app/(tabs)/library.tsx', 'utf8');
  assert.doesNotMatch(library, /usePlaybackActivity|usePlaybackHistory|useListeningStats/);
});

test('mini player limits progress updates to the progress bar', async () => {
  const source = await readFile('src/components/MiniPlayer.tsx', 'utf8');
  const shell = source.match(/export function MiniPlayer\(\)[\s\S]*?function MiniPlayerProgress/)?.[0] || '';
  assert.doesNotMatch(shell, /usePlaybackProgress\(\)/);
  assert.match(source, /function MiniPlayerProgress\([^)]*\)[\s\S]*?usePlaybackProgress\(\)/);
});

test('home discovery caches and deduplicates public catalog requests', async () => {
  const api = await readFile('src/lib/api.ts', 'utf8');
  const home = await readFile('app/(tabs)/index.tsx', 'utf8');
  assert.match(api, /HOME_SECTIONS_TTL_MS/);
  assert.match(api, /TRENDING_HOME_TTL_MS/);
  assert.match(api, /homeSectionsRequest/);
  assert.match(api, /trendingHomeRequest/);
  assert.match(home, /fetchHomeSections\(\{ forceRefresh: refresh \}\)/);
  assert.match(home, /fetchTrendingHomeContent\(\{ forceRefresh: refresh \}\)/);
});

test('now playing backdrop uses a smaller source and low blur cost', async () => {
  const source = await readFile('app/player.tsx', 'utf8');
  assert.match(source, /artworkUrl\(currentSong, 360\)/);
  assert.match(source, /blurRadius=\{batterySaver \? 0 : Platform\.OS === 'android' \? 6 : 12\}/);
  assert.doesNotMatch(source, /artworkUrl\(currentSong, 720\)/);
  assert.doesNotMatch(source, /blurRadius=\{42\}/);
});


test('now playing uses responsive artwork and control spacing on narrow phones', async () => {
  const source = await readFile('app/player.tsx', 'utf8');
  assert.match(source, /useWindowDimensions/);
  assert.match(source, /playerContentWidth = Math\.max\(0, width - 32\)/);
  assert.match(source, /artworkSize = compactArtwork \? Math\.min\(244, playerContentWidth\) : playerContentWidth/);
  assert.match(source, /controlsFixedWidth = 40 \+ 50 \+ 64 \+ 50 \+ 40/);
  assert.match(source, /Math\.min\(34, \(playerContentWidth - controlsFixedWidth\) \/ 4\)/);
  assert.match(source, /style=\{\[styles\.controls, \{ gap: controlGap \}\]\}/);
  assert.match(source, /scrollNowPlaying: \{ flexGrow: 1 \}/);
  assert.match(source, /artworkWrapExpanded: \{ flexGrow: 1/);
  assert.match(source, /PLAYER_BACKGROUND_FADE/);
});

test('sleep countdown no longer invalidates the core player context every second', async () => {
  const provider = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  const player = await readFile('app/player.tsx', 'utf8');
  const coreType = provider.match(/type PlayerContextValue = \{[\s\S]*?\n\};/)?.[0] || '';

  assert.doesNotMatch(coreType, /sleepRemaining/);
  assert.match(provider, /type PlaybackProgressValue = \{[\s\S]*?sleepRemaining: number/);
  assert.match(provider, /sleepRemaining,[\s\S]*?\[currentSong\?\.duration, sleepRemaining, status\.currentTime, status\.duration\]/);
  // Position is consumed in memoized leaves (PlaybackTimeline, LyricLines),
  // not at the screen top level, so status ticks cannot re-render the tree.
  const topLevel = player.match(/export default function PlayerScreen\(\)[\s\S]*?(?=\n  \[progressWidth)/)?.[0] || '';
  assert.match(player, /usePlaybackProgress\(\)/);
  assert.doesNotMatch(topLevel, /\{ position/);
});

test('high-frequency playback progress cannot recreate core player actions', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  const previousCallback = source.match(/const previous = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] || '';

  assert.match(previousCallback, /currentTimeRef\.current > 3/);
  assert.doesNotMatch(previousCallback, /status\.currentTime/);
  assert.doesNotMatch(previousCallback, /\[.*status\.currentTime/);
  assert.match(source, /activeResolutionAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /loadGenerationRef\.current \+= 1/);
});

test('download progress is throttled away from the playback context', async () => {
  const source = await readFile('src/providers/OfflineProvider.tsx', 'utf8');
  const player = await readFile('src/providers/PlayerProvider.tsx', 'utf8');

  assert.match(source, /DOWNLOAD_PROGRESS_UPDATE_MS = 250/);
  assert.match(source, /now - lastUpdate < DOWNLOAD_PROGRESS_UPDATE_MS/);
  assert.match(source, /OfflinePlaybackContext/);
  assert.match(source, /const activeTasks = activeDownloadTasksRef\.current/);
  assert.match(source, /for \(const \[id, task\] of activeTasks\)/);
  assert.match(player, /useOfflinePlayback\(\)/);
  assert.doesNotMatch(player, /useOffline\(\)/);
});

test('session persistence is ordered and startup restore cannot replace a newer login', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');

  assert.match(source, /sessionGenerationRef/);
  assert.match(source, /sessionWriteChainRef/);
  assert.match(source, /enqueueSessionWrite/);
  assert.match(source, /sessionGenerationRef\.current !== startupGeneration/);
  assert.match(source, /tokenRef\.current = accessToken/);
  assert.match(source, /tokenRef\.current = null/);
});

test('provider timeouts only relabel abort failures', async () => {
  for (const path of [
    'src/lib/playback/jiosaavnDirect.ts',
    'src/lib/playback/youtubeMusicDirect.ts',
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /timedOut && ![^\n]+\.aborted && error\?\.name === 'AbortError'/);
  }

  const youtube = await readFile('src/lib/playback/youtubeMusicDirect.ts', 'utf8');
  assert.match(youtube, /visitorData\([\s\S]*?Math\.min\(timeoutMs, 4500\)/);
  assert.doesNotMatch(youtube, /visitorData\([\s\S]{0,150}?\.catch\(\(\) => null\)/);

  const resolver = await readFile('src/lib/playback/streamResolver.ts', 'utf8');
  assert.match(resolver, /if \(parentSignal\?\.aborted\) throw classifyPlaybackError\(error\)/);
  assert.match(resolver, /timedOut && error\?\.name === 'AbortError'/);
});

test('newest-started authentication wins and failed sign-out is recoverable', async () => {
  const source = await readFile('src/providers/AuthProvider.tsx', 'utf8');
  const signIn = source.match(/const signIn = useCallback\([\s\S]*?\n  \}, \[adoptSession\]\);/)?.[0] || '';
  const signOut = source.match(/const signOut = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] || '';

  assert.ok(signIn.indexOf('++sessionGenerationRef.current') < signIn.indexOf('loginWithPassword'));
  assert.match(source, /adoptSession\(result\.accessToken, result\.user, generation\)/);
  assert.match(source, /committedTokenRef/);
  assert.match(source, /const previousToken = committedTokenRef\.current/);
  assert.match(source, /await writeCachedUser\(nextUser\);[\s\S]*?await clearCachedUser\(\);/);
  assert.match(signOut, /await clearAccessToken\(\);/);
  assert.doesNotMatch(signOut, /clearAccessToken\(\)\.catch/);
  assert.match(signOut, /setToken\(previousToken\)/);
  assert.match(signOut, /throw cause/);
});

test('playback refs only follow committed native status', async () => {
  const source = await readFile('src/providers/PlayerProvider.tsx', 'utf8');

  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*?currentTimeRef\.current = Number\(status\.currentTime \|\| 0\);[\s\S]*?nativePlayingRef\.current = Boolean\(status\.playing\);[\s\S]*?\}, \[status\.currentTime, status\.playing\]\)/
  );
});


test('home India chart refreshes dynamically without polling in the background', async () => {
  const home = await readFile('app/(tabs)/index.tsx', 'utf8');
  assert.match(home, /useFocusEffect/);
  assert.match(home, /TRENDING_SCREEN_REFRESH_MS = 10 \* 60_000/);
  assert.match(home, /refreshTrendingSilently/);
  assert.match(home, /fetchTrendingHomeContent\(\{ forceRefresh: true \}\)/);
  assert.match(home, /AppState\.currentState !== 'active'/);
  assert.match(home, /AppState\.addEventListener\('change'/);
  assert.match(home, /appStateSubscription\.remove\(\)/);
  assert.match(home, /setInterval\(\(\) => \{/);
  assert.match(home, /Latest Songs/);
  assert.match(home, /Fresh from the India chart/);
});

test('search cancellation does not fall through to provider fallback work', async () => {
  const api = await readFile('src/lib/api.ts', 'utf8');
  const search = api.match(
    /export async function searchMusic\([\s\S]*?\r?\n\}\r?\n\r?\nexport async function fetchAlbum/
  )?.[0] || '';

  assert.match(search, /catch \(cause: any\)/);
  assert.match(search, /signal\?\.aborted \|\| cause\?\.name === 'AbortError'/);
  assert.match(search, /throw cause/);
});

test('trending album refresh avoids a full multi-entity provider fallback', async () => {
  const api = await readFile('src/lib/api.ts', 'utf8');

  assert.match(api, /async function fetchTrendingAlbums/);
  assert.match(api, /searchDirectJioSaavnAlbums\(query, \{ limit \}\)/);
  assert.doesNotMatch(api, /const albumPromise = searchMusic\('Latest Hindi Songs'/);
});

test('login uses Harmonia web branding and provider SVG marks', async () => {
  const login = await readFile('app/login.tsx', 'utf8');

  assert.match(login, /harmonia-icon\.png/);
  assert.match(login, /google-logo\.svg/);
  assert.match(login, /github-logo\.svg/);
  assert.match(login, /contentFit="contain"/);
  assert.match(login, /Continue without an account/);
});

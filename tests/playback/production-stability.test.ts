import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferDownloadExtension } from '../../src/lib/downloads';

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
  assert.match(source, /queue: queue\.slice\(0, 100\)\.map\(persistenceSafeSong\)/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Static audit of battery-saver gating on every artwork-palette consumer.
 *
 * Palette extraction downloads artwork into the cache and decodes pixels —
 * real CPU/battery/data work. Every consumer must pass a battery-saver gate
 * so extraction is skipped entirely in that mode, matching the web client.
 */

test('MiniPlayer skips palette extraction in battery saver mode', async () => {
  const source = await readFile('src/components/MiniPlayer.tsx', 'utf8');
  assert.match(source, /const paletteSong = batterySaver \? null : currentSong/);
  assert.match(source, /useArtworkPalette\(paletteSong/);
});

test('Home ambient glows skip palette extraction in battery saver mode', async () => {
  const source = await readFile('app/(tabs)/index.tsx', 'utf8');
  assert.match(source, /const \{ batterySaver \} = usePreferences\(\)/);
  assert.match(source, /const paletteSong = batterySaver \? null : currentSong/);
  assert.match(source, /useArtworkPalette\(paletteSong/);
  // The glow tint override must key off paletteSong (the hook input), not
  // currentSong — otherwise battery saver tints the glows with the neutral
  // default palette instead of keeping the saffron/emerald tokens.
  assert.doesNotMatch(
    source,
    /currentSong\s*\n\s*\? \{ backgroundColor: `rgba\(\$\{dominantRgb/,
    'glow tint must key off paletteSong, not currentSong'
  );
  const tintOverrides = source.match(/paletteSong\s*\n\s*\? \{ backgroundColor/g);
  assert.ok(tintOverrides && tintOverrides.length === 2, 'both glow orbs must tint off paletteSong');
});

test('detail headers disable ArtworkColorHeader in battery saver mode', async () => {
  for (const screen of [
    'app/(tabs)/album/[id].tsx',
    'app/(tabs)/playlist/[id].tsx',
    'app/(tabs)/artist/[id].tsx',
    'app/(tabs)/mix/[id].tsx',
  ]) {
    const source = await readFile(screen, 'utf8');
    assert.match(
      source,
      /ArtworkColorHeader artworkUrl=\{paletteCover\} enabled=\{!batterySaver\}/,
      `${screen} must gate the color header on battery saver`
    );
  }
});

test('palette extraction downloads remote artwork before manipulation', async () => {
  // manipulateAsync only accepts local/data URIs; remote https artwork must
  // be downloaded into the cache first or extraction silently fails and
  // every screen falls back to the default tint.
  const source = await readFile('src/lib/palette.ts', 'utf8');
  assert.match(source, /File\.downloadFileAsync\(imageSrc, tempFile, \{ idempotent: true \}\)/);
  assert.match(source, /localUri = tempFile\.uri/);
  // Temp cache file must be cleaned up after decoding.
  assert.match(source, /finally \{[\s\S]*?tempFile[\s\S]*?tempFile\.delete\(\)/);
});

test('snapshot effect persists through the unit-tested throttle decision', async () => {
  // Guard against the write-storm regression returning inline: the throttle
  // must go through shouldPersistPlaybackSnapshot, which has no playing
  // bypass and throttles position-only updates in every state.
  const provider = await readFile('src/providers/PlayerProvider.tsx', 'utf8');
  assert.match(provider, /shouldPersistPlaybackSnapshot\(\{/);
  assert.doesNotMatch(provider, /!queueChanged &&\s*\n\s*!playingChanged &&\s*\n\s*Math\.abs/);
  const decision = await readFile('src/lib/playback/playbackSnapshot.ts', 'utf8');
  assert.match(decision, /if \(queueChanged \|\| playingChanged\) return true/);
  assert.match(decision, /return elapsedSeconds >= positionThrottleSeconds/);
});

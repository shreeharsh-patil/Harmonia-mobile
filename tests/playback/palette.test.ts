import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaletteFromDominant,
  cachePalette,
  clearPaletteCacheForTests,
  DEFAULT_PALETTE,
  dominantRgbFromPixels,
  getHarmoniousSecondary,
  getLuminance,
  readCachedPalette,
  tuneColorForBackground,
  type RawPixels,
} from '../../src/lib/paletteCore';

function makePixels(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number]
): RawPixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

test('luminance follows BT.709 channel weighting', () => {
  assert.ok(Math.abs(getLuminance(255, 255, 255) - 255) < 1e-9);
  assert.equal(getLuminance(0, 0, 0), 0);
  assert.ok(getLuminance(0, 255, 0) > getLuminance(255, 0, 0));
  assert.ok(getLuminance(255, 0, 0) > getLuminance(0, 0, 255));
});

test('tuned colors stay deep enough for ambient surfaces', () => {
  const samples: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
    [128, 128, 128],
    [240, 240, 240],
    [20, 20, 20],
    [255, 200, 80],
    [90, 200, 150],
    [180, 60, 30],
  ];
  for (const [r, g, b] of samples) {
    const [tr, tg, tb] = tuneColorForBackground(r, g, b);
    const maxChannel = Math.max(tr, tg, tb);
    assert.ok(maxChannel <= 176, `too bright: rgb(${tr}, ${tg}, ${tb}) from rgb(${r}, ${g}, ${b})`);
    assert.ok(maxChannel >= 40, `too dark: rgb(${tr}, ${tg}, ${tb}) from rgb(${r}, ${g}, ${b})`);
  }
});

test('near-gray artwork gets a cool slate tint, not flat gray', () => {
  const [r, g, b] = tuneColorForBackground(128, 128, 128);
  // Slate hue (220) means blue channel dominates red.
  assert.ok(b > r, `expected cool tint, got rgb(${r}, ${g}, ${b})`);
});

test('binning picks the dominant vibrant region over background noise', () => {
  // 32x32 artwork: mostly crimson with a small dark corner.
  const crimson: [number, number, number, number] = [180, 30, 60, 255];
  const pixels = makePixels(32, 32, (x, y) =>
    x < 6 && y < 6 ? [10, 10, 10, 255] : crimson
  );
  const [r, g, b] = dominantRgbFromPixels(pixels) as [number, number, number];
  assert.ok(r > 100, `expected red-dominant result, got rgb(${r}, ${g}, ${b})`);
});

test('transparent pixels are excluded from the average', () => {
  // Fully transparent crimson over nothing: must not produce a red result.
  const pixels = makePixels(8, 8, () => [255, 0, 0, 0]);
  assert.equal(dominantRgbFromPixels(pixels), null);
});

test('fully opaque single-color artwork resolves to a tuned version of that color', () => {
  const pixels = makePixels(16, 16, () => [40, 120, 220, 255]);
  const [r, g, b] = dominantRgbFromPixels(pixels) as [number, number, number];
  assert.ok(b > r && b > g, `expected blue-dominant, got rgb(${r}, ${g}, ${b})`);
});

test('secondary hue is distinct from the dominant hue', () => {
  const dominant: [number, number, number] = [180, 40, 60];
  const secondary = getHarmoniousSecondary(dominant[0], dominant[1], dominant[2]);
  // Secondary is darker than the tuned dominant and hue-shifted +30 degrees.
  const [sr, sg, sb] = secondary;
  assert.ok(Math.max(sr, sg, sb) <= Math.max(...dominant));
});

test('buildPaletteFromDominant produces rgb strings consistent with its rgb tuples', () => {
  const palette = buildPaletteFromDominant([30, 90, 160]);
  assert.equal(palette.dominant, `rgb(${palette.dominantRgb[0]}, ${palette.dominantRgb[1]}, ${palette.dominantRgb[2]})`);
  assert.equal(palette.secondary, `rgb(${palette.secondaryRgb[0]}, ${palette.secondaryRgb[1]}, ${palette.secondaryRgb[2]})`);
  assert.equal(palette.dominantRgb[0], 30);
});

test('default palette is stable and dark', () => {
  assert.deepEqual(DEFAULT_PALETTE.dominantRgb, [35, 40, 52]);
});

test('palette cache returns stored values and refreshes recency', () => {
  clearPaletteCacheForTests();
  const palette = buildPaletteFromDominant([10, 60, 120]);
  cachePalette('art-a', palette);
  assert.equal(readCachedPalette('art-a'), palette);
  // Re-reading refreshes recency; a different key inserted later must evict
  // the least recently used once the cache overflows.
  for (let i = 0; i < 130; i += 1) {
    cachePalette(`filler-${i}`, DEFAULT_PALETTE);
    readCachedPalette('art-a');
  }
  assert.equal(readCachedPalette('art-a'), palette, 'recently-used entry must survive eviction');
  assert.equal(readCachedPalette('filler-0'), null, 'least recently used entry must be evicted');
  clearPaletteCacheForTests();
});

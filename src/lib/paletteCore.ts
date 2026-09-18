/**
 * Pure palette primitives shared by the React-facing palette module.
 *
 * Everything here must stay free of expo/react imports so it can run in the
 * Node test runner: color space conversion, ambient tuning, weighted color
 * binning, and the artwork-palette LRU cache.
 */

export type ArtworkPalette = {
  /** Tuned dominant color as `rgb(r, g, b)` — safe for tinted surfaces. */
  dominant: string;
  /** Distinct companion color as `rgb(r, g, b)`. */
  secondary: string;
  /** Dominant color with per-channel scaling for brighter accents. */
  accent: string;
  /** Numeric [r, g, b] of the dominant color. */
  dominantRgb: [number, number, number];
  /** Numeric [r, g, b] of the companion color. */
  secondaryRgb: [number, number, number];
};

/** Neutral dark palette used while loading or when extraction fails. */
export const DEFAULT_PALETTE: ArtworkPalette = {
  dominant: 'rgb(35, 40, 52)',
  secondary: 'rgb(22, 26, 35)',
  accent: 'rgb(59, 130, 246)',
  dominantRgb: [35, 40, 52],
  secondaryRgb: [22, 26, 35],
};

export type RawPixels = {
  data: Uint8Array;
  width: number;
  height: number;
};

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  let r: number;
  let g: number;
  let b: number;

  if (sn === 0) {
    r = g = b = ln;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Perceived luminance (ITU-R BT.709). */
export function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Tune an extracted color for rich, readable ambient use — mirrors the web:
 * gray tones get a subtle cool slate tint, muted colors get saturation boost,
 * lightness is clamped to a deep 18–40% band.
 */
export function tuneColorForBackground(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (s < 12) {
    return hslToRgb(220, 18, Math.max(18, Math.min(l, 32)));
  }

  let sat = s;
  if (sat < 45) {
    sat = Math.min(85, Math.round(sat * 1.6 + 15));
  } else if (sat > 85) {
    sat = 85;
  }

  let light = l;
  if (light > 40) {
    light = Math.round(24 + (light - 40) * 0.2);
  } else if (light < 18) {
    light = Math.round(18 + light * 0.3);
  }

  return hslToRgb(h, sat, light);
}

/** Generate a distinct companion hue from the dominant color. */
export function getHarmoniousSecondary(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb((h + 30) % 360, Math.max(20, s - 10), Math.max(14, l - 6));
}

export function buildPaletteFromDominant(dominant: [number, number, number]): ArtworkPalette {
  const secondary = getHarmoniousSecondary(dominant[0], dominant[1], dominant[2]);
  return {
    dominant: `rgb(${dominant[0]}, ${dominant[1]}, ${dominant[2]})`,
    secondary: `rgb(${secondary[0]}, ${secondary[1]}, ${secondary[2]})`,
    accent: `rgb(${Math.min(255, Math.round(dominant[0] * 1.25))}, ${Math.min(255, Math.round(dominant[1] * 1.25))}, ${Math.min(255, Math.round(dominant[2] * 1.25))})`,
    dominantRgb: dominant,
    secondaryRgb: secondary,
  };
}

/**
 * Weighted color binning over downsampled pixels.
 *
 * Samples every 4th pixel (16-byte stride) to keep the loop cheap, prefers
 * vibrant medium-luminance pixels, and de-weights near black/white outliers.
 */
export function dominantRgbFromPixels(pixels: RawPixels): [number, number, number] | null {
  const { data } = pixels;
  const colorBins = new Map<string, { r: number; g: number; b: number; weight: number }>();
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let countedPixels = 0;

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 50) continue;

    totalR += r;
    totalG += g;
    totalB += b;
    countedPixels += 1;

    const lum = getLuminance(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    const binR = Math.min(255, Math.floor(r / 16) * 16);
    const binG = Math.min(255, Math.floor(g / 16) * 16);
    const binB = Math.min(255, Math.floor(b / 16) * 16);
    const key = `${binR},${binG},${binB}`;

    // Prefer vibrant, medium-luminance pixels; de-weight near black/white.
    let weight = 1;
    if (sat > 0.25) weight += sat * 4;
    if (lum >= 30 && lum <= 200) weight += 2;
    if (lum < 15 || lum > 240) weight *= 0.2;

    const existing = colorBins.get(key);
    if (existing) {
      existing.weight += weight;
    } else {
      colorBins.set(key, { r: binR, g: binG, b: binB, weight });
    }
  }

  if (colorBins.size === 0) {
    if (countedPixels === 0) return null;
    return tuneColorForBackground(
      Math.round(totalR / countedPixels),
      Math.round(totalG / countedPixels),
      Math.round(totalB / countedPixels)
    );
  }

  const sortedBins = Array.from(colorBins.values()).sort((a, b) => b.weight - a.weight);
  const top = sortedBins[0];
  return tuneColorForBackground(top.r, top.g, top.b);
}

const PALETTE_CACHE_TTL_MS = 30 * 60 * 1000;
const PALETTE_CACHE_MAX = 120;

const paletteCache = new Map<string, { value: ArtworkPalette; expiresAt: number }>();

export function cachePalette(key: string, value: ArtworkPalette) {
  paletteCache.delete(key);
  paletteCache.set(key, { value, expiresAt: Date.now() + PALETTE_CACHE_TTL_MS });
  while (paletteCache.size > PALETTE_CACHE_MAX) {
    const oldest = paletteCache.keys().next().value;
    if (oldest === undefined) break;
    paletteCache.delete(oldest);
  }
}

export function readCachedPalette(key: string): ArtworkPalette | null {
  const cached = paletteCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    paletteCache.delete(key);
    return null;
  }
  // Refresh recency (Map preserves insertion order).
  paletteCache.delete(key);
  paletteCache.set(key, cached);
  return cached.value;
}

export function clearPaletteCacheForTests() {
  paletteCache.clear();
}

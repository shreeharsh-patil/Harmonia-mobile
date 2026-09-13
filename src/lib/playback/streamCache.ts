export const RESOLVED_STREAM_TTL_MS = 4 * 60 * 1000;
export const STREAM_EXPIRY_SAFETY_MARGIN_MS = 45 * 1000;
export const STREAM_CACHE_MAX_ENTRIES = 300;
export const METADATA_CACHE_TTL_MS = 30 * 60 * 1000;

export type StreamCacheEntryBase = {
  trackId: string;
  url: string;
  expiresAt: number;
};

export function getStreamExpiresAt(
  url: string,
  resolvedAt = Date.now(),
  fallbackTtlMs = RESOLVED_STREAM_TTL_MS
) {
  let expiresAt = resolvedAt + fallbackTtlMs;
  try {
    const parsed = new URL(url, 'https://harmonia.local');
    const raw = parsed.searchParams.get('expire') || parsed.searchParams.get('expires') || parsed.searchParams.get('expiresAt');
    if (raw) {
      const value = Number(raw);
      const providerExpiry = value > 10_000_000_000 ? value : value * 1000;
      if (Number.isFinite(providerExpiry) && providerExpiry > resolvedAt) {
        expiresAt = Math.min(expiresAt, providerExpiry);
      }
    }
  } catch {}
  return expiresAt;
}

export function isResolvedStreamFresh(
  stream?: StreamCacheEntryBase | null,
  now = Date.now(),
  safetyMarginMs = STREAM_EXPIRY_SAFETY_MARGIN_MS
) {
  return Boolean(stream?.url) && Number(stream?.expiresAt || 0) > now + safetyMarginMs;
}

export class ResolvedStreamMemoryCache<T extends StreamCacheEntryBase> {
  private cache = new Map<string, T>();
  constructor(private maxEntries = STREAM_CACHE_MAX_ENTRIES, private now: () => number = Date.now) {}
  private key(trackId: string, quality: string) { return `${trackId}:${quality}`; }
  get(trackId: string, quality: string) {
    const key = this.key(trackId, quality);
    const value = this.cache.get(key);
    if (!value) return null;
    if (!isResolvedStreamFresh(value, this.now())) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  set(trackId: string, quality: string, value: T) {
    const key = this.key(trackId, quality);
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest == null) break;
      this.cache.delete(oldest);
    }
  }
  invalidate(trackId: string) {
    const prefix = `${trackId}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }
  clear() { this.cache.clear(); }
  get size() { return this.cache.size; }
}

type MetadataEntry<T> = { data: T; expiresAt: number };

export class MetadataMemoryCache<T> {
  private cache = new Map<string, MetadataEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();
  constructor(
    private maxEntries = STREAM_CACHE_MAX_ENTRIES,
    private ttlMs = METADATA_CACHE_TTL_MS,
    private now: () => number = Date.now
  ) {}
  get(key: string) {
    const value = this.cache.get(key);
    if (!value) return null;
    if (value.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value.data;
  }
  set(key: string, data: T) {
    this.cache.delete(key);
    this.cache.set(key, { data, expiresAt: this.now() + this.ttlMs });
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest == null) break;
      this.cache.delete(oldest);
    }
  }
  async getOrLoad(key: string, loader: () => Promise<T>) {
    const cached = this.get(key);
    if (cached) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const request = loader().then((data) => { this.set(key, data); return data; }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }
  invalidate(key: string) { this.cache.delete(key); this.inFlight.delete(key); }
  clear() { this.cache.clear(); this.inFlight.clear(); }
}

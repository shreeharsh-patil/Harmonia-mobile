const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_HISTORY_SIZE = 20;

type ProviderRecord = {
  provider: string;
  latencyMs: number | null;
  consecutiveFailures: number;
  recentFailures: number;
  recentSuccesses: number;
  failureRate: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  cooldownUntil: number;
  availability: 'unknown' | 'available' | 'degraded' | 'cooldown' | 'probing';
  history: boolean[];
};

function emptyRecord(provider: string): ProviderRecord {
  return {
    provider, latencyMs: null, consecutiveFailures: 0, recentFailures: 0,
    recentSuccesses: 0, failureRate: 0, lastSuccess: null, lastFailure: null,
    cooldownUntil: 0, availability: 'unknown', history: [],
  };
}

export class ProviderHealthManager {
  private records = new Map<string, ProviderRecord>();
  constructor(private options: { failureThreshold?: number; cooldownMs?: number; historySize?: number; now?: () => number } = {}) {}
  private get failureThreshold() { return this.options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD; }
  private get cooldownMs() { return this.options.cooldownMs ?? DEFAULT_COOLDOWN_MS; }
  private get historySize() { return this.options.historySize ?? DEFAULT_HISTORY_SIZE; }
  private now() { return (this.options.now || Date.now)(); }
  private record(provider: string) {
    const id = String(provider || 'unknown');
    if (!this.records.has(id)) this.records.set(id, emptyRecord(id));
    return this.records.get(id)!;
  }
  private push(record: ProviderRecord, succeeded: boolean) {
    record.history.push(succeeded);
    if (record.history.length > this.historySize) record.history.shift();
    record.recentSuccesses = record.history.filter(Boolean).length;
    record.recentFailures = record.history.length - record.recentSuccesses;
    record.failureRate = record.history.length ? record.recentFailures / record.history.length : 0;
  }
  recordSuccess(provider: string, latencyMs?: number) {
    const record = this.record(provider);
    record.consecutiveFailures = 0;
    record.lastSuccess = this.now();
    record.cooldownUntil = 0;
    record.availability = 'available';
    if (Number.isFinite(latencyMs) && Number(latencyMs) >= 0) {
      const value = Math.round(Number(latencyMs));
      record.latencyMs = record.latencyMs == null ? value : Math.round(record.latencyMs * 0.7 + value * 0.3);
    }
    this.push(record, true);
    return this.get(provider);
  }
  recordFailure(provider: string) {
    const record = this.record(provider);
    record.consecutiveFailures += 1;
    record.lastFailure = this.now();
    this.push(record, false);
    if (record.consecutiveFailures >= this.failureThreshold) {
      const multiplier = Math.min(4, record.consecutiveFailures - this.failureThreshold + 1);
      record.cooldownUntil = this.now() + this.cooldownMs * multiplier;
      record.availability = 'cooldown';
    } else {
      record.availability = 'degraded';
    }
    return this.get(provider);
  }
  isAvailable(provider: string) {
    const record = this.record(provider);
    if (record.cooldownUntil > this.now()) return false;
    if (record.availability === 'cooldown') {
      record.availability = 'probing';
      record.cooldownUntil = 0;
    }
    return true;
  }
  get(provider: string) {
    const record = this.record(provider);
    const available = !record.cooldownUntil || record.cooldownUntil <= this.now();
    return {
      provider: record.provider,
      healthy: available && record.consecutiveFailures < this.failureThreshold,
      latencyMs: record.latencyMs, consecutiveFailures: record.consecutiveFailures,
      recentFailures: record.recentFailures, recentSuccesses: record.recentSuccesses,
      failureRate: record.failureRate, lastSuccess: record.lastSuccess, lastFailure: record.lastFailure,
      cooldownUntil: record.cooldownUntil || null,
      availability: available ? record.availability : 'cooldown',
    };
  }
  reset(provider?: string) {
    if (provider) this.records.delete(String(provider));
    else this.records.clear();
  }
}

export const providerHealth = new ProviderHealthManager();

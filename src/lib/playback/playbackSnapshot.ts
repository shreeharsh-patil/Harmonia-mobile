/**
 * Inputs the PlayerProvider snapshot effect uses to decide whether the
 * playback snapshot needs rewriting to AsyncStorage.
 */
export type SnapshotPersistDecisionInput = {
  /** Whether the queue array or active index changed since the last write. */
  queueChanged: boolean;
  /** Whether play/pause state flipped since the last write. */
  playingChanged: boolean;
  /** Whole seconds elapsed since the last write (position-only delta). */
  elapsedSeconds: number;
  /** Throttle window for position-only updates, in whole seconds.
   *  Pass Infinity to simulate "playing mode" unlimited waits in tests. */
  positionThrottleSeconds?: number;
};

/**
 * Decide whether the playback snapshot should be persisted now.
 *
 * Queue/index edits and play/pause transitions persist immediately (a pause
 * must checkpoint its exact position). Position-only updates are throttled
 * regardless of playing state: while paused the position does not advance, so
 * gating the throttle on playing would rewrite the queue JSON every 500ms
 * status tick (the write storm this decision exists to prevent).
 */
export function shouldPersistPlaybackSnapshot({
  queueChanged,
  playingChanged,
  elapsedSeconds,
  positionThrottleSeconds = 30,
}: SnapshotPersistDecisionInput): boolean {
  if (queueChanged || playingChanged) return true;
  return elapsedSeconds >= positionThrottleSeconds;
}

export type QueueWindow<T> = {
  items: T[];
  index: number;
  start: number;
};

export function createQueueWindow<T>(
  items: T[],
  index: number,
  maxItems = 100
): QueueWindow<T> {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], index: -1, start: 0 };
  }

  const limit = Math.max(1, Math.floor(maxItems));
  const safeIndex = Math.min(
    Math.max(Number.isFinite(index) ? Math.floor(index) : 0, 0),
    items.length - 1
  );

  if (items.length <= limit) {
    return {
      items: [...items],
      index: safeIndex,
      start: 0,
    };
  }

  const half = Math.floor(limit / 2);
  const start = Math.max(
    0,
    Math.min(safeIndex - half, items.length - limit)
  );

  return {
    items: items.slice(start, start + limit),
    index: safeIndex - start,
    start,
  };
}

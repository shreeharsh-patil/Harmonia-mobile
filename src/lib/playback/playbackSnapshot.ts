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

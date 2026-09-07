export type LyricWord = {
  time: number;
  endTime?: number;
  text: string;
};

export type LyricLine = {
  time: number;
  text: string;
  words?: LyricWord[];
};

function timestampSeconds(minutesText?: string, secondsText?: string, fractionText?: string) {
  const minutes = Number(minutesText || 0);
  const seconds = Number(secondsText || 0);
  const fractionRaw = String(fractionText || '');
  const fraction = fractionRaw
    ? Number(fractionRaw) / (fractionRaw.length === 3 ? 1000 : fractionRaw.length === 2 ? 100 : 10)
    : 0;
  return minutes * 60 + seconds + fraction;
}

function parseEnhancedWords(value: string): LyricWord[] {
  const words: LyricWord[] = [];
  const matcher = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g;

  for (const match of value.matchAll(matcher)) {
    const text = String(match[4] || '');
    if (!text) continue;
    words.push({
      time: timestampSeconds(match[1], match[2], match[3]),
      text,
    });
  }

  return words.map((word, index) => ({
    ...word,
    endTime: words[index + 1]?.time,
  }));
}

export function parseLrc(value?: string | null): LyricLine[] {
  if (!value) return [];

  const lines: LyricLine[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) continue;

    const body = rawLine.replace(/\[[^\]]+\]/g, '').trim();
    if (!body) continue;

    const enhancedWords = parseEnhancedWords(body);
    const text = body.replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim();
    if (!text) continue;

    for (const match of matches) {
      const time = timestampSeconds(match[1], match[2], match[3]);
      lines.push({
        time,
        text,
        words: enhancedWords.length
          ? enhancedWords.map((word) => ({ ...word }))
          : undefined,
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

function lastTimedIndexAtOrBefore<T>(items: T[], threshold: number, timeOf: (item: T) => number) {
  let low = 0;
  let high = items.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    if (timeOf(items[middle]) <= threshold) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

export function activeLyricIndex(lines: LyricLine[], position: number) {
  if (!lines.length) return -1;
  return Math.max(0, lastTimedIndexAtOrBefore(lines, position + 0.08, (line) => line.time));
}

export function activeLyricWordIndex(line: LyricLine | undefined, position: number) {
  const words = line?.words || [];
  if (!words.length) return -1;
  return lastTimedIndexAtOrBefore(words, position + 0.04, (word) => word.time);
}

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

export function activeLyricIndex(lines: LyricLine[], position: number) {
  if (!lines.length) return -1;
  let active = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= position + 0.08) active = index;
    else break;
  }
  return active;
}

export function activeLyricWordIndex(line: LyricLine | undefined, position: number) {
  const words = line?.words || [];
  if (!words.length) return -1;

  let active = -1;
  for (let index = 0; index < words.length; index += 1) {
    if (words[index].time <= position + 0.04) active = index;
    else break;
  }
  return active;
}

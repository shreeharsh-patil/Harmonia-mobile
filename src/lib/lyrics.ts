export type LyricLine = {
  time: number;
  text: string;
};

export function parseLrc(value?: string | null): LyricLine[] {
  if (!value) return [];

  const lines: LyricLine[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) continue;

    const text = rawLine.replace(/\[[^\]]+\]/g, '').trim();
    if (!text) continue;

    for (const match of matches) {
      const minutes = Number(match[1] || 0);
      const seconds = Number(match[2] || 0);
      const fractionText = String(match[3] || '');
      const fraction = fractionText
        ? Number(fractionText) / (fractionText.length === 3 ? 1000 : fractionText.length === 2 ? 100 : 10)
        : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
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

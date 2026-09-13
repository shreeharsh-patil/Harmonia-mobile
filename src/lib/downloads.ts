export function inferDownloadExtension(
  url: string,
  mimeType?: string | null,
  codec?: string | null
) {
  const mime = String(mimeType || '').toLowerCase();
  const codecName = String(codec || '').toLowerCase();

  if (mime.includes('webm') || codecName.includes('opus')) return 'webm';
  if (mime.includes('mpeg') || codecName.includes('mp3')) return 'mp3';
  if (mime.includes('flac') || codecName.includes('flac')) return 'flac';
  if (mime.includes('wav') || codecName.includes('wav')) return 'wav';
  if (mime.includes('aac') || codecName.includes('aac')) return 'aac';
  if (mime.includes('ogg')) return 'ogg';

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(m4a|mp4|mp3|aac|ogg|opus|webm|flac|wav)$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ext === 'opus') return 'ogg';
      if (ext === 'mp4') return 'm4a';
      return ext;
    }
  } catch {}

  return 'm4a';
}

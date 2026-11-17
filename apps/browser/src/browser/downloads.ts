export interface DownloadRecoveryInfo {
  status: 'none' | 'recovered' | 'blocked';
  canReveal: boolean;
}

export type DownloadState =
  'progressing' | 'completed' | 'cancelled' | 'interrupted';
export interface DownloadRecord {
  id: string;
  sourceKey?: string;
  name: string;
  path: string;
  mime: string;
  startedAt: number;
  endedAt?: number;
  receivedBytes: number;
  totalBytes: number;
  state: DownloadState;
  paused: boolean;
  active?: boolean;
  awaitingSaveLocation?: boolean;
  resumable?: boolean;
  retryable?: boolean;
  /** Main-process persistence only; removed from renderer responses. */
  retrySource?: { url: string; profile?: string };
}
export type DownloadAction =
  | 'get'
  | 'open'
  | 'open-file'
  | 'reveal'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'cancel'
  | 'remove'
  | 'clear'
  | 'reveal-recovery';
export function downloadKind(record: DownloadRecord) {
  const extension = record.name.split('.').pop()?.toLowerCase() || '';
  if (
    record.mime.startsWith('image/') ||
    /^(png|jpe?g|gif|webp|svg|heic|avif|bmp|tiff?)$/.test(extension)
  )
    return 'Images';
  if (
    record.mime.startsWith('video/') ||
    /^(mp4|mov|webm|mkv|avi)$/.test(extension)
  )
    return 'Video';
  if (
    record.mime.startsWith('audio/') ||
    /^(mp3|wav|m4a|flac|ogg)$/.test(extension)
  )
    return 'Audio';
  if (/^(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|pages|numbers|key)$/.test(extension))
    return 'Documents';
  if (/^(zip|rar|7z|tar|gz|bz2|dmg|pkg)$/.test(extension)) return 'Archives';
  return 'Other';
}
export function downloadDateGroup(timestamp: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(start);
  week.setDate(week.getDate() - 7);
  if (timestamp >= start.getTime()) return 'Today';
  if (timestamp >= yesterday.getTime()) return 'Yesterday';
  if (timestamp >= week.getTime()) return 'Last 7 days';
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
export function downloadBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

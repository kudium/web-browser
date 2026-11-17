import path from 'path';
import type { DownloadRecord } from '../browser/downloads';

export function parseDownloadRetrySource(
  value: unknown,
  privateMode = false,
): DownloadRecord['retrySource'] {
  if (!value || typeof value !== 'object') return undefined;
  const { url, profile } = value as Record<string, unknown>;
  if (
    typeof url !== 'string' ||
    url.length > 8192 ||
    /[\u0000-\u001f\u007f]/.test(url)
  )
    return undefined;
  if (
    !privateMode &&
    (typeof profile !== 'string' ||
      !profile.length ||
      profile.length > 1024 ||
      /[\\/:\u0000-\u001f\u007f]/.test(profile))
  )
    return undefined;
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return undefined;
    parsed.hash = '';
    return {
      url: parsed.href,
      ...(typeof profile === 'string' && { profile }),
    };
  } catch {
    return undefined;
  }
}

export function parseDownloadRecords(value: unknown) {
  const records: DownloadRecord[] = [];
  const ids = new Set<string>();
  let damaged = !Array.isArray(value);
  if (!Array.isArray(value)) return { records, damaged };
  const text = (entry: unknown, limit: number) =>
    typeof entry === 'string' &&
    entry.length > 0 &&
    entry.length <= limit &&
    !entry.includes('\0');
  value.forEach((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      damaged = true;
      return;
    }
    const item = entry as DownloadRecord;
    if (
      !text(item.id, 128) ||
      ids.has(item.id) ||
      !text(item.name, 1024) ||
      !text(item.path, 32768) ||
      !path.isAbsolute(item.path) ||
      typeof item.mime !== 'string' ||
      item.mime.length > 256 ||
      item.mime.includes('\0') ||
      !Number.isFinite(item.startedAt) ||
      item.startedAt < 0 ||
      item.startedAt > 8640000000000000 ||
      !Number.isSafeInteger(item.receivedBytes) ||
      !Number.isSafeInteger(item.totalBytes) ||
      !['progressing', 'completed', 'cancelled', 'interrupted'].includes(
        item.state,
      )
    ) {
      damaged = true;
      return;
    }
    const endedAt =
      Number.isFinite(item.endedAt) &&
      item.endedAt! >= 0 &&
      item.endedAt! <= 8640000000000000
        ? item.endedAt
        : undefined;
    if (
      (item.sourceKey !== undefined && !text(item.sourceKey, 1024)) ||
      (item.endedAt !== undefined && endedAt === undefined) ||
      (item.paused !== undefined && typeof item.paused !== 'boolean') ||
      item.receivedBytes < 0 ||
      item.totalBytes < 0
    )
      damaged = true;
    ids.add(item.id);
    const retrySource = parseDownloadRetrySource(item.retrySource);
    if (item.retrySource !== undefined && !retrySource) damaged = true;
    records.push({
      id: item.id,
      sourceKey:
        typeof item.sourceKey === 'string' &&
        item.sourceKey.length > 0 &&
        item.sourceKey.length <= 1024 &&
        !item.sourceKey.includes('\0')
          ? item.sourceKey
          : undefined,
      name: item.name,
      path: item.path,
      mime: item.mime,
      startedAt: item.startedAt,
      endedAt,
      receivedBytes: Math.max(0, item.receivedBytes),
      totalBytes: Math.max(0, item.totalBytes),
      state: item.state === 'progressing' ? 'interrupted' : item.state,
      paused: false,
      ...(retrySource && { retrySource }),
    });
  });
  if (records.length !== value.length) damaged = true;
  return { records, damaged };
}

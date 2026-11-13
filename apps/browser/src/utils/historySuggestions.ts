import type { HistoryRecord } from '../browser/history';

export const historyURLKey = (value: string) => {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return '';
    return url.href;
  } catch {
    return '';
  }
};

/**
 * Match locally; combine repeat visits without merging distinct paths or
 * queries.
 */
export function historySuggestions(
  records: HistoryRecord[],
  query: string,
  {
    excludedURLs = [],
    hiddenProfiles = new Set<string>(),
    profile,
    now = Date.now(),
  }: {
    excludedURLs?: string[];
    hiddenProfiles?: Set<string>;
    profile?: string;
    now?: number;
  } = {}
): HistoryRecord[] {
  const term = query.trim().toLowerCase();
  if (!term || term.startsWith('@') || term.startsWith('#')) return [];
  const addressTerm = term.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const excluded = new Set(excludedURLs.map(historyURLKey));
  const matches = new Map<
    string,
    { record: HistoryRecord; relevance: number; score: number }
  >();
  records.forEach((record) => {
    if (
      hiddenProfiles.has(record.profile) ||
      (profile && record.profile !== profile)
    )
      return;
    const key = historyURLKey(record.url);
    if (!key || excluded.has(key)) return;
    const address = key
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    const title = record.title.toLowerCase();
    if (!address.includes(addressTerm) && !title.includes(term)) return;
    const relevance = address.startsWith(addressTerm)
      ? 2
      : Number(title.startsWith(term));
    // A recent visit carries more weight; repeated visits accumulate naturally.
    const ageDays = Math.max(0, now - record.visitedAt) / 86400000;
    const weight = 1 / (1 + ageDays / 7);
    const previous = matches.get(key);
    matches.set(key, {
      record:
        previous && previous.record.visitedAt > record.visitedAt
          ? previous.record
          : { ...record, url: key },
      relevance: Math.max(relevance, previous?.relevance || 0),
      score: weight + (previous?.score || 0),
    });
  });
  return [...matches.values()]
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.score - a.score ||
        b.record.visitedAt - a.record.visitedAt ||
        a.record.url.localeCompare(b.record.url)
    )
    .slice(0, 6)
    .map((match) => match.record);
}

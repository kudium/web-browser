import { historySuggestions } from '../utils/historySuggestions';
import type { HistoryRecord } from '../browser/history';

const now = 1800000000000;
const record = (
  id: string,
  url: string,
  days = 0,
  title = 'Docs',
  profile = 'work'
): HistoryRecord => ({
  id,
  url,
  title,
  profile,
  visitedAt: now - days * 86400000,
});

it('matches URLs without schemes or www and matches titles case-insensitively', () => {
  const records = [
    record('a', 'https://www.example.com/Docs', 0, 'Developer handbook'),
  ];
  expect(historySuggestions(records, 'EXAMPLE.com', { now })).toHaveLength(1);
  expect(
    historySuggestions(records, 'https://example.com', { now })
  ).toHaveLength(1);
  expect(historySuggestions(records, 'HANDBOOK', { now })).toHaveLength(1);
  expect(historySuggestions(records, '', { now })).toEqual([]);
  expect(historySuggestions(records, '@example', { now })).toEqual([]);
});

it('ranks address-prefix matches first, then balances frequency and recency', () => {
  const records = [
    record('substring', 'https://other.com/example.com', 0),
    record('old', 'https://example.com/old', 90),
    record('recent', 'https://example.com/recent', 0),
    record('repeat1', 'https://example.com/frequent', 1),
    record('repeat2', 'https://example.com/frequent', 2),
  ];
  expect(
    historySuggestions(records, 'example.com', { now }).map((item) => item.id)
  ).toEqual(['repeat1', 'recent', 'old', 'substring']);
});

it('deduplicates canonical URLs but preserves different paths, queries and case', () => {
  const records = [
    record('root', 'https://example.com'),
    record('duplicate', 'https://example.com/', 1),
    record('path', 'https://example.com/Docs'),
    record('case', 'https://example.com/docs'),
    record('query', 'https://example.com/docs?q=one'),
  ];
  expect(historySuggestions(records, 'example', { now })).toHaveLength(4);
  expect(
    historySuggestions(records, 'example', {
      now,
      excludedURLs: ['https://example.com/'],
    })
  ).toHaveLength(3);
});

it('excludes locked profiles, respects group scope and rejects unsafe or malformed URLs', () => {
  const records = [
    record('work', 'https://example.com/work'),
    record('hidden', 'https://example.com/hidden', 0, 'Docs', 'locked'),
    record('other', 'https://example.com/other', 0, 'Docs', 'other'),
    record('bad', 'not a URL'),
    // eslint-disable-next-line no-script-url -- Verify script URLs cannot become suggestions.
    record('script', 'javascript:example'),
    record('credentials', 'https://user:secret@example.com'),
  ];
  expect(
    historySuggestions(records, 'example', {
      now,
      hiddenProfiles: new Set(['locked']),
      profile: 'work',
    }).map((item) => item.id)
  ).toEqual(['work']);
  expect(
    historySuggestions(records, 'example', {
      now,
      hiddenProfiles: new Set(['locked']),
    })
  ).toHaveLength(2);
});

it('caps the suggestion list at six', () => {
  expect(
    historySuggestions(
      Array.from({ length: 20 }, (_, index) =>
        record(`${index}`, `https://example.com/${index}`)
      ),
      'example',
      { now }
    )
  ).toHaveLength(6);
});

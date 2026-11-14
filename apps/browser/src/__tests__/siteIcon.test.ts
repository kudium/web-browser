import { savedSiteIcon } from '../utils/siteIcon';
import type { IApp } from '../types';

const tabs = [
  {
    id: 'other',
    url: 'https://example.com/page',
    icon: 'other-profile',
    sessionId: 'other',
  },
  {
    id: 'saved',
    url: 'https://example.com/old',
    icon: 'resolved',
    sessionId: 'personal',
    archived: true,
  },
] as IApp[];
it('reuses a resolved same-origin icon within the requested profile, including archived tabs', () => {
  expect(savedSiteIcon(tabs, 'https://example.com/new', 'personal')).toBe(
    'resolved'
  );
  expect(
    savedSiteIcon(tabs, 'https://example.com/new', 'missing')
  ).toBeUndefined();
});
it('does not reuse icons across sites or internal pages', () => {
  expect(savedSiteIcon(tabs, 'https://other.example/')).toBeUndefined();
  expect(savedSiteIcon(tabs, 'http://example.com/')).toBeUndefined();
  expect(savedSiteIcon(tabs, 'about:blank')).toBeUndefined();
});

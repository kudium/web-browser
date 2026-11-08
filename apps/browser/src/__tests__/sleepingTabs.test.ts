import {
  excludedFromSleep,
  normalizeSleepSites,
} from '../browser/sleepingTabs';

test('normalizes website exclusions and matches subdomains without matching unrelated domains', () => {
  const sites = normalizeSleepSites([
    'https://Example.com/mail',
    'example.com',
    'mail.example.org',
  ]);
  expect(sites).toEqual(['example.com', 'mail.example.org']);
  expect(excludedFromSleep('https://work.example.com', sites)).toBe(true);
  expect(excludedFromSleep('https://evil-example.com', sites)).toBe(false);
  expect(excludedFromSleep('https://example.com.evil.org', sites)).toBe(false);
  expect(excludedFromSleep('https://other.org', sites)).toBe(false);
});
test('rejects invalid, oversized and credential-bearing exclusions', () => {
  expect(() =>
    normalizeSleepSites(['https://user:pass@example.com'])
  ).toThrow();
  expect(() => normalizeSleepSites(['file:///tmp/test'])).toThrow();
  expect(() => normalizeSleepSites(['not a domain'])).toThrow();
  expect(() =>
    normalizeSleepSites(new Array(101).fill('example.com'))
  ).toThrow();
});

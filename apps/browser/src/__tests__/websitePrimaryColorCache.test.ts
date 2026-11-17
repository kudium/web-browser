import { createWebsitePrimaryColorCache } from '../utils/websitePrimaryColorCache';

it('reuses a color across paths and reloads for two minutes without renewing it on reads', () => {
  let now = 0;
  const cache = createWebsitePrimaryColorCache({ now: () => now });
  cache.set('https://example.com/first?token=fixture', '#00B53F');
  now = 119999;
  expect(cache.get('https://example.com/second')).toBe('#00b53f');
  now = 120000;
  expect(cache.get('https://example.com/first')).toBeUndefined();
});

it('keeps origins, login profiles, appearance and separate browser caches isolated', () => {
  const cache = createWebsitePrimaryColorCache();
  cache.set('https://example.com', '#00b53f', 'personal/light');
  for (const url of ['https://other.example', 'https://sub.example.com', 'http://example.com', 'https://example.com:444'])
    expect(cache.get(url, 'personal/light')).toBeUndefined();
  expect(cache.get('https://example.com', 'work/light')).toBeUndefined();
  expect(cache.get('https://example.com', 'personal/dark')).toBeUndefined();
  expect(createWebsitePrimaryColorCache().get('https://example.com', 'personal/light')).toBeUndefined();
});

it('updates immediately when a fresh document provides a different color', () => {
  let now = 0;
  const cache = createWebsitePrimaryColorCache({ now: () => now });
  cache.set('https://example.com', '#00b53f');
  now = 100000;
  cache.set('https://example.com/new', '#fcd72b');
  now = 200000;
  expect(cache.get('https://example.com')).toBe('#fcd72b');
  cache.delete('https://example.com');
  expect(cache.get('https://example.com')).toBeUndefined();
});

it('bounds memory, evicts the least recently used color and rejects unsupported input', () => {
  const cache = createWebsitePrimaryColorCache({ maxEntries: 2 });
  cache.set('https://one.example', '#112233');
  cache.set('https://two.example', '#223344');
  cache.get('https://one.example');
  cache.set('https://three.example', '#334455');
  expect(cache.get('https://two.example')).toBeUndefined();
  expect(cache.get('https://one.example')).toBe('#112233');
  cache.set('https://one.example', 'red; color:blue');
  expect(cache.get('https://one.example')).toBe('#112233');
  for (const url of ['invalid', 'about:blank', 'file:///fixture', 'data:text/html,fixture']) {
    cache.set(url, '#112233');
    expect(cache.get(url)).toBeUndefined();
  }
});

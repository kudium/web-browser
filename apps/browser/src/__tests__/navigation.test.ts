import { resolveAddress, sharesOrigin } from '../utils/navigation';
import { IApp } from '../types';

it('normalizes URLs and searches and shares only exact origins', () => {
  const source = { url: 'https://example.com/inbox' } as IApp;
  expect(resolveAddress('example.com/messages')).toBe(
    'https://example.com/messages'
  );
  expect(resolveAddress('browser tips')).toBe(
    'https://duckduckgo.com/?q=browser%20tips'
  );
  expect(sharesOrigin(source, 'https://example.com/settings')).toBe(true);
  expect(sharesOrigin(source, 'https://other.com')).toBe(false);
  expect(sharesOrigin(source, 'http://example.com')).toBe(false);
  expect(sharesOrigin(source, 'https://example.com:8443')).toBe(false);
  expect(sharesOrigin(undefined, 'https://example.com')).toBe(false);
});

it('preserves hook-install deep links instead of searching for them', () => {
  const link = 'kudium://install-hook?url=https%3A%2F%2Fbrowser.kudium.com%2Fv1%2Fhooks%2Febae2914-f663-4291-8e2d-373360e2cf03%2Fversions%2F1%2Fpackage';
  expect(resolveAddress(link)).toBe(link);
});

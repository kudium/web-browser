import { expect, test } from 'bun:test';
import { analyticsConsentRequired, countryRequiresConsent } from '../src/analytics-policy';
import { createApp } from '../src/app';
import type { Database } from '../src/db';

test('EEA, UK, Switzerland and unknown regions require opt-in', () => {
  for (const country of ['FR', 'DE', 'IS', 'NO', 'LI', 'GB', 'CH', '', null, 'unknown']) {
    expect(countryRequiresConsent(country)).toBe(true);
  }
  for (const country of ['US', 'CA', 'AU', 'JP']) expect(countryRequiresConsent(country)).toBe(false);
});

test('country lookup uses the proxy-appended client address and refuses spoofed headers', () => {
  expect(analyticsConsentRequired('8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('81.2.69.142', '8.8.8.8')).toBe(true);
  expect(analyticsConsentRequired('172.18.0.2', '81.2.69.142, 8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('172.18.0.2', '8.8.8.8, 81.2.69.142')).toBe(true);
  expect(analyticsConsentRequired('::ffff:172.18.0.2', '::ffff:8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('172.18.0.2', 'not-an-ip')).toBe(true);
  expect(analyticsConsentRequired()).toBe(true);
});

test('policy responses are uncached and disclose neither IP nor country', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/analytics-policy', {
    headers: { 'x-forwarded-for': '8.8.8.8' },
  }, { remoteAddress: '172.18.0.2' });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ consentRequired: false });
  expect(await (await app.request('/analytics-policy')).json()).toEqual({ consentRequired: true });
});

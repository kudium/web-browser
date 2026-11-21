import { expect, test } from 'bun:test';
import { analyticsConsentRequired, countryRequiresConsent } from '../src/analytics-policy';
import { createApp } from '../src/app';
import type { Database } from '../src/db';

test('confirmed EEA, UK and Switzerland require opt-in; other and unknown regions default on', () => {
  for (const country of ['FR', 'DE', 'IS', 'NO', 'LI', 'GB', 'CH']) {
    expect(countryRequiresConsent(country)).toBe(true);
  }
  for (const country of ['US', 'CA', 'AU', 'JP', '', null, 'unknown']) expect(countryRequiresConsent(country)).toBe(false);
});

test('country lookup uses the proxy-appended client address and refuses spoofed headers', () => {
  expect(analyticsConsentRequired('8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('81.2.69.142', '8.8.8.8')).toBe(true);
  expect(analyticsConsentRequired('172.18.0.2', '81.2.69.142, 8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('172.18.0.2', '8.8.8.8, 81.2.69.142')).toBe(true);
  expect(analyticsConsentRequired('::ffff:172.18.0.2', '::ffff:8.8.8.8')).toBe(false);
  expect(analyticsConsentRequired('172.18.0.2', 'not-an-ip')).toBe(false);
  expect(analyticsConsentRequired()).toBe(false);
});

test('policy responses are uncached and disclose neither IP nor country', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/analytics-policy', {
    headers: { 'x-forwarded-for': '8.8.8.8' },
  }, { remoteAddress: '172.18.0.2' });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ consentRequired: false });
  expect(await (await app.request('/analytics-policy')).json()).toEqual({ consentRequired: false });
});

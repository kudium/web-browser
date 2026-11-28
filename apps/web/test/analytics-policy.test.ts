import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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


test('patched GeoIP maintenance retains IPv4 range conversion with the secure IP helper', () => {
  const require = createRequire(import.meta.url);
  const { Address4 } = require('ip-address');
  const source = readFileSync(require.resolve('geoip-country/scripts/updatedb.js'), 'utf8');
  const snippets = source.match(/sip = parseInt\(rngip.startAddress\(\).bigInt\(\),10\)\s+eip = parseInt\(rngip.endAddress\(\).bigInt\(\),10\)/g);
  expect(snippets?.length).toBe(2);
  for (const snippet of snippets!) {
    const convert = new Function('rngip', `let sip, eip; ${snippet}; return [sip, eip];`);
    expect(convert(new Address4('10.0.0.0/8'))).toEqual([167772160, 184549375]);
  }
  expect(analyticsConsentRequired('2001:4860:4860::8888')).toBe(false);
});

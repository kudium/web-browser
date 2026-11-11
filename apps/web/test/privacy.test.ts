import { expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { privacyPage } from '../src/privacy';
import type { Database } from '../src/db';
test('privacy policy is publicly accessible without a session or database', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/privacy');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  const html = await response.text();
  expect(html).toContain('https://browser.kudium.com/privacy');
  expect(html).toContain('/assets/privacy.css');
  expect((await app.request('/assets/privacy.css')).headers.get('Content-Type')).toContain('text/css');
});
test('contents links resolve and encryption and Google disclosures are explicit', () => {
  const html = privacyPage();
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) expect(html).toContain(`id="${id}"`);
  expect(html).toContain('This is not end-to-end encryption');
  expect(html).toContain('Kudium does not receive that biometric data');
  expect(html).toContain('Google API Services User Data Policy');
  expect(html).toContain('hello@kudium.com');
});

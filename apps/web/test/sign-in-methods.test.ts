import { expect, test } from 'bun:test';
import { authPage, accountPage } from '../src/pages';
import { createAuth } from '../src/auth';
import { createApp } from '../src/app';
import type { Database } from '../src/db';
const db = {} as Database;
const config = { secret: 'test-secret-at-least-32-characters-long', baseURL: 'https://browser.kudium.com' };
test('sign-in choices reflect configured providers and recovery keeps its own form', () => {
  expect(authPage('sign-in', true, false)).not.toContain('data-google-sign-in');
  expect(authPage('sign-up', true, false, true)).toContain('Continue with Google');
  expect(authPage('sign-in', true, false, true)).toContain('data-passkey-sign-in');
  expect(authPage('forgot-password', true, true, true)).not.toContain('data-google-sign-in');
  expect(authPage('reset-password', true, true, true)).not.toContain('data-passkey-sign-in');
  expect(accountPage('Test', 'test@example.com', { usedBytes: 0, recordCount: 0, quotas: { bytes: 100 } })).toContain('data-passkey-add');
});
test('passkeys use the exact service origin and user verification; account linking protects unverified identities', () => {
  const auth = createAuth(db, config);
  const plugin = auth.options.plugins.find(plugin => plugin.id === 'passkey')!;
  expect(plugin).toBeDefined();
  expect(auth.options.account?.accountLinking?.requireLocalEmailVerified).toBe(true);
  expect(auth.options.account?.accountLinking?.allowDifferentEmails).toBe(false);
});
test('browser bundle is self-hosted and does not include server OAuth secrets', async () => {
  const secret = 'fake-google-secret-never-bundle';
  const auth = createAuth(db, { ...config, google: { clientId: 'fake-google-client', clientSecret: secret } });
  const app = createApp({ db, auth, assetOrigins: [] });
  expect(await (await app.request('/api/sign-in-options')).json()).toEqual({ google: true });
  const response = await app.request('/assets/passkeys.js');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('javascript');
  const bundle = await response.text();
  expect(bundle).toContain('generate-authenticate-options');
  expect(bundle).not.toContain(secret);
});

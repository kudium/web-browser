import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { homepage, accountPage } from '../src/pages';
import { createApp } from '../src/app';
import type { Database } from '../src/db';
const source = await Bun.file(new URL('../public/analytics.js', import.meta.url)).text();
function run(origin = 'https://browser.kudium.com', consent: string | null = null) {
  const listeners: Record<string, () => void> = {};
  const scripts: unknown[] = [];
  const panel = { hidden: true, querySelector: () => ({ focus() {} }) };
  const window: any = {};
  const storage = new Map(consent ? [['kudium.analytics-consent.v1', consent]] : []);
  const document = {
    cookie: '', head: { append: (script: unknown) => scripts.push(script) }, createElement: () => ({}),
    querySelector: (selector: string) => selector === '[data-analytics-consent]' ? panel : { addEventListener: (_: string, fn: () => void) => listeners[selector] = fn },
  };
  runInNewContext(source, { window, document, location: { origin, pathname: '/download', search: '?token=secret', hash: '#email' }, navigator: {}, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  return { window, panel, scripts, listeners };
}
test('analytics waits for consent and strips URL secrets; revocation can be reversed', () => {
  const state = run();
  expect(state.scripts).toHaveLength(0);
  expect(state.panel.hidden).toBe(false);
  state.listeners['[data-analytics-allow]']();
  expect(state.scripts).toHaveLength(1);
  expect(JSON.stringify(state.window.dataLayer)).not.toContain('secret');
  expect(JSON.stringify(state.window.dataLayer)).toContain('https://browser.kudium.com/download');
  state.listeners['[data-analytics-decline]']();
  expect(state.window['ga-disable-G-JF314TQ397']).toBe(true);
  state.listeners['[data-analytics-allow]']();
  expect(state.window['ga-disable-G-JF314TQ397']).toBe(false);
  expect(state.scripts).toHaveLength(1);
});
test('development does not load Google even with saved consent', () => {
  expect(run('http://localhost:3000', 'granted').scripts).toHaveLength(0);
});
test('public layouts serve analytics under CSP; account layouts exclude it', async () => {
  expect(homepage()).toContain('/assets/analytics.js');
  expect(accountPage('Private Name', 'private@example.com', { usedBytes: 0, recordCount: 0, quotas: { bytes: 1000 } })).not.toContain('/assets/analytics.js');
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/');
  expect(response.headers.get('content-security-policy')).toContain('https://www.googletagmanager.com');
  expect((await app.request('/assets/analytics.js')).status).toBe(200);
});

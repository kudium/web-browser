import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { homepage, accountPage } from '../src/pages';
import { createApp } from '../src/app';
import type { Database } from '../src/db';
const source = await Bun.file(new URL('../public/analytics.js', import.meta.url)).text();
async function run(origin = 'https://browser.kudium.com', consent: string | null = null, consentRequired: boolean | null = true, privacy: Record<string, unknown> = {}, fetchPolicy?: () => Promise<any>) {
  const listeners: Record<string, () => void> = {};
  const scripts: unknown[] = [];
  const panel = { hidden: true, querySelector: () => ({ focus() {} }) };
  const window: any = {};
  const storage = new Map(consent ? [['kudium.analytics-consent.v1', consent]] : []);
  const document = {
    cookie: '', head: { append: (script: unknown) => scripts.push(script) }, createElement: () => ({}),
    querySelector: (selector: string) => selector === '[data-analytics-consent]' ? panel : { addEventListener: (_: string, fn: () => void) => listeners[selector] = fn },
  };
  runInNewContext(source, { window, document, location: { origin, pathname: '/download', search: '?token=secret', hash: '#email' }, navigator: privacy, AbortSignal, fetch: fetchPolicy ?? (async () => { if (consentRequired === null) throw new Error('lookup failed'); return { ok: true, json: async () => ({ consentRequired }) }; }), localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  await new Promise(resolve => setImmediate(resolve));
  return { window, panel, scripts, listeners, storage };
}
test('analytics waits for consent and strips URL secrets; revocation can be reversed', async () => {
  const state = await run();
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
test('development does not load Google even with saved consent', async () => {
  expect((await run('http://localhost:3000', 'granted')).scripts).toHaveLength(0);
});
test('public layouts serve analytics under CSP; account layouts exclude it', async () => {
  expect(homepage()).toContain('/assets/analytics.js');
  expect(accountPage('Private Name', 'private@example.com', { usedBytes: 0, recordCount: 0, quotas: { bytes: 1000 } })).not.toContain('/assets/analytics.js');
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/');
  expect(response.headers.get('content-security-policy')).toContain('https://www.googletagmanager.com');
  expect((await app.request('/assets/analytics.js')).status).toBe(200);
});


test('outside opt-in regions analytics starts without a prompt or a fabricated consent record', async () => {
  const state = await run('https://browser.kudium.com', null, false);
  expect(state.panel.hidden).toBe(true);
  expect(state.scripts).toHaveLength(1);
  expect(state.storage.has('kudium.analytics-consent.v1')).toBe(false);
  state.listeners['[data-analytics-decline]']();
  expect(state.window['ga-disable-G-JF314TQ397']).toBe(true);
});

test('saved declines and privacy signals override regional defaults', async () => {
  for (const [consent, privacy] of [
    ['denied', {}], [null, { globalPrivacyControl: true }], [null, { doNotTrack: '1' }],
  ] as const) {
    const state = await run('https://browser.kudium.com', consent, false, privacy);
    expect(state.scripts).toHaveLength(0);
    expect(state.panel.hidden).toBe(true);
  }
});

test('failed region lookup enables analytics without a prompt', async () => {
  const state = await run('https://browser.kudium.com', null, null);
  expect(state.scripts).toHaveLength(1);
  expect(state.panel.hidden).toBe(true);
  expect(state.storage.has('kudium.analytics-consent.v1')).toBe(false);
});


test('a decline while region lookup is pending cannot be overridden by automatic enablement', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const state = await run('https://browser.kudium.com', null, false, {}, () => pending);
  state.listeners['[data-analytics-decline]']();
  resolve({ ok: true, json: async () => ({ consentRequired: false }) });
  await new Promise(done => setImmediate(done));
  expect(state.scripts).toHaveLength(0);
  expect(state.panel.hidden).toBe(true);
});

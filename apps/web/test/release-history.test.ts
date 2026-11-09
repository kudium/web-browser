import { expect, test } from 'bun:test';
import { createApp } from '../src/app';
import type { Database } from '../src/db';
import { groupReleaseHistory } from '../src/releases';
import type { ReleaseManifest } from '../src/validation';

const origin = 'https://downloads.example.com';
const row = (version: string, arch: 'arm64' | 'x64' = 'arm64', channel: 'stable' | 'beta' = version.includes('-') ? 'beta' : 'stable') => ({
  manifest: { version, platform: 'darwin', arch, channel, notes: 'Release notes', files: [{ url: `${origin}/${version}/${arch}/browser.dmg`, sha512: Buffer.alloc(64).toString('base64'), size: 1024 }] } as ReleaseManifest,
  publishedAt: new Date('2026-11-08T20:00:00Z'),
});
const fakeDatabase = (rows: ReturnType<typeof row>[]) => ({ select: () => ({ from: () => ({ where: async () => rows }) }) }) as unknown as Database;

test('history groups architecture downloads and sorts stable and beta versions numerically', () => {
  const history = groupReleaseHistory([row('1.9.0'), row('1.10.0', 'x64'), row('1.10.0'), row('1.11.0-beta.2'), row('1.11.0-beta.10')], [origin], 'all', 1);
  expect(history.releases.map(r => r.version)).toEqual(['1.11.0-beta.10', '1.11.0-beta.2', '1.10.0', '1.9.0']);
  expect(history.releases[2].targets).toHaveLength(2);
  expect(history.releases[2].notes).toEqual(['Release notes']);
  expect(groupReleaseHistory([row('1.10.0'), row('1.11.0-beta.1')], [origin], 'stable', 1).releases.map(r => r.version)).toEqual(['1.10.0']);
});

test('pagination keeps every architecture of a release together', () => {
  const rows = Array.from({ length: 14 }, (_, index) => [row(`1.0.${index}`), row(`1.0.${index}`, 'x64')]).flat();
  const first = groupReleaseHistory(rows, [origin], 'all', 1);
  const second = groupReleaseHistory(rows, [origin], 'all', 2);
  expect(first.releases).toHaveLength(12);
  expect(second.releases.map(r => r.version)).toEqual(['1.0.1', '1.0.0']);
  expect(first.total).toBe(14);
  expect(first.totalPages).toBe(2);
  expect([...first.releases, ...second.releases].every(r => r.targets.length === 2)).toBe(true);
});

test('history excludes untrusted URLs and malformed version manifests', () => {
  const untrusted = row('2.0.0'); untrusted.manifest.files[0].url = 'https://evil.example/browser.dmg';
  const malformed = row('not-a-version');
  expect(groupReleaseHistory([row('1.0.0'), untrusted, malformed], [origin], 'all', 1).releases.map(r => r.version)).toEqual(['1.0.0']);
});

test('public HTML and API show version downloads, escaped notes and channel filters', async () => {
  const stable = row('1.10.0'); stable.manifest.notes = '<script>alert("bad")</script>\nFixed tabs.';
  const app = createApp({ db: fakeDatabase([stable, row('1.11.0-beta.1')]), assetOrigins: [origin] });
  const response = await app.request('/releases?channel=stable');
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('1.10.0'); expect(html).not.toContain('1.11.0-beta.1');
  expect(html).toContain(`href="${stable.manifest.files[0].url}"`);
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>alert');
  expect(html).toContain('aria-label="Release channel"');
  expect(html).toContain('November 8, 2026');
  const api = await app.request('/v1/releases?channel=beta');
  const data = await api.json();
  expect(data.releases.map((r: { version: string }) => r.version)).toEqual(['1.11.0-beta.1']);
  expect(data.releases[0]).not.toHaveProperty('id');
  expect(api.headers.get('Cache-Control')).toBe('no-store');
  const downloads = await app.request('/download');
  expect(await downloads.text()).toContain('Browse all versions');
});

test('invalid queries are rejected and empty pages provide useful navigation', async () => {
  const app = createApp({ db: fakeDatabase([]), assetOrigins: [origin] });
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=abc', 'channel=preview']) expect((await app.request(`/releases?${query}`)).status).toBe(400);
  expect(await (await app.request('/releases')).text()).toContain('No published versions yet.');
  const populated = createApp({ db: fakeDatabase([row('1.0.0')]), assetOrigins: [origin] });
  expect(await (await populated.request('/releases?page=2')).text()).toContain('Return to the first page');
});


test('Get Browser links open the download page', async () => {
  const app = createApp({ db: fakeDatabase([]), assetOrigins: [origin] });
  const html = await (await app.request('/')).text();
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>\s*Get Browser/g)].map(match => match[1]);
  expect(links.length).toBeGreaterThan(0);
  expect(links.every(href => href === '/download')).toBe(true);
});

test('download page shows five most recent versions with all architecture downloads', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => [row(`1.0.${index}`), row(`1.0.${index}`, 'x64')]).flat();
  rows[14].manifest.notes = '<script>unsafe()</script>';
  const app = createApp({ db: fakeDatabase(rows), assetOrigins: [origin] });
  const response = await app.request('/download');
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('Recent releases');
  expect((html.match(/class="release-card"/g) || []).length).toBe(5);
  expect([...html.matchAll(/<h3>(1\.0\.\d)<\/h3>/g)].map(match => match[1])).toEqual(['1.0.7', '1.0.6', '1.0.5', '1.0.4', '1.0.3']);
  for (const arch of ['arm64', 'x64']) expect(html).toContain(`href="${origin}/1.0.7/${arch}/browser.dmg"`);
  expect(html).toContain('&lt;script&gt;unsafe()');
  expect(html).not.toContain('<script>unsafe()');
  expect(html).not.toContain(`${origin}/1.0.2/`);
});

test('download history displays available versions and an empty state without placeholders', async () => {
  const empty = createApp({ db: fakeDatabase([]), assetOrigins: [origin] });
  expect(await (await empty.request('/download')).text()).toContain('No published versions yet.');
  const one = createApp({ db: fakeDatabase([row('1.0.3')]), assetOrigins: [origin] });
  const html = await (await one.request('/download')).text();
  expect((html.match(/class="release-card"/g) || []).length).toBe(1);
  expect(html).not.toContain('No published versions yet.');
});

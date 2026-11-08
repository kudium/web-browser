import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { connect } from '../src/db';
import { createApp } from '../src/app';
import { accounts, releases } from '../src/schema';
import { envelopeSchema } from '../src/validation';
import { cursorFor, parseCursor, quotas } from '../src/sync';
import { updateAvailable } from '../src/releases';
import { parse } from 'yaml';
const envelope = (recordId = 'record_one') => ({ version: 1 as const, recordId, keyVersion: 1, nonce: Buffer.alloc(12).toString('base64'), ciphertext: Buffer.from('opaque ciphertext').toString('base64'), tag: Buffer.alloc(16).toString('base64') });
test('envelopes reject plaintext, unknown keys and invalid nonce/tag lengths', () => {
  expect(envelopeSchema.safeParse(envelope()).success).toBe(true);
  expect(envelopeSchema.safeParse({ ...envelope(), plaintext: 'secret' }).success).toBe(false);
  expect(envelopeSchema.safeParse({ ...envelope(), nonce: 'AAAA' }).success).toBe(false);
  expect(envelopeSchema.safeParse({ ...envelope(), ciphertext: 'not base64' }).success).toBe(false);
});
test('cursors reject cross-account, malformed and unsafe sequence values', () => {
  expect(parseCursor(cursorFor('alice', 7), 'alice')).toBe(7);
  expect(() => parseCursor(cursorFor('alice', 7), 'bob')).toThrow();
  expect(() => parseCursor(cursorFor('alice', -1), 'alice')).toThrow();
  expect(() => parseCursor('invalid', 'alice')).toThrow();
});
test('semantic versions never downgrade and compare numerically', () => {
  expect(updateAvailable('1.10.0', '1.9.0')).toBe(true);
  expect(updateAvailable('1.0.0', '2.0.0')).toBe(false);
  expect(updateAvailable('1.0.0', '1.0.0')).toBe(false);
});
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL API integration (dedicated test database only)', () => {
  const { db, client } = connect(url!);
  const suffix = randomUUID();
  const alice = `alice-${suffix}`, bob = `bob-${suffix}`;
  const app = createApp({ db, authenticate: async token => { if (token === 'alice') return alice; if (token === 'bob') return bob; throw new Error(); }, assetOrigins: ['https://downloads.example.com'] });
  const request = (path: string, method = 'GET', token = 'alice', data?: unknown, extra: Record<string, string> = {}) => app.request(path, { method, headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  beforeAll(async () => { await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname }); });
  afterAll(async () => { await db.delete(accounts).where(eq(accounts.id, alice)); await db.delete(accounts).where(eq(accounts.id, bob)); await db.delete(releases).where(eq(releases.id, suffix)); await db.delete(releases).where(eq(releases.id, suffix + '-old')); await client.end(); });
  test('homepage, docs and database readiness serve correctly', async () => {
    const home = await app.request('/'); expect(home.status).toBe(200); expect(await home.text()).toContain('Make room for');
    const docs = await app.request('/docs'); expect(docs.status).toBe(200); expect(await docs.text()).toContain('If-None-Match');
    expect((await app.request('/assets/site.css')).headers.get('Content-Type')).toContain('text/css');
    expect((await app.request('/ready')).status).toBe(200);
  });
  test('deployment without a sign-in provider serves pages and blocks every sync request', async () => {
    const unconfigured = createApp({ db, assetOrigins: ['https://downloads.example.com'] });
    expect((await unconfigured.request('/')).status).toBe(200);
    const ready = await (await unconfigured.request('/ready')).json();
    expect(ready.sync).toBe('unconfigured');
    const sync = await unconfigured.request('/v1/sync/status');
    expect(sync.status).toBe(503);
    expect(await sync.json()).toEqual({ error: 'sync_not_configured' });
  });
  test('authentication is mandatory and unknown tokens fail', async () => {
    expect((await app.request('/v1/sync/status')).status).toBe(401);
    expect((await request('/v1/sync/status', 'GET', 'invalid')).status).toBe(401);
  });
  test('create, account isolation, conditional concurrency and resumable changes', async () => {
    const path = '/v1/sync/records/record_one';
    expect((await request(path, 'PUT', 'alice', envelope())).status).toBe(428);
    const created = await request(path, 'PUT', 'alice', envelope(), { 'If-None-Match': '*' });
    expect(created.status).toBe(201); expect(created.headers.get('ETag')).toBe('"1"');
    expect((await request(path, 'GET', 'bob')).status).toBe(404);
    expect((await request(path, 'PUT', 'alice', envelope(), { 'If-None-Match': '*' })).status).toBe(409);
    const writes = await Promise.all([request(path, 'PUT', 'alice', envelope(), { 'If-Match': '"1"' }), request(path, 'PUT', 'alice', envelope(), { 'If-Match': '"1"' })]);
    expect(writes.map(r => r.status).sort()).toEqual([200, 409]);
    const first = await (await request('/v1/sync/changes?limit=1')).json();
    expect(first.changes[0].revision).toBe(1); expect(first.hasMore).toBe(true);
    const second = await (await request(`/v1/sync/changes?cursor=${first.cursor}&limit=1`)).json();
    expect(second.changes[0].revision).toBe(2); expect(second.hasMore).toBe(false);
    expect((await request(`/v1/sync/changes?cursor=${first.cursor}`, 'GET', 'bob')).status).toBe(400);
    expect((await request('/v1/sync/changes?limit=0')).status).toBe(400);
    expect((await request(path, 'DELETE', 'bob', undefined, { 'If-Match': '"2"' })).status).toBe(409);
    expect((await request(path, 'DELETE', 'alice', undefined, { 'If-Match': '"2"' })).status).toBe(200);
    const deleted = await (await request(`/v1/sync/changes?cursor=${second.cursor}`)).json();
    expect(deleted.changes[0].deleted).toBe(true); expect(deleted.changes[0].envelope).toBeNull();
  });
  test('strict payload and path validation', async () => {
    expect((await request('/v1/sync/records/other', 'PUT', 'alice', envelope(), { 'If-None-Match': '*' })).status).toBe(400);
    expect((await request('/v1/sync/records/record_one', 'PUT', 'alice', { ...envelope(), secrets: [] })).status).toBe(400);
    expect((await app.request('/v1/sync/records/record_one', { method: 'PUT', headers: { Authorization: 'Bearer alice', 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
  });
  test('quota enforcement rolls back atomically', async () => {
    await request('/v1/sync/status', 'GET', 'bob');
    await db.update(accounts).set({ usedBytes: quotas.bytes }).where(eq(accounts.id, bob));
    expect((await request('/v1/sync/records/quota_record', 'PUT', 'bob', envelope('quota_record'), { 'If-None-Match': '*' })).status).toBe(413);
    expect((await request('/v1/sync/records/quota_record', 'GET', 'bob')).status).toBe(404);
    const status = await (await request('/v1/sync/status', 'GET', 'bob')).json(); expect(status.recordCount).toBe(0); expect(status.changeCount).toBe(0);
    await db.update(accounts).set({ usedBytes: 0 }).where(eq(accounts.id, bob));
  });
  test('confirmed data deletion erases historical payloads and preserves monotonic cursor', async () => {
    await request('/v1/sync/records/new_record', 'PUT', 'alice', envelope('new_record'), { 'If-None-Match': '*' });
    const before = await (await request('/v1/sync/status')).json();
    expect((await request('/v1/sync/data', 'DELETE')).status).toBe(400);
    expect((await request('/v1/sync/data', 'DELETE', 'alice', undefined, { 'X-Confirm-Delete': 'all-sync-data' })).status).toBe(200);
    const feed = await (await request('/v1/sync/changes')).json(); expect(feed.changes.every((v: { envelope: unknown }) => v.envelope === null)).toBe(true);
    const delta = await (await request(`/v1/sync/changes?cursor=${before.cursor}`)).json(); expect(delta.changes).toHaveLength(1); expect(delta.changes[0].deleted).toBe(true);
    const status = await (await request('/v1/sync/status')).json(); expect(status.usedBytes).toBe(0); expect(status.historyBytes).toBe(0);
  });
  test('latest update feed selects semver, validates platform and emits updater-compatible YAML', async () => {
    const manifest = { platform: 'darwin' as const, arch: 'arm64' as const, channel: 'stable' as const, version: '1.10.0', notes: 'Release notes', files: [{ url: 'https://downloads.example.com/Kudium-1.10.0-arm64.zip', sha512: Buffer.alloc(64).toString('base64'), size: 1024 }] };
    await db.insert(releases).values([{ id: suffix, ...manifest, manifest }, { id: suffix + '-old', ...manifest, version: '1.9.0', manifest: { ...manifest, version: '1.9.0' } }]);
    const result = await (await app.request('/v1/updates/latest?platform=darwin&arch=arm64&currentVersion=1.9.0')).json(); expect(result.available).toBe(true); expect(result.release.version).toBe('1.10.0');
    const newer = await (await app.request('/v1/updates/latest?platform=darwin&arch=arm64&currentVersion=2.0.0')).json(); expect(newer.available).toBe(false);
    const yaml = parse(await (await app.request('/updates/stable/darwin/arm64/latest-mac.yml')).text()); expect(yaml.version).toBe('1.10.0'); expect(yaml.files[0].sha512).toBe(manifest.files[0].sha512);
    expect((await app.request('/download/darwin/arm64')).headers.get('Location')).toBe(manifest.files[0].url);
    expect((await app.request('/v1/updates/latest?platform=android&arch=x64')).status).toBe(400);
    expect((await app.request('/updates/stable/darwin/arm64/latest.yml')).status).toBe(404);
    expect((await app.request('/download/linux/arm64')).status).toBe(404);
  });
});

import { releasePublishing, type PublishingConfig } from './release-publishing';
import { registerReleases } from './releases';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { valid } from 'semver';
import { stringify } from 'yaml';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { authenticateSession, syncAccountId, type Authenticate, type Auth } from './auth';
import { envelopeSchema, opaqueId, targetSchema } from './validation';
import { expectedRevision, syncStore } from './sync';
import { latestRelease, updateAvailable, updaterManifest, releaseHistory } from './releases';
import { homepage, downloadPage, documentation, unavailablePage, authPage, accountPage, tutorialIndex, tutorialPage, devicePage, releaseHistoryPage } from './pages';
import { tutorials } from './tutorials';
export function createApp({ db, auth, authenticate: testAuthenticate, assetOrigins, publishing }: { publishing?: PublishingConfig; db: Database; auth?: Auth; authenticate?: Authenticate; assetOrigins: string[] }) {
  const app = new Hono<{ Variables: { account: string } }>();
  const store = syncStore(db);
  const authenticate = auth ? authenticateSession(auth) : testAuthenticate;
  app.use('*', (c, next) => secureHeaders({
    xFrameOptions: c.req.path === '/' ? false : 'SAMEORIGIN',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      frameAncestors: c.req.path === '/' ? ["'self'", 'file:', 'http://localhost:1212'] : ["'none'"],
      baseUri: ["'none'"], formAction: ["'self'"],
    },
  })(c, next));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    // Deliberately avoid logging credentials, encrypted payloads or database query parameters.
    console.error('Service request failed');
    return c.json({ error: 'internal_error' }, 500);
  });
  app.notFound(c => c.json({ error: 'not_found' }, 404));
  if (publishing) app.route('/', releasePublishing(publishing, manifests => registerReleases(db, manifests)));
  app.get('/health', c => c.json({ status: 'ok' }));
  app.get('/ready', async c => { try { await db.execute(sql`select 1`); return c.json({ status: 'ready', sync: authenticate ? 'configured' : 'unconfigured' }); } catch { return c.json({ status: 'unavailable' }, 503); } });
  app.get('/', c => c.html(homepage()));
  app.get('/download', async c => {
    const history = await releaseHistory(db, assetOrigins, 'all', 1, 5);
    c.header('Cache-Control', 'no-store');
    return c.html(downloadPage(history.releases));
  });
  const historyQuery = z.object({ channel: z.enum(['all', 'stable', 'beta']).default('all'), page: z.coerce.number().int().min(1).max(10000).default(1) });
  for (const route of ['/releases', '/v1/releases']) app.get(route, async c => {
    const query = historyQuery.safeParse(c.req.query());
    if (!query.success) throw new HTTPException(400, { message: 'invalid_release_query' });
    const history = await releaseHistory(db, assetOrigins, query.data.channel, query.data.page);
    c.header('Cache-Control', 'no-store');
    return route === '/v1/releases' ? c.json(history) : c.html(releaseHistoryPage(history, query.data.channel));
  });
  app.get('/docs', c => c.html(documentation()));
  app.get('/tutorials', c => c.html(tutorialIndex()));
  app.get('/tutorials/:slug', c => { const tutorial = tutorials.find(t => t.slug === c.req.param('slug')); return tutorial ? c.html(tutorialPage(tutorial)) : c.notFound(); });
  const demoAssets = new Set(['sidebar-expanded', 'sidebar-collapsed', 'address-group-picker', 'workspace-light', 'workspace-dark', 'project-files-light', 'project-files-dark', 'project-editor-light', 'project-editor-dark', 'file-filter', 'project-scripts', 'site-hooks-light', 'site-hooks-dark', 'ai-context', 'ai-mentions', 'ai-active-tabs', 'project-terminal', 'developer-workspace', 'developer-files', 'developer-terminal', 'design-workspace', 'social-workspace']);
  app.get('/assets/product/demo/:filename', async c => {
    const filename = c.req.param('filename');
    if (!filename.endsWith('.webp') || !demoAssets.has(filename.slice(0, -5))) return c.notFound();
    const file = Bun.file(new URL(`../public/product/demo/${filename}`, import.meta.url));
    if (!(await file.exists())) return c.notFound();
    c.header('Content-Type', 'image/webp'); c.header('Cache-Control', 'public, max-age=3600');
    return c.body(await file.arrayBuffer());
  });
  const productAssets = new Set(['address-picker-detail.webp', 'favorites-detail.webp', 'highlight-workspaces.webp', 'highlight-ai.webp', 'highlight-developer.webp', 'origin-logo.png', 'browser.webp', 'assistant.webp', 'editor.webp', 'kudium-macbook.webp', 'kudium-ai-macbook.webp', 'kudium-imac.webp', 'workspace-detail.webp', 'editor-detail.webp']);
  app.get('/assets/product/:filename', async c => {
    const filename = c.req.param('filename');
    if (!productAssets.has(filename)) return c.notFound();
    const file = Bun.file(new URL(`../public/product/${filename}`, import.meta.url));
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('Content-Type', filename.endsWith('.png') ? 'image/png' : 'image/webp');
    return c.body(await file.arrayBuffer());
  });
  app.get('/assets/download.js', async c => { c.header('Content-Type', 'text/javascript; charset=utf-8'); return c.body(await Bun.file(new URL('../public/download.js', import.meta.url)).text()); });
  app.get('/assets/showcase.js', async c => { c.header('Content-Type', 'text/javascript; charset=utf-8'); return c.body(await Bun.file(new URL('../public/showcase.js', import.meta.url)).text()); });
  app.get('/assets/site.css', async c => { c.header('Cache-Control', 'public, max-age=300'); c.header('Content-Type', 'text/css; charset=utf-8'); return c.body(await Bun.file(new URL('../public/site.css', import.meta.url)).text()); });
  app.use('/api/auth/*', bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: 'body_too_large' }, 413) }));
  app.use('/api/auth/*', async (c, next) => {
    if (auth && c.req.method === 'POST') {
      const origin = c.req.header('Origin');
      const expected = new URL(String(auth.options.baseURL)).origin;
      if ((origin && origin !== expected) || (!origin && c.req.header('Sec-Fetch-Site') === 'cross-site')) throw new HTTPException(403, { message: 'untrusted_origin' });
    }
    await next();
  });
  app.on(['GET', 'POST'], '/api/auth/*', c => {
    c.header('Cache-Control', 'no-store');
    if (!auth) throw new HTTPException(503, { message: 'auth_not_configured' });
    return auth.handler(c.req.raw);
  });
  app.get('/assets/auth.js', async c => {
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=300');
    return c.body(await Bun.file(new URL('../public/auth.js', import.meta.url)).text());
  });
  for (const page of ['sign-in', 'sign-up', 'forgot-password', 'reset-password'] as const) {
    app.get(`/${page}`, c => {
      c.header('Cache-Control', 'no-store');
      return c.html(authPage(page, Boolean(auth), Boolean(auth?.options.emailAndPassword?.sendResetPassword)));
    });
  }
  app.get('/device', async c => {
    c.header('Cache-Control', 'no-store');
    if (!auth) throw new HTTPException(503, {message: 'auth_not_configured'});
    const code = c.req.query('user_code');
    if (!code || !/^[A-Za-z0-9-]{4,32}$/.test(code)) throw new HTTPException(400, {message: 'invalid_device_code'});
    const session = await auth.api.getSession({headers: c.req.raw.headers, query: {disableCookieCache:true}});
    if (!session) return c.redirect(`/sign-in?next=${encodeURIComponent(`/device?user_code=${code}`)}`);
    return c.html(devicePage());
  });
  app.get('/assets/sessions.js', async c => {c.header('Content-Type','text/javascript; charset=utf-8');return c.body(await Bun.file(new URL('../public/sessions.js',import.meta.url)).text());});
  app.get('/assets/device.js', async c => {c.header('Content-Type','text/javascript; charset=utf-8');return c.body(await Bun.file(new URL('../public/device.js',import.meta.url)).text());});
  app.get('/account', async c => {
    c.header('Cache-Control', 'no-store');
    if (!auth) return c.redirect('/sign-in');
    const session = await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
    if (!session) return c.redirect('/sign-in');
    return c.html(accountPage(session.user.name, session.user.email, await store.status(syncAccountId(session.user.id))));
  });
  app.get('/download/:platform/:arch', async c => {
    const parsed = targetSchema.safeParse({ ...c.req.param(), channel: 'stable' });
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid_target' });
    const release = await latestRelease(db, parsed.data, assetOrigins);
    c.header('Cache-Control', 'no-store');
    if (!release) return c.html(unavailablePage(), 404);
    // ZIP is the macOS updater asset; prefer a DMG for manual installation if supplied.
    const file = release.manifest.files.find(f => new URL(f.url).pathname.toLowerCase().endsWith('.dmg')) ?? release.manifest.files[0];
    return c.redirect(file.url, 302);
  });
  app.get('/v1/updates/latest', async c => {
    const target = targetSchema.safeParse(c.req.query());
    const current = c.req.query('currentVersion');
    if (!target.success || (current !== undefined && valid(current) !== current)) throw new HTTPException(400, { message: 'invalid_update_query' });
    const release = await latestRelease(db, target.data, assetOrigins);
    c.header('Cache-Control', 'no-store');
    if (!release) return c.json({ available: false, release: null });
    return c.json({ available: current ? updateAvailable(release.version, current) : true, release: { ...release.manifest, publishedAt: release.publishedAt.toISOString() } });
  });
  app.get('/updates/:channel/:platform/:arch/:filename', async c => {
    const target = targetSchema.safeParse(c.req.param());
    if (!target.success) throw new HTTPException(400, { message: 'invalid_target' });
    const base = target.data.channel === 'stable' ? 'latest' : 'beta';
    const filename = base + ({ darwin: '-mac.yml', win32: '.yml', linux: '-linux.yml' }[target.data.platform]);
    if (c.req.param('filename') !== filename) throw new HTTPException(404, { message: 'not_found' });
    const release = await latestRelease(db, target.data, assetOrigins);
    if (!release) throw new HTTPException(404, { message: 'release_not_found' });
    c.header('Cache-Control', 'no-store'); c.header('Content-Type', 'application/yaml');
    return c.body(stringify(updaterManifest(release)));
  });
  const buckets = new Map<string, { count: number; reset: number }>();
  app.use('/v1/sync/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (!authenticate) throw new HTTPException(503, { message: 'sync_not_configured' });
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ') || header.length > 16384) throw new HTTPException(401, { message: 'unauthorized' });
    let account: string;
    try { account = await authenticate(header.slice(7)); } catch { throw new HTTPException(401, { message: 'unauthorized' }); }
    const now = Date.now();
    if (buckets.size >= 10000) for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
    let bucket = buckets.get(account);
    if (!bucket || bucket.reset <= now) {
      if (!bucket && buckets.size >= 10000) throw new HTTPException(503, { message: 'service_busy' });
      bucket = { count: 0, reset: now + 60000 }; buckets.set(account, bucket);
    }
    if (++bucket.count > 120) { c.header('Retry-After', String(Math.ceil((bucket.reset - now) / 1000))); throw new HTTPException(429, { message: 'rate_limited' }); }
    c.set('account', account); await next();
  });
  app.use('/v1/sync/*', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: c => c.json({ error: 'body_too_large' }, 413) }));
  app.get('/v1/sync/status', async c => c.json(await store.status(c.get('account'))));
  app.get('/v1/sync/changes', async c => {
    const input = c.req.query('limit') ?? '10';
    if (!/^[0-9]+$/.test(input) || Number(input) < 1 || Number(input) > 20) throw new HTTPException(400, { message: 'invalid_limit' });
    return c.json(await store.changes(c.get('account'), c.req.query('cursor'), Number(input)));
  });
  app.get('/v1/sync/records/:id', async c => {
    const id = opaqueId.safeParse(c.req.param('id'));
    if (!id.success) throw new HTTPException(400, { message: 'invalid_record_id' });
    const row = await store.get(c.get('account'), id.data);
    c.header('ETag', `"${row.revision}"`);
    if (!row.envelope) return c.json({error:'record_not_found',revision:row.revision,deleted:true},404);
    return c.json({ envelope: row.envelope, revision: row.revision });
  });
  app.put('/v1/sync/records/:id', async c => {
    if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('Content-Type') ?? '')) throw new HTTPException(415, { message: 'json_required' });
    let body: unknown;
    try { body = await c.req.json(); } catch { throw new HTTPException(400, { message: 'invalid_json' }); }
    const envelope = envelopeSchema.safeParse(body);
    if (!envelope.success || envelope.data.recordId !== c.req.param('id')) throw new HTTPException(400, { message: 'invalid_envelope' });
    const expected = expectedRevision(c.req.header('If-Match'), c.req.header('If-None-Match'));
    const result = await store.write(c.get('account'), envelope.data.recordId, expected, envelope.data);
    c.header('ETag', `"${result.revision}"`);
    return c.json(result, expected === 0 ? 201 : 200);
  });
  app.delete('/v1/sync/records/:id', async c => {
    const id = opaqueId.safeParse(c.req.param('id'));
    if (!id.success) throw new HTTPException(400, { message: 'invalid_record_id' });
    const result = await store.write(c.get('account'), id.data, expectedRevision(c.req.header('If-Match')), null);
    c.header('ETag', `"${result.revision}"`); return c.json(result);
  });
  app.delete('/v1/sync/data', async c => {
    if (c.req.header('X-Confirm-Delete') !== 'all-sync-data') throw new HTTPException(400, { message: 'delete_confirmation_required' });
    return c.json(await store.clear(c.get('account')));
  });
  return app;
}

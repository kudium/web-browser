import { HookSourceValidationError } from "../../../packages/hooks/source-validation";
import { hookRoutes } from './hook-routes';
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
import { homepage, downloadPage, documentation, notesAndActivityDocumentation, unavailablePage, authPage, accountPage, tutorialIndex, tutorialPage, devicePage, releaseHistoryPage } from './pages';
import { tutorials } from './tutorials';
import { whatsNewPage } from './pages';
import { privacyPage } from './privacy';
import { managedSync, managedKeyRecord } from './managed-sync';
export function createApp({ db, auth, authenticate: testAuthenticate, assetOrigins, publishing, syncMasterKey, hookAdminIds }: { hookAdminIds?: string[]; syncMasterKey?: Buffer; publishing?: PublishingConfig; db: Database; auth?: Auth; authenticate?: Authenticate; assetOrigins: string[] }) {
  const app = new Hono<{ Variables: { account: string; styleNonce: string } }>();
  const store = syncStore(db);
  const managed = syncMasterKey ? managedSync(store, syncMasterKey) : undefined;
  const authenticate = auth ? authenticateSession(auth) : testAuthenticate;
  app.use('*', (c, next) => {
    const nonce = crypto.randomUUID().replaceAll('-', '');
    c.set('styleNonce', nonce);
    return secureHeaders({
    xFrameOptions: c.req.path === '/' ? false : 'SAMEORIGIN',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://www.google.com", "https://t0.gstatic.com", "https://t1.gstatic.com", "https://t2.gstatic.com", "https://t3.gstatic.com"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', `'nonce-${nonce}'`],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      frameAncestors: c.req.path === '/' ? ["'self'", 'file:', 'http://localhost:1212'] : ["'none'"],
      baseUri: ["'none'"], formAction: ["'self'"],
    },
  })(c, next);
  });
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      if (error.cause instanceof HookSourceValidationError) return c.json({ error: error.message, diagnostics: error.cause.diagnostics }, error.status);
      return c.json({ error: error.message }, error.status);
    }
    // Deliberately avoid logging credentials, encrypted payloads or database query parameters.
    console.error('Service request failed');
    return c.json({ error: 'internal_error' }, 500);
  });
  app.notFound(c => c.json({ error: 'not_found' }, 404));
  if (publishing) app.route('/', releasePublishing(publishing, manifests => registerReleases(db, manifests)));
  app.route('/', hookRoutes(db, auth, hookAdminIds));
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
  app.get('/privacy', c => c.html(privacyPage()));
  app.get('/whats-new', c => c.html(whatsNewPage()));
  app.get('/assets/privacy.css', async c => { c.header('Content-Type', 'text/css; charset=utf-8'); c.header('Cache-Control', 'public, max-age=300'); return c.body(await Bun.file(new URL('../public/privacy.css', import.meta.url)).text()); });
  app.get('/docs', c => c.html(documentation()));
  app.get('/docs/notes-and-activity', c => c.html(notesAndActivityDocumentation()));
  app.get('/tutorials', c => c.html(tutorialIndex()));
  app.get('/tutorials/:slug', c => { const tutorial = tutorials.find(t => t.slug === c.req.param('slug')); return tutorial ? c.html(tutorialPage(tutorial)) : c.notFound(); });
  const demoAssets = new Set(['sidebar-expanded', 'sidebar-collapsed', 'address-group-picker', 'workspace-light', 'workspace-dark', 'project-files-light', 'project-files-dark', 'project-editor-light', 'project-editor-dark', 'file-filter', 'project-scripts', 'site-hooks-light', 'site-hooks-dark', 'ai-context', 'ai-glassy', 'ai-mentions', 'ai-active-tabs', 'project-terminal', 'developer-workspace', 'developer-files', 'developer-terminal', 'design-workspace', 'social-workspace']);
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
  app.get('/assets/whats-new-fab.js', async c => { c.header('Content-Type', 'text/javascript; charset=utf-8'); return c.body(await Bun.file(new URL('../public/whats-new-fab.js', import.meta.url)).text()); });
  app.get('/assets/showcase.js', async c => { c.header('Content-Type', 'text/javascript; charset=utf-8'); return c.body(await Bun.file(new URL('../public/showcase.js', import.meta.url)).text()); });
  app.get('/assets/radix-themes.css', async c => { c.header('Cache-Control', 'public, max-age=300'); c.header('Content-Type', 'text/css; charset=utf-8'); return c.body(await Bun.file(new URL('../node_modules/@radix-ui/themes/styles.css', import.meta.url)).text()); });
  app.get('/assets/ui.css', async c => { c.header('Cache-Control', 'public, max-age=300'); c.header('Content-Type', 'text/css; charset=utf-8'); return c.body(await Bun.file(new URL('../public/ui.css', import.meta.url)).text()); });
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
  let passkeyBundle: Promise<string> | undefined;
  app.get('/assets/passkeys.js', async c => {
    passkeyBundle ??= Bun.build({ entrypoints: [new URL('../public/passkeys.ts', import.meta.url).pathname], target: 'browser', minify: true }).then(async result => {
      if (!result.success) throw new Error('Passkey client build failed');
      return result.outputs[0].text();
    }).catch(error => { passkeyBundle = undefined; throw error; });
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    return c.body(await passkeyBundle);
  });
  app.get('/api/sign-in-options', c => { c.header('Cache-Control', 'no-store'); return c.json({ google: Boolean(auth?.options.socialProviders?.google) }); });
  for (const page of ['sign-in', 'sign-up', 'forgot-password', 'reset-password'] as const) {
    app.get(`/${page}`, c => {
      c.header('Cache-Control', 'no-store');
      return c.html(authPage(page, Boolean(auth), Boolean(auth?.options.emailAndPassword?.sendResetPassword), Boolean(auth?.options.socialProviders?.google)));
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
  app.get('/assets/account-data.js', async c => { c.header('Content-Type','text/javascript; charset=utf-8'); return c.body(await Bun.file(new URL('../public/account-data.js',import.meta.url)).text()); });
  app.use('/api/account-data/*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({error:'body_too_large'},413) }));
  app.use('/api/account-data/*', async (c,next) => {
    c.header('Cache-Control','no-store');
    if (!auth) throw new HTTPException(401,{message:'unauthorized'});
    if (!managed) throw new HTTPException(503,{message:'managed_sync_not_configured'});
    if (c.req.method !== 'GET' && c.req.header('Origin') !== new URL(String(auth.options.baseURL)).origin) throw new HTTPException(403,{message:'untrusted_origin'});
    const session=await auth.api.getSession({headers:c.req.raw.headers,query:{disableCookieCache:true}});
    if(!session)throw new HTTPException(401,{message:'unauthorized'});
    c.set('account',syncAccountId(session.user.id)); await next();
  });
  app.get('/api/account-data/records',async c=>c.json({records:await managed!.list(c.get('account'))}));
  app.post('/api/account-data/enroll',async c=>{
    const input=z.object({recoveryKey:z.string().max(64).optional()}).strict().safeParse(await c.req.json());
    if(!input.success)throw new HTTPException(400,{message:'invalid_request'});
    const key=await managed!.key(c.get('account'),input.data.recoveryKey);key.fill(0);return c.json({ready:true});
  });
  app.patch('/api/account-data/records/:id',async c=>{
    const input=z.object({revision:z.number().int().positive(),itemId:opaqueId,title:z.string().max(256).optional(),notes:z.string().max(1000000).optional(),url:z.url().max(8192).optional(),remove:z.boolean().optional()}).strict().safeParse(await c.req.json());
    if(!input.success)throw new HTTPException(400,{message:'invalid_update'});
    return c.json(await managed!.edit(c.get('account'),c.req.param('id'),input.data.revision,input.data));
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
  app.post('/v1/sync/account-key',async c=>{
    if(!managed)throw new HTTPException(503,{message:'managed_sync_not_configured'});
    const input=z.object({recoveryKey:z.string().max(64).optional()}).strict().safeParse(await c.req.json());
    if(!input.success)throw new HTTPException(400,{message:'invalid_request'});
    const key=await managed.key(c.get('account'),input.data.recoveryKey);
    try{return c.json({key:key.toString('base64url'),managed:true});}finally{key.fill(0);}
  });
  app.get('/v1/sync/changes', async c => {
    const input = c.req.query('limit') ?? '10';
    if (!/^[0-9]+$/.test(input) || Number(input) < 1 || Number(input) > 20) throw new HTTPException(400, { message: 'invalid_limit' });
    const page=await store.changes(c.get('account'), c.req.query('cursor'), Number(input));
    return c.json({...page,changes:page.changes.filter(record=>record.recordId!==managedKeyRecord)});
  });
  app.get('/v1/sync/records/:id', async c => {
    const id = opaqueId.safeParse(c.req.param('id'));
    if (!id.success) throw new HTTPException(400, { message: 'invalid_record_id' });
    if(id.data===managedKeyRecord)throw new HTTPException(403,{message:'reserved_record'});
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
    if(c.req.param('id')===managedKeyRecord)throw new HTTPException(403,{message:'reserved_record'});
    if (!envelope.success || envelope.data.recordId !== c.req.param('id')) throw new HTTPException(400, { message: 'invalid_envelope' });
    const expected = expectedRevision(c.req.header('If-Match'), c.req.header('If-None-Match'));
    const result = await store.write(c.get('account'), envelope.data.recordId, expected, envelope.data);
    c.header('ETag', `"${result.revision}"`);
    return c.json(result, expected === 0 ? 201 : 200);
  });
  app.delete('/v1/sync/records/:id', async c => {
    const id = opaqueId.safeParse(c.req.param('id'));
    if (!id.success) throw new HTTPException(400, { message: 'invalid_record_id' });
    if(id.data===managedKeyRecord)throw new HTTPException(403,{message:'reserved_record'});
    const result = await store.write(c.get('account'), id.data, expectedRevision(c.req.header('If-Match')), null);
    c.header('ETag', `"${result.revision}"`); return c.json(result);
  });
  app.delete('/v1/sync/data', async c => {
    if (c.req.header('X-Confirm-Delete') !== 'all-sync-data') throw new HTTPException(400, { message: 'delete_confirmation_required' });
    return c.json(await store.clear(c.get('account')));
  });
  return app;
}

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Auth } from './auth';
import type { Database } from './db';
import { marketplaceStore, hookQuery } from './hook-marketplace';
import { hookIndexPage, hookDetailPage, hookPublishPage } from './hook-pages';
export function hookRoutes(db: Database, auth?: Auth, adminIds: string[] = []) {
  const app = new Hono<{ Variables: { user: string; admin: boolean; styleNonce: string } }>();
  const store = marketplaceStore(db);
  const session = async (headers: Headers) =>
    auth?.api.getSession({ headers, query: { disableCookieCache: true } });
  const admins = new Set(adminIds);
  const buckets = new Map<string, { count: number; until: number }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  for (const asset of ['hooks.css', 'hooks.js'])
    app.get(`/assets/${asset}`, async (c) => {
      c.header(
        'Content-Type',
        asset.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'text/javascript; charset=utf-8'
      );
      return c.body(
        await Bun.file(new URL(`../public/${asset}`, import.meta.url)).text()
      );
    });
  let editorBundle: Promise<string> | undefined;
  app.get('/assets/hook-editor.js', async c => {
    editorBundle ??= Bun.build({ entrypoints: [new URL('../public/hook-editor.ts', import.meta.url).pathname], target: 'browser', minify: true }).then(async result => {
      if (!result.success) throw new Error('Hook editor build failed');
      return result.outputs[0].text();
    }).catch(error => { editorBundle = undefined; throw error; });
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    return c.body(await editorBundle);
  });
  app.get('/hooks', async (c) =>
    c.html(
      hookIndexPage(
        await store.list(hookQuery(c.req.query()), c.req.query('cursor')),
        hookQuery(c.req.query())
      )
    )
  );
  for (const route of ['/account/hooks', '/hooks/admin'])
    app.get(route, async (c) => {
      const viewer = await session(c.req.raw.headers);
      if (!viewer)
        return c.redirect(`/sign-in?next=${encodeURIComponent(route)}`);
      const admin = route.endsWith('/admin');
      if (admin && !admins.has(viewer.user.id))
        throw new HTTPException(403, { message: 'admin_required' });
      const q = hookQuery(c.req.query());
      return c.html(
        hookIndexPage(
          await store.list(
            q,
            c.req.query('cursor'),
            admin ? undefined : viewer.user.id,
            admin
          ),
          q,
          !admin,
          admin
        )
      );
    });
  app.get('/hooks/new', async (c) => {
    const viewer = await session(c.req.raw.headers);
    return viewer
      ? c.html(hookPublishPage(undefined, c.get('styleNonce')))
      : c.redirect('/sign-in?next=%2Fhooks%2Fnew');
  });
  app.get('/hooks/:id/edit', async (c) => {
    const viewer = await session(c.req.raw.headers);
    if (!viewer)
      return c.redirect(`/sign-in?next=${encodeURIComponent(c.req.path)}`);
    const detail = await store.detail(c.req.param('id'), viewer.user.id);
    if (detail.hook.authorId !== viewer.user.id)
      throw new HTTPException(403, { message: 'owner_required' });
    return c.html(hookPublishPage(detail, c.get('styleNonce')));
  });
  app.get('/hooks/:id', async (c) => {
    const viewer = await session(c.req.raw.headers);
    const admin = !!viewer && admins.has(viewer.user.id);
    return c.html(
      hookDetailPage(
        await store.detail(c.req.param('id'), viewer?.user.id, admin),
        viewer?.user.id,
        admin
      )
    );
  });
  app.get('/v1/hooks', async (c) =>
    c.json(await store.list(hookQuery(c.req.query()), c.req.query('cursor')))
  );
  app.get('/v1/hooks/:id', async (c) => {
    const viewer = await session(c.req.raw.headers);
    return c.json(
      await store.detail(
        c.req.param('id'),
        viewer?.user.id,
        !!viewer && admins.has(viewer.user.id)
      )
    );
  });
  app.get('/v1/hooks/:id/package', async (c) =>
    c.json(await store.package(c.req.param('id')))
  );
  app.get('/v1/hooks/:id/versions/:version/package', async (c) => {
    const version = Number(c.req.param('version'));
    if (!Number.isSafeInteger(version) || version < 1)
      throw new HTTPException(400, { message: 'invalid_version' });
    return c.json(await store.package(c.req.param('id'), version));
  });
  app.get('/v1/hooks/:id/comments', async (c) => {
    const viewer = await session(c.req.raw.headers);
    return c.json(
      await store.comments(
        c.req.param('id'),
        c.req.query('cursor'),
        viewer?.user.id,
        !!viewer && admins.has(viewer.user.id)
      )
    );
  });
  app.use(
    '/api/hooks/*',
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json({ error: 'body_too_large' }, 413),
    })
  );
  app.use('/api/hooks/*', async (c, next) => {
    if (!auth) throw new HTTPException(401, { message: 'sign_in_required' });
    const bearer = c.req.header('Authorization');
    if (
      c.req.method !== 'GET' &&
      !bearer &&
      c.req.header('Origin') !== new URL(String(auth.options.baseURL)).origin
    )
      throw new HTTPException(403, { message: 'untrusted_origin' });
    const headers = bearer
      ? new Headers({ Authorization: bearer })
      : c.req.raw.headers;
    const viewer = await session(headers);
    if (!viewer) throw new HTTPException(401, { message: 'sign_in_required' });
    if (c.req.method !== 'GET') {
      if (!c.req.header('Content-Type')?.startsWith('application/json'))
        throw new HTTPException(415, { message: 'json_required' });
      const now = Date.now();
      for (const [key, value] of buckets)
        if (value.until <= now) buckets.delete(key);
      const bucket = buckets.get(viewer.user.id) || {
        count: 0,
        until: now + 60000,
      };
      bucket.count += 1;
      buckets.set(viewer.user.id, bucket);
      if (bucket.count > 30)
        throw new HTTPException(429, { message: 'too_many_requests' });
    }
    c.set('user', viewer.user.id);
    c.set('admin', admins.has(viewer.user.id));
    await next();
  });
  const input = async <T>(c: any, schema: z.ZodType<T>): Promise<T> => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: 'invalid_json' });
    }
    const result = schema.safeParse(body);
    if (!result.success)
      throw new HTTPException(400, { message: 'invalid_request' });
    return result.data;
  };
  app.post('/api/hooks/publish', async (c) => {
    const data = await input(
      c,
      z
        .object({
          package: z.unknown(),
          id: z.string().max(100).optional(),
          expectedVersion: z.number().int().positive().optional(),
        })
        .strict()
    );
    return c.json(
      await store.publish(
        c.get('user'),
        data.package,
        data.id,
        data.expectedVersion
      ),
      201
    );
  });
  app.put('/api/hooks/:id/like', async (c) => {
    const data = await input(c, z.object({ liked: z.boolean() }).strict());
    return c.json(
      await store.like(c.req.param('id'), c.get('user'), data.liked)
    );
  });
  const comment = z
    .object({ body: z.string().trim().min(1).max(2000) })
    .strict();
  app.post('/api/hooks/:id/comments', async (c) => {
    const data = await input(c, comment);
    return c.json(
      await store.comment(c.req.param('id'), c.get('user'), data.body),
      201
    );
  });
  app.patch('/api/hooks/:id/comments/:comment', async (c) => {
    const data = await input(c, comment);
    await store.editComment(
      c.req.param('id'),
      c.req.param('comment'),
      c.get('user'),
      data.body
    );
    return c.json({ ok: true });
  });
  app.delete('/api/hooks/:id/comments/:comment', async (c) => {
    await store.editComment(
      c.req.param('id'),
      c.req.param('comment'),
      c.get('user'),
      undefined,
      c.get('admin')
    );
    return c.json({ ok: true });
  });
  app.post('/api/hooks/:id/report', async (c) => {
    const data = await input(
      c,
      z
        .object({
          reason: z.string().trim().min(1).max(2000),
          commentId: z.string().max(100).optional(),
        })
        .strict()
    );
    await store.report(
      c.req.param('id'),
      c.get('user'),
      data.reason,
      data.commentId
    );
    return c.json({ ok: true });
  });
  app.use('/api/hooks/admin/*', async (c, next) => {
    if (!c.get('admin'))
      throw new HTTPException(403, { message: 'admin_required' });
    await next();
  });
  app.get('/api/hooks/admin/reports', async (c) =>
    c.json({ items: await store.reports() })
  );
  app.post('/api/hooks/admin/reports/:id/resolve', async (c) => {
    await input(c, z.object({}).strict());
    await store.resolveReport(c.req.param('id'), c.get('user'));
    return c.json({ ok: true });
  });
  app.patch('/api/hooks/admin/:id', async (c) => {
    const data = await input(
      c,
      z
        .object({
          status: z.enum(['approved', 'pending', 'rejected']),
          reason: z.string().trim().max(2000),
        })
        .strict()
    );
    if (data.status === 'rejected' && !data.reason)
      throw new HTTPException(400, { message: 'rejection_reason_required' });
    await store.moderate(
      c.req.param('id'),
      c.get('user'),
      data.status,
      data.reason
    );
    return c.json({ ok: true });
  });
  return app;
}

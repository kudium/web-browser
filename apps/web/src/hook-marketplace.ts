import { hookSourceValidator } from "./hook-validation";
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, lt, or, sql, count } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from './db';
import {
  authUser,
  hookListings,
  hookVersions,
  hookTargets,
  hookLikes,
  hookComments,
  hookReports,
  hookModeration,
} from './schema';
import {
  parseHookPackage,
  type HookPackage,
} from '../../../packages/hooks/package';
function validatedPackage(input: unknown): HookPackage {
  try {
    const pkg = parseHookPackage(input);
    hookSourceValidator.assert({ ...pkg.lifecycle, actions: pkg.actions });
    return pkg;
  } catch (error) {
    throw new HTTPException(400, { message: (error as Error).message, cause: error });
  }
}
export const packageHash = (pkg: HookPackage) =>
  createHash('sha256').update(JSON.stringify(pkg)).digest('hex');
export type HookQuery = {
  q: string;
  kind: 'all' | 'site' | 'general';
  site: string;
  sort?: 'newest' | 'trending';
};
export function hookQuery(raw: Record<string, string | undefined>): HookQuery {
  const q = (raw.q || '').trim();
  const site = (raw.site || '').trim().toLowerCase();
  const kind = raw.kind || 'all';
  const sort = raw.sort || 'newest';
  if (
    !['newest', 'trending'].includes(sort) ||
    q.length > 120 ||
    site.length > 253 ||
    !['all', 'site', 'general'].includes(kind) ||
    (site && !/^[a-z0-9.-]+$/.test(site))
  )
    throw new HTTPException(400, { message: 'invalid_filters' });
  return { q, site, kind: kind as HookQuery['kind'], sort: sort as HookQuery['sort'] };
}
const fingerprint = (query: unknown) =>
  createHash('sha256').update(JSON.stringify(query)).digest('hex');
export function encodeHookCursor(
  query: unknown,
  boundary: string,
  time: string,
  id: string,
  score?: number
) {
  return Buffer.from(
    JSON.stringify({ filter: fingerprint(query), boundary, time, id, score })
  ).toString('base64url');
}
export function decodeHookCursor(value: string, query: unknown) {
  try {
    if (value.length > 1500) throw new Error();
    const c = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      (c.score !== undefined && (!Number.isSafeInteger(c.score) || c.score < 0)) ||
      typeof c.time !== 'string' ||
      typeof c.boundary !== 'string' ||
      new Date(c.time).toISOString() !== c.time ||
      new Date(c.boundary).toISOString() !== c.boundary ||
      c.filter !== fingerprint(query) ||
      typeof c.id !== 'string' ||
      c.id.length > 100 ||
      !Number.isFinite(Date.parse(c.time)) ||
      !Number.isFinite(Date.parse(c.boundary)) ||
      c.time > c.boundary
    )
      throw new Error();
    return c as { boundary: string; time: string; id: string; score?: number };
  } catch {
    throw new HTTPException(400, { message: 'invalid_cursor' });
  }
}
export function publisherUsername(input: string) {
  const username = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username))
    throw new HTTPException(400, { message: 'Use 3–30 letters, numbers or underscores, starting with a letter.' });
  return username;
}
export function marketplaceStore(db: Database) {
  const publicRow = async (id: string, viewer?: string, admin = false) => {
    const [row] = await db
      .select({
        hook: hookListings,
        author: { id: authUser.id, name: authUser.name, username: authUser.username },
      })
      .from(hookListings)
      .innerJoin(authUser, eq(authUser.id, hookListings.authorId))
      .where(eq(hookListings.id, id));
    if (
      !row ||
      (row.hook.status !== 'approved' && row.hook.authorId !== viewer && !admin)
    )
      throw new HTTPException(404, { message: 'hook_not_found' });
    return row;
  };
  return {
    async imageReferenced(key: string, viewer?: string, onlyPublic = false) {
      const conditions = [sql`${hookListings.images} @> ${JSON.stringify([key])}::jsonb`];
      if(onlyPublic) conditions.push(viewer ? or(eq(hookListings.status,'approved'),eq(hookListings.authorId,viewer))! : eq(hookListings.status,'approved'));
      return (await db.select({id:hookListings.id}).from(hookListings).where(and(...conditions)).limit(1)).length>0;
    },
    async publisher(userId: string) {
      const [user] = await db.select({ username: authUser.username }).from(authUser).where(eq(authUser.id, userId));
      if (!user) throw new HTTPException(404, { message: 'publisher_not_found' });
      return user;
    },
    async updatePublisherUsername(userId: string, input: string) {
      const username = publisherUsername(input);
      try {
        const [user] = await db.update(authUser).set({ username, updatedAt: new Date() })
          .where(eq(authUser.id, userId)).returning({ username: authUser.username });
        if (!user) throw new HTTPException(404, { message: 'publisher_not_found' });
        return user;
      } catch (error: any) {
        if ((error?.constraint_name || error?.cause?.constraint_name) === 'auth_users_username_unique')
          throw new HTTPException(409, { message: 'That username is already taken. Choose another.' });
        throw error;
      }
    },
    async list(
      query: HookQuery,
      cursor?: string,
      owner?: string,
      admin = false
    ) {
      const scope = { ...query, owner: owner || '', admin, ordering: 'updated-v1' };
      const after = cursor ? decodeHookCursor(cursor, scope) : undefined;
      const boundary = after?.boundary || new Date().toISOString();
      const conditions = [sql`${hookListings.updatedAt} <= ${boundary}`];
      if (owner) conditions.push(eq(hookListings.authorId, owner));
      else if (!admin)
        conditions.push(sql`${hookListings.status} = 'approved'`);
      if (query.kind !== 'all')
        conditions.push(eq(hookListings.applicability, query.kind));
      if (query.q)
        conditions.push(
          sql`${hookListings.name} ILIKE ${
            '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
          }`
        );
      if (query.site)
        conditions.push(
          sql`exists (select 1 from hook_targets t where t.hook_id = ${hookListings.id} and (t.host = ${query.site} or (t.include_subdomains and ${query.site} like '%.' || t.host)))`
        );
      const trending = query.sort === 'trending';
      if (after) {
        const older = or(
          lt(hookListings.updatedAt, new Date(after.time)),
          and(eq(hookListings.updatedAt, new Date(after.time)), lt(hookListings.id, after.id))
        )!;
        if (trending && after.score === undefined)
          throw new HTTPException(400, { message: 'invalid_cursor' });
        conditions.push(trending
          ? or(lt(hookListings.likes, after.score!), and(eq(hookListings.likes, after.score!), older))!
          : older);
      }
      const rows = await db
        .select({
          hook: hookListings,
          author: { id: authUser.id, name: authUser.name, username: authUser.username },
          package: hookVersions.package,
        })
        .from(hookListings)
        .innerJoin(authUser, eq(authUser.id, hookListings.authorId))
        .innerJoin(
          hookVersions,
          and(
            eq(hookVersions.hookId, hookListings.id),
            eq(hookVersions.version, hookListings.version)
          )
        )
        .where(and(...conditions))
        .orderBy(...(trending ? [desc(hookListings.likes)] : []), desc(hookListings.updatedAt), desc(hookListings.id))
        .limit(25);
      const items = rows.slice(0, 24);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > 24 && last
            ? encodeHookCursor(
                scope,
                boundary,
                last.hook.updatedAt.toISOString(),
                last.hook.id,
                trending ? last.hook.likes : undefined
              )
            : null,
      };
    },
    async detail(id: string, viewer?: string, admin = false) {
      const row = await publicRow(id, viewer, admin);
      const versions = await db
        .select()
        .from(hookVersions)
        .where(eq(hookVersions.hookId, id))
        .orderBy(desc(hookVersions.version));
      const liked = viewer
        ? (
            await db
              .select()
              .from(hookLikes)
              .where(
                and(eq(hookLikes.hookId, id), eq(hookLikes.userId, viewer))
              )
          ).length > 0
        : false;
      return {
        ...row,
        package: versions[0].package,
        versions: versions
          .filter(
            (v) =>
              row.hook.authorId === viewer || admin || v.status === 'approved'
          )
          .map((v) => ({
            status: v.status,
            version: v.version,
            contentHash: v.contentHash,
            createdAt: v.createdAt,
          })),
        liked,
      };
    },
    async package(id: string, version?: number) {
      const row = await publicRow(id);
      const [release] = await db
        .select()
        .from(hookVersions)
        .where(
          and(
            eq(hookVersions.hookId, id),
            eq(hookVersions.version, version || row.hook.version)
          )
        );
      if (!release || release.status !== 'approved')
        throw new HTTPException(404, { message: 'version_not_found' });
      return {
        id,
        version: release.version,
        publisher: row.author,
        contentHash: release.contentHash,
        package: release.package,
      };
    },
    async publish(
      userId: string,
      input: unknown,
      id?: string,
      expected?: number,
      username?: string,
      images?: string[]
    ) {
      const pkg = validatedPackage(input);
      const hookId = id || randomUUID();
      const handle = username === undefined ? undefined : publisherUsername(username);
      return db.transaction(async (tx) => {
        if (handle !== undefined)
          await tx.update(authUser).set({ username: handle, updatedAt: new Date() }).where(eq(authUser.id, userId));
        let version = 1;
        let status: 'approved' | 'pending' = 'approved';
        if (id) {
          const [previous] = await tx
            .select()
            .from(hookListings)
            .where(eq(hookListings.id, id))
            .for('update');
          if (!previous || previous.authorId !== userId)
            throw new HTTPException(404, { message: 'hook_not_found' });
          if (previous.version !== expected)
            throw new HTTPException(409, {
              message: 'hook_changed_reload_before_publishing',
            });
          version = previous.version + 1;
          status = previous.status === 'approved' ? 'approved' : 'pending';
          await tx
            .update(hookListings)
            .set({
              name: pkg.name,
              description: pkg.description,
              applicability: pkg.applicability,
              version,
              status,
              updatedAt: new Date(),
              ...(images === undefined ? {} : {images}),
            })
            .where(eq(hookListings.id, id));
          await tx.delete(hookTargets).where(eq(hookTargets.hookId, id));
        } else
          await tx
            .insert(hookListings)
            .values({
              id: hookId,
              images: images || [],
              authorId: userId,
              name: pkg.name,
              description: pkg.description,
              applicability: pkg.applicability,
            });
        await tx
          .insert(hookVersions)
          .values({
            hookId,
            version,
            status,
            package: pkg,
            contentHash: packageHash(pkg),
          });
        if (pkg.sites.length)
          await tx
            .insert(hookTargets)
            .values(pkg.sites.map((site) => ({ hookId, ...site })));
        return { id: hookId, version };
      }).catch((error) => {
        if ((error?.constraint_name || error?.cause?.constraint_name) === 'auth_users_username_unique')
          throw new HTTPException(409, { message: 'That username is already taken. Choose another.' });
        throw error;
      });
    },
    async like(id: string, user: string, liked: boolean) {
      await publicRow(id);
      return db.transaction(async (tx) => {
        await tx
          .select()
          .from(hookListings)
          .where(eq(hookListings.id, id))
          .for('update');
        if (liked)
          await tx
            .insert(hookLikes)
            .values({ hookId: id, userId: user })
            .onConflictDoNothing();
        else
          await tx
            .delete(hookLikes)
            .where(and(eq(hookLikes.hookId, id), eq(hookLikes.userId, user)));
        const [total] = await tx
          .select({ value: count() })
          .from(hookLikes)
          .where(eq(hookLikes.hookId, id));
        await tx
          .update(hookListings)
          .set({ likes: total.value })
          .where(eq(hookListings.id, id));
        return { liked, likes: total.value };
      });
    },
    async comments(
      id: string,
      cursor?: string,
      viewer?: string,
      admin = false
    ) {
      await publicRow(id, viewer, admin);
      const query = { comments: id };
      const after = cursor ? decodeHookCursor(cursor, query) : undefined;
      const boundary = after?.boundary || new Date().toISOString();
      const conditions = [
        eq(hookComments.hookId, id),
        sql`${hookComments.createdAt} <= ${boundary}`,
      ];
      if (after)
        conditions.push(
          or(
            lt(hookComments.createdAt, new Date(after.time)),
            and(
              eq(hookComments.createdAt, new Date(after.time)),
              lt(hookComments.id, after.id)
            )
          )!
        );
      const rows = await db
        .select({
          id: hookComments.id,
          body: hookComments.body,
          createdAt: hookComments.createdAt,
          author: { id: authUser.id, name: authUser.name, username: authUser.username },
        })
        .from(hookComments)
        .innerJoin(authUser, eq(authUser.id, hookComments.userId))
        .where(and(...conditions))
        .orderBy(desc(hookComments.createdAt), desc(hookComments.id))
        .limit(25);
      const items = rows.slice(0, 24);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > 24 && last
            ? encodeHookCursor(
                query,
                boundary,
                last.createdAt.toISOString(),
                last.id
              )
            : null,
      };
    },
    async comment(id: string, user: string, body: string) {
      await publicRow(id);
      const [row] = await db
        .insert(hookComments)
        .values({ id: randomUUID(), hookId: id, userId: user, body })
        .returning();
      return row;
    },
    async editComment(
      id: string,
      commentId: string,
      user: string,
      body?: string,
      admin = false
    ) {
      const [row] = await db
        .select()
        .from(hookComments)
        .where(
          and(eq(hookComments.id, commentId), eq(hookComments.hookId, id))
        );
      if (!row || (row.userId !== user && !(admin && body === undefined)))
        throw new HTTPException(404, { message: 'comment_not_found' });
      if (body !== undefined)
        await db
          .update(hookComments)
          .set({ body, updatedAt: new Date() })
          .where(eq(hookComments.id, commentId));
      else
        await db.transaction(async (tx) => {
          if (admin)
            await tx
              .insert(hookModeration)
              .values({
                id: randomUUID(),
                hookId: id,
                adminId: user,
                action: 'delete_comment',
                reason: commentId,
              });
          await tx.delete(hookComments).where(eq(hookComments.id, commentId));
        });
    },
    async report(id: string, user: string, reason: string, commentId?: string) {
      await publicRow(id);
      if (
        commentId &&
        !(
          await db
            .select()
            .from(hookComments)
            .where(
              and(eq(hookComments.hookId, id), eq(hookComments.id, commentId))
            )
        ).length
      )
        throw new HTTPException(404, { message: 'comment_not_found' });
      await db
        .insert(hookReports)
        .values({
          id: randomUUID(),
          hookId: id,
          userId: user,
          reason,
          commentId,
        });
    },
    async moderate(
      id: string,
      admin: string,
      status: 'approved' | 'pending' | 'rejected',
      reason: string
    ) {
      await publicRow(id, admin, true);
      await db.transaction(async (tx) => {
        const [listing] = await tx
          .select()
          .from(hookListings)
          .where(eq(hookListings.id, id))
          .for('update');
        if (status === 'approved') {
          const [version] = await tx.select().from(hookVersions).where(and(eq(hookVersions.hookId, id), eq(hookVersions.version, listing.version)));
          if (!version) throw new HTTPException(404, { message: 'version_not_found' });
          validatedPackage(version.package);
        }
        await tx
          .update(hookListings)
          .set({ status, statusReason: reason || null, updatedAt: new Date() })
          .where(eq(hookListings.id, id));
        await tx
          .update(hookVersions)
          .set({ status })
          .where(
            and(
              eq(hookVersions.hookId, id),
              eq(hookVersions.version, listing.version)
            )
          );
        await tx
          .insert(hookModeration)
          .values({
            id: randomUUID(),
            hookId: id,
            adminId: admin,
            action: status,
            reason,
          });
      });
    },
    async reports() {
      return db
        .select()
        .from(hookReports)
        .where(eq(hookReports.resolved, false))
        .orderBy(desc(hookReports.createdAt))
        .limit(100);
    },
    async resolveReport(id: string, admin: string) {
      await db.transaction(async (tx) => {
        const [report] = await tx
          .update(hookReports)
          .set({ resolved: true })
          .where(eq(hookReports.id, id))
          .returning();
        if (!report)
          throw new HTTPException(404, { message: 'report_not_found' });
        await tx
          .insert(hookModeration)
          .values({
            id: randomUUID(),
            hookId: report.hookId,
            adminId: admin,
            action: 'resolve_report',
            reason: id,
          });
      });
    },
  };
}
export type MarketplaceStore = ReturnType<typeof marketplaceStore>;

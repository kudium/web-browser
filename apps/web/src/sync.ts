import { and, eq, gt, asc, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { accounts, records, changes } from './schema';
import type { Database } from './db';
import type { Envelope } from './validation';
export const quotas = { bytes: 64 * 1024 * 1024, historyBytes: 256 * 1024 * 1024, records: 10000, changes: 100000 };
export function cursorFor(account: string, revision: number) { return Buffer.from(JSON.stringify([account, revision])).toString('base64url'); }
export function parseCursor(value: string | undefined, account: string): number {
  if (!value) return 0;
  try {
    if (value.length > 256) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== account || !Number.isSafeInteger(parsed[1]) || parsed[1] < 0 || cursorFor(account, parsed[1]) !== value) throw new Error();
    return parsed[1];
  } catch { throw new HTTPException(400, { message: 'invalid_cursor' }); }
}
export function expectedRevision(ifMatch: string | undefined, ifNoneMatch?: string): number {
  if (ifNoneMatch === '*' && ifMatch === undefined) return 0;
  if (!ifMatch) throw new HTTPException(428, { message: 'precondition_required' });
  if (!/^"[1-9][0-9]*"$/.test(ifMatch) || !Number.isSafeInteger(Number(ifMatch.slice(1, -1)))) throw new HTTPException(400, { message: 'invalid_revision' });
  return Number(ifMatch.slice(1, -1));
}
/** Leave room for cursors and JSON metadata under the desktop transport limit. */
export function boundedChangePage<T extends { envelope: unknown }>(rows: T[], limit: number): T[] {
  const page: T[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, limit)) {
    const size = Buffer.byteLength(JSON.stringify(row.envelope)) + 1024;
    if (page.length && bytes + size > 12 * 1024 * 1024 - 64 * 1024) break;
    page.push(row); bytes += size;
  }
  return page;
}
export function syncStore(db: Database) {
  async function ensure(account: string) { await db.insert(accounts).values({ id: account }).onConflictDoNothing(); }
  return {
    async status(account: string) {
      await ensure(account);
      const [row] = await db.select().from(accounts).where(eq(accounts.id, account));
      return { schemaVersion: 1, usedBytes: row.usedBytes, historyBytes: row.historyBytes, recordCount: row.recordCount, changeCount: row.changeCount, quotas, cursor: cursorFor(account, row.revision) };
    },
    async get(account: string, id: string) {
      const [row] = await db.select().from(records).where(and(eq(records.accountId, account), eq(records.id, id)));
      if (!row) throw new HTTPException(404, { message: 'record_not_found' });
      return row;
    },
    async write(account: string, id: string, expected: number, envelope: Envelope | null) {
      await ensure(account);
      return db.transaction(async tx => {
        // Serialize revision allocation and quota accounting per account; accounts remain independent.
        const [owner] = await tx.select().from(accounts).where(eq(accounts.id, account)).for('update');
        const [old] = await tx.select().from(records).where(and(eq(records.accountId, account), eq(records.id, id)));
        if ((old?.revision ?? 0) !== expected) throw new HTTPException(409, { message: 'revision_conflict' });
        if (!envelope && !old?.envelope) throw new HTTPException(404, { message: 'record_not_found' });
        const bytes = envelope ? Buffer.byteLength(JSON.stringify(envelope)) : 0;
        const usedBytes = owner.usedBytes - (old?.bytes ?? 0) + bytes;
        const historyBytes = owner.historyBytes + bytes;
        // Count tombstones too: opaque IDs cannot grow storage without a bound.
        const recordCount = owner.recordCount + (old ? 0 : 1);
        if (usedBytes > quotas.bytes || historyBytes > quotas.historyBytes || recordCount > quotas.records || owner.changeCount >= quotas.changes) throw new HTTPException(413, { message: 'sync_quota_exceeded' });
        const revision = owner.revision + 1;
        await tx.insert(records).values({ accountId: account, id, revision, envelope, bytes }).onConflictDoUpdate({ target: [records.accountId, records.id], set: { revision, envelope, bytes, updatedAt: new Date() } });
        await tx.insert(changes).values({ accountId: account, revision, recordId: id, envelope });
        await tx.update(accounts).set({ revision, usedBytes, historyBytes, recordCount, changeCount: owner.changeCount + 1 }).where(eq(accounts.id, account));
        return { revision, deleted: envelope === null };
      });
    },
    async changes(account: string, cursor: string | undefined, limit: number) {
      const revision = parseCursor(cursor, account);
      await ensure(account);
      const [owner] = await db.select().from(accounts).where(eq(accounts.id, account));
      if (revision > owner.revision) throw new HTTPException(400, { message: 'invalid_cursor' });
      const rows = await db.select().from(changes).where(and(eq(changes.accountId, account), gt(changes.revision, revision))).orderBy(asc(changes.revision)).limit(limit + 1);
      const page = boundedChangePage(rows, limit);
      return { changes: page.map(row => ({ recordId: row.recordId, revision: row.revision, envelope: row.envelope, deleted: row.envelope === null })), cursor: cursorFor(account, page.at(-1)?.revision ?? revision), hasMore: rows.length > page.length };
    },
    async clear(account: string) {
      await ensure(account);
      return db.transaction(async tx => {
        const [owner] = await tx.select().from(accounts).where(eq(accounts.id, account)).for('update');
        const live = await tx.select().from(records).where(and(eq(records.accountId, account), sql`${records.envelope} is not null`));
        // Erase historical ciphertext too, while preserving the change sequence for offline clients.
        await tx.update(changes).set({ envelope: null }).where(eq(changes.accountId, account));
        let revision = owner.revision;
        for (const row of live) {
          revision += 1;
          await tx.update(records).set({ envelope: null, bytes: 0, revision, updatedAt: new Date() }).where(and(eq(records.accountId, account), eq(records.id, row.id)));
          await tx.insert(changes).values({ accountId: account, recordId: row.id, revision, envelope: null });
        }
        await tx.update(accounts).set({ revision, usedBytes: 0, historyBytes: 0, changeCount: owner.changeCount + live.length }).where(eq(accounts.id, account));
        return { deleted: live.length, cursor: cursorFor(account, revision) };
      });
    },
  };
}

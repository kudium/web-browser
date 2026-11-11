import { randomBytes } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import {
  encryptSyncRecord,
  decryptSyncRecord,
} from "./sync-protocol/encryption";
import { validateSyncedNotes } from "./sync-protocol/notes";
import { z } from "zod";
import { opaqueId } from "./validation";
import { validateSyncCustomizations } from "./sync-protocol/syncCustomizations";
import type { syncStore } from "./sync";

const label = z.string().max(256);
const webUrl = z
  .string()
  .max(8192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
const tabSchema = z
  .object({
    id: opaqueId,
    sessionId: opaqueId,
    spaceId: opaqueId,
    folderId: opaqueId.optional(),
    name: label,
    sessionName: label.optional(),
    homeUrl: webUrl,
    favorite: z.boolean(),
    pinned: z.boolean(),
    archived: z.boolean(),
  })
  .strict();
const snapshotSchema = z
  .object({
    version: z.literal(1),
    deviceId: opaqueId,
    createdAt: z.number().int().nonnegative(),
    workspace: z
      .object({
        spaces: z
          .array(
            z
              .object({
                id: opaqueId,
                name: label,
                color: z.enum(["iris", "blue", "green", "amber", "pink"]),
                icon: z.string().optional(),
                iconEmoji: z.string().optional(),
                customColor: z.string().optional(),
                folders: z
                  .array(z.object({ id: opaqueId, name: label }).strict())
                  .max(500),
              })
              .strict()
          )
          .max(200),
        apps: z.array(tabSchema).max(5000),
        developer: z.array(z.unknown()).max(1000).optional(),
      })
      .strict()
      .optional(),
    openTabs: z
      .array(
        z
          .object({
            id: opaqueId,
            sessionId: opaqueId,
            spaceId: opaqueId,
            title: label,
            url: webUrl,
          })
          .strict()
      )
      .max(5000)
      .optional(),
    preferences: z
      .object({
        searchEngine: z.unknown().optional(),
        searchEngines: z.unknown().optional(),
        zoom: z.unknown().optional(),
        spellcheck: z.unknown().optional(),
        spellcheckLanguage: z.unknown().optional(),
        defaultFontSize: z.unknown().optional(),
        shortcuts: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const validateIncomingSnapshot = (value: unknown) => {
  const snapshot = snapshotSchema.parse(value);
  if (snapshot.workspace?.developer)
    validateSyncCustomizations(snapshot.workspace.developer, [
      ...snapshot.workspace.apps.map((app) => ({ ...app, url: app.homeUrl })),
      ...(snapshot.openTabs || []),
    ]);
  return snapshot;
};

export const managedKeyRecord = "account_managed_key_v1";
const proofRecord = "account_key_check_v1";
type Store = ReturnType<typeof syncStore>;
async function optionalRecord(store: Store, account: string, id: string) {
  try {
    return await store.get(account, id);
  } catch (error) {
    if (error instanceof HTTPException && error.status === 404)
      return undefined;
    throw error;
  }
}
export function managedSync(store: Store, masterKey: Buffer) {
  if (masterKey.length !== 32)
    throw new Error("SYNC_MASTER_KEY must decode to 32 bytes");
  async function key(account: string, migrationKey?: string): Promise<Buffer> {
    const saved = await optionalRecord(store, account, managedKeyRecord);
    if (saved?.envelope) {
      const payload = decryptSyncRecord(saved.envelope, masterKey) as {
        account: string;
        key: string;
      };
      if (payload.account !== account) throw new Error("Account key mismatch");
      return decodeKey(payload.key);
    }
    const proof = await optionalRecord(store, account, proofRecord);
    if (proof?.envelope && !migrationKey)
      throw new HTTPException(409, { message: "recovery_key_required" });
    const selected = migrationKey ? decodeKey(migrationKey) : randomBytes(32);
    try {
      if (proof?.envelope) verifyProof(proof.envelope, selected, account);
      const wrapped = encryptSyncRecord(
        { account, key: selected.toString("base64url") },
        masterKey,
        managedKeyRecord
      );
      try {
        await store.write(
          account,
          managedKeyRecord,
          saved?.revision ?? 0,
          wrapped
        );
      } catch (error) {
        if (error instanceof HTTPException && error.status === 409)
          return key(account);
        throw error;
      }
      if (!proof?.envelope) {
        try {
          await store.write(
            account,
            proofRecord,
            proof?.revision ?? 0,
            encryptSyncRecord(
              { kind: "kudium-sync-key", accountId: account },
              selected,
              proofRecord
            )
          );
        } catch (error) {
          if (!(error instanceof HTTPException) || error.status !== 409)
            throw error;
          const current = await store.get(account, proofRecord);
          if (!current.envelope) throw new Error("Sync key changed");
          verifyProof(current.envelope, selected, account);
        }
      }
      return Buffer.from(selected);
    } finally {
      selected.fill(0);
    }
  }
  async function list(account: string) {
    const dataKey = await key(account);
    try {
      const latest = new Map<string, any>();
      let cursor: string | undefined;
      for (let page = 0; page < 5000; page++) {
        const result = await store.changes(account, cursor, 20);
        for (const record of result.changes) {
          if (!/^(?:device|notes)_/.test(record.recordId)) continue;
          if (record.deleted) latest.delete(record.recordId);
          else latest.set(record.recordId, record);
        }
        cursor = result.cursor;
        if (!result.hasMore) break;
        if (page === 4999)
          throw new HTTPException(413, { message: "sync_history_too_large" });
      }
      return [...latest.values()].map((record) => {
        const value = decryptSyncRecord(record.envelope, dataKey) as any;
        if (record.recordId.startsWith("notes_")) {
          if (
            value.version !== 1 ||
            record.recordId !== `notes_${value.deviceId}`
          )
            throw new Error("Invalid notes record");
          return {
            id: record.recordId,
            revision: record.revision,
            category: "notes",
            value: { ...value, items: validateSyncedNotes(value.items) },
          };
        }
        const snapshot = validateIncomingSnapshot(value);
        if (record.recordId !== `device_${snapshot.deviceId}`)
          throw new Error("Invalid workspace record");
        return {
          id: record.recordId,
          revision: record.revision,
          category: "workspace",
          value: snapshot,
        };
      });
    } finally {
      dataKey.fill(0);
    }
  }
  async function edit(
    account: string,
    id: string,
    revision: number,
    update: {
      itemId: string;
      title?: string;
      notes?: string;
      url?: string;
      remove?: boolean;
    }
  ) {
    if (!/^(?:device|notes)_[a-zA-Z0-9_-]+$/.test(id))
      throw new HTTPException(400, { message: "invalid_record_id" });
    const record = await store.get(account, id);
    if (!record.envelope)
      throw new HTTPException(404, { message: "record_not_found" });
    if (record.revision !== revision)
      throw new HTTPException(409, { message: "revision_conflict" });
    const dataKey = await key(account);
    try {
      const value = decryptSyncRecord(record.envelope, dataKey) as any;
      if (id.startsWith("notes_")) {
        const items = validateSyncedNotes(value.items);
        if (!items.some((item) => item.id === update.itemId))
          throw new HTTPException(404, { message: "note_not_found" });
        value.items = validateSyncedNotes(
          items.flatMap((item) =>
            item.id !== update.itemId
              ? [item]
              : update.remove
              ? []
              : [
                  {
                    ...item,
                    title: update.title ?? item.title,
                    notes: update.notes ?? item.notes,
                  },
                ]
          )
        );
      } else {
        const snapshot = validateIncomingSnapshot(value);
        if (
          !snapshot.workspace?.apps.some((item) => item.id === update.itemId) &&
          !snapshot.openTabs?.some((item) => item.id === update.itemId)
        )
          throw new HTTPException(404, { message: "tab_not_found" });
        if (snapshot.workspace)
          snapshot.workspace.apps = snapshot.workspace.apps.flatMap((item) =>
            item.id !== update.itemId
              ? [item]
              : update.remove
              ? []
              : [
                  {
                    ...item,
                    name: update.title ?? item.name,
                    homeUrl: update.url ?? item.homeUrl,
                  },
                ]
          );
        if (snapshot.openTabs)
          snapshot.openTabs = snapshot.openTabs.flatMap((item) =>
            item.id !== update.itemId
              ? [item]
              : update.remove
              ? []
              : [
                  {
                    ...item,
                    title: update.title ?? item.title,
                    url: update.url ?? item.url,
                  },
                ]
          );
        Object.assign(value, validateIncomingSnapshot(snapshot));
      }
      return store.write(
        account,
        id,
        revision,
        encryptSyncRecord(value, dataKey, id)
      );
    } finally {
      dataKey.fill(0);
    }
  }
  return { key, list, edit };
}
function decodeKey(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new HTTPException(400, { message: "invalid_sync_key" });
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value)
    throw new HTTPException(400, { message: "invalid_sync_key" });
  return key;
}
function verifyProof(
  envelope: Parameters<typeof decryptSyncRecord>[0],
  key: Buffer,
  account: string
) {
  try {
    const value = decryptSyncRecord(envelope, key) as any;
    if (value.kind !== "kudium-sync-key" || value.accountId !== account)
      throw new Error();
  } catch {
    throw new HTTPException(400, { message: "incorrect_recovery_key" });
  }
}

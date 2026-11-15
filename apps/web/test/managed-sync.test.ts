import { expect, test } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import { managedSync, managedKeyRecord } from "../src/managed-sync";
import {
  encryptSyncRecord,
  decryptSyncRecord,
} from "../../browser/src/main/sync/encryption";
function fixture() {
  const records = new Map<string, any>();
  let revision = 0;
  const store: any = {
    async get(account: string, id: string) {
      const row = records.get(`${account}:${id}`);
      if (!row) throw new HTTPException(404);
      return row;
    },
    async write(account: string, id: string, expected: number, envelope: any) {
      const old = records.get(`${account}:${id}`);
      if ((old?.revision ?? 0) !== expected) throw new HTTPException(409);
      const row = {
        id,
        recordId: id,
        revision: ++revision,
        envelope,
        deleted: !envelope,
      };
      records.set(`${account}:${id}`, row);
      return { revision: row.revision };
    },
    async changes(account: string) {
      return {
        changes: [...records.entries()]
          .filter(([id]) => id.startsWith(`${account}:`))
          .map(([, row]) => row),
        cursor: "end",
        hasMore: false,
      };
    },
  };
  return { store, records, managed: managedSync(store, randomBytes(32)) };
}
test("keys survive repeated sign-ins and are isolated by account", async () => {
  const { managed, records } = fixture();
  const a = await managed.key("alice"),
    b = await managed.key("bob");
  expect((await managed.key("alice")).equals(a)).toBe(true);
  expect(a.equals(b)).toBe(false);
  expect(JSON.stringify([...records.values()])).not.toContain(
    a.toString("base64url"),
  );
});
test("migrates a verified legacy key without losing encrypted data", async () => {
  const { managed, store, records } = fixture();
  const key = randomBytes(32);
  await store.write(
    "alice",
    "account_key_check_v1",
    0,
    encryptSyncRecord(
      { kind: "kudium-sync-key", accountId: "alice" },
      key,
      "account_key_check_v1",
    ),
  );
  await expect(managed.key("alice")).rejects.toThrow("recovery_key_required");
  await expect(
    managed.key("alice", randomBytes(32).toString("base64url")),
  ).rejects.toThrow("incorrect_recovery_key");
  expect(records.has(`alice:${managedKeyRecord}`)).toBe(false);
  expect(
    (await managed.key("alice", key.toString("base64url"))).equals(key),
  ).toBe(true);
  expect((await managed.key("alice")).equals(key)).toBe(true);
});
test("edits encrypted notes with revision checks and account isolation", async () => {
  const { managed, store } = fixture();
  const key = await managed.key("alice");
  const id = "notes_desktop";
  const written = await store.write(
    "alice",
    id,
    0,
    encryptSyncRecord(
      {
        version: 1,
        deviceId: "desktop",
        items: [
          { id: "one", title: "Note", notes: "private text", sensitive: true },
        ],
      },
      key,
      id,
    ),
  );
  expect((await managed.list("alice"))[0].value.items[0].notes).toBe(
    "private text",
  );
  expect(await managed.list("bob")).toEqual([]);
  await expect(
    managed.edit("bob", id, written.revision, {
      itemId: "one",
      title: "attack",
    }),
  ).rejects.toThrow();
  const updated = await managed.edit("alice", id, written.revision, {
    itemId: "one",
    title: "Edited",
    notes: "updated text",
  });
  const stored = await store.get("alice", id);
  expect(JSON.stringify(stored)).not.toContain("updated text");
  expect((decryptSyncRecord(stored.envelope, key) as any).items[0].title).toBe(
    "Edited",
  );
  await expect(
    managed.edit("alice", id, written.revision, {
      itemId: "one",
      remove: true,
    }),
  ).rejects.toThrow("revision_conflict");
  await managed.edit("alice", id, updated.revision, {
    itemId: "one",
    remove: true,
  });
  expect((await managed.list("alice"))[0].value.items).toEqual([]);
});

test("app edits update workspace and open-tab information and reject unsafe URLs", async () => {
  const { managed, store } = fixture();
  const key = await managed.key("alice");
  const id = "device_desktop";
  const written = await store.write(
    "alice",
    id,
    0,
    encryptSyncRecord(
      {
        version: 1,
        deviceId: "desktop",
        createdAt: 1,
        workspace: {
          spaces: [],
          apps: [
            {
              id: "tab",
              sessionId: "group",
              spaceId: "space",
              name: "Example",
              homeUrl: "https://example.com",
              favorite: false,
              pinned: true,
              archived: false,
            },
          ],
        },
        openTabs: [
          {
            id: "tab",
            sessionId: "group",
            spaceId: "space",
            title: "Example",
            url: "https://example.com",
          },
        ],
      },
      key,
      id,
    ),
  );
  await expect(
    managed.edit("alice", id, written.revision, {
      itemId: "tab",
      url: "javascript:alert(1)",
    }),
  ).rejects.toThrow();
  await managed.edit("alice", id, written.revision, {
    itemId: "tab",
    title: "Updated",
    url: "https://example.org",
  });
  const record = (await managed.list("alice"))[0];
  expect(record.value.workspace.apps[0].name).toBe("Updated");
  expect(record.value.openTabs[0].url).toBe("https://example.org");
});

test("loads legacy saved passwords without exposing another account", async () => {
  const { managed, store } = fixture();
  const key = await managed.key("alice");
  await store.write(
    "alice",
    "passwords_desktop",
    0,
    encryptSyncRecord(
      {
        version: 1,
        deviceId: "desktop",
        items: [
          {
            title: "Example",
            origin: "https://example.com",
            username: "alex",
            password: "private",
          },
        ],
      },
      key,
      "passwords_desktop",
    ),
  );
  const result = await managed.list("alice");
  expect(result[0].category).toBe("passwords");
  expect(result[0].value.items[0].password).toBe("private");
  expect(await managed.list("bob")).toEqual([]);
});

test("reassembles encrypted personal data and a document larger than one sync record", async () => {
  const { createHash } = await import("node:crypto");
  const { managed, store } = fixture();
  const key = await managed.key("alice");
  const content = Buffer.alloc(9 * 1024 * 1024, 65).toString("base64");
  const items = [
    {
      id: "document",
      title: "Document",
      kind: "knowledge",
      origin: "",
      scope: "group",
      username: "",
      password: "",
      fields: [],
      document: {
        name: "report.txt",
        mime: "text/plain",
        content,
        text: "Report",
      },
    },
    {
      id: "profile",
      title: "Profile",
      kind: "profile",
      origin: "",
      username: "",
      password: "",
      fields: [{ name: "name", value: "Alex", secret: false }],
    },
  ];
  const value = Buffer.from(JSON.stringify(items));
  const chunks: string[] = [];
  const prefix = `personalblob_${createHash("sha256").update("desktop").digest("hex").slice(0, 16)}_`;
  for (let offset = 0; offset < value.length; offset += 4 * 1024 * 1024) {
    const data = value
      .subarray(offset, offset + 4 * 1024 * 1024)
      .toString("base64");
    const id = prefix + createHash("sha256").update(data).digest("hex");
    chunks.push(id);
    try {
      await store.get("alice", id);
    } catch {
      await store.write("alice", id, 0, encryptSyncRecord({ data }, key, id));
    }
  }
  await store.write(
    "alice",
    "personal_desktop",
    0,
    encryptSyncRecord(
      { version: 1, deviceId: "desktop", chunks },
      key,
      "personal_desktop",
    ),
  );
  const records = await managed.list("alice");
  expect(records).toHaveLength(1);
  expect(records[0].value.items).toEqual(items);
  expect(await managed.list("bob")).toEqual([]);
  const old = await store.get("alice", chunks[0]);
  await store.write(
    "alice",
    chunks[0],
    old.revision,
    encryptSyncRecord({ data: "changed" }, key, chunks[0]),
  );
  await expect(managed.list("alice")).rejects.toThrow(
    "Invalid personal data chunk",
  );
});

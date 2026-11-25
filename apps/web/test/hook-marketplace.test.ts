import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { hookPublishPage } from "../src/hook-pages";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, inArray, sql } from "drizzle-orm";
import { connect } from "../src/db";
import { authUser, hookListings, hookModeration } from "../src/schema";
import {
  marketplaceStore,
  publisherUsername,
  encodeHookCursor,
  decodeHookCursor,
  hookQuery,
} from "../src/hook-marketplace";
import { parseHookPackage } from "../../../packages/hooks/package";
import { createApp } from "../src/app";
import type { Auth } from "../src/auth";
const sample = (name = "Quiet reading") =>
  parseHookPackage({
    schemaVersion: 1,
    minimumBrowserVersion: "1.0.0",
    name,
    description: "A calmer reading experience.",
    license: "MIT",
    applicability: "site",
    sites: [{ host: "example.com", includeSubdomains: true }],
    path: "/articles/*",
    lifecycle: {
      before: "",
      after: "log('ready')",
      css: "aside { display:none; }",
    },
  });
test("portable package validates scope, stages and source limits without accepting local grants", () => {
  const pkg = sample();
  expect(pkg.name).toBe("Quiet reading");
  for (const invalid of [
    { ...pkg, enabled: true },
    { ...pkg, schemaVersion: 3 },
    { ...pkg, lifecycle: { ...pkg.lifecycle, ready: "x" } },
    { ...pkg, lifecycle: { ...pkg.lifecycle, after: "x".repeat(20001) } },
    {
      ...pkg,
      sites: [{ host: "https://example.com", includeSubdomains: false }],
    },
    { ...pkg, applicability: "general" },
  ])
    expect(() => parseHookPackage(invalid)).toThrow();
});
test("cursors are bound to filters and reject malformed boundaries", () => {
  const q = hookQuery({ q: "reader" });
  const cursor = encodeHookCursor(
    q,
    "2026-11-12T12:00:00.000Z",
    "2026-11-11T12:00:00.000Z",
    "hook",
  );
  expect(decodeHookCursor(cursor, q).id).toBe("hook");
  expect(() => decodeHookCursor(cursor, hookQuery({ q: "other" }))).toThrow();
  expect(() => decodeHookCursor("invalid", q)).toThrow();
  expect(() => hookQuery({ kind: "bad" })).toThrow();
});
test("publisher usernames normalize case and reject invalid handles", () => {
  expect(publisherUsername(" Atlas_Studio ")).toBe("atlas_studio");
  for (const value of [
    "ab",
    "123name",
    "has spaces",
    "@alice",
    "a".repeat(31),
    "publisher-reserved",
  ])
    expect(() => publisherUsername(value)).toThrow();
  const page = hookPublishPage(undefined, "", "atlas_studio");
  expect(page).toContain('name="username"');
  expect(page).toContain('value="atlas_studio"');
});
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "hooks marketplace PostgreSQL integration (dedicated database)",
  () => {
    const { db, client } = connect(url!);
    const suffix = randomUUID();
    const alice = "hooks-a-" + suffix,
      bob = "hooks-b-" + suffix,
      admin = "hooks-admin-" + suffix;
    const store = marketplaceStore(db);
    let id = "";
    const auth = {
      options: { baseURL: "http://localhost:3000" },
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          const identity =
            headers.get("Authorization")?.replace("Bearer ", "") ||
            headers.get("Cookie")?.replace("test_user=", "");
          return [alice, bob, admin].includes(identity || "")
            ? { user: { id: identity, name: identity } }
            : null;
        },
      },
      handler: async () => new Response("{}"),
    } as unknown as Auth;
    const imagesRoot = mkdtempSync(
      path.join(os.tmpdir(), "marketplace-images-"),
    );
    process.env.HOOK_IMAGE_DIR = imagesRoot;
    const app = createApp({
      db,
      auth,
      assetOrigins: [],
      hookAdminIds: [admin],
    });
    const request = (
      path: string,
      method = "GET",
      user?: string,
      data?: unknown,
      extra: Record<string, string> = {},
    ) =>
      app.request(path, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${user}` } : {}),
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          ...extra,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    beforeAll(async () => {
      await migrate(db, {
        migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
      });
      await db.insert(authUser).values(
        [alice, bob, admin].map((user) => ({
          id: user,
          name: user === alice ? "<Alice>" : user,
          email: `${user}@example.test`,
        })),
      );
    });
    afterAll(async () => {
      await db.delete(hookModeration).where(eq(hookModeration.adminId, admin));
      await db
        .delete(authUser)
        .where(inArray(authUser.id, [alice, bob, admin]));
      await client.end();
      await fs.rm(imagesRoot, { recursive: true, force: true });
    });
    test("screenshots enforce authentication, ownership and safe public serving", async () => {
      const png = await sharp({
        create: { width: 640, height: 400, channels: 3, background: "#547d89" },
      })
        .png()
        .toBuffer();
      const upload = async (user?: string, origin?: string) => {
        const form = new FormData();
        form.set("image", new File([png], "screen.png", { type: "image/png" }));
        return app.request("/api/hooks/images", {
          method: "POST",
          headers: user
            ? { Authorization: "Bearer " + user }
            : origin
              ? { Origin: origin, Cookie: "test_user=" + alice }
              : {},
          body: form,
        });
      };
      expect((await upload("not-an-account")).status).toBe(401);
      expect((await upload(undefined, "https://evil.test")).status).toBe(403);
      const response = await upload(alice);
      expect(response.status).toBe(201);
      const image = await response.json();
      expect((await request(image.url)).status).toBe(404);
      expect((await request(image.url, "GET", bob)).status).toBe(404);
      expect(
        (
          await request("/api/hooks/publish", "POST", bob, {
            package: sample(),
            images: [image.key],
          })
        ).status,
      ).toBe(403);
      const published = await request("/api/hooks/publish", "POST", alice, {
        package: sample(),
        images: [image.key],
      });
      expect(published.status).toBe(201);
      const result = await published.json();
      const visible = await request(image.url);
      expect(visible.status).toBe(200);
      expect(visible.headers.get("content-type")).toBe("image/webp");
      expect(visible.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await (await request("/hooks/" + result.id)).text()).toContain(
        image.key,
      );
    });
    test("chosen publisher handles are unique, public and atomic with publication", async () => {
      const handle = "atlas_" + suffix.replaceAll("-", "").slice(0, 12);
      const published = await store.publish(
        alice,
        sample(),
        undefined,
        undefined,
        handle.toUpperCase(),
      );
      expect((await store.detail(published.id)).author.username).toBe(handle);
      expect((await store.package(published.id)).publisher.username).toBe(
        handle,
      );
      const bobBefore = await store.publisher(bob);
      const collision = await request("/api/hooks/publish", "POST", bob, {
        package: sample(),
        username: handle.toUpperCase(),
      });
      expect(collision.status).toBe(409);
      expect(await collision.text()).toContain("already taken");
      await expect(
        store.publish(bob, sample(), undefined, undefined, handle),
      ).rejects.toThrow("already taken");
      expect(await store.publisher(bob)).toEqual(bobBefore);
      await expect(
        store.publish(
          alice,
          sample(),
          published.id,
          999,
          "changed_" + suffix.replaceAll("-", "").slice(0, 12),
        ),
      ).rejects.toThrow("hook_changed");
      expect((await store.publisher(alice)).username).toBe(handle);
      const html = await (await request("/hooks/" + published.id)).text();
      expect(html).toContain("@" + handle);
      expect(html).not.toContain(alice + "@example.test");
    });
    test("publisher usernames can change independently of publishing", async () => {
      const handle = "studio_" + suffix.replaceAll("-", "").slice(0, 12);
      const published = await store.publish(alice, sample());
      const saved = await request("/api/hooks/publisher", "POST", alice, {
        username: " " + handle.toUpperCase() + " ",
      });
      expect(saved.status).toBe(200);
      expect((await saved.json()).username).toBe(handle);
      expect((await store.detail(published.id)).author.username).toBe(handle);
      expect((await store.package(published.id)).publisher.username).toBe(
        handle,
      );
      const before = await store.publisher(bob);
      expect(
        (
          await request("/api/hooks/publisher", "POST", bob, {
            username: handle,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request("/api/hooks/publisher", "POST", bob, {
            username: "bad-name",
          })
        ).status,
      ).toBe(400);
      expect(await store.publisher(bob)).toEqual(before);
      expect(
        (
          await request(
            "/api/hooks/publisher",
            "POST",
            undefined,
            { username: handle },
            { Origin: "http://localhost:3000" },
          )
        ).status,
      ).toBe(401);
    });
    test("public browsing, JSON assets, and account redirects work", async () => {
      expect((await request("/hooks")).status).toBe(200);
      expect((await request("/account/hooks")).status).toBe(302);
      expect(
        (await request("/assets/hooks.css")).headers.get("Content-Type"),
      ).toContain("text/css");
      expect(
        (await request("/assets/hooks.js")).headers.get("Content-Type"),
      ).toContain("javascript");
    });
    test("publishing requires an account; cookie mutations require the trusted origin", async () => {
      expect(
        (
          await request(
            "/api/hooks/publish",
            "POST",
            undefined,
            { package: sample() },
            { Origin: "http://localhost:3000" },
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await request(
            "/api/hooks/publish",
            "POST",
            undefined,
            { package: sample() },
            { Cookie: `test_user=${alice}` },
          )
        ).status,
      ).toBe(403);
      const created = await request("/api/hooks/publish", "POST", alice, {
        package: sample(),
      });
      expect(created.status).toBe(201);
      id = (await created.json()).id;
      const detail = await (await request("/v1/hooks/" + id)).json();
      expect(detail.hook.status).toBe("approved");
      expect(detail.author).not.toHaveProperty("email");
      const markup = await (await request("/hooks/" + id)).text();
      expect(markup).toContain("&lt;Alice&gt;");
      expect(markup).toContain("Open in Kudium");
    });
    test("version updates enforce ownership and optimistic concurrency; packages remain immutable", async () => {
      expect(
        (
          await request("/api/hooks/publish", "POST", bob, {
            id,
            expectedVersion: 1,
            package: sample("Other"),
          })
        ).status,
      ).toBe(404);
      const requests = await Promise.all(
        ["Update A", "Update B"].map((name) =>
          request("/api/hooks/publish", "POST", alice, {
            id,
            expectedVersion: 1,
            package: sample(name),
          }),
        ),
      );
      expect(requests.map((r) => r.status).sort()).toEqual([201, 409]);
      const old = await (
        await request(`/v1/hooks/${id}/versions/1/package`)
      ).json();
      expect(old.package.name).toBe("Quiet reading");
      expect(old.contentHash).toHaveLength(64);
      expect((await request(`/v1/hooks/${id}/versions/0/package`)).status).toBe(
        400,
      );
    });
    test("moderation hides rejected packages and resubmissions wait for review", async () => {
      expect(
        (
          await request("/api/hooks/admin/" + id, "PATCH", alice, {
            status: "rejected",
            reason: "Needs changes",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/api/hooks/admin/" + id, "PATCH", admin, {
            status: "rejected",
            reason: "",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request("/api/hooks/admin/" + id, "PATCH", admin, {
            status: "rejected",
            reason: "Needs changes",
          })
        ).status,
      ).toBe(200);
      expect((await request(`/v1/hooks/${id}/versions/1/package`)).status).toBe(
        404,
      );
      expect((await request("/hooks/" + id)).status).toBe(404);
      expect((await request("/hooks/" + id, "GET", alice)).status).toBe(200);
      await store.publish(alice, sample("Revised"), id, 2);
      expect((await store.detail(id, alice)).hook.status).toBe("pending");
      await store.moderate(id, admin, "approved", "");
      expect((await request("/hooks/" + id)).status).toBe(200);
      expect((await request(`/v1/hooks/${id}/versions/2/package`)).status).toBe(
        404,
      );
    });
    test("likes are unique and comments have ownership, escaping, reports and moderation", async () => {
      await Promise.all([
        store.like(id, alice, true),
        store.like(id, alice, true),
      ]);
      expect((await store.detail(id, alice)).hook.likes).toBe(1);
      await store.like(id, bob, true);
      expect((await store.detail(id)).hook.likes).toBe(2);
      await store.like(id, alice, false);
      expect((await store.detail(id)).hook.likes).toBe(1);
      const comment = await store.comment(
        id,
        alice,
        "<script>alert(1)</script>",
      );
      expect((await store.comments(id)).items[0].body).toContain("<script>");
      expect(
        (
          await request(
            `/api/hooks/${id}/comments/${comment.id}`,
            "PATCH",
            bob,
            { body: "edited" },
          )
        ).status,
      ).toBe(404);
      await store.editComment(id, comment.id, alice, "Thanks!");
      await store.report(id, bob, "Review this", comment.id);
      const reports = await store.reports();
      const report = reports.find((r) => r.hookId === id)!;
      expect(report.commentId).toBe(comment.id);
      await store.editComment(id, comment.id, admin, undefined, true);
      await store.resolveReport(report.id, admin);
      expect((await store.comments(id)).items).toHaveLength(0);
      expect((await store.reports()).some((r) => r.id === report.id)).toBe(
        false,
      );
    });
    test("cursor pagination retains timestamp ties, applies site/name filters and excludes new publications", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 53; i += 1)
        ids.push(
          (await store.publish(bob, sample(`Pagination reader ${i}`))).id,
        );
      await db
        .update(hookListings)
        .set({ publishedAt: new Date("2026-11-01T10:00:00.123Z") })
        .where(inArray(hookListings.id, ids));
      const q = hookQuery({
        q: "Pagination reader",
        site: "sub.example.com",
        kind: "site",
      });
      const first = await store.list(q);
      expect(first.items).toHaveLength(24);
      expect(first.nextCursor).toBeTruthy();
      const fresh = await store.publish(bob, sample("Pagination reader new"));
      const second = await store.list(q, first.nextCursor!);
      const third = await store.list(q, second.nextCursor!);
      const found = [...first.items, ...second.items, ...third.items].map(
        (row) => row.hook.id,
      );
      expect(new Set(found).size).toBe(53);
      expect(found).not.toContain(fresh.id);
      expect(third.nextCursor).toBeNull();
      expect(
        (
          await store.list(
            hookQuery({ q: "Pagination reader", kind: "general" }),
          )
        ).items,
      ).toHaveLength(0);
      expect(() =>
        decodeHookCursor(first.nextCursor!, { ...q, q: "different" }),
      ).toThrow();
    });
    test("search and cursor query plans can use the intended indexes", async () => {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO hook_listings (id,author_id,name,description,applicability) SELECT ${bob} || '-index-' || i, ${bob}, 'unrelated hook ' || i, 'index fixture', 'general' FROM generate_series(1,5000) i`,
        );
        await tx.execute(
          sql`SELECT gin_clean_pending_list('hook_name_search')`,
        );
        await tx.execute(sql`ANALYZE hook_listings`);
        await tx.execute(sql`SET LOCAL enable_seqscan=off`);
        await tx.execute(sql`SET LOCAL enable_indexscan=off`);
        const name = JSON.stringify(
          await tx.execute(
            sql`EXPLAIN SELECT id FROM hook_listings WHERE status='approved' AND name ILIKE '%Pagination%'`,
          ),
        );
        expect(name).toContain("hook_name_search");
        await tx.execute(sql`SET LOCAL enable_indexscan=on`);
        const cursor = JSON.stringify(
          await tx.execute(
            sql`EXPLAIN SELECT id FROM hook_listings WHERE status='approved' ORDER BY published_at DESC,id DESC LIMIT 24`,
          ),
        );
        expect(cursor).toContain("hook_public_cursor");
        expect(cursor).not.toContain("Sort");
        const targets = JSON.stringify(
          await tx.execute(
            sql`EXPLAIN SELECT hook_id FROM hook_targets WHERE host='example.com'`,
          ),
        );
        expect(targets).toContain("hook_target_host");
      });
    });
  },
);

test("email login returns to allowed marketplace pages and rejects external or encoded redirects", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await Bun.file(
    new URL("../public/auth.js", import.meta.url),
  ).text();
  for (const next of [
    "/hooks/new",
    "/account/hooks",
    "/hooks/abc-123",
    "/hooks/abc-123/edit",
    "//evil.example",
    "https://evil.example",
    "/hooks/%2f%2fevil",
  ]) {
    let submit: any;
    let destination = "";
    const button = { disabled: false };
    const form = {
      dataset: { authForm: "sign-in" },
      querySelector: () => button,
      addEventListener: (_name: string, handler: any) => {
        submit = handler;
      },
    };
    const document = {
      querySelector: (selector: string) =>
        selector === "[data-auth-form]" ? form : null,
      querySelectorAll: () => [],
    };
    runInNewContext(source, {
      document,
      URLSearchParams,
      location: {
        origin: "https://browser.kudium.com",
        search: "?next=" + encodeURIComponent(next),
        assign: (value: string) => {
          destination = value;
        },
      },
      FormData: class {
        get(name: string) {
          return name === "email" ? "qa@example.test" : "test-password-only";
        }
      },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      Error,
    });
    await submit({ preventDefault() {} });
    expect(destination).toBe(
      (next.startsWith("/hooks/") && !next.includes("%")) ||
        next === "/account/hooks"
        ? next
        : "/account",
    );
  }
});

test("portable context menu actions need no permission declarations", () => {
  const action = {
    id: "password",
    name: "Generate password",
    contexts: ["password" as const],
    source: "api.passwords.generateAndFill();",
  };
  const pkg = parseHookPackage({
    ...sample(),
    schemaVersion: 2,
    actions: [action],
    lifecycle: { before: "", after: "", css: "" },
  });
  expect(pkg.actions).toEqual([action]);
  expect(() =>
    parseHookPackage({
      ...pkg,
      actions: [{ ...action, permissions: ["vault.read"] }],
    }),
  ).toThrow();
  expect(() =>
    parseHookPackage({ ...pkg, actions: [{ ...action, granted: true }] }),
  ).toThrow();
});

test("website creator exposes shared action templates and retains update handlers", () => {
  const action = {
    id: "generate",
    name: "Generate password",
    contexts: ["password" as const],
    permissions: ["password.generate" as const],
    source: "api.passwords.generateAndFill();",
  };
  const pkg = parseHookPackage({
    ...sample(),
    schemaVersion: 2,
    actions: [action],
  });
  const html = hookPublishPage({
    package: pkg,
    hook: { id: "listing", version: 1 },
  } as any);
  expect(html).toContain("data-hook-actions");
  expect(html).toContain("data-action-templates");
  expect(html).toContain("api.passwords.generateAndFill();");
  expect(html).not.toContain("data-action-permission");
});

test("sort filters validate and trending cursors retain the ranking tie-breaker", () => {
  expect(hookQuery({}).sort).toBe("newest");
  expect(hookQuery({ sort: "trending" }).sort).toBe("trending");
  expect(() => hookQuery({ sort: "unknown" })).toThrow();
  const query = hookQuery({ sort: "trending", q: "reading" });
  const cursor = encodeHookCursor(
    query,
    "2026-11-13T12:00:00.000Z",
    "2026-11-12T12:00:00.000Z",
    "hook",
    7,
  );
  expect(decodeHookCursor(cursor, query).score).toBe(7);
  expect(() =>
    decodeHookCursor(cursor, { ...query, sort: "newest" }),
  ).toThrow();
});

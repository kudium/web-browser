import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { Database } from "../src/db";

const app = createApp({ db: {} as Database, assetOrigins: [] });

describe("Notes and Activity documentation", () => {
  test("is linked from the docs index and publicly accessible without a database", async () => {
    const index = await app.request("/docs");
    expect(await index.text()).toContain('href="/docs/notes-and-activity"');
    const page = await app.request("/docs/notes-and-activity");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain('href="https://browser.kudium.com/docs/notes-and-activity"');
    for (const term of ["context.notes.create", "context.activity.create", "manage_note", "create_activity", "asRead: false", "#kudiumbrowser-note-", "#kudiumbrowser-activity-"]) {
      expect(html).toContain(term);
    }
    for (const id of ["hook-api", "monitoring", "ai-tools", "links", "limits"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("not HTTP endpoints");
    expect(html).toContain("not cloud-synced");
  });
});

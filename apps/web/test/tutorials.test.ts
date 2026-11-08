import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { Database } from "../src/db";
import { tutorials } from "../src/tutorials";

// Public content routes must not need a database connection or authenticated session.
const app = createApp({ db: {} as Database, assetOrigins: [] });

describe("browser tutorials", () => {
  test("all guides have working public pages and screenshot URLs", async () => {
    const index = await app.request("/tutorials");
    expect(index.status).toBe(200);
    const html = await index.text();
    for (const guide of tutorials) {
      const path = `/tutorials/${guide.slug}`;
      expect(html).toContain(`href="${path}"`);
      const page = await app.request(path);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(guide.title.replaceAll("&", "&amp;"));
      if (guide.image) {
        const image = await app.request(
          `/assets/product/demo/${guide.image}.webp`
        );
        expect(image.status).toBe(200);
        expect(image.headers.get("content-type")).toBe("image/webp");
        expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      }
    }
  });

  test("unknown guides and private capture artifacts are not exposed", async () => {
    for (const path of [
      "/tutorials/missing-guide",
      "/assets/product/demo/manifest.json",
      "/assets/product/demo/workspace-light.png",
      "/assets/product/demo/unknown.webp",
    ]) {
      expect((await app.request(path)).status).toBe(404);
    }
  });
});

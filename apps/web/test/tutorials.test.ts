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
      "/assets/product/demo/unknown.mp4",
    ]) {
      expect((await app.request(path)).status).toBe(404);
    }
  });

  test("the homepage serves refreshed screenshots and only its public recording", async () => {
    const homepage = await (await app.request("/")).text();
    for (const name of ["favorites-workspace", "folder-group", "space-search", "notes-workspace", "task-manager"]) {
      expect(homepage).toContain(`/assets/product/demo/${name}.webp?v=12`);
      expect((await app.request(`/assets/product/demo/${name}.webp`)).status).toBe(200);
    }
    const video = await app.request("/assets/product/demo/space-search.mp4");
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("video/mp4");
    expect((await video.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});

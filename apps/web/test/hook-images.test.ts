import { test, expect, afterAll } from "bun:test";
import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hookImageStore } from "../src/hook-images";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "hook-images-test-"));
const store = hookImageStore(root);
afterAll(() => fs.rm(root, { recursive: true, force: true }));
test("bounded metadata-free WebP derivatives survive store restart and enforce ownership", async () => {
  const png = await sharp({
    create: { width: 1800, height: 1000, channels: 3, background: "#547d89" },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const result = await store.upload("alice", png);
  expect(result.bytes).toBeLessThanOrEqual(250 * 1024);
  expect(result.thumbnailBytes).toBeLessThanOrEqual(50 * 1024);
  const info = await sharp(
    await store.read(result.key, "main.webp"),
  ).metadata();
  expect(info.format).toBe("webp");
  expect(info.width).toBeLessThanOrEqual(1600);
  expect(info.exif).toBeUndefined();
  await hookImageStore(root).owned("alice", result.key);
  await expect(store.owned("bob", result.key)).rejects.toThrow();
  await expect(store.read("../escape", "main.webp")).rejects.toThrow();
  await expect(store.read(result.key, "../../file")).rejects.toThrow();
  await fs.utimes(path.join(root, result.key), new Date(0), new Date(0));
  expect(await store.cleanup(async (key) => key === result.key)).toBe(0);
  expect(await store.cleanup(async () => false)).toBe(1);
});
test("rejects active documents, spoofed raster headers and oversized uploads", async () => {
  for (const data of [
    Buffer.from('<svg onload="alert(1)"></svg>'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
    Buffer.alloc(5 * 1024 * 1024 + 1),
  ])
    await expect(store.upload("alice", data)).rejects.toThrow();
});

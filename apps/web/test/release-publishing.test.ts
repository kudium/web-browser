import { afterAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chunkSize, releasePublishing } from "../src/release-publishing";
import type { ReleaseManifest } from "../src/validation";
const root = await mkdtemp(path.join(os.tmpdir(), "kudium-release-tests-"));
const token = "test-token-".repeat(8);
const published: ReleaseManifest[][] = [];
const app = new Hono();
app.onError((error, c) =>
  error instanceof HTTPException
    ? c.json({ error: error.message }, error.status)
    : c.json({ error: "internal" }, 500)
);
app.route(
  "/",
  releasePublishing(
    { root, token, origin: "https://browser.kudium.com" },
    async (manifests) => {
      published.push(manifests);
    }
  )
);
const checksum = (bytes: Uint8Array) =>
  createHash("sha512").update(bytes).digest("base64");
const prefix =
  "/internal/releases/uploads/1.1.0-beta.1/linux/x64/Browser.AppImage";
const request = (
  route: string,
  method = "GET",
  body?: any,
  headers: Record<string, string> = {}
) =>
  app.request(route, {
    method,
    body,
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
afterAll(() => rm(root, { recursive: true, force: true }));
describe("release publication", () => {
  test("rejects unauthenticated uploads and oversized chunks before writing files", async () => {
    expect(
      (await app.request(prefix + "/0", { method: "PUT", body: "installer" }))
        .status
    ).toBe(401);
    expect(
      (await request(prefix + "/0", "PUT", Buffer.alloc(chunkSize + 1))).status
    ).toBe(413);
  });
  test("migration recovery remains authenticated and rejects missing GitHub credentials", async () => {
    const status = prefix + "/status";
    expect((await app.request(status)).status).toBe(401);
    expect((await request(status)).status).toBe(200);
    expect((await app.request("/internal/releases/github-mirror", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await request("/internal/releases/github-mirror", "POST", "{}")).status).toBe(400);
  });
  test("malformed completion and manifest JSON returns a client error", async () => {
    expect((await request(prefix + "/complete", "POST", "{")).status).toBe(400);
    expect(
      (await request("/internal/releases/manifests", "POST", "{")).status
    ).toBe(400);
  });
  test("rejects bad chunk digests and missing parts without making a download visible", async () => {
    expect(
      (
        await request(prefix + "/0", "PUT", "bad", {
          "X-Chunk-Sha512": checksum(Buffer.from("different")),
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(
          prefix + "/complete",
          "POST",
          JSON.stringify({
            size: 3,
            sha512: checksum(Buffer.from("bad")),
            parts: 1,
          }),
          { "Content-Type": "application/json" }
        )
      ).status
    ).toBe(400);
    expect(
      (await app.request("/downloads/1.1.0-beta.1/linux/x64/Browser.AppImage"))
        .status
    ).toBe(404);
  });
  test("assembles verified chunks, serves byte ranges, and keeps artifacts immutable", async () => {
    const bytes = Buffer.alloc(chunkSize + 4, 65);
    for (let index = 0; index < 2; index++) {
      const part = bytes.subarray(
        index * chunkSize,
        Math.min((index + 1) * chunkSize, bytes.length)
      );
      expect(
        (
          await request(prefix + "/" + index, "PUT", part, {
            "X-Chunk-Sha512": checksum(part),
          })
        ).status
      ).toBe(200);
    }
    const complete = () =>
      request(
        prefix + "/complete",
        "POST",
        JSON.stringify({
          size: bytes.length,
          sha512: checksum(bytes),
          parts: 2,
        }),
        { "Content-Type": "application/json" }
      );
    expect((await complete()).status).toBe(200);
    expect((await complete()).status).toBe(200);
    const download = "/downloads/1.1.0-beta.1/linux/x64/Browser.AppImage";
    const range = await app.request(download, {
      headers: { Range: "bytes=0-3" },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get("cache-control")).toContain("no-transform");
    expect(await range.text()).toBe("AAAA");
    expect(range.headers.get("content-range")).toBe(
      `bytes 0-3/${bytes.length}`
    );
    expect(
      (await app.request(download, { headers: { Range: "bytes=999999999-" } }))
        .status
    ).toBe(416);
    expect((await request(prefix + "/0", "PUT", "new")).status).toBe(409);
    expect((await app.request(download + ".metadata.json")).status).toBe(400);
  });
  test("publishes only fully verified matching artifacts and rejects stable prereleases", async () => {
    const bytes = Buffer.alloc(chunkSize + 4, 65);
    const manifest: ReleaseManifest = {
      version: "1.1.0-beta.1",
      platform: "linux",
      arch: "x64",
      channel: "beta",
      notes: "Beta",
      files: [
        {
          url: "https://browser.kudium.com/downloads/1.1.0-beta.1/linux/x64/Browser.AppImage",
          size: bytes.length,
          sha512: checksum(bytes),
        },
      ],
    };
    const publish = (m: any) =>
      request("/internal/releases/manifests", "POST", JSON.stringify([m]), {
        "Content-Type": "application/json",
      });
    expect((await publish({ ...manifest, channel: "stable" })).status).toBe(
      400
    );
    expect(
      (
        await publish({
          ...manifest,
          files: [
            { ...manifest.files[0], sha512: checksum(Buffer.from("wrong")) },
          ],
        })
      ).status
    ).toBe(400);
    expect((await publish(manifest)).status).toBe(200);
    expect(published).toEqual([[manifest]]);
  });
  test("mirrors only checksum-verified cached files to the owned GitHub draft without publishing feeds", async () => {
    const bytes = Buffer.alloc(chunkSize + 4, 65);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let uploads = 0;
    const mirror = new Hono();
    mirror.onError((error, c) => error instanceof HTTPException ? c.json({ error: error.message }, error.status) : c.json({ error: "internal" }, 500));
    mirror.route("/", releasePublishing({ root, token, origin: "https://browser.kudium.com" }, async () => { throw Error("must not publish"); }, async (url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test_github_token");
      if (url.startsWith("https://api.github.com/repos/kudium/web-browser/releases/")) return Response.json({ tag_name: "v1.1.0-beta.1", draft: true, prerelease: true, assets: [] });
      expect(url).toStartWith("https://uploads.github.com/repos/kudium/web-browser/releases/123/assets?");
      uploads++;
      const actual = Buffer.from(await (init?.body as Blob).arrayBuffer());
      expect(checksum(actual)).toBe(checksum(bytes));
      return Response.json({ size: actual.length, state: "uploaded", digest: `sha256:${sha256}` });
    }));
    const manifest: ReleaseManifest = { version: "1.1.0-beta.1", channel: "beta", platform: "linux", arch: "x64", notes: "", files: [{ url: "https://github.com/kudium/web-browser/releases/download/v1.1.0-beta.1/Browser.AppImage", size: bytes.length, sha512: checksum(bytes), sha256 }] };
    const send = (m: ReleaseManifest) => mirror.request("/internal/releases/github-mirror", { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-GitHub-Token": "test_github_token", "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: 123, manifest: m }) });
    expect((await send(manifest)).status).toBe(200);
    expect(uploads).toBe(1);
    expect((await send({ ...manifest, files: [{ ...manifest.files[0], sha256: "0".repeat(64) }] })).status).toBe(400);
    expect((await send({ ...manifest, files: [{ ...manifest.files[0], url: manifest.files[0].url.replace("kudium/web-browser", "other/repository") }] })).status).toBe(400);
    expect(uploads).toBe(1);
  });

});

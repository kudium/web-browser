import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  link,
} from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";
import { z } from "zod";
import { releaseSchema, type ReleaseManifest } from "./validation";

import { verifyGitHubAssets } from "./github-release-assets";

export const chunkSize = 8 * 1024 * 1024;
const maxSize = chunkSize * 128;
const digest = z
  .string()
  .refine(
    (v) =>
      Buffer.from(v, "base64").length === 64 &&
      Buffer.from(v, "base64").toString("base64") === v
  );
const completion = z
  .object({
    size: z.number().int().positive().max(maxSize),
    sha512: digest,
    parts: z.number().int().min(1).max(1024),
    chunkBytes: z.union([z.literal(1024 * 1024), z.literal(chunkSize)]).optional(),
  })
  .strict();
export type PublishingConfig = { root: string; token: string; origin: string };
export function publishingConfig(
  env: Record<string, string | undefined>
): PublishingConfig | undefined {
  if (!env.RELEASE_STORAGE_PATH && !env.RELEASE_PUBLISH_TOKEN) return;
  if (
    !env.RELEASE_STORAGE_PATH ||
    !path.isAbsolute(env.RELEASE_STORAGE_PATH) ||
    !env.RELEASE_PUBLISH_TOKEN ||
    env.RELEASE_PUBLISH_TOKEN.length < 64
  )
    throw new Error(
      "Configure an absolute RELEASE_STORAGE_PATH and a RELEASE_PUBLISH_TOKEN of at least 64 characters"
    );
  const origin = new URL(env.BETTER_AUTH_URL || "https://browser.kudium.com");
  if (
    origin.protocol !== "https:" ||
    origin.origin !== origin.href.slice(0, -1)
  )
    throw new Error("Release origin must be an HTTPS origin");
  return {
    root: env.RELEASE_STORAGE_PATH,
    token: env.RELEASE_PUBLISH_TOKEN,
    origin: origin.origin,
  };
}
function filePath(root: string, params: Record<string, string>) {
  const { version, platform, arch, filename } = params;
  if (
    valid(version) !== version ||
    !["darwin", "win32", "linux"].includes(platform) ||
    !["arm64", "x64"].includes(arch) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:zip|dmg|exe|AppImage|blockmap)$/.test(
      filename
    )
  )
    throw new HTTPException(400, { message: "invalid_release_path" });
  return path.join(root, version, platform, arch, filename);
}
function sameDigest(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}
async function metadata(
  file: string
): Promise<{ size: number; sha512: string } | undefined> {
  try {
    return JSON.parse(await readFile(file + ".metadata.json", "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}
export function releasePublishing(
  config: PublishingConfig,
  publish: (manifests: ReleaseManifest[]) => Promise<void>,
  githubFetch: (url: string, init?: RequestInit) => Promise<Response> = fetch
) {
  const app = new Hono();
  app.use("/internal/releases/*", async (c, next) => {
    if (
      !sameDigest(c.req.header("Authorization") || "", `Bearer ${config.token}`)
    )
      throw new HTTPException(401, { message: "unauthorized" });
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.use(
    "/internal/releases/*",
    bodyLimit({
      maxSize: chunkSize,
      onError: (c) => c.json({ error: "chunk_too_large" }, 413),
    })
  );
  app.put(
    "/internal/releases/uploads/:version/:platform/:arch/:filename/:part",
    async (c) => {
      const file = filePath(config.root, c.req.param());
      const part = c.req.param("part");
      if (!/^(?:0|[1-9][0-9]{0,3})$/.test(part) || Number(part) >= 1024)
        throw new HTTPException(400, { message: "invalid_part" });
      if (await metadata(file))
        throw new HTTPException(409, { message: "artifact_already_completed" });
      const bytes = Buffer.from(await c.req.arrayBuffer());
      if (
        !bytes.length ||
        createHash("sha512").update(bytes).digest("base64") !==
          c.req.header("X-Chunk-Sha512")
      )
        throw new HTTPException(400, { message: "chunk_checksum_mismatch" });
      const parts = file + ".parts";
      await mkdir(parts, { recursive: true });
      const temp = path.join(parts, `${part}.${randomUUID()}.tmp`);
      try {
        await Bun.write(temp, bytes);
        await rename(temp, path.join(parts, part));
      } finally {
        await rm(temp, { force: true });
      }
      return c.json({ uploaded: Number(part) });
    }
  );
  app.post(
    "/internal/releases/uploads/:version/:platform/:arch/:filename/complete",
    async (c) => {
      const file = filePath(config.root, c.req.param());
      const input = completion.safeParse(await c.req.json().catch(() => null));
      if (
        !input.success ||
        Math.ceil(input.data.size / (input.data.chunkBytes ?? chunkSize)) !== input.data.parts
      )
        throw new HTTPException(400, { message: "invalid_completion" });
      const { size, sha512, parts } = input.data;
      const assemblyChunkSize = input.data.chunkBytes ?? chunkSize;
      const existing = await metadata(file);
      if (existing) {
        if (existing.size !== size || existing.sha512 !== sha512)
          throw new HTTPException(409, { message: "immutable_artifact" });
        return c.json({ completed: true });
      }
      await mkdir(path.dirname(file), { recursive: true });
      const temp = file + "." + randomUUID() + ".tmp";
      const output = await open(temp, "wx");
      const hash = createHash("sha512");
      let written = 0;
      try {
        for (let index = 0; index < parts; index++) {
          let bytes: Buffer;
          try {
            bytes = await readFile(path.join(file + ".parts", String(index)));
          } catch {
            throw new HTTPException(400, { message: "missing_chunk" });
          }
          const expected =
            index === parts - 1 ? size - index * assemblyChunkSize : assemblyChunkSize;
          if (bytes.length !== expected)
            throw new HTTPException(400, { message: "invalid_chunk_size" });
          hash.update(bytes);
          await output.writeFile(bytes);
          written += bytes.length;
        }
        if (written !== size || hash.digest("base64") !== sha512)
          throw new HTTPException(400, {
            message: "artifact_checksum_mismatch",
          });
        await output.sync();
        // Hard-link promotion never replaces an already completed artifact.
        try {
          await link(temp, file);
        } catch (error: any) {
          if (error.code !== "EEXIST") throw error;
          const actual = createHash("sha512");
          for await (const bytes of Bun.file(file).stream())
            actual.update(bytes);
          if (actual.digest("base64") !== sha512)
            throw new HTTPException(409, { message: "immutable_artifact" });
        }
        const sidecar = file + "." + randomUUID() + ".metadata.tmp";
        await Bun.write(sidecar, JSON.stringify({ size, sha512 }));
        await rename(sidecar, file + ".metadata.json");
        await rm(file + ".parts", { recursive: true, force: true });
      } finally {
        await output.close();
        await rm(temp, { force: true });
      }
      return c.json({ completed: true });
    }
  );
  // Migration recovery: reuse verified legacy files without sending installers from the Mac again.
  app.get("/internal/releases/uploads/:version/:platform/:arch/:filename/status", async (c) => {
    const file = filePath(config.root, c.req.param());
    const complete = await metadata(file);
    if (complete) return c.json({ completed: true, ...complete });
    const names = await readdir(file + ".parts").catch(() => [] as string[]);
    const parts = await Promise.all(names.filter(name => /^(?:0|[1-9][0-9]{0,3})$/.test(name)).map(async name => ({ part: Number(name), size: (await stat(path.join(file + ".parts", name))).size })));
    return c.json({ completed: false, parts });
  });
  app.post("/internal/releases/github-mirror", async (c) => {
    const input = z.object({ releaseId: z.number().int().positive(), manifest: releaseSchema }).strict().safeParse(await c.req.json().catch(() => null));
    const githubToken = c.req.header("X-GitHub-Token");
    if (!input.success || !githubToken || !/^[A-Za-z0-9_]+$/.test(githubToken)) throw new HTTPException(400, { message: "invalid_mirror_request" });
    const { manifest, releaseId } = input.data;
    const repository = "kudium/web-browser";
    const headers = { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "User-Agent": "Kudium-Release-Migration" };
    const response = await githubFetch(`https://api.github.com/repos/${repository}/releases/${releaseId}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new HTTPException(400, { message: "github_release_unavailable" });
    const release = await response.json() as { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; size: number; digest: string }[] };
    if (release.tag_name !== `v${manifest.version}` || !release.draft || release.prerelease !== (manifest.channel === "beta")) throw new HTTPException(400, { message: "invalid_mirror_release" });
    const mirrored: string[] = [];
    for (const asset of manifest.files) {
      const prefix = `https://github.com/${repository}/releases/download/v${manifest.version}/`;
      if (!asset.url.startsWith(prefix) || !asset.sha256) throw new HTTPException(400, { message: "invalid_github_asset" });
      const name = asset.url.slice(prefix.length);
      const file = filePath(config.root, { version: manifest.version, platform: manifest.platform, arch: manifest.arch, filename: name });
      const meta = await metadata(file);
      if (!meta || meta.size !== asset.size || meta.sha512 !== asset.sha512 || (await stat(file)).size !== asset.size) throw new HTTPException(400, { message: "unverified_artifact" });
      const hash = createHash("sha256");
      for await (const bytes of Bun.file(file).stream()) hash.update(bytes);
      if (hash.digest("hex") !== asset.sha256) throw new HTTPException(400, { message: "artifact_checksum_mismatch" });
      const existing = release.assets.find(item => item.name === name);
      if (existing) {
        if (existing.size !== asset.size || existing.digest !== `sha256:${asset.sha256}`) throw new HTTPException(409, { message: "immutable_artifact" });
      } else {
        const uploaded = await githubFetch(`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: Bun.file(file), signal: AbortSignal.timeout(120000) });
        if (!uploaded.ok) throw new HTTPException(502, { message: "github_mirror_failed" });
        const actual = await uploaded.json() as { size: number; digest: string; state: string };
        if (actual.size !== asset.size || actual.digest !== `sha256:${asset.sha256}` || actual.state !== "uploaded") throw new HTTPException(502, { message: "github_mirror_checksum_mismatch" });
      }
      mirrored.push(name);
    }
    return c.json({ mirrored });
  });
  app.post("/internal/releases/manifests", async (c) => {
    const input = z
      .array(releaseSchema)
      .min(1)
      .max(6)
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      throw new HTTPException(400, { message: "invalid_manifests" });
    const first = input.data[0];
    const targets = new Set<string>();
    for (const manifest of input.data) {
      const target = `${manifest.platform}/${manifest.arch}`;
      if (
        manifest.version !== first.version ||
        manifest.channel !== first.channel ||
        targets.has(target)
      )
        throw new HTTPException(400, { message: "mixed_or_duplicate_release" });
      targets.add(target);
      for (const asset of manifest.files) {
        const url = new URL(asset.url);
        if (url.origin === "https://github.com") continue;
        const prefix = `/downloads/${manifest.version}/${manifest.platform}/${manifest.arch}/`;
        if (
          url.origin !== config.origin ||
          !url.pathname.startsWith(prefix) ||
          url.search ||
          url.hash
        )
          throw new HTTPException(400, { message: "invalid_asset_url" });
        const file = filePath(config.root, {
          version: manifest.version,
          platform: manifest.platform,
          arch: manifest.arch,
          filename: decodeURIComponent(url.pathname.slice(prefix.length)),
        });
        const meta = await metadata(file);
        if (
          !meta ||
          meta.size !== asset.size ||
          meta.sha512 !== asset.sha512 ||
          (await stat(file)).size !== asset.size
        )
          throw new HTTPException(400, { message: "unverified_artifact" });
      }
    }
    await verifyGitHubAssets(input.data);
    await publish(input.data);
    return c.json({
      published: input.data.map((m) => `${m.platform}/${m.arch}/${m.channel}`),
    });
  });
  app.get("/downloads/:version/:platform/:arch/:filename", async (c) => {
    const file = filePath(config.root, c.req.param());
    if (!(await metadata(file)))
      throw new HTTPException(404, { message: "artifact_not_found" });
    const asset = Bun.file(file);
    const headers = {
      "Cache-Control": "public, max-age=31536000, immutable, no-transform",
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
    };
    const range = c.req.header("Range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${asset.size}` },
        });
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, asset.size - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), asset.size - 1)
          : asset.size - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= asset.size
      )
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${asset.size}` },
        });
      return new Response(asset.slice(start, end + 1), {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${asset.size}`,
        },
      });
    }
    return new Response(asset, {
      headers: { ...headers, "Content-Length": String(asset.size) },
    });
  });
  return app;
}

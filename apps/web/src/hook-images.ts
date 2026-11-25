import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { HTTPException } from "hono/http-exception";
let processing = 0;
export const imageKeyPattern = /^[a-f0-9]{32}\/[a-f0-9]{32}$/;
export const imageOwner = (user: string) =>
  createHash("sha256").update(user).digest("hex").slice(0, 32);
export const imageRoot = () => process.env.HOOK_IMAGE_DIR || "/app/hook-images";
export function hookImageStore(root: string) {
  const jobs = new Map<string, Promise<unknown>>();
  const directory = (key: string) => {
    if (!imageKeyPattern.test(key))
      throw new HTTPException(404, { message: "image_not_found" });
    return path.join(root, key);
  };
  const owned = async (user: string, key: string) => {
    if (!imageKeyPattern.test(key) || key.split("/")[0] !== imageOwner(user))
      throw new HTTPException(403, { message: "image_not_owned" });
    try {
      await fs.access(path.join(directory(key), "main.webp"));
    } catch {
      throw new HTTPException(404, { message: "image_not_found" });
    }
  };
  return {
    owned,
    async read(key: string, size: string) {
      if (!["main.webp", "thumb.webp"].includes(size))
        throw new HTTPException(404, { message: "image_not_found" });
      try {
        return await fs.readFile(path.join(directory(key), size));
      } catch {
        throw new HTTPException(404, { message: "image_not_found" });
      }
    },
    async upload(user: string, bytes: Buffer) {
      if (bytes.length > 5 * 1024 * 1024)
        throw new HTTPException(413, { message: "image_too_large" });
      const format = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? "jpeg"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "png"
          : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            ? "webp"
            : "";
      if (!format)
        throw new HTTPException(415, {
          message:
            "Use a PNG, JPEG or WebP screenshot. SVG and animated files are not supported.",
        });
      if (processing >= 2)
        throw new HTTPException(429, {
          message: "Image processor is busy. Try again shortly.",
        });
      processing++;
      let main: Buffer, thumb: Buffer;
      try {
        const decoder = sharp(bytes, {
          limitInputPixels: 16000000,
          failOn: "warning",
          animated: true,
        });
        const metadata = await decoder.metadata();
        if (
          metadata.format !== format ||
          (metadata.pages || 1) !== 1 ||
          !metadata.width ||
          !metadata.height
        )
          throw new Error("Unsupported image");
        main = await sharp(bytes, {
          limitInputPixels: 16000000,
          failOn: "warning",
        })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 75, effort: 4 })
          .toBuffer();
        if (main.length > 250 * 1024)
          main = await sharp(main)
            .resize({
              width: 1280,
              height: 1280,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 55, effort: 4 })
            .toBuffer();
        if (main.length > 250 * 1024)
          throw new Error("Image cannot fit storage limit");
        thumb = await sharp(main)
          .resize({
            width: 400,
            height: 300,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 65, effort: 4 })
          .toBuffer();
        if (thumb.length > 50 * 1024) throw new Error("Thumbnail too large");
      } catch {
        throw new HTTPException(400, {
          message:
            "Invalid, oversized or animated image. Try a simpler screenshot.",
        });
      } finally {
        processing--;
      }
      const owner = imageOwner(user);
      const previous = jobs.get(owner) || Promise.resolve();
      const task = previous
        .catch(() => {})
        .then(async () => {
          const parent = path.join(root, owner);
          await fs.mkdir(parent, { recursive: true, mode: 0o700 });
          const entries = await fs.readdir(parent, { withFileTypes: true });
          let stored = 0;
          for (const entry of entries) {
            if (entry.isDirectory() && /^[a-f0-9]{32}$/.test(entry.name)) {
              for (const name of ["main.webp", "thumb.webp"])
                stored += (
                  await fs
                    .stat(path.join(parent, entry.name, name))
                    .catch(() => ({ size: 0 }))
                ).size;
            }
          }
          if (
            entries.length >= 200 ||
            stored + main.length + thumb.length > 50 * 1024 * 1024
          )
            throw new HTTPException(429, {
              message: "Publisher image quota reached.",
            });
          const key = owner + "/" + randomBytes(16).toString("hex");
          const dest = directory(key);
          await fs.mkdir(dest, { mode: 0o700 });
          try {
            await fs.writeFile(path.join(dest, "main.webp"), main, {
              flag: "wx",
              mode: 0o600,
            });
            await fs.writeFile(path.join(dest, "thumb.webp"), thumb, {
              flag: "wx",
              mode: 0o600,
            });
          } catch (error) {
            await fs.rm(dest, { recursive: true, force: true });
            throw error;
          }
          return {
            key,
            url: "/hook-images/" + key + "/main.webp",
            thumbnail: "/hook-images/" + key + "/thumb.webp",
            bytes: main.length,
            thumbnailBytes: thumb.length,
          };
        });
      jobs.set(owner, task);
      try {
        return await task;
      } finally {
        if (jobs.get(owner) === task) jobs.delete(owner);
      }
    },
    async cleanup(referenced: (key: string) => Promise<boolean>) {
      let removed = 0;
      for (const owner of await fs.readdir(root).catch(() => [])) {
        if (!/^[a-f0-9]{32}$/.test(owner)) continue;
        for (const id of await fs.readdir(path.join(root, owner))) {
          const key = owner + "/" + id;
          if (!imageKeyPattern.test(key)) continue;
          const stat = await fs.stat(directory(key));
          if (
            stat.mtimeMs < Date.now() - 7 * 86400000 &&
            !(await referenced(key))
          ) {
            await fs.rm(directory(key), { recursive: true, force: true });
            removed++;
          }
        }
      }
      return removed;
    },
  };
}

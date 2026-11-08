import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { validateManifests } from "./browser-release-targets.mjs";
const root = process.argv[2];
const targets = process.argv[3] || "all";
const origin = "https://browser.kudium.com";
const token = process.env.RELEASE_PUBLISH_TOKEN;
if (!root || !token)
  throw new Error("Supply the artifacts directory and RELEASE_PUBLISH_TOKEN");
async function request(route, options, acceptCompleted = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(origin + route, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(90000),
      });
      if (response.ok || (acceptCompleted && response.status === 409))
        return response;
      if (response.status < 500)
        throw Object.assign(
          new Error(`Release API rejected ${route} (${response.status})`),
          { permanent: true }
        );
      throw new Error(`Release API failed (${response.status})`);
    } catch (error) {
      if (error.permanent || attempt === 2) throw error;
      await delay(1000 * (attempt + 1));
    }
  }
}
const manifests = [];
const artifacts = [];
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(root, entry.name);
  const manifest = JSON.parse(
    await fs.readFile(path.join(directory, "manifest.json"), "utf8")
  );
  artifacts.push({ directory, manifest });
  manifests.push(manifest);
}
validateManifests(manifests, targets);
if (
  process.env.RELEASE_VERSION &&
  manifests[0].version !== process.env.RELEASE_VERSION.replace(/^v/, "")
)
  throw new Error("Artifacts do not match the requested release tag");
for (const { directory, manifest } of artifacts) {
  const prefix = `/internal/releases/uploads/${manifest.version}/${manifest.platform}/${manifest.arch}/`;
  for (const name of await fs.readdir(directory)) {
    if (name === "manifest.json") continue;
    const file = await fs.open(path.join(directory, name), "r");
    const size = (await file.stat()).size;
    const hash = createHash("sha512");
    let part = 0;
    try {
      for (let offset = 0; offset < size; offset += 8 * 1024 * 1024) {
        const bytes = Buffer.alloc(Math.min(8 * 1024 * 1024, size - offset));
        let read = 0;
        while (read < bytes.length) {
          const { bytesRead } = await file.read(
            bytes,
            read,
            bytes.length - read,
            offset + read
          );
          if (!bytesRead) throw new Error("Unexpected end of installer");
          read += bytesRead;
        }
        hash.update(bytes);
        // Completion below verifies the full digest before an existing artifact is accepted.
        await request(
          prefix + name + "/" + part,
          {
            method: "PUT",
            headers: {
              "X-Chunk-Sha512": createHash("sha512")
                .update(bytes)
                .digest("base64"),
            },
            body: bytes,
          },
          true
        );
        part++;
      }
    } finally {
      await file.close();
    }
    const sha512 = hash.digest("base64");
    const advertised = manifest.files.find((f) =>
      new URL(f.url).pathname.endsWith("/" + name)
    );
    if (
      advertised &&
      (advertised.size !== size || advertised.sha512 !== sha512)
    )
      throw new Error("Artifact checksum does not match its manifest");
    await request(prefix + name + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, sha512, parts: part }),
    });
    const publicUrl = `${origin}/downloads/${manifest.version}/${manifest.platform}/${manifest.arch}/${name}`;
    const publicFile = await fetch(publicUrl, { method: "HEAD" });
    const length = publicFile.headers.get("content-length");
    if (!publicFile.ok || (length !== null && Number(length) !== size))
      throw new Error("Uploaded download is not publicly accessible");
    if (length === null) {
      // Some CDNs omit Content-Length; verify the actual response bytes instead.
      const download = await fetch(publicUrl, {
        headers: { "Accept-Encoding": "identity" },
      });
      if (!download.ok || !download.body)
        throw new Error("Public download failed");
      const publicHash = createHash("sha512");
      let received = 0;
      for await (const bytes of download.body) {
        received += bytes.length;
        if (received > size)
          throw new Error("Public download exceeds advertised size");
        publicHash.update(bytes);
      }
      if (received !== size || publicHash.digest("base64") !== sha512)
        throw new Error("Public download checksum mismatch");
    }
    console.log(
      `Verified public download: ${manifest.platform}/${manifest.arch}/${name}`
    );
  }
}
await request("/internal/releases/manifests", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(manifests),
});
console.log(`Published ${manifests[0].version} to ${manifests[0].channel}`);

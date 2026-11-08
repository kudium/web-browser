/* eslint-disable */
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// KudiumBrowser: authenticated bounded CRX v1')) return source;
  const esm = source.includes('import * as path5');
  source = (esm ? 'import * as kudiumbrowserCrypto from "node:crypto";\nimport * as kudiumbrowserZlib from "node:zlib";\n' :
    'const kudiumbrowserCrypto = require("node:crypto");\nconst kudiumbrowserZlib = require("node:zlib");\n') + source;
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('Extension transport patch needs dependency review: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  replace('function parseCrx(buffer) {', `// KudiumBrowser: authenticated bounded CRX v1
function parseCrx(buffer) {
  if (buffer.length < 12 || buffer.length > 64 * 1024 * 1024 || buffer.readUInt32LE(4) !== 3 ||
      buffer.readUInt32LE(8) > 1024 * 1024 || 12 + buffer.readUInt32LE(8) >= buffer.length)
    throw new Error("Invalid or oversized CRX3 package");`);
  replace('const keyProof = crxFileHeader.sha256_with_rsa.find((proof) => {', 'const keyProof = [...crxFileHeader.sha256_with_rsa, ...crxFileHeader.sha256_with_ecdsa].find((proof) => {');
  replace('    extensionId = declaredCrxId;\n    publicKey = keyProof.public_key;', `    const signed = crxFileHeader.signed_header_data;
    const length = Buffer.alloc(4); length.writeUInt32LE(signed.length);
    const verifier = kudiumbrowserCrypto.createVerify("sha256");
    verifier.update(Buffer.from("CRX3 SignedData\\0"));
    verifier.update(length); verifier.update(signed); verifier.update(contents);
    if (!keyProof.signature || !verifier.verify({ key: keyProof.public_key, format: "der", type: "spki" }, keyProof.signature))
      throw new Error("CRX signature verification failed");
    extensionId = declaredCrxId;
    publicKey = keyProof.public_key;`);
  const unpackStart = source.indexOf('async function unpackCrx(crx, destPath) {');
  const unpackEnd = source.indexOf('async function readCrx(crxPath) {', unpackStart);
  if (unpackStart < 0 || unpackEnd < 0) throw new Error('Extension unpack patch needs review');
  const zip = esm ? 'AdmZip' : 'import_adm_zip.default';
  source = source.slice(0, unpackStart) + `async function unpackCrx(crx, destPath) {
  const zip = new ${zip}(crx.contents);
  const entries = zip.getEntries();
  if (entries.length > 10000) throw new Error("Too many extension entries");
  let total = 0;
  const names = new Set();
  for (const entry of entries) {
    const name = entry.entryName;
    const parts = name.replace(/\\/$/, "").split("/");
    const mode = (entry.attr >>> 16) & 0xf000;
    if (!name || name.length > 2048 || parts.length > 16 || name.includes("\\\\") || name.includes(":") || name.includes("\\0") ||
        parts.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\\.|$)/i.test(part)) ||
        (mode && mode !== 0x8000 && mode !== 0x4000) || (entry.header.flags & 1) ||
        ![0, 8].includes(entry.header.method) || names.has(name.toLowerCase()))
      throw new Error("Unsafe extension archive entry");
    names.add(name.toLowerCase());
    total += entry.header.size;
    if (entry.header.size > 16 * 1024 * 1024 || total > 256 * 1024 * 1024 ||
        (name === "manifest.json" && entry.header.size > 1024 * 1024))
      throw new Error("Extension archive is too large");
  }
  for (const entry of entries) {
    const output = path3.join(destPath, entry.entryName);
    if (entry.isDirectory) { await fs2.promises.mkdir(output, { recursive: true, mode: 0o700 }); continue; }
    const compressed = entry.getCompressedData();
    const data = entry.header.method === 0 ? compressed : await new Promise((resolve, reject) => {
      kudiumbrowserZlib.inflateRaw(compressed, { maxOutputLength: Math.max(1, entry.header.size) }, (error, data) => error ? reject(error) : resolve(data));
    });
    if (data.length !== entry.header.size) throw new Error("Invalid extension archive size");
    await fs2.promises.mkdir(path3.dirname(output), { recursive: true, mode: 0o700 });
    await fs2.promises.writeFile(output, data, { flag: "wx", mode: 0o600 });
  }
  const manifestPath = path3.join(destPath, "manifest.json");
  const manifest = JSON.parse(await fs2.promises.readFile(manifestPath, "utf8"));
  if (manifest.manifest_version !== 3 || typeof manifest.version !== "string" || !/^\\d{1,5}(?:\\.\\d{1,5}){0,3}$/.test(manifest.version))
    throw new Error("Invalid extension manifest");
  manifest.key = crx.publicKey.toString("base64");
  await fs2.promises.writeFile(manifestPath, JSON.stringify(manifest));
  return manifest;
}
` + source.slice(unpackEnd);
  const downloadStart = source.indexOf('async function downloadCrx(url, dest) {');
  const downloadEnd = source.indexOf('async function downloadExtensionFromURL(', downloadStart);
  if (downloadStart < 0 || downloadEnd < 0) throw new Error('Extension download patch needs review');
  source = source.slice(0, downloadStart) + `async function downloadCrx(url, dest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let file;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = new URL(url);
      if (target.protocol !== "https:" || target.username || target.password ||
          (target.port && target.port !== "443") || !["clients2.google.com", "clients2.googleusercontent.com"].includes(target.hostname))
        throw new Error("Untrusted extension download destination");
      const response = await fetch(target.toString(), { redirect: "manual", signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 3) throw new Error("Invalid extension redirect");
        url = new URL(location, target).toString(); continue;
      }
      if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > 64 * 1024 * 1024)
        throw new Error("Invalid extension download response");
      file = await fs2.promises.open(dest, "wx", 0o600);
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > 64 * 1024 * 1024) throw new Error("Extension download is too large");
        await file.writeFile(chunk);
      }
      return;
    }
  } finally { controller.abort(); clearTimeout(timer); await file?.close(); }
}
` + source.slice(downloadEnd);
  replace('  const crxPath = path3.join(os.tmpdir(),', '  let unpackedPath;\n  let completed = false;\n  const crxPath = path3.join(os.tmpdir(),');
  replace('    const unpackedPath = path3.join(extensionsDir, crx.extensionId, installUuid);', '    unpackedPath = path3.join(extensionsDir, crx.extensionId, installUuid);');
  replace('    return versionedPath;\n  } finally {', '    completed = true;\n    return versionedPath;\n  } finally {\n    if (!completed && unpackedPath) await fs2.promises.rm(unpackedPath, { recursive: true, force: true });');
  return source;
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of ['dist/cjs/browser/index.js', 'dist/esm/browser/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-web-store', entry);
      if (fs.existsSync(file)) fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

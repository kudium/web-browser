/* eslint-disable */
// Dependency updates prepare candidates; only the main-process owner may load.
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// TouchBox: owned extension updates v2')) return source;
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('Extension update patch needs review: ' + before.slice(0, 70));
    source = source.replace(before, after);
  };
  if (!source.includes('// TouchBox: owned extension updates v1')) {
  replace('async function updateExtension(session, update) {', 'async function updateExtension(session, update, applyUpdate) {\n  // TouchBox: owned extension updates v1\n  if (typeof applyUpdate !== "function") throw new Error("An owned update review is required");');
  const start = source.indexOf('  d4("downloaded update %s@%s", extensionId, update.version);');
  const end = source.indexOf('async function checkForUpdates(session)', start);
  if (start < 0 || end < 0) throw new Error('Extension update load patch needs review');
  source = source.slice(0, start) + `  try {
    await applyUpdate(update, updatePath);
  } finally {
    await fs3.promises.rm(updatePath, { recursive: true, force: true });
  }
}
` + source.slice(end);
  replace('async function installUpdates(session, updates) {', 'async function installUpdates(session, updates, applyUpdate) {');
  replace('await updateExtension(session, update);', 'await updateExtension(session, update, applyUpdate);');
  // Both bundles differ only in the default-session expression.
  const signature = /async function updateExtensions\(session = ([^)]+)\) \{/;
  if (!signature.test(source)) throw new Error('Extension updater signature needs review');
  source = source.replace(signature, 'async function updateExtensions(session = $1, applyUpdate) {');
  replace('await installUpdates(session, updates);', 'await installUpdates(session, updates, applyUpdate);');
  }
  replace('  const response = await fetch(url, {\n    method: "POST",',
    '  const response = await fetch(url, {\n    signal: AbortSignal.timeout(30000),\n    redirect: "error",\n    method: "POST",');
  replace('  const text = await response.text();', `  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error("Extension update metadata is too large");
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");`);
  return source.replace('// TouchBox: owned extension updates v1', '// TouchBox: owned extension updates v2');
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

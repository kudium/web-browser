/* eslint-disable */
// Mitigate GHSA-gcqx-w48m-w2h4 in the development toolchain until upstream ships a fix.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const originals = {
  'index.js': '12440c84957c1990ea2d5e33dc0091722dc1dc1585c6d20e0c780e568ffa9d30',
  'dist/cjs.js': '2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d',
  'dist/umd.js': 'f33e6596482d1fb5c7c427f8ef92f2aa849eea9223acd974176b2fb27ddbf73a',
};
const patched = {
  "index.js": "aee8105c44343c2ff972335207b9307c3d51fdbb1f9472893da62c7ea40d6521",
  "dist/cjs.js": "73786979f4e792ee45b30c5e505d1fdfb349400de5b6bbb793e32cc272928bbd",
  "dist/umd.js": "a6af789b8891bc98003736c53822ecdb366897edb88e80bad0769741fd82a0d4"
};
const hash = source => crypto.createHash('sha256').update(source).digest('hex');
function patchSource(source, file) {
  const digest = hash(source);
  if (digest === patched[file]) return source;
  if (digest !== originals[file]) throw new Error(`Deepmerge security patch needs review: ${file}`);
  const helper = 'function kudiumDefineMergeProperty(object, key, value) {\n\tObject.defineProperty(object, key, { value: value, enumerable: true, configurable: true, writable: true });\n}\n\n';
  let count = 0;
  const result = source.replace('function mergeObject(target, source, options) {', helper + 'function mergeObject(target, source, options) {')
    .replace(/destination\[key\] = ([^\r\n;]+);?/g, (_, expression) => { count += 1; return `kudiumDefineMergeProperty(destination, key, ${expression});`; });
  if (count !== 3) throw new Error('Deepmerge assignment layout changed');
  return result;
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  let packageFile;
  try { packageFile = require.resolve('deepmerge/package.json', { paths: [root] }); }
  catch { return; } // Production-only installations do not include this development dependency.
  const directory = path.dirname(packageFile);
  if (JSON.parse(fs.readFileSync(packageFile, 'utf8')).version !== '4.3.1') throw new Error('Review the deepmerge patch before changing dependency versions');
  const updates = Object.keys(originals).map(file => {
    const filename = path.join(directory, file);
    const source = fs.readFileSync(filename, 'utf8');
    return { filename, source, result: patchSource(source, file) };
  });
  for (const { filename, source, result } of updates) if (result !== source) fs.writeFileSync(filename, result);
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

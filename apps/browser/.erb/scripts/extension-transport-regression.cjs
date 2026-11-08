/* eslint-disable */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const { patchSource } = require('./patch-extension-transport.cjs');
const entry = require.resolve('electron-chrome-web-store');
const source = fs.readFileSync(process.argv.includes('--esm') ? entry.replace('dist/cjs/browser/index.js', 'dist/esm/browser/index.mjs') : entry, 'utf8');
assert.equal(patchSource(source), source);
function varint(number) {
  const bytes = [];
  do { bytes.push((number & 127) | (number > 127 ? 128 : 0)); number >>>= 7; } while (number);
  return Buffer.from(bytes);
}
function field(tag, data) { return Buffer.concat([varint(tag * 8 + 2), varint(data.length), data]); }
function signedPackage(contents, type = 'rsa') {
  const pair = crypto.generateKeyPairSync(type, type === 'rsa' ? { modulusLength: 2048 } : { namedCurve: 'prime256v1' });
  const key = pair.publicKey.export({ format: 'der', type: 'spki' });
  const hash = crypto.createHash('sha256').update(key).digest().subarray(0, 16);
  const signed = field(1, hash);
  const length = Buffer.alloc(4); length.writeUInt32LE(signed.length);
  const signature = crypto.sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0'), length, signed, contents]), pair.privateKey);
  const header = Buffer.concat([field(type === 'rsa' ? 2 : 3, Buffer.concat([field(1, key), field(2, signature)])), field(10000, signed)]);
  const prefix = Buffer.alloc(12); prefix.write('Cr24'); prefix.writeUInt32LE(3, 4); prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, contents]);
}
function archive(name = 'manifest.json', content) {
  const zip = new AdmZip();
  zip.addFile(name === '../escape' ? 'xx/escape' : name, content || Buffer.from(JSON.stringify({ manifest_version: 3, name: 'Fixture', version: '1.0' })));
  const buffer = zip.toBuffer();
  if (name === '../escape') {
    let offset = buffer.indexOf('xx/escape');
    while (offset >= 0) { buffer.write('../escape', offset); offset = buffer.indexOf('xx/escape', offset + 9); }
  }
  return buffer;
}
(async () => {
  const { default: Pbf } = await import('pbf');
  const context = vm.createContext({ Buffer, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    require, Pbf, AdmZip, createHash: crypto.createHash, touchboxCrypto: crypto, touchboxZlib: zlib, import_adm_zip: { default: AdmZip },
    fs2: fs, path3: path, os, crypto, d2() {}, getChromeVersion: () => '145.0.0.0', fetch: globalThis.fetch });
  vm.runInContext(source.slice(source.indexOf('// src/browser/crx3.ts'), source.indexOf('// src/browser/loader.ts')).replace(/^import .*;$/gm, ''), context);
  vm.runInContext(source.slice(source.indexOf('function getExtensionCrxURL('), source.indexOf('async function installExtension(')), context);
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'touchbox-transport-test-'));
  let cases = 0;
  async function test(name, operation) { await operation(); cases++; console.log('PASS ' + name); }
  try {
    for (const type of ['rsa', 'ec']) await test(type + ' signature and bounded extraction', async () => {
      const crx = context.parseCrx(signedPackage(archive(), type));
      const dest = path.join(root, type); await fs.promises.mkdir(dest);
      const manifest = await context.unpackCrx(crx, dest);
      assert.equal(manifest.version, '1.0'); assert.equal(context.generateId(manifest.key), crx.extensionId);
    });
    await test('tampered signed content is rejected', async () => {
      const crx = signedPackage(archive()); crx[crx.length - 1] ^= 1;
      assert.throws(() => context.parseCrx(crx), /signature/);
    });
    await test('CRX2 and truncated headers are rejected', async () => {
      const crx = signedPackage(archive()); crx.writeUInt32LE(2, 4);
      assert.throws(() => context.parseCrx(crx), /CRX3/);
      assert.throws(() => context.parseCrx(Buffer.alloc(7)), /CRX3/);
    });
    await test('signed traversal archive is rejected before file writes', async () => {
      const dest = path.join(root, 'traversal'); await fs.promises.mkdir(dest);
      await assert.rejects(context.unpackCrx(context.parseCrx(signedPackage(archive('../escape'))), dest), /Unsafe/);
      assert.deepEqual(await fs.promises.readdir(dest), []);
    });
    await test('oversized signed manifest is rejected before inflation', async () => {
      const dest = path.join(root, 'large'); await fs.promises.mkdir(dest);
      await assert.rejects(context.unpackCrx(context.parseCrx(signedPackage(archive('manifest.json', Buffer.alloc(1024 * 1024 + 1)))), dest), /too large/);
      assert.deepEqual(await fs.promises.readdir(dest), []);
    });
    await test('declared zip size cannot bypass inflation limit', async () => {
      const zip = archive('payload', Buffer.alloc(1024 * 1024));
      const central = zip.indexOf(Buffer.from('504b0102', 'hex')); zip.writeUInt32LE(1, central + 24);
      const dest = path.join(root, 'bomb'); await fs.promises.mkdir(dest);
      await assert.rejects(context.unpackCrx(context.parseCrx(signedPackage(zip)), dest));
      assert.deepEqual(await fs.promises.readdir(dest), []);
    });
    await test('remote destinations and redirect escapes are rejected', async () => {
      await assert.rejects(context.downloadCrx('http://clients2.google.com/a', path.join(root, 'bad')), /Untrusted/);
      context.fetch = async () => new Response('', { status: 302, headers: { location: 'https://attacker.example/evil' } });
      await assert.rejects(context.downloadCrx('https://clients2.google.com/a', path.join(root, 'bad')), /Untrusted/);
    });
    await test('streamed download ceiling applies without content length', async () => {
      context.fetch = async () => ({ ok: true, headers: new Headers(), body: (async function* () {
        for (let i = 0; i < 65; i++) yield Buffer.alloc(1024 * 1024);
      })() });
      await assert.rejects(context.downloadCrx('https://clients2.google.com/a', path.join(root, 'limit')), /too large/);
      assert.equal((await fs.promises.stat(path.join(root, 'limit'))).size, 64 * 1024 * 1024);
    });
    await test('failed authenticated extraction cleans package directory', async () => {
      const crx = signedPackage(archive('../escape'));
      const id = context.parseCrx(crx).extensionId;
      context.fetch = async () => new Response(crx);
      const cache = path.join(root, 'failed');
      await assert.rejects(context.downloadExtension(id, cache), /Unsafe/);
      assert.deepEqual(await fs.promises.readdir(path.join(cache, id)), []);
    });
    if (process.argv.includes('--remote')) await test('real Chrome store CRX3 download verifies and extracts', async () => {
      context.fetch = globalThis.fetch;
      const id = 'ddkjiahejlhfcafbddmgiahcphecmpfh';
      const installed = await context.downloadExtension(id, path.join(root, 'remote'));
      const manifest = JSON.parse(await fs.promises.readFile(path.join(installed, 'manifest.json'), 'utf8'));
      assert.equal(context.generateId(manifest.key), id);
      console.log(JSON.stringify({ extensionId: id, version: manifest.version, manifestVersion: manifest.manifest_version }));
    });
    console.log('Extension transport regression: ' + cases + ' cases passed using installed parser/download/extraction code.');
  } finally { await fs.promises.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

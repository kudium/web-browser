/* eslint-disable */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { patchSource } = require('./patch-extension-updates.cjs');
const entry = require.resolve('electron-chrome-web-store');
const source = fs.readFileSync(process.argv.includes('--esm') ? entry.replace('dist/cjs/browser/index.js', 'dist/esm/browser/index.mjs') : entry, 'utf8');
assert.equal(patchSource(source), source);
let downloaded = 0;
const removed = [];
const context = vm.createContext({
  Buffer, AbortSignal, d4() {}, console, path4: path,
  fs3: { promises: { rm: async filename => removed.push(filename) } },
  downloadExtensionFromURL: async () => { downloaded++; return '/cache/id/2_0'; },
  getChromeVersion: () => '145.0.0.0', getOmahaPlatform: () => 'mac', getOmahaArch: () => 'arm64',
  getSessionId: () => 'session', crypto: { randomUUID: () => 'request' }, process: { env: {} },
});
vm.runInContext(source.slice(source.indexOf('async function fetchAvailableUpdates('), source.indexOf('async function checkForUpdates(')), context);
(async () => {
  let nativeCalls = 0;
  const target = { extensions: { getExtension() { nativeCalls++; }, removeExtension() { nativeCalls++; }, loadExtension() { nativeCalls++; } } };
  const update = { id: 'id', version: '2', extension: { path: '/cache/id/1_0', version: '1' } };
  await assert.rejects(context.updateExtension(target, update), /owned update review/);
  assert.equal(downloaded, 0);
  await assert.rejects(context.updateExtension(target, update, async () => { throw new Error('Declined'); }), /Declined/);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(removed, ['/cache/id/2_0']);
  let delegated = 0;
  await context.updateExtension(target, update, async (candidate, filename) => {
    delegated++; assert.equal(candidate, update); assert.equal(filename, '/cache/id/2_0');
  });
  assert.equal(delegated, 1); assert.equal(nativeCalls, 0);
  assert(!removed.includes('/cache/id/1_0'));
  let options;
  context.fetch = async (_url, opts) => { options = opts; return { ok: true, body: (async function* () { yield Buffer.alloc(1024 * 1024 + 1); })() }; };
  await assert.rejects(context.fetchAvailableUpdates([{ id: 'id' }]), /metadata is too large/);
  assert.equal(options.redirect, 'error'); assert(options.signal instanceof AbortSignal);
  console.log('PASS owned updater: missing review, declined review, delegated apply/old-package retention, bounded metadata with deadline and redirect refusal. Installed ' + (process.argv.includes('--esm') ? 'ESM' : 'CommonJS') + ' code.');
})().catch(error => { console.error(error); process.exitCode = 1; });

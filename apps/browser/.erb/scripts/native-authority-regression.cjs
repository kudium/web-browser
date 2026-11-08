/* eslint-disable */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { patchSource } = require('./patch-native-boundaries.cjs');
const entry = require.resolve('electron-chrome-extensions');
const source = fs.readFileSync(process.argv.includes('--esm') ? entry.replace('dist/cjs/index.js', 'dist/esm/index.mjs') : entry, 'utf8');
assert.equal(patchSource(source), source);
const hostStart = source.indexOf('var NativeMessagingHost = class');
const runtimeEnd = source.indexOf('// src/browser/api/cookies.ts', hostStart);
let cases = 0;
function fixture({ stalled = false } = {}) {
  let release;
  let spawns = 0;
  let kills = 0;
  let writes = 0;
  const sender = Object.assign(new EventEmitter(), {
    ipc: new EventEmitter(), isDestroyed: () => false, send() {},
  });
  const frame = { url: 'chrome-extension://test/page.html', isDestroyed: () => false };
  const extension = { id: 'test', path: '/test', manifest: { permissions: ['nativeMessaging'] } };
  const extensions = Object.assign(new EventEmitter(), { getExtension: () => extension });
  const workers = new EventEmitter();
  const event = { type: 'frame', sender, senderFrame: frame, extension };
  const input = Object.assign(new EventEmitter(), {
    writable: true, write(_buffer, callback) { writes++; callback(); },
  });
  const child = Object.assign(new EventEmitter(), {
    stdin: input, stdout: new EventEmitter(), stderr: new EventEmitter(), kill() { kills++; },
  });
  const context = vm.createContext({
    Buffer, setTimeout, clearTimeout, kudiumbrowserNativeCrypto: { randomUUID }, d7() {}, getExtensionManifest: () => extension.manifest,
    EventEmitter3: EventEmitter, fs2: { stat: async () => ({ isFile: () => true }) },
    spawn2() { spawns++; return child; },
    import_node_events3: { EventEmitter }, import_node_crypto: { randomUUID },
    readNativeMessagingHostConfig: () => stalled ? new Promise(resolve => { release = resolve; }) :
      Promise.resolve({ path: '/host', allowed_origins: ['chrome-extension://test/'] }),
    import_node_fs2: { promises: { stat: async () => ({ isFile: () => true }) } },
    import_node_child_process: { spawn() { spawns++; return child; } },
  });
  vm.runInContext(source.slice(hostStart, runtimeEnd), context);
  const runtime = new context.RuntimeAPI({ session: { extensions, serviceWorkers: workers }, router: { apiHandler: () => () => {} } });
  return { runtime, event, sender, frame, extension, extensions, workers, child,
    counts: () => ({ spawns, kills, writes }), release: () => release({ path: '/host', allowed_origins: ['chrome-extension://test/'] }) };
}
async function test(name, operation) { await operation(); cases++; console.log('PASS ' + name); }
(async () => {
  await test('approved connection and exact-frame messages', async () => {
    const f = fixture();
    await f.runtime.connectNative(f.event, 'owned', 'host');
    f.sender.ipc.emit('crx-native-msg-owned', f.event, { ok: true });
    assert.equal(f.counts().writes, 1);
    f.sender.ipc.emit('crx-native-msg-owned', { ...f.event, senderFrame: { ...f.frame } }, { spoof: true });
    f.sender.ipc.emit('crx-native-msg-owned', {}, { spoof: true });
    assert.equal(f.counts().writes, 1);
    f.runtime.disconnectNative(f.event, 'owned');
    assert.equal(f.runtime.hostMap.size, 0);
    assert.equal(f.sender.listenerCount('destroyed'), 0);
    assert.equal(f.extensions.listenerCount('extension-unloaded'), 0);
  });
  await test('connection collision and foreign disconnect', async () => {
    const f = fixture();
    await f.runtime.connectNative(f.event, 'owned', 'host');
    await assert.rejects(f.runtime.connectNative(f.event, 'owned', 'host'), /unavailable/);
    assert.throws(() => f.runtime.disconnectNative({ ...f.event, senderFrame: { ...f.frame } }, 'owned'), /another sender/);
    assert.equal(f.counts().spawns, 1);
    f.runtime.disconnectNative(f.event, 'owned');
  });
  await test('website cannot impersonate installed extension', async () => {
    const f = fixture(); f.frame.url = 'https://example.com/';
    await assert.rejects(f.runtime.connectNative(f.event, 'owned', 'host'), /sender/);
    assert.equal(f.counts().spawns, 0);
  });
  for (const signal of ['destroyed', 'render-process-gone', 'did-start-navigation', 'extension-unloaded']) {
    await test(signal + ' cancels pending launch and clears listeners', async () => {
      const f = fixture({ stalled: true });
      const pending = f.runtime.connectNative(f.event, 'owned', 'host');
      const rejected = assert.rejects(pending, /unavailable/);
      if (signal === 'extension-unloaded') f.extensions.emit(signal, {}, f.extension);
      else f.sender.emit(signal, {}, { isSameDocument: false });
      await rejected;
      f.release(); await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.counts().spawns, 0);
      assert.equal(f.runtime.hostMap.size, 0);
      assert.equal(f.sender.ipc.listenerCount('crx-native-msg-owned'), 0);
      assert.equal(f.extensions.listenerCount('extension-unloaded'), 0);
    });
  }
  await test('unload closes an established host', async () => {
    const f = fixture(); await f.runtime.connectNative(f.event, 'owned', 'host');
    f.extensions.emit('extension-unloaded', {}, f.extension);
    assert.equal(f.counts().kills, 1); assert.equal(f.runtime.hostMap.size, 0);
  });
  await test('one-shot reply terminates process and connection', async () => {
    const f = fixture(); const response = f.runtime.sendNativeMessage(f.event, 'host', { text: 'hello' });
    await new Promise(resolve => setImmediate(resolve));
    const payload = Buffer.from('{"ok":true}');
    const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
    f.child.stdout.emit('data', Buffer.concat([header, payload]));
    assert.equal((await response).ok, true);
    assert.equal(f.counts().kills, 1); assert.equal(f.runtime.hostMap.size, 0);
  });
  await test('one-shot disconnect rejects pending reply', async () => {
    const f = fixture(); const response = f.runtime.sendNativeMessage(f.event, 'host', {});
    const rejected = assert.rejects(response, /disconnected/);
    await new Promise(resolve => setImmediate(resolve));
    f.child.emit('exit', 1); await rejected;
    assert.equal(f.runtime.hostMap.size, 0);
  });
  await test('stopped worker cannot continue native transport', async () => {
    const f = fixture();
    const worker = { scope: 'chrome-extension://test/', versionId: 7, ipc: new EventEmitter(), send() {} };
    f.workers.getWorkerFromVersionID = () => worker;
    const event = { ...f.event, type: 'service-worker', sender: worker };
    await f.runtime.connectNative(event, 'worker', 'host');
    f.workers.emit('running-status-changed', { versionId: 7, runningStatus: 'stopped' });
    assert.equal(f.counts().kills, 1); assert.equal(f.runtime.hostMap.size, 0);
    assert.equal(f.workers.listenerCount('running-status-changed'), 0);
  });
  console.log('Native authority regression: ' + cases + ' cases passed using installed dependency classes and controlled IPC/process fixtures.');
})().catch(error => { console.error(error); process.exitCode = 1; });

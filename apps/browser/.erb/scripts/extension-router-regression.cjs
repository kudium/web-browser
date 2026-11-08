/* eslint-disable */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { EventEmitter } = require('events');
const { patchSource } = require('./patch-extension-router.cjs');
const entry = require.resolve('electron-chrome-extensions');
const source = fs.readFileSync(process.argv.includes('--esm') ? entry.replace('dist/cjs/index.js', 'dist/esm/index.mjs') : entry, 'utf8');
assert.equal(patchSource(source), source);
const id = 'a'.repeat(32), foreignId = 'b'.repeat(32);
let worker;
const target = {
  extensions: { getExtension: key => [id, foreignId].includes(key) ? { id: key } : undefined },
  serviceWorkers: { getWorkerFromVersionID: () => worker },
};
const other = {};
let resolved = 0, messages = 0, listeners = 0;
const observer = {
  onExtensionMessage() { messages++; }, addListener() { listeners++; }, removeListener() { listeners--; },
};
const frame = { url: `chrome-extension://${id}/page.html`, isDestroyed: () => false };
const sender = { session: target, mainFrame: frame, isDestroyed: () => false };
const event = { type: 'frame', sender, senderFrame: frame };
const uiFrame = { url: 'file:///app/index.html', isDestroyed: () => false };
const ui = { type: 'frame', sender: { session: target, mainFrame: uiFrame, isDestroyed: () => false }, senderFrame: uiFrame };
const ipc = Object.assign(new EventEmitter(), { handle() {} });
const context = vm.createContext({
  Symbol, import_debug8: { default: () => () => {} }, debug8: () => () => {},
  import_electron9: { ipcMain: ipc }, ipcMain: ipc,
  resolvePartition(partition) { resolved++; return partition === 'allowed' ? target : other; },
});
context[Symbol.for('touchbox.extensionRemoteAuthority')] = (candidate, session) => candidate === ui && (!session || session === target);
vm.runInContext(source.slice(source.indexOf('var getSessionFromEvent ='), source.indexOf('var getHostId =')), context);
const delegate = new context.RoutingDelegate();
delegate.sessionMap.set(target, observer);
(async () => {
  await delegate.onRouterMessage(event, id, 'tabs.query');
  assert.equal(messages, 1);
  await assert.rejects(delegate.onRouterMessage(event, foreignId, 'tabs.query'), /Untrusted/);
  await assert.rejects(delegate.onRouterMessage({ ...event, senderFrame: { ...frame, url: 'https://example.com/' } }, id, 'tabs.query'), /Untrusted/);
  delegate.onAddListener(event, foreignId, 'tabs.onCreated');
  assert.equal(listeners, 0);
  delegate.onAddListener(event, id, 'tabs.onCreated');
  assert.equal(listeners, 1);
  delegate.onRemoveListener(event, foreignId, 'tabs.onCreated');
  assert.equal(listeners, 1);
  delegate.onRemoveListener(event, id, 'tabs.onCreated');
  assert.equal(listeners, 0);
  worker = { scope: `chrome-extension://${id}/`, versionId: 7 };
  const workerEvent = { type: 'service-worker', session: target, serviceWorker: worker };
  await delegate.onRouterMessage(workerEvent, id, 'tabs.query');
  await assert.rejects(delegate.onRouterMessage({ ...workerEvent, serviceWorker: { ...worker } }, id, 'tabs.query'), /Untrusted/);
  await assert.rejects(delegate.onRemoteMessage(event, 'unowned', 'browserAction.activate'), /Untrusted/);
  assert.equal(resolved, 0);
  await delegate.onRemoteMessage(ui, 'allowed', 'browserAction.getState');
  assert.equal(messages, 3);
  await assert.rejects(delegate.onRemoteMessage(ui, 'other', 'browserAction.activate'), /Untrusted/);
  assert.equal(messages, 3);
  const preload = fs.readFileSync(path.join(path.dirname(entry), '../chrome-extension-api.preload.js'), 'utf8');
  assert(!preload.includes('console.log(fnName, args)'));
  assert(!preload.includes('console.log(fnName, "(result)", result)'));
  console.log('PASS installed extension routing: frame/worker identity, spoofed extension IDs and listeners, pre-resolution workspace authorization, target ownership, normal toolbar flow and payload log removal (' + (process.argv.includes('--esm') ? 'ESM' : 'CommonJS') + ').');
})().catch(error => { console.error(error); process.exitCode = 1; });

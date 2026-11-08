/* eslint-disable */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { EventEmitter } = require('events');
const { patchSource } = require('./patch-native-messaging.cjs');
const source = fs.readFileSync(
  require.resolve('electron-chrome-extensions'),
  'utf8'
);
assert.equal(patchSource(source), source, 'patch must be idempotent');
const start = source.indexOf('var NativeMessagingHost = class');
const end = source.indexOf('// src/browser/api/runtime.ts', start);
async function run(mode) {
  const input = new EventEmitter();
  input.writable = true;
  input.destroyed = false;
  let written;
  const received = [];
  input.write = (_buffer, callback) => {
    written = _buffer;
    const error = Object.assign(new Error('Broken pipe'), { code: 'EPIPE' });
    if (mode === 'throw') throw error;
    if (mode === 'callback') callback(error);
    if (mode === 'event') input.emit('error', error);
  };
  const child = Object.assign(new EventEmitter(), {
    stdin: input,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill() {},
  });
  const sender = {
    ipc: new EventEmitter(),
    send(channel, message) {
      if (message) received.push(message);
    },
  };
  const context = vm.createContext({
    Buffer,
    d7() {},
    readNativeMessagingHostConfig: async () => ({
      path: '/host',
      allowed_origins: ['chrome-extension://test/'],
    }),
    import_node_fs2: {
      promises: { stat: async () => ({ isFile: () => true }) },
    },
    import_node_child_process: { spawn: () => child },
  });
  vm.runInContext(source.slice(start, end), context);
  const host = new context.NativeMessagingHost(
    'test',
    sender,
    'connection',
    'host'
  );
  await host.ready;
  if (mode === 'framing') {
    const payload = { text: 'こんにちは 🔐' };
    host.send(payload);
    assert.equal(
      written.readUInt32LE(0),
      Buffer.byteLength(JSON.stringify(payload))
    );
    assert.deepEqual(JSON.parse(written.subarray(4).toString()), payload);
    child.stdout.emit('data', written.subarray(0, 2));
    child.stdout.emit('data', written.subarray(2, 7));
    assert.equal(received.length, 0);
    child.stdout.emit('data', Buffer.concat([written.subarray(7), written]));
    assert.equal(received.length, 2);
    assert.equal(received[0].text, payload.text);
    host.destroy();
    return;
  }
  if (mode === 'invalid' || mode === 'oversized') {
    const frame = Buffer.alloc(5);
    frame.writeUInt32LE(mode === 'invalid' ? 1 : 1024 * 1024 + 1);
    frame[4] = 0x7b;
    child.stdout.emit('data', frame);
    assert.equal(host.connected, false);
    return;
  }
  if (mode === 'closed') input.destroyed = true;
  host.send({ hello: true });
  assert.equal(host.connected, false, `${mode}: host disconnected`);
  assert.equal(
    sender.ipc.listenerCount('crx-native-msg-connection'),
    0,
    `${mode}: subscription removed`
  );
}
(async () => {
  for (const mode of [
    'event',
    'callback',
    'throw',
    'closed',
    'framing',
    'invalid',
    'oversized',
  ])
    await run(mode);
  console.log(
    'Native messaging regression passed: EPIPE event, callback, synchronous failure, closed pipe, UTF-8, fragmented/coalesced replies, invalid JSON and oversized frames.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

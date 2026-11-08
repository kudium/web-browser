/* eslint-disable */
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert');
const { EventEmitter } = require('events');
const source = fs.readFileSync('src/main/main.ts', 'utf8');
const queue = source.slice(
  source.indexOf('const activeWindows:'),
  source.indexOf('let createAdditionalWindow:')
) + source.slice(
  source.indexOf('const deliverExternalLinks ='),
  source.indexOf('if (process.env.NODE_ENV')
);
const handlers = source.slice(
  source.indexOf('const openExternalLink ='),
  source.indexOf('registerHistory(')
);
const app = new EventEmitter();
let ready = false;
app.isReady = () => ready;
app.requestSingleInstanceLock = () => true;
const ipcMain = new EventEmitter();
const sent = [];
const host = {
  isDestroyed: () => false,
  isMinimized: () => true,
  restore() {},
  show() {},
  focus() {},
  webContents: {
    mainFrame: {},
    send: (_channel, request) => sent.push(request),
  },
};
const context = vm.createContext({
  app,
  ipcMain,
  process: { argv: ['KudiumBrowser', 'https://example.com/cold?q=1#anchor'] },
  URL,
  randomUUID: require('crypto').randomUUID,
  MAIN_WINDOW: {},
  createNewWindow: async () => {},
});
vm.runInContext(
  ts
    .transpileModule(queue + handlers + '\nactiveWindows.main = host;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace('activeWindows.main = host;', ''),
  context
);
context.host = host;
vm.runInContext('activeWindows.main = host;', context);
app.emit('open-url', { preventDefault() {} }, 'javascript:alert(1)');
app.emit('open-url', { preventDefault() {} }, 'file:///secret');
ipcMain.emit('browser-tab-requests-ready', {
  sender: {},
  senderFrame: host.webContents.mainFrame,
});
assert.equal(sent.length, 0);
ipcMain.emit('browser-tab-requests-ready', {
  sender: host.webContents,
  senderFrame: {},
});
assert.equal(sent.length, 0);
ipcMain.emit('browser-tab-requests-ready', {
  sender: host.webContents,
  senderFrame: host.webContents.mainFrame,
});
assert.equal(sent.length, 1);
assert.equal(sent[0].action, 'open-external');
assert.equal(sent[0].url, 'https://example.com/cold?q=1#anchor');
ready = true;
app.emit('second-instance', {}, ['KudiumBrowser', 'https://example.com/running']);
setImmediate(() => {
  assert.equal(sent.length, 2);
  assert.equal(sent[1].action, 'open-external');
  assert.equal(sent[1].url, 'https://example.com/running');
  console.log(
    'External links passed: cold queue, exact destination, running instance, scheme filtering, trusted main-frame handshake, active-group dispatch.'
  );
});

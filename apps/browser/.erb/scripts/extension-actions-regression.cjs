/* eslint-disable */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { EventEmitter } = require('events');
const { patchSource } = require('./patch-extension-actions.cjs');
const source = fs.readFileSync(
  require.resolve('electron-chrome-extensions/browser-action'),
  'utf8'
);
assert.equal(patchSource(source), source, 'patch must be idempotent');
assert.throws(
  () => patchSource('unexpected dependency'),
  /requires dependency review/
);
const pending = [];
const events = [];
const emitter = new EventEmitter();
emitter.contextIsolated = true;
const classes = new Map();
let api;
let queried = 0;
class Element {
  constructor() {
    this.attributes = new Map();
    this.isConnected = true;
  }
  getAttribute(key) {
    return this.attributes.get(key);
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  addEventListener() {}
  attachShadow() {
    return (this.shadowRoot = {
      querySelector() {
        queried++;
      },
      querySelectorAll() {
        return [];
      },
      appendChild() {},
    });
  }
}
const context = vm.createContext({
  import_electron: {
    ipcRenderer: {
      invoke(_channel, partition, name) {
        if (name !== 'browserAction.getState') return Promise.resolve();
        return new Promise((resolve) => pending.push({ partition, resolve }));
      },
      on() {},
    },
    contextBridge: {
      exposeInMainWorld(name, value) {
        api = value;
        context.browserAction = value;
      },
      executeInMainWorld({ func }) {
        func();
      },
    },
  },
  process: emitter,
  queueMicrotask,
  HTMLElement: Element,
  HTMLButtonElement: Element,
  customElements: {
    define(name, value) {
      classes.set(name, value);
    },
  },
  document: {
    createElement() {
      return new Element();
    },
  },
  requestAnimationFrame() {
    return 1;
  },
  cancelAnimationFrame() {},
});
vm.runInContext(
  source.slice(source.indexOf('var injectBrowserAction =')) +
    '\ninjectBrowserAction();',
  context
);
api.addEventListener('update', (state) => events.push(state));
const state = (title) => ({
  activeTabId: 42,
  actions: [
    {
      id: 'extension',
      title,
      text: '',
      tabs: { 42: { title: title + ' tab' } },
    },
  ],
});
(async () => {
  api.addObserver('a');
  const old = api.getState('a');
  const recent = api.getState('a');
  pending[1].resolve(state('latest A'));
  await recent;
  pending[0].resolve(state('stale A'));
  await old;
  assert.equal(events.length, 1);
  assert.equal(events[0].partition, 'a');
  assert.equal(api.getAction('extension', 'a').title, 'latest A');
  api.addObserver('b');
  const b = api.getState('b');
  pending[2].resolve(state('B'));
  await b;
  assert.equal(api.getAction('extension', 'a').title, 'latest A');
  assert.equal(api.getAction('extension', 'b').title, 'B');
  const list = new (classes.get('browser-action-list'))();
  list.partition = 'b';
  queried = 0;
  list.update(events[0]);
  assert.equal(queried, 0, 'foreign state reached toolbar');
  list.update(events[1]);
  assert.equal(queried, 1, 'own state did not reach toolbar');
  const infos = [];
  classes.get('browser-action').prototype.updateCallback.call({
    id: 'extension',
    partition: 'b',
    tab: 42,
    updateIcon(info) {
      infos.push(info);
    },
  });
  assert.equal(infos[0].title, 'B tab', 'tab overrides lost to default title');
  const staleB = api.getState('b');
  api.removeObserver('b');
  api.addObserver('b');
  const newB = api.getState('b');
  pending[4].resolve(state('new B'));
  await newB;
  pending[3].resolve(state('old B'));
  await staleB;
  assert.equal(api.getAction('extension', 'b').title, 'new B');
  const afterRemoval = api.getState('a');
  api.removeObserver('a');
  const count = events.length;
  pending[5].resolve(state('removed A'));
  await afterRemoval;
  assert.equal(events.length, count);
  assert.equal(api.getAction('extension', 'a'), undefined);
  console.log(
    'PASS: extension action profile isolation, stale responses, reconnect races, unsubscribe cleanup, scoped rendering and tab metadata'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Exercise the installed main-process observer callbacks across repeated UI mounts.
const { patchObserverSource } = require('./patch-extension-actions.cjs');
const observerSource = fs.readFileSync(require.resolve('electron-chrome-extensions'), 'utf8');
assert.equal(patchObserverSource(observerSource), observerSource);
assert.throws(() => patchObserverSource('unknown version'), /dependency review/);
const observerCallback = name => {
  const match = observerSource.match(new RegExp('"browserAction.' + name + '",\\s*(\\(event\\) => \\{[\\s\\S]+?\\n      \\}),\\n      preloadOpts'));
  assert(match, 'Reviewed observer callback must exist: ' + name);
  return vm.runInNewContext('(' + match[1].replace('(event) =>', 'function(event)') + ')');
};
const addObserver = observerCallback('addObserver');
const removeObserver = observerCallback('removeObserver');
const observerOwner = { observers: new Set() };
const observedContents = new EventEmitter();
const observerEvent = { type: 'frame', sender: observedContents };
for (let i=0;i<100;i++) {
  addObserver.call(observerOwner, observerEvent);
  addObserver.call(observerOwner, observerEvent);
  assert.equal(observedContents.listenerCount('destroyed'),1);
  removeObserver.call(observerOwner, observerEvent);
  assert.equal(observedContents.listenerCount('destroyed'),0);
}
addObserver.call(observerOwner, observerEvent);
observedContents.emit('destroyed');
assert.equal(observerOwner.observers.size,0);
assert.equal(observedContents.listenerCount('destroyed'),0);
console.log('PASS: extension observer registration/removal/destruction keep bounded listeners');

const assert = require('assert/strict');
const fs = require('fs');
const { patchSource } = require('./patch-extension-webextension-alias.cjs');
const installed = fs.readFileSync(
  require.resolve('electron-chrome-extensions/preload'),
  'utf8'
);
assert.equal(
  patchSource(installed),
  installed,
  'Installed patch must be idempotent'
);
const alias =
  /\n        \/\/ Kudium: shared WebExtension compatibility APIs v1[\s\S]*?\n        }/;
const nativeGetter =
  /\n        \/\/ Kudium: preserve native runtime lastError v2[\s\S]*?\n        }/;
const original = installed.replace(alias, '').replace(nativeGetter, '');
assert.notEqual(
  original,
  installed,
  'Fixture must remove the actual alias patch'
);
assert.equal(
  patchSource(original),
  installed,
  'Reviewed dependency layout must reproduce the installed patch'
);
assert.throws(
  () => patchSource('unreviewed dependency layout'),
  /dependency review/
);
console.log(
  'PASS: WebExtension namespace patch layout, reproduction and idempotence'
);

// Exercise the actual installed transport rather than a copy of its behavior.
const vm = require('vm');
const start = installed.indexOf('    const invokeExtension = async function');
const end = installed.indexOf('    const connectNative =', start);
const context = vm.createContext({
  import_electron2: {
    ipcRenderer: {
      invoke: async () => {
        throw new Error('Native permission denied');
      },
    },
  },
  console: {
    warn() {},
    error() {
      throw new Error('Extension payload/errors must not be logged');
    },
  },
});
vm.runInContext(
  installed.slice(start, end) + '\nglobalThis.invokeFixture = invokeExtension;',
  context
);
(async () => {
  await assert.rejects(
    context.invokeFixture('fixture', 'runtime.sendNativeMessage', {}, 'host', {
      private: 'payload',
    }),
    /Native permission denied/
  );
  console.log(
    'PASS: actual installed promise rejects native authorization failures without payload logging'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

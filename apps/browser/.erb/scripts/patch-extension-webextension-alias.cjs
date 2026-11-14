// Keep Chromium's browser namespace consistent with the reviewed Chrome adapter.
const fs = require('fs');
const path = require('path');
function patchAliases(source) {
  if (source.includes('// Kudium: shared WebExtension compatibility APIs v1'))
    return source;
  const before = `        Object.defineProperty(chrome, apiName, {
          value: api.factory(baseApi),
          enumerable: true,
          configurable: true
        });`;
  if (!source.includes(before))
    throw new Error('WebExtension namespace patch needs dependency review');
  return source.replace(
    before,
    `${before}
        // Kudium: shared WebExtension compatibility APIs v1
        const browser = globalThis.browser;
        if (browser && browser !== chrome) {
          Object.defineProperty(browser, apiName, {
            value: chrome[apiName],
            enumerable: true,
            configurable: true
          });
        }`
  );
}
function patchPromises(source) {
  source = patchAliases(source);
  if (source.includes('// Kudium: reject failed WebExtension promises v1'))
    return source;
  const before = `      } catch (e) {
        console.error(e);
        result = void 0;
      }`;
  if (!source.includes(before))
    throw new Error('WebExtension promise patch needs dependency review');
  source = source.replace(
    before,
    `      } catch (e) {
        // Kudium: reject failed WebExtension promises v1
        if (!callback) throw e;
        result = void 0;
      }`
  );
  const connect =
    '      invokeExtension(extensionId, "runtime.connectNative", {}, connectionId, application);';
  if (!source.includes(connect))
    throw new Error('Native connection promise patch needs dependency review');
  source = source.replace(
    connect,
    `      invokeExtension(extensionId, "runtime.connectNative", {}, connectionId, application).catch(() => {
        import_electron2.ipcRenderer.off(\`crx-native-msg-\${connectionId}\`, onMessage);
        import_electron2.ipcRenderer.removeAllListeners(\`crx-native-msg-\${connectionId}-disconnect\`);
        disconnect();
      });`
  );
  source = source.replace(
    '      invokeExtension(extensionId, "runtime.disconnectNative", {}, connectionId);',
    '      invokeExtension(extensionId, "runtime.disconnectNative", {}, connectionId).catch(() => {});'
  );
  return source;
}
function patchCallbacks(source) {
  source = patchPromises(source);
  if (source.includes('// Kudium: scoped callback lastError v1')) return source;
  const before = `        if (!callback) throw e;
        result = void 0;`;
  if (!source.includes(before))
    throw new Error('WebExtension callback transport needs dependency review');
  source = source.replace(
    before,
    `        if (!callback) throw e;
        callback(void 0, { message: String(e?.message || "Extension API request failed") });
        return;`
  );
  const invoke =
    '      const invokeExtension2 = (fnName, opts = {}) => (...args) => electron.invokeExtension(extensionId, fnName, opts, ...args);';
  if (!source.includes(invoke))
    throw new Error('WebExtension callback wrapper needs dependency review');
  return source.replace(
    invoke,
    `      // Kudium: scoped callback lastError v1
      const invokeExtension2 = (fnName, opts = {}) => (...args) => {
        const callback = typeof args[args.length - 1] === "function" ? args.pop() : void 0;
        if (!callback) return electron.invokeExtension(extensionId, fnName, opts, ...args);
        return electron.invokeExtension(extensionId, fnName, opts, ...args, (result, error) => {
          if (!error) return callback(result);
          const runtime = chrome.runtime;
          const previous = Object.getOwnPropertyDescriptor(runtime, "lastError");
          Object.defineProperty(runtime, "lastError", { value: error, configurable: true });
          try { callback(result); }
          finally {
            if (previous) Object.defineProperty(runtime, "lastError", previous);
            else delete runtime.lastError;
          }
        });
      };`
  );
}
function patchPortRefusals(source) {
  source = patchCallbacks(source);
  if (source.includes('// Kudium: native port refusal details v1'))
    return source;
  const before = `      invokeExtension(extensionId, "runtime.connectNative", {}, connectionId, application).catch(() => {
        import_electron2.ipcRenderer.off(\`crx-native-msg-\${connectionId}\`, onMessage);
        import_electron2.ipcRenderer.removeAllListeners(\`crx-native-msg-\${connectionId}-disconnect\`);
        disconnect();
      });`;
  const port = `        _disconnect() {
          this.disconnect();
        }`;
  const manual = `            this.onDisconnect._emit();
            this.connected = false;`;
  if (
    !source.includes(before) ||
    !source.includes(port) ||
    !source.includes(manual)
  )
    throw new Error('Native port error patch needs dependency review');
  source = source.replace(
    before,
    `      // Kudium: native port refusal details v1
      invokeExtension(extensionId, "runtime.connectNative", {}, connectionId, application).catch((error) => {
        import_electron2.ipcRenderer.off(\`crx-native-msg-\${connectionId}\`, onMessage);
        import_electron2.ipcRenderer.removeAllListeners(\`crx-native-msg-\${connectionId}-disconnect\`);
        disconnect({ message: String(error?.message || "Native connection failed") });
      });`
  );
  source = source.replace(
    port,
    `        _disconnect(error) {
          if (!this.connected) return;
          this.connected = false;
          const runtime = chrome.runtime;
          const previous = Object.getOwnPropertyDescriptor(runtime, "lastError");
          if (error) Object.defineProperty(runtime, "lastError", { value: error, configurable: true });
          try { this.onDisconnect._emit(this); }
          finally {
            if (error) {
              if (previous) Object.defineProperty(runtime, "lastError", previous);
              else delete runtime.lastError;
            }
          }
        }`
  );
  return source.replace(manual, '            this.connected = false;');
}
function patchHostDisconnects(source) {
  source = patchPortRefusals(source);
  if (source.includes('// Kudium: native host disconnect details v1'))
    return source;
  const before = `      import_electron2.ipcRenderer.once(\`crx-native-msg-\${connectionId}-disconnect\`, () => {
        import_electron2.ipcRenderer.off(\`crx-native-msg-\${connectionId}\`, onMessage);
        disconnect();
      });`;
  if (!source.includes(before))
    throw new Error('Native host disconnect patch needs dependency review');
  return source.replace(
    before,
    `      // Kudium: native host disconnect details v1
      import_electron2.ipcRenderer.once(\`crx-native-msg-\${connectionId}-disconnect\`, (_event, error) => {
        import_electron2.ipcRenderer.off(\`crx-native-msg-\${connectionId}\`, onMessage);
        disconnect(error);
      });`
  );
}
function patchNativeRuntimeGetter(source) {
  source = patchHostDisconnects(source);
  source = source.replace(
    '        }\n\n        // Kudium: shared WebExtension compatibility APIs v1',
    '        }\n        // Kudium: shared WebExtension compatibility APIs v1'
  );
  if (source.includes('// Kudium: preserve native runtime lastError v2'))
    return source;
  source = source.replace(
    `        // Kudium: preserve native runtime lastError v1
        if (apiName === "runtime") {
          const lastError = Object.getOwnPropertyDescriptor(baseApi, "lastError");
          if (lastError) Object.defineProperty(chrome.runtime, "lastError", lastError);
        }`,
    ''
  );
  const before = `        Object.defineProperty(chrome, apiName, {
          value: api.factory(baseApi),
          enumerable: true,
          configurable: true
        });`;
  if (!source.includes(before))
    throw new Error('Native runtime descriptor patch needs dependency review');
  return source.replace(
    before,
    `${before}
        // Kudium: preserve native runtime lastError v2
        if (apiName === "runtime") {
          // Chromium creates lastError only for the duration of a native callback.
          Object.defineProperty(chrome.runtime, "lastError", {
            get: () => baseApi.lastError,
            configurable: true
          });
        }`
  );
}
function patchSource(source) {
  source = patchNativeRuntimeGetter(source);
  if (source.includes('// Kudium: reject disconnected port writes v1'))
    return source;
  const before = `        postMessage(message) {
          this._send(message);
        }`;
  if (!source.includes(before))
    throw new Error('Native port write patch needs dependency review');
  return source.replace(
    before,
    `        postMessage(message) {
          // Kudium: reject disconnected port writes v1
          if (!this.connected && !this._init) throw new Error("Attempting to use a disconnected port object");
          this._send(message);
        }`
  );
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    const file = path.join(
      root,
      tree,
      'electron-chrome-extensions/dist/chrome-extension-api.preload.js'
    );
    if (fs.existsSync(file))
      fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

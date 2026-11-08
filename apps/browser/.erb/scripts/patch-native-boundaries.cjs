/* eslint-disable */
// Fail closed if the reviewed dependency layout changes. Apply to both bundles.
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// TouchBox: native authority v4')) return source;
  if (source.includes('// TouchBox: native authority v3')) {
    const esm = source.includes('import { randomUUID }');
    return (esm ? 'import * as touchboxNativeCrypto from "node:crypto";\n' : 'const touchboxNativeCrypto = require("node:crypto");\n') +
      source.replace('// TouchBox: native authority v3', '// TouchBox: native authority v4')
        .replace('const connectionId = (0, import_node_crypto.randomUUID)();', 'const connectionId = touchboxNativeCrypto.randomUUID();');
  }
  if (source.includes('// TouchBox: native authority v2')) {
    source = source.replace('// TouchBox: native authority v2', '// TouchBox: native authority v3')
      .replace('    this.ready = this.launch(application, extensionId);',
        '    const canceled = new Promise(resolve => { this.cancelLaunch = resolve; });\n    this.ready = Promise.race([this.launch(application, extensionId), canceled]);')
      .replace('    this.closed = true;\n    this.connected = false;',
        '    this.closed = true;\n    this.cancelLaunch?.();\n    this.connected = false;')
      .replace('      await host.ready;\n      if (!host.connected) throw new Error("Native host unavailable");',
        '      const timer = setTimeout(() => host.destroy(), 30000);\n      timer.unref?.();\n      try {\n        await host.ready;\n        if (!host.connected) throw new Error("Native host unavailable");\n      } catch (error) { host.destroy(); throw error; }\n      finally { clearTimeout(timer); }');
    return patchSource(source);
  }
  if (source.includes('// TouchBox: native authority v1')) {
    return patchSource(source.replace('// TouchBox: native authority v1', '// TouchBox: native authority v2').replace(
      '(frame && frame !== this.frame) ||',
      '(this.frame && (event.type !== "frame" || frame !== this.frame || event.sender !== this.sender)) ||\n          (!this.frame && (event.type !== "service-worker" || event.serviceWorker !== this.sender)) ||'
    ));
  }
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('Native authority patch needs dependency review: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  replace('    this.hostMap = {};', '    // TouchBox: native authority v1\n    this.hostMap = new Map();');
  const start = source.indexOf('    this.connectNative = async (event, connectionId, application) => {');
  const end = source.indexOf('    this.openOptionsPage = ', start);
  if (start < 0 || end < 0) throw new Error('Native runtime patch needs review');
  source = source.slice(0, start) + `    this.createNativeHost = (event, connectionId, application, keepAlive) => {
      if (typeof connectionId !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(connectionId) ||
          typeof application !== "string" || !/^[a-zA-Z0-9_]+(?:\\.[a-zA-Z0-9_]+)*$/.test(application) || application.length > 256)
        throw new Error("Invalid native connection");
      if (this.hostMap.has(connectionId) || this.hostMap.size >= 128)
        throw new Error("Native connection unavailable");
      const session = this.ctx.session;
      const extensions = session.extensions || session;
      const origin = "chrome-extension://" + event.extension.id + "/";
      const frame = event.senderFrame;
      let revoked = false;
      const current = () => {
        const extension = extensions.getExtension(event.extension.id);
        if (revoked || !extension || extension.path !== event.extension.path ||
            !extension.manifest.permissions?.includes("nativeMessaging")) return false;
        if (event.type === "frame") {
          return !event.sender.isDestroyed() && frame && !frame.isDestroyed() && frame.url.startsWith(origin);
        }
        return event.sender.scope?.startsWith(origin) &&
          session.serviceWorkers.getWorkerFromVersionID(event.sender.versionId) === event.sender;
      };
      if (!current()) throw new Error("Native sender unavailable");
      const host = new NativeMessagingHost(event.extension.id, event.sender, connectionId, application, keepAlive, current);
      this.hostMap.set(connectionId, host);
      const revoke = () => { revoked = true; host.destroy(); };
      const unloaded = (_event, extension) => { if (extension.id === event.extension.id) revoke(); };
      const navigation = (_event, details) => { if (!details?.isSameDocument) revoke(); };
      const workerStatus = (details) => {
        if (details.versionId === event.sender.versionId && details.runningStatus === "stopped") revoke();
      };
      extensions.on("extension-unloaded", unloaded);
      if (event.type === "frame") {
        event.sender.on("destroyed", revoke);
        event.sender.on("render-process-gone", revoke);
        event.sender.on("did-start-navigation", navigation);
      } else session.serviceWorkers.on("running-status-changed", workerStatus);
      host.cleanup = () => {
        revoked = true;
        this.hostMap.delete(connectionId);
        extensions.removeListener("extension-unloaded", unloaded);
        if (event.type === "frame") {
          event.sender.removeListener("destroyed", revoke);
          event.sender.removeListener("render-process-gone", revoke);
          event.sender.removeListener("did-start-navigation", navigation);
        } else session.serviceWorkers.removeListener("running-status-changed", workerStatus);
      };
      return host;
    };
    this.connectNative = async (event, connectionId, application) => {
      const host = this.createNativeHost(event, connectionId, application, true);
      await host.ready;
      if (!host.connected) throw new Error("Native host unavailable");
    };
    this.disconnectNative = (event, connectionId) => {
      const host = this.hostMap.get(connectionId);
      if (host && (host.sender !== event.sender || host.extensionId !== event.extension.id ||
          (event.type === "frame" && host.frame !== event.senderFrame)))
        throw new Error("Native connection belongs to another sender");
      host?.destroy();
    };
    this.sendNativeMessage = async (event, application, message) => {
      const connectionId = (0, import_node_crypto.randomUUID)();
      const host = this.createNativeHost(event, connectionId, application, false);
      const timer = setTimeout(() => host.destroy(), 30000);
      timer.unref?.();
      try {
        await host.ready;
        if (!host.connected) throw new Error("Native host unavailable");
        return await host.sendAndReceive(message);
      } finally { clearTimeout(timer); host.destroy(); }
    };
` + source.slice(end);
  replace('application, keepAlive = true) {', 'application, keepAlive = true, authority = () => true) {');
  replace('    this.connected = false;\n    this.receiveExtensionMessage = (_event, message) => {\n      this.send(message);\n    };', `    this.connected = false;
    this.closed = false;
    this.extensionId = extensionId;
    this.authority = authority;
    this.receiveExtensionMessage = (event, message) => {
      const frame = event.senderFrame;
      if (this.closed || !this.authority() ||
          (frame && frame !== this.frame) ||
          (event.type === "frame" && event.sender !== this.sender) ||
          (event.type === "service-worker" && event.serviceWorker !== this.sender)) return;
      this.send(message);
    };`);
  replace('      if (!this.connected) return;\n      this.incoming = Buffer.concat', '      if (!this.connected || !this.authority()) { this.destroy(); return; }\n      this.incoming = Buffer.concat');
  replace('  destroy() {\n    this.connected = false;', `  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.pending = [];
    this.incoming = Buffer.alloc(0);
    this.rejectResponse?.(new Error("Native host disconnected"));
    this.rejectResponse = void 0;
    this.cleanup?.();`);
  replace('    const config = await readNativeMessagingHostConfig(application);', '    const config = await readNativeMessagingHostConfig(application);\n    if (this.closed || !this.authority()) { this.destroy(); return; }');
  replace('    d7("launch: spawning %s for %s", config.path, extensionId);', '    if (this.closed || !this.authority()) { this.destroy(); return; }\n    d7("launch: spawning %s for %s", config.path, extensionId);');
  replace('  send(json) {\n    // Native payloads must never be logged.', '  send(json) {\n    if (this.closed || !this.authority()) { this.destroy(); return; }\n    // Native payloads must never be logged.');
  replace('      pending.push(json);', '      if (pending.length >= 16) { this.destroy(); return; }\n      pending.push(json);');
  replace(`    this.send(message);
    return new Promise((resolve) => {
      this.resolveResponse = resolve;
    });`, `    return new Promise((resolve, reject) => {
      if (this.closed || !this.authority()) { reject(new Error("Native host disconnected")); return; }
      this.resolveResponse = resolve;
      this.rejectResponse = reject;
      this.send(message);
    });`);
  // Preserve the exact initiating frame rather than only its containing WebContents.
  replace('this.hostMap.set(connectionId, host);', 'host.frame = frame;\n      this.hostMap.set(connectionId, host);');
  replace('const extEvent = event.type === "frame" ? { type: event.type, sender: event.sender, extension }', 'const extEvent = event.type === "frame" ? { type: event.type, sender: event.sender, senderFrame: event.senderFrame, extension }');
  return patchSource(source);
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of ['dist/cjs/index.js', 'dist/esm/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file)) fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

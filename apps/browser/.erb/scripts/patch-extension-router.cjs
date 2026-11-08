/* eslint-disable */
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// KudiumBrowser: extension IPC provenance v2')) return source;
  if (source.includes('// KudiumBrowser: extension IPC provenance v1')) {
    const before = '      const ses = sessionPartition === DEFAULT_SESSION ? getSessionFromEvent(event) : resolvePartition(sessionPartition);';
    if (!source.includes(before)) throw new Error('Extension remote routing needs review');
    return source.replace('// KudiumBrowser: extension IPC provenance v1', '// KudiumBrowser: extension IPC provenance v2').replace(before,
      '      const beforeResolve = globalThis[Symbol.for("kudiumbrowser.extensionRemoteAuthority")];\n      if (typeof sessionPartition !== "string" || sessionPartition.length > 256 || typeof beforeResolve !== "function" || !beforeResolve(event)) throw new Error("Untrusted remote extension sender");\n' + before);
  }
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('Extension router patch needs review: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  replace('var DEFAULT_SESSION = "_self";', `// KudiumBrowser: extension IPC provenance v1
function kudiumbrowserExtensionSender(event, extensionId) {
  if (typeof extensionId !== "string" || !/^[a-p]{32}$/.test(extensionId)) return false;
  const session = getSessionFromEvent(event);
  const extension = (session.extensions || session).getExtension(extensionId);
  if (!extension) return false;
  const prefix = "chrome-extension://" + extensionId + "/";
  if (event.type === "frame") {
    return !event.sender.isDestroyed() && event.senderFrame && !event.senderFrame.isDestroyed() && event.senderFrame.url.startsWith(prefix);
  }
  return event.type === "service-worker" && event.serviceWorker.scope?.startsWith(prefix) &&
    session.serviceWorkers.getWorkerFromVersionID(event.serviceWorker.versionId) === event.serviceWorker;
}
var DEFAULT_SESSION = "_self";`);
  replace('      d8(`received \'${handlerName}\'`, args);', '      if (!kudiumbrowserExtensionSender(event, extensionId)) throw new Error("Untrusted extension sender");\n      d8(`received \'${handlerName}\'`);');
  replace('      d8(`received remote \'${handlerName}\' for \'${sessionPartition}\'`, args);', '      d8(`received remote \'${handlerName}\'`);');
  replace('      const observer = this.sessionMap.get(ses);', `      const authority = globalThis[Symbol.for("kudiumbrowser.extensionRemoteAuthority")];
      if (typeof authority !== "function" || !authority(event, ses, handlerName)) throw new Error("Untrusted remote extension sender");
      const observer = this.sessionMap.get(ses);`);
  replace('    this.onAddListener = (event, extensionId, eventName) => {', '    this.onAddListener = (event, extensionId, eventName) => {\n      if (!kudiumbrowserExtensionSender(event, extensionId)) return;');
  replace('    this.onRemoveListener = (event, extensionId, eventName) => {', '    this.onRemoveListener = (event, extensionId, eventName) => {\n      if (!kudiumbrowserExtensionSender(event, extensionId)) return;');
  replace('    d8(`${handlerName} result: %r`, result);', '    d8(`${handlerName} completed`);');
  return patchSource(source);
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of ['dist/cjs/index.js', 'dist/esm/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file)) fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
    const preload = path.join(root, tree, 'electron-chrome-extensions/dist/chrome-extension-api.preload.js');
    if (fs.existsSync(preload)) {
      let source = fs.readFileSync(preload, 'utf8');
      source = source.replace('console.log(fnName, args);', '// Extension request payloads must not be logged.')
        .replace('console.log(fnName, "(result)", result);', '// Extension response payloads must not be logged.');
      fs.writeFileSync(preload, source);
    }
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

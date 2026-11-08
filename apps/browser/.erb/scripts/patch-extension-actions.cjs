/* eslint-disable */
// Reviewed adapter for electron-chrome-extensions 4.10.0 renderer state.
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// TouchBox: profile-scoped action state v1'))
    return source;
  function replace(before, after) {
    if (!source.includes(before))
      throw new Error(
        'Extension action patch requires dependency review: ' +
          before.slice(0, 70)
      );
    source = source.replace(before, after);
  }
  replace(
    '  const observerCounts = /* @__PURE__ */ new Map();',
    '  // TouchBox: profile-scoped action state v1\n  const observerCounts = /* @__PURE__ */ new Map();\n  const requests = new Map();\n  let requestNumber = 0;'
  );
  replace(
    '    getAction(extensionId) {\n      return actionMap.get(extensionId);\n    },',
    '    getAction(extensionId, partition) {\n      return actionMap.get(partition)?.get(extensionId);\n    },'
  );
  replace(
    '      const state = await invoke("browserAction.getState", partition);\n      for (const action of state.actions) {\n        actionMap.set(action.id, action);\n      }\n      queueMicrotask(() => internalEmitter.emit("-actions-update", state));\n      return state;',
    `      const request = ++requestNumber;
      requests.set(partition, request);
      const state = await invoke("browserAction.getState", partition);
      if (!observerCounts.has(partition) || requests.get(partition) !== request) return state;
      actionMap.set(partition, new Map(state.actions.map(action => [action.id, action])));
      const scoped = { ...state, partition };
      queueMicrotask(() => {
        if (observerCounts.has(partition) && requests.get(partition) === request)
          internalEmitter.emit("-actions-update", scoped);
      });
      return scoped;`
  );
  replace(
    '        observerCounts.delete(partition);',
    '        observerCounts.delete(partition);\n        actionMap.delete(partition);\n        requests.delete(partition);'
  );
  replace(
    '      __browserAction__.getState(partition);',
    '      __browserAction__.getState(partition).catch(() => {});'
  );
  replace(
    '        this.update = (state) => {',
    '        this.update = (state) => {\n          if (!this.isConnected || state.partition !== (this.partition || DEFAULT_PARTITION)) return;'
  );
  replace(
    '        const action = browserAction.getAction(this.id);',
    '        const action = browserAction.getAction(this.id, this.partition || DEFAULT_PARTITION);\n        if (!action) return;'
  );
  // Per-tab title/badge overrides must take precedence over extension defaults.
  replace(
    '        const info = { ...tabInfo, ...action };',
    '        const info = { ...action, ...tabInfo };'
  );
  return source;
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of [
      'dist/cjs/browser-action.js',
      'dist/esm/browser-action.mjs',
    ]) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file))
        fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
    for (const entry of ['dist/cjs/index.js', 'dist/esm/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file)) fs.writeFileSync(file, patchObserverSource(fs.readFileSync(file, 'utf8')));
    }
  }
}

function patchObserverSource(source) {
  if (source.includes('// TouchBox: bounded extension observer cleanup v1')) return source;
  const beforeAdd = `        this.observers.add(observer);
        observer.once?.("destroyed", () => {
          this.observers.delete(observer);
        });`;
  const afterAdd = `        // TouchBox: bounded extension observer cleanup v1
        if (this.observers.has(observer)) return;
        this.observers.add(observer);
        this.observerCleanup ||= new WeakMap();
        const cleanup = () => {
          this.observers.delete(observer);
          this.observerCleanup.delete(observer);
        };
        this.observerCleanup.set(observer, cleanup);
        observer.once?.("destroyed", cleanup);`;
  const beforeRemove = `        const { sender: observer } = event;
        this.observers.delete(observer);`;
  const afterRemove = `        const { sender: observer } = event;
        this.observers.delete(observer);
        const cleanup = this.observerCleanup?.get(observer);
        if (cleanup) observer.removeListener?.("destroyed", cleanup);
        this.observerCleanup?.delete(observer);`;
  if (!source.includes(beforeAdd) || !source.includes(beforeRemove))
    throw new Error('Extension observer patch requires dependency review');
  return source.replace(beforeAdd, afterAdd).replace(beforeRemove, afterRemove);
}
module.exports = { patchSource, patchInstalled, patchObserverSource };
if (require.main === module) patchInstalled();

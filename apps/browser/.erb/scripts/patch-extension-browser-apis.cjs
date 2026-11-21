const fs = require('node:fs');
const path = require('node:path');
function patchSource(source) {
  if (source.includes('// Kudium: browser APIs v1')) return source;
  const anchor = '      const apiDefinitions = {';
  if (
    !source.includes(anchor) ||
    !source.includes('              get: invokeExtension2("tabs.get"),')
  )
    throw new Error('Extension browser APIs need dependency review');
  source = source.replace(
    anchor,
    `${anchor}
        // Kudium: browser APIs v1
        tabGroups: {
          shouldInject: () => manifest.permissions?.includes("tabGroups"),
          factory: (base) => ({ ...base, TAB_GROUP_ID_NONE: -1,
            get: invokeExtension2("tabGroups.get"), query: invokeExtension2("tabGroups.query"),
            update: invokeExtension2("tabGroups.update"), move: invokeExtension2("tabGroups.move"),
            onCreated: new ExtensionEvent("tabGroups.onCreated"), onUpdated: new ExtensionEvent("tabGroups.onUpdated"),
            onRemoved: new ExtensionEvent("tabGroups.onRemoved"), onMoved: new ExtensionEvent("tabGroups.onMoved") })
        },
        debugger: {
          shouldInject: () => manifest.permissions?.includes("debugger"),
          factory: (base) => ({ ...base, attach: invokeExtension2("debugger.attach"),
            detach: invokeExtension2("debugger.detach"), getTargets: invokeExtension2("debugger.getTargets"),
            sendCommand: invokeExtension2("debugger.sendCommand"),
            onEvent: new ExtensionEvent("debugger.onEvent"), onDetach: new ExtensionEvent("debugger.onDetach") })
        },`,
  );
  return source.replace(
    '              get: invokeExtension2("tabs.get"),',
    `              get: invokeExtension2("tabs.get"),
              group: invokeExtension2("tabs.group"), ungroup: invokeExtension2("tabs.ungroup"),`,
  );
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    const file = path.join(
      root,
      tree,
      'electron-chrome-extensions/dist/chrome-extension-api.preload.js',
    );
    if (fs.existsSync(file))
      fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

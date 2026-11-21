const fs = require('node:fs');
const path = require('node:path');

function patchSource(source) {
  if (source.includes('// Kudium: extension sidePanel API v1')) return source;
  const anchor = '      const apiDefinitions = {';
  if (!source.includes(anchor))
    throw new Error('Extension sidePanel preload needs dependency review');
  return source.replace(
    anchor,
    `${anchor}
        // Kudium: extension sidePanel API v1
        sidePanel: {
          shouldInject: () => manifest.permissions?.includes("sidePanel"),
          factory: (base) => ({
            ...base,
            getOptions: invokeExtension2("sidePanel.getOptions"),
            setOptions: invokeExtension2("sidePanel.setOptions"),
            getPanelBehavior: invokeExtension2("sidePanel.getPanelBehavior"),
            setPanelBehavior: invokeExtension2("sidePanel.setPanelBehavior"),
            open: invokeExtension2("sidePanel.open"),
            close: invokeExtension2("sidePanel.close"),
            getLayout: invokeExtension2("sidePanel.getLayout"),
            onOpened: new ExtensionEvent("sidePanel.onOpened"),
            onClosed: new ExtensionEvent("sidePanel.onClosed")
          })
        },`,
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

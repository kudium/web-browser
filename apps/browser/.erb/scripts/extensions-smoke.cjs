// Optional live integration test: installs uBlock Origin Lite into disposable profiles.
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const runtime = fs.mkdtempSync(
  path.join(require('os').tmpdir(), 'touchbox-extensions-')
);
app.setPath('userData', path.join(runtime, 'user-data'));
for (const [moduleName, filename] of [
  ['electron-chrome-extensions/preload', 'chrome-extension-api.preload.js'],
  ['electron-chrome-web-store/preload', 'chrome-web-store.preload.js'],
])
  fs.copyFileSync(require.resolve(moduleName), path.join(runtime, filename));
require('esbuild').buildSync({
  entryPoints: ['src/main/extensions.ts'],
  bundle: true,
  platform: 'node',
  external: [
    'electron',
    './dialogs',
    require.resolve('electron-chrome-extensions'),
    require.resolve('electron-chrome-web-store'),
  ],
  alias: {
    'electron-chrome-extensions': require.resolve('electron-chrome-extensions'),
    'electron-chrome-web-store': require.resolve('electron-chrome-web-store'),
  },
  outfile: path.join(runtime, 'extensions.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtime, 'ui-preload.js'),
});
// Consent UI is covered separately; this optional integration verifies installation
// and extraction only in the disposable profile established above.
fs.writeFileSync(
  path.join(runtime, 'dialogs.js'),
  `exports.permissionSummary = permissions => permissions.join(', ');
exports.showBrowserDialog = async (_owner, options) => {
  if (options.title === 'Install extension' || options.message.startsWith('Remove '))
    return { response: 1 };
  throw new Error('Unexpected integration dialog: ' + options.message);
};`
);
const manager = require(path.join(runtime, 'extensions.js'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.on('window-all-closed', () => {});
app
  .whenReady()
  .then(async () => {
    const a = session.fromPartition('persist:touchbox-a'),
      b = session.fromPartition('persist:touchbox-b');
    a.serviceWorkers.on('console-message', (_event, details) =>
      console.log('WORKER', details.message)
    );
    console.log('Electron', process.versions.electron);
    const owner = new BrowserWindow({
      show: false,
      width: 1000,
      height: 800,
      webPreferences: {
        preload: path.join(runtime, 'ui-preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    await owner.loadURL(
      'data:text/html,<html><body style="margin:0">Toolbar test</body></html>'
    );
    await manager.applyExtensions(a, 'a', 'Account A', owner);
    await manager.applyExtensions(b, 'b', 'Account B', owner);
    // Exercise the real store in a WebContentsView, including its install button.
    const storeSession = session.fromPartition('persist:touchbox-store');
    await manager.applyExtensions(
      storeSession,
      'store',
      'Chrome Web Store',
      owner
    );
    manager.setExtensionInstallTarget('store', 'a');
    const store = new WebContentsView({
      webPreferences: {
        session: storeSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    manager.configureExtensionStore(store.webContents, 'store');
    owner.contentView.addChildView(store);
    store.setBounds({ x: 0, y: 0, width: 1000, height: 750 });
    owner.show();
    store.webContents.on('console-message', (event) =>
      console.log('STORE', event.message)
    );
    await store.webContents.loadURL(
      'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh'
    );
    let clicked = false;
    for (let attempt = 0; attempt < 60 && !clicked; attempt++) {
      clicked = await store.webContents.executeJavaScript(
        `(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>/Add to/i.test(b.innerText)&&!b.disabled);if(!button)return false;button.click();return true})()`,
        true
      );
      if (!clicked) await wait(500);
    }
    assert(clicked, 'Store install button did not become enabled');
    for (
      let i = 0;
      i < 120 && !a.extensions.getExtension('ddkjiahejlhfcafbddmgiahcphecmpfh');
      i++
    )
      await wait(500);
    const extension = a.extensions.getExtension(
      'ddkjiahejlhfcafbddmgiahcphecmpfh'
    );
    assert(extension, 'Real store click did not install extension');
    await wait(1000);
    assert(a.extensions.getExtension(extension.id));
    assert(!b.extensions.getExtension(extension.id));
    const items = JSON.parse(
      fs.readFileSync(
        path.join(app.getPath('userData'), 'extensions.json'),
        'utf8'
      )
    );
    assert.equal(items[0].scope, 'selected');
    assert.deepEqual(items[0].profiles, ['a']);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extension.path, 'manifest.json'), 'utf8')
    );
    assert.equal(manifest.manifest_version, 3);
    assert(manifest.permissions.includes('declarativeNetRequest'));
    const popup = new BrowserWindow({
      show: false,
      webPreferences: {
        session: a,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    manager.getExtensionProfile('a').api.addTab(popup.webContents, owner);
    await popup.loadURL(
      `chrome-extension://${extension.id}/${manifest.action.default_popup}`
    );
    assert(
      await popup.webContents.executeJavaScript(
        `typeof chrome.storage.local.get === 'function'`
      )
    );
    await popup.webContents.executeJavaScript(
      `chrome.storage.local.set({ touchboxTestProfile: 'a' })`
    );
    assert.equal(
      await popup.webContents.executeJavaScript(
        `chrome.storage.local.get('touchboxTestProfile').then(result=>result.touchboxTestProfile)`
      ),
      'a'
    );
    // Click the same toolbar element as the workspace; verify popup and placement.
    let actionPopup;
    manager
      .getExtensionProfile('a')
      .api.once('browser-action-popup-created', (popup) => {
        actionPopup = popup;
      });
    await owner.webContents.executeJavaScript(
      `(()=>{const list=document.createElement('browser-action-list');list.setAttribute('partition','persist:touchbox-a');list.setAttribute('tab','${popup.webContents.id}');list.setAttribute('alignment','bottom left');list.style.cssText='position:absolute;right:8px;top:8px';document.body.append(list);})()`
    );
    await wait(1000);
    assert(
      await owner.webContents.executeJavaScript(
        `(()=>{const list=document.querySelector('browser-action-list');const button=list.shadowRoot.querySelector('button.action');if(!button)return false;button.click();return true})()`,
        true
      ),
      'Toolbar action missing'
    );
    for (let i = 0; i < 40 && !actionPopup; i++) await wait(100);
    assert(actionPopup, 'Toolbar click did not create popup');
    await actionPopup.whenReady();
    const bounds = actionPopup.browserWindow.getBounds(),
      parentBounds = owner.getBounds();
    assert(
      bounds.x >= parentBounds.x &&
        bounds.x + bounds.width <= parentBounds.x + parentBounds.width,
      'Extension popup extends outside browser'
    );
    assert.equal(
      await actionPopup.browserWindow.webContents.executeJavaScript(
        `chrome.storage.local.get('touchboxTestProfile').then(result=>result.touchboxTestProfile)`
      ),
      'a'
    );
    actionPopup.destroy();
    // Enable globally using the same native management menu users receive.
    const entry = manager
      .extensionMenu(owner)
      .find((item) => item.label === extension.name);
    await entry.submenu
      .find((item) => item.label === 'All Sessions (including New Sessions)')
      .click();
    for (
      let attempt = 0;
      attempt < 60 && !b.extensions.getExtension(extension.id);
      attempt++
    )
      await wait(100);
    assert(b.extensions.getExtension(extension.id));
    const popupB = new BrowserWindow({
      show: false,
      webPreferences: {
        session: b,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    manager.getExtensionProfile('b').api.addTab(popupB.webContents, owner);
    await popupB.loadURL(
      `chrome-extension://${extension.id}/${manifest.action.default_popup}`
    );
    assert.equal(
      await popupB.webContents.executeJavaScript(
        `chrome.storage.local.get('touchboxTestProfile').then(result=>result.touchboxTestProfile)`
      ),
      undefined
    );
    await store.webContents.reload();
    await wait(3500);
    assert(
      await store.webContents.executeJavaScript(
        `(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>/^Remove from/i.test(b.innerText));if(!button)return false;button.click();return true})()`,
        true
      ),
      'Installed extension does not show Remove action'
    );
    for (let i = 0; i < 50 && a.extensions.getExtension(extension.id); i++)
      await wait(100);
    assert(
      !a.extensions.getExtension(extension.id),
      'Store remove failed for target app'
    );
    assert(
      b.extensions.getExtension(extension.id),
      'Store remove affected unrelated app'
    );
    console.log(
      'PASS (installation/storage only, not ad-blocking): live Web Store download, Manifest V3 toolbar popup and placement, profile-scoped installation/removal, all-app enablement and isolated extension storage'
    );
    store.webContents.close();
    BrowserWindow.getAllWindows().forEach((window) => window.destroy());
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => {
  console.error('Extension integration test timed out');
  app.exit(1);
}, 150000).unref();

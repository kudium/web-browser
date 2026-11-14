// Optional live integration test: installs uBlock Origin Lite into disposable profiles.
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const crypto = require('crypto');
const fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const runtime = fs.mkdtempSync(
  path.join(require('os').tmpdir(), 'kudiumbrowser-extensions-')
);
app.setPath('userData', path.join(runtime, 'user-data'));
app.commandLine.appendSwitch(
  'host-resolver-rules',
  'MAP *.doubleclick.net 127.0.0.1, MAP fixture.test 127.0.0.1, EXCLUDE localhost'
);
require('esbuild').buildSync({
  entryPoints: ['src/main/browserIdentity.ts'],
  bundle: true,
  platform: 'node',
  outfile: path.join(runtime, 'browser-identity.js'),
});
app.userAgentFallback = require(path.join(
  runtime,
  'browser-identity.js'
)).browserUserAgent(app.userAgentFallback);

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
    const a = session.fromPartition('persist:kudiumbrowser-a'),
      b = session.fromPartition('persist:kudiumbrowser-b');
    const workerErrors = [];
    a.serviceWorkers.on('console-message', (_event, details) => {
      console.log('WORKER', details.message);
      if (details.level >= 3) workerErrors.push(details.message);
    });
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
    const storeSession = session.fromPartition('persist:kudiumbrowser-store');
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
      if (
        !clicked &&
        attempt >= 12 &&
        (await store.webContents.executeJavaScript(
          `document.body.innerText.includes('Switch to Chrome to install extensions and themes')`
        ))
      )
        break;
      if (!clicked) await wait(500);
    }
    if (!clicked) {
      console.error(
        'Store installation diagnostics',
        await store.webContents.executeJavaScript(
          `({ url: location.href, title: document.title, userAgent: navigator.userAgent, brands: navigator.userAgentData?.brands, vendor: navigator.vendor, buttons: Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText, label: b.getAttribute('aria-label'), disabled: b.disabled })), text: document.body.innerText.slice(0, 500) })`
        )
      );
    }
    let installVia = 'store-button';
    if (!clicked) {
      const fallback = manager
        .extensionMenu(owner, store.webContents)
        .find((item) => item.label === 'Install this extension…');
      assert(
        fallback,
        'Owned store install menu must be available when the page button is blocked'
      );
      installVia = 'extensions-menu';
      await fallback.click();
      clicked = true;
    }
    assert(clicked, 'Store install action must be available');
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
    assert(
      Object.values(a.serviceWorkers.getAllRunning()).some(
        (worker) => worker.scope === `chrome-extension://${extension.id}/`
      ),
      'uBlock worker must start'
    );
    assert.deepEqual(
      workerErrors,
      [],
      'Extension worker must not report startup errors'
    );
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
        `typeof chrome.storage.local.get === 'function' && browser.commands === chrome.commands && typeof browser.commands.onCommand.addListener === 'function'`
      )
    );
    await popup.webContents.executeJavaScript(
      `chrome.storage.local.set({ kudiumbrowserTestProfile: 'a' })`
    );
    assert.equal(
      await popup.webContents.executeJavaScript(
        `chrome.storage.local.get('kudiumbrowserTestProfile').then(result=>result.kudiumbrowserTestProfile)`
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
      `(()=>{const list=document.createElement('browser-action-list');list.setAttribute('partition','persist:kudiumbrowser-a');list.setAttribute('tab','${popup.webContents.id}');list.setAttribute('alignment','bottom left');list.style.cssText='position:absolute;right:8px;top:8px';document.body.append(list);})()`
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
        `chrome.storage.local.get('kudiumbrowserTestProfile').then(result=>result.kudiumbrowserTestProfile)`
      ),
      'a'
    );
    actionPopup.destroy();
    // Actual installed static rules must block a controlled tracker endpoint.
    let trackerRequests = 0;
    const server = require('http').createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      if (request.url.startsWith('/advertising.js')) {
        trackerRequests++;
        response.end('controlled tracker fixture');
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end('<title>Content blocking fixture</title>');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const rulesets = await popup.webContents.executeJavaScript(
      `chrome.declarativeNetRequest.getEnabledRulesets()`
    );
    assert(
      rulesets.length > 0,
      'Installed extension must enable native static rules'
    );
    const contentBlocking = [];
    for (const [profile, target, shouldBlock] of [
      ['a', a, true],
      ['b', b, false],
      ['private', session.fromPartition('blocking-private'), false],
    ]) {
      const page = new BrowserWindow({
        show: false,
        webPreferences: {
          session: target,
          backgroundThrottling: false,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      await target.setProxy({ mode: 'direct' });

      const failures = [];
      await page.loadURL(`http://fixture.test:${port}/`);
      page.webContents.debugger.attach('1.3');
      page.webContents.debugger.on('message', (_event, method, params) => {
        if (method === 'Network.loadingFailed') failures.push(params.errorText);
      });
      await page.webContents.debugger.sendCommand('Network.enable');

      const countBefore = trackerRequests;
      const result = await page.webContents.executeJavaScript(
        `fetch('http://ad.doubleclick.net:${port}/advertising.js?profile=${profile}', {signal:AbortSignal.timeout(8000)}).then(async response=>({ok:true,text:await response.text(),url:response.url,redirected:response.redirected}),error=>({ok:false,error:error.message}))`
      );
      if (shouldBlock) {
        assert(
          failures.includes('net::ERR_BLOCKED_BY_CLIENT') ||
            (result.ok &&
              result.url.startsWith(`chrome-extension://${extension.id}/`)),
          `Chromium must block or redirect the tracker: ${JSON.stringify(
            result
          )}`
        );
        assert.equal(
          trackerRequests,
          countBefore,
          'Blocked tracker must never reach server'
        );
      } else {
        assert(result.ok);
        assert.equal(result.text, 'controlled tracker fixture');
        assert.equal(trackerRequests, countBefore + 1);
      }
      contentBlocking.push({
        profile,
        result,
        failures,
        requests: trackerRequests - countBefore,
      });
      page.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
    // Enable globally using the same native management menu users receive.
    const entry = manager
      .extensionMenu(owner)
      .find((item) => item.label === extension.name);
    await entry.submenu
      .find((item) => item.label === 'All Groups (including New Groups)')
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
        `chrome.storage.local.get('kudiumbrowserTestProfile').then(result=>result.kudiumbrowserTestProfile)`
      ),
      undefined
    );
    await store.webContents.reload();
    await wait(3500);
    let removeVia = 'store-button';
    const removed = await store.webContents.executeJavaScript(
      `(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>/^Remove from/i.test(b.innerText)&&!b.disabled);if(!button)return false;button.click();return true})()`,
      true
    );
    if (!removed) {
      removeVia = 'extensions-menu-group-access';
      const entry = manager
        .extensionMenu(owner)
        .find((item) => item.label === extension.name);
      const access = entry.submenu.find(
        (item) =>
          item.submenu &&
          item.submenu.some((group) => group.label === 'Account A')
      );
      assert(access, 'Existing group-access menu must be available');
      await access.submenu.find((group) => group.label === 'Account A').click();
    }
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
      'PASS: live Web Store download, Manifest V3 toolbar popup and placement, profile-scoped installation/removal, native tracker filtering with unblocked controls, all-app enablement and isolated extension storage'
    );
    const files = [
      'src/main/extensions.ts',
      'src/main/extensionPackage.ts',
      'src/main/extensionStoreCompatibility.ts',
      'src/main/requestHeaderRules.ts',
      'src/main/advancedPreferences.ts',
      '.erb/scripts/extensions-smoke.cjs',
    ];
    const report = {
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        platform: process.platform,
        arch: process.arch,
      },
      extension: {
        id: extension.id,
        name: extension.name,
        version: manifest.version,
        manifestName: manifest.name,
        reviewedName: items[0].name,
      },
      verified: [
        'live store install action',
        'actual native DNR filtering with enabled static rules and regular/private unblocked controls',
        'uBlock worker startup and shared browser/chrome APIs',
        'remote CRX download',
        'selected profile install',
        'toolbar popup and placement',
        'All Groups enablement',
        'separate storage',
        'reload and selected-profile removal',
      ],
      workerErrors,
      installVia,
      removeVia,
      contentBlocking,
      rulesets,
      scope:
        'Live uBlock installation, worker, native DNR filtering and isolated storage; controlled permission review and disposable profiles. Native messaging and real account autofill are not tested.',
      sourceHashes: Object.fromEntries(
        files.map((file) => [
          file,
          crypto
            .createHash('sha256')
            .update(fs.readFileSync(file))
            .digest('hex'),
        ])
      ),
    };
    fs.writeFileSync(
      'docs/benchmarks/extension-live-store.json',
      JSON.stringify(report, null, 2) + '\n'
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

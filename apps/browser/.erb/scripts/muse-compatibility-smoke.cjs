/* Actual Muse package/UI, isolated from the user's extensions and credentials. */
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require('./patch-native-messaging.cjs');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText,
    file,
  );
const {
  prepareExtensionPackage,
} = require('../../src/main/extensionPackage.ts');
const {
  registerSidebarPanelWindow,
  sidebarPanelsFor,
} = require('../../src/main/sidebarPanels.ts');
const {
  attachExtensionSidePanels,
} = require('../../src/main/extensionSidePanels.ts');
const {
  attachExtensionBrowserAPIs,
} = require('../../src/main/extensionBrowserAPIs.ts');
const {
  navigateExtensionPage,
} = require('../../src/main/extensionPageNavigation.ts');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-muse-compatibility-'),
);
app.setPath('userData', root);
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => {
  console.error('Muse compatibility check timed out');
  app.exit(1);
}, 60000);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    const prepared = await prepareExtensionPackage(
      'jnakhhjmpmoohbjgfccbccfoifnmbdjd',
      path.join(root, 'cache'),
      root,
      () => {},
    );
    const profile = session.fromPartition('persist:muse-compatibility');
    const errors = [];
    profile.serviceWorkers.on('console-message', (_event, details) => {
      if (details.level >= 3) errors.push(details.message);
    });
    const chrome = new BrowserWindow({
      title: 'Muse compatibility check — temporary profile',
      show: false,
      width: 1000,
      height: 700,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    registerSidebarPanelWindow(chrome);
    const host = sidebarPanelsFor(chrome);
    host.setSession(profile);
    await chrome.loadURL(
      'data:text/html,<title>Muse compatibility check — temporary profile</title>',
    );
    const openedTabs = [];
    const popupWindows = [];
    const api = new ElectronChromeExtensions({
      session: profile,
      createTab: async (details) => {
        openedTabs.push(details);
        const popup = new BrowserWindow({
          parent: chrome,
          show: false,
          width: 700,
          height: 600,
          webPreferences: {
            session: profile,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        popupWindows.push(popup);
        api.addTab(popup.webContents, popup);
        navigateExtensionPage(popup, details.url, {
          active: details.active,
          assertAccess: () => {},
          reportError: async (error) => {
            errors.push(String(error));
          },
        });
        return [popup.webContents, popup];
      },
    });
    attachExtensionSidePanels(api, 'muse-compatibility');
    attachExtensionBrowserAPIs(api);
    const extension = await profile.extensions.loadExtension(prepared.path());
    const tab = new WebContentsView({
      webPreferences: {
        session: profile,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    api.addTab(tab.webContents, chrome);
    await tab.webContents.loadURL('about:blank');
    api.selectTab(tab.webContents);
    const id = host.state().panels[0]?.id;
    assert(id, 'Muse registered a sidebar resource');
    host.activate(id);
    host.layout(id, { x: 600, y: 60, width: 360, height: 560 });
    const view = host.entries.get(id).view;
    view.webContents.on('console-message', (...args) => {
      const level = args[0].level ?? args[1],
        message = args[0].message ?? args[2];
      if (level >= 3) errors.push(message);
    });
    chrome.show();
    let text = '';
    for (let i = 0; i < 200; i++) {
      text = await view.webContents.executeJavaScript(
        'document.body.innerText',
      );
      if (/Sign in to Muse/.test(text)) break;
      await pause(100);
    }
    assert.match(
      text,
      /Sign in to Muse/,
      'Actual Muse panel renders its signed-out screen',
    );
    await profile.serviceWorkers.startWorkerForScope(
      `chrome-extension://${extension.id}/`,
    );
    assert.equal(
      await view.webContents.executeJavaScript(
        'document.querySelector("#root").childElementCount > 0',
      ),
      true,
    );
    assert.equal(errors.length, 0, `Muse runtime errors: ${errors.join('; ')}`);
    const button = await view.webContents.executeJavaScript(
      `(() => { const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Sign in'); if(!button) return null; const rect=button.getBoundingClientRect(); return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2),disabled:button.disabled}; })()`,
    );
    assert(button && !button.disabled, 'Muse sign-in button is actionable');
    view.webContents.focus();
    view.webContents.sendInputEvent({
      type: 'mouseMove',
      x: button.x,
      y: button.y,
    });
    view.webContents.sendInputEvent({
      type: 'mouseDown',
      x: button.x,
      y: button.y,
      button: 'left',
      clickCount: 1,
    });
    view.webContents.sendInputEvent({
      type: 'mouseUp',
      x: button.x,
      y: button.y,
      button: 'left',
      clickCount: 1,
    });
    for (let i = 0; i < 100 && !popupWindows[0]?.isVisible(); i++)
      await pause(50);
    assert(
      openedTabs.length > 0,
      'Native mouse click dispatches Muse sign-in to tabs.create',
    );
    assert.equal(new URL(openedTabs[0].url).hostname, 'muse.ai');
    assert(
      popupWindows[0].isVisible(),
      'Sign-in window is visible before navigation completes',
    );
    assert.equal(
      popupWindows[0].webContents.session,
      profile,
      'Authentication retains its extension profile',
    );
    let authText = '';
    for (let i = 0; i < 200; i++) {
      authText = await popupWindows[0].webContents.executeJavaScript(
        'document.body.innerText',
      );
      if (/Mobile number or email/.test(authText)) break;
      await pause(100);
    }
    assert.match(
      authText,
      /Mobile number or email/,
      'Muse authentication page renders its account input',
    );
    assert.equal(
      await view.webContents.executeJavaScript(
        'chrome.windows.getCurrent().then(window=>window.id)',
      ),
      chrome.id,
      'Panel keeps its logical owner after authentication opens',
    );
    host.undock();
    assert.match(
      await view.webContents.executeJavaScript('document.body.innerText'),
      /Sign in to Muse/,
    );
    host.dock();
    profile.extensions.removeExtension(extension.id);
    for (const popup of popupWindows) if (!popup.isDestroyed()) popup.destroy();
    tab.webContents.close();
    chrome.destroy();
    await prepared.dispose();
    await fs.promises.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    clearTimeout(timeout);
    console.log(
      `PASS Muse ${prepared.manifest.version}: real worker, rendered panel, native Sign in click, visible authentication window in its own profile, and pop-out. Authentication form loaded; completed login/chat/task execution was not tested.`,
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

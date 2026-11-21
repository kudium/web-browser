/* Real extension frames/workers and native sidebar content in disposable profiles. */
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const ts = require('typescript');
require('./patch-extension-side-panel.cjs').patchInstalled();
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
  registerSidebarPanelWindow,
  sidebarPanelsFor,
} = require('../../src/main/sidebarPanels.ts');
const {
  attachExtensionSidePanels,
} = require('../../src/main/extensionSidePanels.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-side-panel-smoke-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => {
  console.error('Side panel smoke timed out');
  app.exit(1);
}, 45000);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    for (const type of ['classic', 'module']) {
      const dir = path.join(root, type);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          manifest_version: 3,
          name: `${type} sidebar`,
          version: '1',
          permissions: ['sidePanel', 'storage'],
          action: {},
          side_panel: { default_path: 'panel.html' },
          background: {
            service_worker: 'worker.js',
            ...(type === 'module' && { type: 'module' }),
          },
        }),
      );
      fs.writeFileSync(
        path.join(dir, 'control.html'),
        '<title>Extension control</title>',
      );
      fs.writeFileSync(
        path.join(dir, 'panel.html'),
        '<title>Native extension panel</title><h1>Panel output</h1>',
      );
      fs.writeFileSync(
        path.join(dir, 'alternate.html'),
        '<title>Tab-specific panel</title>',
      );
      fs.writeFileSync(
        path.join(dir, 'worker.js'),
        `chrome.runtime.onMessage.addListener((message, sender, respond) => {
      const operation = message.command === 'options' ? chrome.sidePanel.getOptions({}) :
        message.command === 'behavior' ? chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}) :
        chrome.sidePanel.open({windowId:message.windowId});
      operation.then(value => respond({ok:true,value}), error => respond({ok:false,error:error.message}));
      return true;
    });`,
      );
      const profile = session.fromPartition(`persist:side-panel-${type}`);
      const chrome = new BrowserWindow({
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
        'data:text/html,<title>Disposable sidebar host</title>',
      );
      const api = new ElectronChromeExtensions({ session: profile });
      attachExtensionSidePanels(api, `smoke-${type}`);
      const extension = await profile.extensions.loadExtension(dir);
      const tab = new WebContentsView({
        webPreferences: {
          session: profile,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      api.addTab(tab.webContents, chrome);
      await tab.webContents.loadURL(
        `chrome-extension://${extension.id}/control.html`,
      );
      const rpc = (message) =>
        tab.webContents.executeJavaScript(
          `chrome.runtime.sendMessage(${JSON.stringify(message)})`,
        );
      let options;
      for (let i = 0; i < 100; i++) {
        try {
          options = await rpc({ command: 'options' });
          if (options?.ok) break;
        } catch {}
        await pause(30);
      }
      assert.equal(options?.ok, true, `${type} worker sidePanel API`);
      assert.equal(options.value.path, 'panel.html');
      await tab.webContents.executeJavaScript(
        `window.panelEvents=[];chrome.sidePanel.onOpened.addListener(info=>panelEvents.push({type:'opened',info}));chrome.sidePanel.onClosed.addListener(info=>panelEvents.push({type:'closed',info}));`,
      );
      await pause(20);
      const blocked = await rpc({ command: 'open', windowId: chrome.id });
      assert.equal(blocked.ok, false);
      assert.match(blocked.error, /user gesture/);
      assert.equal((await rpc({ command: 'behavior' })).ok, true);
      // Feed the same authenticated toolbar callback used by the workspace UI.
      const handler = api.ctx.router.handlers.get('browserAction.activate');
      handler.callback(
        { type: 'frame', sender: chrome.webContents },
        {
          eventType: 'click',
          extensionId: extension.id,
          tabId: tab.webContents.id,
        },
      );
      assert(host.state().activeId);
      host.layout(host.state().activeId, {
        x: 650,
        y: 100,
        width: 300,
        height: 500,
      });
      let entry = host.entries.get(host.state().activeId);
      for (let i = 0; i < 100 && entry.view.webContents.isLoading(); i++)
        await pause(20);
      assert.match(
        await entry.view.webContents.executeJavaScript(
          'document.body.textContent',
        ),
        /Panel output/,
      );
      assert.equal(entry.view.webContents.session, profile);
      const originalView = entry.view;
      await originalView.webContents.executeJavaScript('window.panelDraft = "keep this output"');
      host.undock();
      assert.equal(host.state().floating, true);
      let floating = host.floating.window;
      for (let i = 0; i < 100 && floating.webContents.isLoading(); i++) await pause(20);
      assert(floating.contentView.children.includes(originalView));
      assert(!chrome.contentView.children.includes(originalView));
      host.layout(host.state().activeId, null);
      assert.equal(await originalView.webContents.executeJavaScript('window.panelDraft'), 'keep this output');
      assert.equal(await floating.webContents.executeJavaScript('typeof require'), 'undefined');
      await floating.webContents.executeJavaScript('document.querySelector("a").click()');
      for (let i = 0; i < 100 && host.state().floating; i++) await pause(20);
      assert.equal(host.state().floating, false, 'Dock back control returns the view');
      assert(chrome.contentView.children.includes(originalView));
      host.layout(host.state().activeId, { x: 650, y: 100, width: 300, height: 500 });
      host.undock();
      floating = host.floating.window;
      floating.close();
      assert.equal(host.state().floating, false, 'Closing the floating window docks its content');
      assert.equal(entry.view, originalView);
      assert.equal(await originalView.webContents.executeJavaScript('window.panelDraft'), 'keep this output');
      assert.equal(
        await entry.view.webContents.executeJavaScript('typeof require'),
        'undefined',
      );
      assert.equal(
        await entry.view.webContents.executeJavaScript(
          'typeof chrome.sidePanel.open',
        ),
        'function',
      );
      assert(
        (await tab.webContents.executeJavaScript('panelEvents')).some(
          (event) =>
            event.type === 'opened' && event.info.windowId === chrome.id,
        ),
      );
      host.close();
      await pause(20);
      assert(
        (await tab.webContents.executeJavaScript('panelEvents')).some(
          (event) => event.type === 'closed',
        ),
      );
      handler.callback(
        { type: 'frame', sender: chrome.webContents },
        {
          eventType: 'click',
          extensionId: extension.id,
          tabId: tab.webContents.id,
        },
      );
      const tab2 = new WebContentsView({
        webPreferences: {
          session: profile,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      api.addTab(tab2.webContents, chrome);
      await tab2.webContents.loadURL(
        `chrome-extension://${extension.id}/control.html`,
      );
      await tab.webContents.executeJavaScript(
        `chrome.sidePanel.setOptions({tabId:${tab2.webContents.id},path:'alternate.html'})`,
      );
      api.selectTab(tab2.webContents);
      assert.match(
        host.state().activeId,
        new RegExp(`:${tab2.webContents.id}$`),
      );
      host.layout(host.state().activeId, {
        x: 650,
        y: 100,
        width: 300,
        height: 500,
      });
      entry = host.entries.get(host.state().activeId);
      for (let i = 0; i < 100 && entry.view.webContents.isLoading(); i++)
        await pause(20);
      assert.equal(
        await entry.view.webContents.executeJavaScript('document.title'),
        'Tab-specific panel',
      );
      await tab2.webContents.executeJavaScript(
        `chrome.sidePanel.setOptions({tabId:${tab2.webContents.id},enabled:false})`,
      );
      assert.equal(host.state().activeId, undefined);
      api.selectTab(tab.webContents);
      assert(host.state().activeId);
      host.undock();
      const profileWindow = host.floating.window;
      host.setSession(
        session.fromPartition(`persist:other-side-panel-${type}`),
      );
      assert.equal(host.state().panels.length, 0);
      assert.equal(host.state().activeId, undefined);
      assert.equal(host.state().floating, false);
      assert(profileWindow.isDestroyed(), 'Profile change removes floating extension content');
      profile.extensions.removeExtension(extension.id);
      assert.equal(host.state().panels.length, 0);
      tab.webContents.close();
      tab2.webContents.close();
      chrome.destroy();
      console.log(
        `PASS ${type}: extension API, worker calls, gesture gate, isolated content, tab scopes, profile switches and unload`,
      );
    }
    clearTimeout(timeout);
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

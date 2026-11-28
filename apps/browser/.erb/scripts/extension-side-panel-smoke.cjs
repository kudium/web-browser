/* Real extension frames/workers and native sidebar content in disposable profiles. */
const { app, BrowserWindow, WebContentsView, session } = require('electron');
require('./patch-extension-context-menus.cjs').patchInstalled();
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const ts = require('typescript');
require('./patch-extension-browser-apis.cjs').patchInstalled();
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
const {
  attachExtensionBrowserAPIs,
} = require('../../src/main/extensionBrowserAPIs.ts');
const {
  registerExtensionWorkspace,
} = require('../../src/main/extensionWorkspaceGroups.ts');
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
          permissions: ['sidePanel', 'storage', 'tabGroups', 'debugger', 'contextMenus'],
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
        `chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      await chrome.storage.local.set({menuClick:{info,tabId:tab?.id}});
      if(info.menuItemId === 'askMuse') {
        try { await chrome.sidePanel.open({windowId:tab.windowId}); await chrome.storage.local.set({menuOpened:true}); }
        catch(error) { await chrome.storage.local.set({menuError:error.message}); }
      }
    });
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      const operation = message.command === 'menus' ? (async()=>{
        await chrome.contextMenus.removeAll();
        chrome.contextMenus.create({id:'askMuse',title:'Ask Muse',contexts:['page'],visible:false});
        await chrome.contextMenus.update('askMuse',{title:'Ask Muse about this page',visible:true});
        chrome.contextMenus.create({id:'useBrowser',title:'Use this browser',type:'checkbox',checked:true,contexts:['action']});
        return true;
      })() : message.command === 'groups' ? chrome.tabGroups.query({}) :
        message.command === 'targets' ? chrome.debugger.getTargets() :
        message.command === 'options' ? chrome.sidePanel.getOptions({}) :
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
      const createdTabs = [];
      const api = new ElectronChromeExtensions({
        session: profile,
        createTab: async (details) => {
          const created = new WebContentsView({
            webPreferences: {
              session: profile,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
            },
          });
          chrome.contentView.addChildView(created);
          created.setBounds({ x: 0, y: 20, width: 600, height: 60 });
          api.addTab(created.webContents, chrome);
          void created.webContents.loadURL(details.url).catch(() => {});
          createdTabs.push(created);
          return [created.webContents, chrome];
        },
      });
      attachExtensionSidePanels(api, `smoke-${type}`);
      attachExtensionBrowserAPIs(api);
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
      let workspace = [
        {
          id: 'control',
          sessionId: 'original',
          sessionProfileId: `smoke-${type}`,
          name: 'Control',
          sessionName: 'Original',
          url: 'https://example.com',
          icon: '',
        },
      ];
      const releaseWorkspace = registerExtensionWorkspace({
        apps: () => workspace,
        contents: (id) => (id === 'control' ? tab.webContents : undefined),
        window: () => chrome,
        profile: (value) => (value === profile ? `smoke-${type}` : undefined),
        assertAccess: () => {},
        update: async (_window, changes) => {
          workspace = workspace.map((item) => ({
            ...item,
            ...changes.find((change) => change.id === item.id)?.changes,
          }));
          fs.writeFileSync(
            path.join(dir, 'workspace.json'),
            JSON.stringify(workspace),
          );
        },
      });
      await tab.webContents.loadURL(
        `chrome-extension://${extension.id}/control.html`,
      );
      const groupId = await tab.webContents.executeJavaScript(
        `chrome.tabs.group({tabIds:[${tab.webContents.id}]})`,
      );
      await tab.webContents.executeJavaScript(
        `chrome.tabGroups.update(${groupId}, {title:'Task output',color:'blue',collapsed:true})`,
      );
      assert.equal(workspace[0].sessionName, 'Task output');
      assert.equal(workspace[0].sessionProfileId, `smoke-${type}`);
      assert.notEqual(workspace[0].sessionId, 'original');
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, 'workspace.json')))[0]
          .sessionChromeColor,
        'blue',
      );
      assert.equal(
        (
          await tab.webContents.executeJavaScript(
            `chrome.tabs.get(${tab.webContents.id})`,
          )
        ).groupId,
        groupId,
      );
      assert.equal(
        (
          await tab.webContents.executeJavaScript(
            `chrome.tabGroups.get(${groupId})`,
          )
        ).title,
        'Task output',
      );
      await tab.webContents.executeJavaScript(
        `chrome.tabs.ungroup(${tab.webContents.id})`,
      );
      assert.equal(
        (await tab.webContents.executeJavaScript('chrome.tabGroups.query({})'))
          .length,
        0,
      );
      releaseWorkspace();
      const server = require('node:http').createServer((_request, response) =>
        response.end('<title>Debugger fixture</title><h1>Original</h1>'),
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const debugTab = new WebContentsView({
        webPreferences: {
          session: profile,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      api.addTab(debugTab.webContents, chrome);
      await debugTab.webContents.loadURL(
        `http://127.0.0.1:${server.address().port}/`,
      );
      await tab.webContents.executeJavaScript(
        `chrome.debugger.attach({tabId:${debugTab.webContents.id}}, '1.3')`,
      );
      const command = await tab.webContents.executeJavaScript(
        `chrome.debugger.sendCommand({tabId:${debugTab.webContents.id}}, 'Runtime.evaluate', {expression:'document.querySelector("h1").textContent="Updated by extension"'})`,
      );
      assert.equal(command.result.value, 'Updated by extension');
      assert.equal(
        await debugTab.webContents.executeJavaScript(
          'document.querySelector("h1").textContent',
        ),
        'Updated by extension',
      );
      await tab.webContents.executeJavaScript(
        `chrome.debugger.detach({tabId:${debugTab.webContents.id}})`,
      );
      assert.equal(debugTab.webContents.debugger.isAttached(), false);
      debugTab.webContents.close();
      api.selectTab(tab.webContents);
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
      assert.equal(
        (await rpc({ command: 'groups' })).ok,
        true,
        `${type} worker tabGroups API`,
      );
      assert.equal(
        (await rpc({ command: 'targets' })).ok,
        true,
        `${type} worker debugger API`,
      );
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
      let entry = host.laneFor(host.state().activeId).entries.get(host.state().activeId);
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
      await originalView.webContents.executeJavaScript(
        `window.open('http://127.0.0.1:${server.address().port}/')`,
        true,
      );
      for (let i = 0; i < 100 && !createdTabs.length; i++) await pause(20);
      assert(
        createdTabs.length,
        'An extension panel can create a tab in its existing window',
      );
      assert(chrome.contentView.children.includes(createdTabs[0]));
      assert.equal(createdTabs[0].webContents.session, profile);
      for (let i = 0; i < 100 && createdTabs[0].webContents.isLoading(); i++)
        await pause(20);
      assert.equal(
        await createdTabs[0].webContents.executeJavaScript('document.title'),
        'Debugger fixture',
      );
      createdTabs[0].webContents.close();
      api.selectTab(tab.webContents);
      server.close();
      await originalView.webContents.executeJavaScript(
        'window.panelDraft = "keep this output"',
      );
      host.undock();
      assert.equal(host.state().floating, true);
      assert.equal(
        await originalView.webContents.executeJavaScript(
          'chrome.windows.getCurrent().then(window=>window.id)',
        ),
        chrome.id,
      );
      assert(
        await originalView.webContents.executeJavaScript(
          `chrome.tabs.query({currentWindow:true}).then(tabs=>tabs.every(tab=>tab.windowId===${chrome.id} && tab.id!==${originalView.webContents.id}))`,
        ),
      );
      let floating = host.laneFor(host.state().activeId).floating.window;
      for (let i = 0; i < 100 && floating.webContents.isLoading(); i++)
        await pause(20);
      assert(floating.contentView.children.includes(originalView));
      assert(!chrome.contentView.children.includes(originalView));
      host.layout(host.state().activeId, null);
      assert.equal(
        await originalView.webContents.executeJavaScript('window.panelDraft'),
        'keep this output',
      );
      assert.equal(
        await floating.webContents.executeJavaScript('typeof require'),
        'undefined',
      );
      await floating.webContents.executeJavaScript(
        'document.querySelector("a").click()',
      );
      for (let i = 0; i < 100 && host.state().floating; i++) await pause(20);
      assert.equal(
        host.state().floating,
        false,
        'Dock back control returns the view',
      );
      assert(chrome.contentView.children.includes(originalView));
      host.layout(host.state().activeId, {
        x: 650,
        y: 100,
        width: 300,
        height: 500,
      });
      host.undock();
      floating = host.laneFor(host.state().activeId).floating.window;
      floating.close();
      assert.equal(
        host.state().floating,
        false,
        'Closing the floating window docks its content',
      );
      assert.equal(entry.view, originalView);
      assert.equal(
        await originalView.webContents.executeJavaScript('window.panelDraft'),
        'keep this output',
      );
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
      entry = host.laneFor(host.state().activeId).entries.get(host.state().activeId);
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
      const menuSetup = await tab.webContents.executeJavaScript(`chrome.runtime.sendMessage({command:'menus'})`);
      assert(menuSetup.ok, 'Worker must be able to update registered menus');
      const pageMenus=api.getContextMenuItems(tab.webContents,{pageURL:tab.webContents.getURL(),mediaType:'none',selectionText:'',isEditable:false});
      assert.equal(pageMenus[0].label,'Ask Muse about this page','Hidden Muse-style menu becomes visible after update');
      host.close();
      pageMenus[0].click(pageMenus[0]);
      let menuState;
      for(let i=0;i<80;i++) {
        menuState=await tab.webContents.executeJavaScript(`chrome.storage.local.get(['menuClick','menuOpened','menuError'])`);
        if(menuState.menuOpened || menuState.menuError)break;
        await pause(30);
      }
      assert.equal(menuState.menuClick.tabId,tab.webContents.id,'Click events point at the clicked tab');
      assert.equal(menuState.menuClick.info.menuItemId,'askMuse');
      assert.equal(menuState.menuOpened,true,menuState.menuError || 'Context-menu gesture opens the panel from the worker');
      const toolbarMenus=api.api.contextMenus.buildMenuItemsForExtension(extension.id,'browser_action');
      assert.equal(toolbarMenus[0].label,'Use this browser');assert.equal(toolbarMenus[0].checked,true);
      toolbarMenus[0].click(toolbarMenus[0]);
      for(let i=0;i<80;i++) {
        menuState=await tab.webContents.executeJavaScript(`chrome.storage.local.get('menuClick')`);
        if(menuState.menuClick?.info.menuItemId==='useBrowser')break;
        await pause(30);
      }
      assert.equal(menuState.menuClick.info.wasChecked,true);assert.equal(menuState.menuClick.info.checked,false);
      host.undock();
      const profileWindow = host.laneFor(host.state().activeId).floating.window;
      host.setSession(
        session.fromPartition(`persist:other-side-panel-${type}`),
      );
      assert.equal(host.state().panels.length, 0);
      assert.equal(host.state().activeId, undefined);
      assert.equal(host.state().floating, false);
      assert(
        profileWindow.isDestroyed(),
        'Profile change removes floating extension content',
      );
      profile.extensions.removeExtension(extension.id);
      assert.equal(host.state().panels.length, 0);
      tab.webContents.close();
      tab2.webContents.close();
      chrome.destroy();
      console.log(
        `PASS ${type}: extension API, real worker context menus and checked clicks, menu gesture gate, isolated content, tab scopes, profile switches and unload`,
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

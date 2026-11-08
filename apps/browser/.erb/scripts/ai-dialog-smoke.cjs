const { app, BrowserWindow, WebContentsView, dialog } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  assert = require('assert');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-dialog-smoke-'));
app.setPath('userData', root);
app.commandLine.appendSwitch('site-per-process');
require('esbuild').buildSync({
  entryPoints: ['src/main/ai.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'ai.cjs'),
});
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),stop:()=>ipcRenderer.invoke('ai-stop'),takeOver:()=>ipcRenderer.invoke('ai-takeover')});`
);
const decode = (result) => {
  assert(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
};
(async () => {
  await app.whenReady();
  let frameURL;
  const server = http.createServer((request, res) =>
    res.end(
      request.url === '/embedded'
        ? `<iframe src="${frameURL}"></iframe>`
        : request.url === '/before'
        ? `<button onclick="window.addEventListener('beforeunload',event=>{localStorage.unloadCount=Number(localStorage.unloadCount||0)+1;event.preventDefault();event.returnValue='';})">Arm unload</button>`
        : request.url === '/navigation'
        ? `<title>Navigation dialog fixture</title><script>window.result=confirm('Navigation fixture')</script><p>Destination loaded</p>`
        : request.url === '/frame'
        ? `<button onclick="window.result=prompt('Prompt fixture','default')">Frame prompt</button>`
        : `<iframe src="/frame"></iframe><button onclick="window.result=confirm('Confirm fixture')">Confirm</button><button onclick="window.result=[confirm('First fixture'),confirm('Second fixture')]">Repeat</button><button onclick="alert('Alert fixture');window.result='alert done'">Alert</button>`
    )
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const frameServer = http.createServer((_request, response) =>
    response.end(
      `<button onclick="window.addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue='';})">Arm frame unload</button>`
    )
  );
  await new Promise((resolve) => frameServer.listen(0, '::', resolve));
  frameURL = `http://localhost:${frameServer.address().port}/`;
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const host = new BrowserWindow({
    show: true,
    webPreferences: { preload: path.join(root, 'preload.cjs') },
  });
  const view = new WebContentsView();
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 600, height: 400 });
  await view.webContents.loadURL(url);
  const tabs = [{ id: 'first', name: 'Fixture', url, sessionId: 'fixture' }];
  const pages = new Map([['first', view.webContents]]);
  await require(path.join(root, 'ai.cjs')).initializeLocalStorage();
  const dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => tabs,
    focused: () => 'first',
    contents: (id) => pages.get(id),
    createTab: async (item) => {
      tabs.push(item);
      const child = new WebContentsView();
      host.contentView.addChildView(child);
      child.setBounds({ x: 0, y: 0, width: 600, height: 400 });
      pages.set(item.id, child.webContents);
      return child.webContents;
    },
  });
  await host.loadURL('data:text/html,Dialog test');
  const evaluate = (code) => host.webContents.executeJavaScript(code);
  await evaluate(`test.mcp('update',{enabled:true,port:${port}})`);
  const connection = (await evaluate(`test.mcp('connection')`)).mcpServers
    .kudiumbrowser;
  const client = new Client(
    { name: 'dialog-smoke', version: '1' },
    { capabilities: {} }
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers: connection.headers },
    })
  );
  dialog.showMessageBox = async (_host, options) => {
    console.log('APPROVAL', options.message);
    return { response: 1 };
  };
  const call = (name, args = {}) =>
    client.callTool({ name, arguments: { tabId: 'first', ...args } });
  const page = decode(await call('read_page'));
  const clicked = decode(
    await call('click', {
      elementId: page.elements.find((element) => element.label === 'Confirm')
        .id,
      snapshotId: page.snapshotId,
    })
  );
  console.log('CLICK', clicked);
  assert(clicked.dialog?.type === 'confirm');
  const recoverDialogs = async () =>
    decode(await client.callTool({ name: 'list_tabs', arguments: {} }));
  const recovered = (await recoverDialogs()).find((tab) => tab.id === 'first');
  assert.deepEqual(recovered.pendingDialog, clicked.dialog);

  assert((await call('read_page')).isError);
  const handled = await call('handle_dialog', {
    dialogId: recovered.pendingDialog.id,
    accept: true,
  });
  console.log('HANDLED', JSON.stringify(handled));
  decode(handled);
  assert.equal(await view.webContents.executeJavaScript('window.result'), true);
  assert(!('pendingDialog' in (await recoverDialogs())[0]));
  assert(!view.webContents.debugger.isAttached());
  const originalHandlers = view.webContents.listeners('-run-dialog');
  const clickLabel = async (label, action = 'click') => {
    const observed = decode(
      await call('find_element', { label, role: 'button' })
    );
    return decode(
      await call(action, {
        ...(action === 'click_at' ? { x: 5, y: 5 } : {}),
        elementId: observed.elementId,
        snapshotId: observed.snapshotId,
      })
    );
  };
  const dismissed = await clickLabel('Confirm');
  assert(
    (await call('handle_dialog', { dialogId: clicked.dialog.id, accept: true }))
      .isError
  );
  dialog.showMessageBox = async () => ({ response: 0 });
  assert(
    (
      await call('handle_dialog', {
        dialogId: dismissed.dialog.id,
        accept: true,
      })
    ).isError
  );
  assert(
    view.webContents.debugger.isAttached(),
    'Denied response must preserve lease'
  );
  assert.deepEqual((await recoverDialogs())[0].pendingDialog, dismissed.dialog);
  dialog.showMessageBox = async () => ({ response: 1 });
  decode(
    await call('handle_dialog', {
      dialogId: dismissed.dialog.id,
      accept: false,
    })
  );
  assert.equal(
    await view.webContents.executeJavaScript('window.result'),
    false
  );
  const alert = await clickLabel('Alert');
  assert.equal(alert.dialog.type, 'alert');
  decode(
    await call('handle_dialog', { dialogId: alert.dialog.id, accept: true })
  );
  assert.equal(
    await view.webContents.executeJavaScript('window.result'),
    'alert done'
  );
  const repeat = await clickLabel('Repeat');
  const second = decode(
    await call('handle_dialog', { dialogId: repeat.dialog.id, accept: true })
  );
  assert.equal(second.dialog.message, 'Second fixture');
  assert.deepEqual((await recoverDialogs())[0].pendingDialog, second.dialog);
  decode(
    await call('handle_dialog', { dialogId: second.dialog.id, accept: false })
  );
  assert.deepEqual(await view.webContents.executeJavaScript('window.result'), [
    true,
    false,
  ]);
  const frames = decode(await call('list_frames'));
  const frame = frames.find((item) => item.url.endsWith('/frame'));
  assert(frame, JSON.stringify(frames));
  const promptTarget = decode(
    await call('find_element', {
      frameId: frame.id,
      label: 'Frame prompt',
      role: 'button',
    })
  );
  const prompt = decode(
    await call('click', {
      frameId: frame.id,
      elementId: promptTarget.elementId,
      snapshotId: promptTarget.snapshotId,
    })
  );
  assert.equal(prompt.dialog.type, 'prompt');
  assert.equal(prompt.dialog.defaultPrompt, 'default');
  decode(
    await call('handle_dialog', {
      dialogId: prompt.dialog.id,
      accept: true,
      promptText: 'Fixture response',
    })
  );
  assert.equal(
    await view.webContents.executeJavaScript(
      'document.querySelector("iframe").contentWindow.result'
    ),
    'Fixture response'
  );
  await clickLabel('Confirm');
  if (process.argv.includes('--escape-dialog')) {
    host.focus();
    view.webContents.focus();
    view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const interrupted = (await evaluate("test.mcp('status')")).paused;
    if (!interrupted) {
      console.log(
        'LIMIT: website dialog blocks the native Escape hook; verifying trusted takeover fallback.'
      );
      await evaluate('test.takeOver()');
    }
    assert(
      (await evaluate("test.mcp('status')")).paused,
      'Trusted takeover must interrupt the owned pending dialog'
    );
    await evaluate("test.mcp('update', {enabled:true})");
    decode(await client.callTool({ name: 'list_tabs', arguments: {} }));
  } else await evaluate('test.stop()');
  for (
    let attempt = 0;
    attempt < 50 && view.webContents.debugger.isAttached();
    attempt += 1
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    !view.webContents.debugger.isAttached(),
    'Stop releases pending lease'
  );
  assert(!('pendingDialog' in (await recoverDialogs())[0]));
  assert.deepEqual(view.webContents.listeners('-run-dialog'), originalHandlers);
  decode(await call('read_page'));
  const navigation = decode(
    await call('navigate', { url: url + 'navigation' })
  );
  assert.equal(navigation.dialog.message, 'Navigation fixture');
  assert.equal(navigation.tabId, 'first');
  const loaded = decode(
    await call('handle_dialog', {
      dialogId: navigation.dialog.id,
      accept: true,
    })
  );
  assert.equal(loaded.url, url + 'navigation');
  assert.equal(loaded.title, 'Navigation dialog fixture');
  assert.equal(await view.webContents.executeJavaScript('window.result'), true);
  const reloaded = decode(await call('reload'));
  assert.equal(reloaded.dialog.message, 'Navigation fixture');
  decode(
    await call('handle_dialog', { dialogId: reloaded.dialog.id, accept: false })
  );
  assert.equal(
    await view.webContents.executeJavaScript('window.result'),
    false
  );
  const back = decode(await call('back'));
  assert.equal(back.url, url);
  const forward = decode(await call('forward'));
  assert.equal(forward.dialog.message, 'Navigation fixture');
  decode(
    await call('handle_dialog', { dialogId: forward.dialog.id, accept: true })
  );
  const stoppedLoad = decode(await call('reload'));
  assert(stoppedLoad.pending);
  await evaluate('test.stop()');
  for (
    let attempt = 0;
    attempt < 50 && view.webContents.debugger.isAttached();
    attempt += 1
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert(!view.webContents.debugger.isAttached());
  assert.deepEqual(view.webContents.listeners('-run-dialog'), originalHandlers);
  decode(await call('read_page'));
  let nativeDepartures = 0;
  view.webContents.on('will-prevent-unload', () => {
    nativeDepartures += 1;
  });
  decode(await call('navigate', { url: url + 'before' }));
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  dialog.showMessageBox = async (_host, options) => {
    assert.equal(options.message, 'Leave this page?');
    return { response: 0 };
  };
  const refusedDeparture = await call('navigate', { url });
  assert(refusedDeparture.isError, 'Leaving a guarded page needs approval');
  assert.equal(view.webContents.getURL(), url + 'before');
  assert.equal(
    await view.webContents.executeJavaScript('localStorage.unloadCount'),
    null,
    'Denied departure must not fire unload handlers'
  );
  dialog.showMessageBox = async () => ({ response: 1 });
  decode(await call('navigate', { url }));
  assert.equal(
    await view.webContents.executeJavaScript('localStorage.unloadCount'),
    '1',
    'Approved navigation must fire unload exactly once'
  );
  decode(await call('navigate', { url: url + 'before' }));
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  decode(await call('reload'));
  assert.equal(
    await view.webContents.executeJavaScript('localStorage.unloadCount'),
    '2'
  );
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  decode(await call('back'));
  assert.equal(view.webContents.getURL(), url);
  assert.equal(
    await view.webContents.executeJavaScript('localStorage.unloadCount'),
    '3'
  );
  decode(await call('forward'));
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  decode(await call('navigate', { url }));
  decode(await call('back'));
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  decode(await call('forward'));
  assert.equal(view.webContents.getURL(), url);
  assert.equal(
    await view.webContents.executeJavaScript('localStorage.unloadCount'),
    '5'
  );
  assert.equal(
    nativeDepartures,
    5,
    'Every approved departure must handle a genuine native beforeunload event once'
  );
  decode(await call('navigate', { url: url + 'before' }));
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  dialog.showMessageBox = async () => {
    view.webContents.once('will-prevent-unload', (event) =>
      event.preventDefault()
    );
    await view.webContents.loadURL(url + 'before');
    return { response: 1 };
  };
  const replacedApproval = await call('navigate', { url });
  assert(
    replacedApproval.isError &&
      replacedApproval.content[0].text.includes('changed'),
    'Same-URL replacement must invalidate departure approval'
  );
  assert.equal(view.webContents.getURL(), url + 'before');
  await view.webContents.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  let departureApproval;
  dialog.showMessageBox = (_host, options) =>
    new Promise((resolve) => {
      departureApproval = options;
      options.signal.addEventListener('abort', () => resolve({ response: 0 }), {
        once: true,
      });
    });
  const stoppedDeparture = call('navigate', { url });
  for (let attempt = 0; attempt < 50 && !departureApproval; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert(departureApproval, 'Departure approval must be active before Stop');
  await evaluate('test.stop()');
  assert((await stoppedDeparture).isError);
  assert.equal(view.webContents.getURL(), url + 'before');
  assert(!view.webContents.debugger.isAttached());
  dialog.showMessageBox = async () => ({ response: 1 });
  decode(await call('navigate', { url: url + 'embedded' }));
  const nativeFrame = view.webContents.mainFrame.framesInSubtree.find(
    (frame) => frame.url === frameURL
  );
  assert(nativeFrame, 'Embedded fixture must load');
  assert.notEqual(
    nativeFrame.processId,
    view.webContents.mainFrame.processId,
    'Unload fixture must use a separate renderer process'
  );
  await nativeFrame.executeJavaScript(
    "document.querySelector('button').click()",
    true
  );
  dialog.showMessageBox = async (_host, options) => {
    assert.equal(options.message, 'Leave this page?');
    return { response: 0 };
  };
  assert(
    (await call('navigate', { url })).isError,
    'Cross-origin frame unload handlers need departure approval'
  );
  assert.equal(view.webContents.getURL(), url + 'embedded');
  const beforeFrameDeparture = nativeDepartures;
  dialog.showMessageBox = async () => ({ response: 1 });
  decode(await call('navigate', { url }));
  assert.equal(
    nativeDepartures,
    beforeFrameDeparture + 1,
    'Approved OOP frame departure must authorize one genuine native event'
  );
  const newTab = decode(await call('new_tab', { url: url + 'navigation' }));
  assert.equal(newTab.dialog.message, 'Navigation fixture');
  assert(newTab.tabId && newTab.tabId !== 'first');
  const newLoaded = decode(
    await call('handle_dialog', {
      tabId: newTab.tabId,
      dialogId: newTab.dialog.id,
      accept: true,
    })
  );
  assert.equal(newLoaded.tabId, newTab.tabId);
  assert.equal(newLoaded.loaded, true);
  assert.equal(newLoaded.url, url + 'navigation');
  assert.equal(
    await pages.get(newTab.tabId).executeJavaScript('window.result'),
    true
  );
  assert(!pages.get(newTab.tabId).debugger.isAttached());
  await client.close();
  dispose();
  host.destroy();
  server.close();
  frameServer.close();
  console.log(
    'PASS: recoverable pending-dialog discovery, native confirm, alert, iframe prompt, sequential dialogs, denial, stale IDs, Stop, navigation/reload/history/new-tab dialogs, guarded main/OOP-frame unload and same-URL replacement refusal'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
setTimeout(() => {
  console.error('DIALOG TEST TIMEOUT');
  app.exit(1);
}, 20000);

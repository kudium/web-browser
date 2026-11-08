// Run from apps/browser: npx electron .erb/scripts/browser-windows-smoke.cjs
const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
} = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const project = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-windows-'));
app.setPath('userData', directory);
const lockMock = path.join(directory, 'locks.cjs');
fs.writeFileSync(
  lockMock,
  'exports.isGroupLocked=()=>false;exports.getGroupLocks=()=>({locked:()=>false,snapshot:()=>({protected:[]}),subscribe:()=>()=>{}});'
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 12000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, 'Window check timed out');
    await pause(30);
  }
}
let server, root, windows;
const created = [],
  pages = new Map(),
  mirrors = new Map();
let persisted = [];
const preload = path.join(directory, 'chrome.cjs');
fs.writeFileSync(
  preload,
  `const {ipcRenderer}=require('electron');ipcRenderer.on('browser-window-commit',(_,change)=>ipcRenderer.send('test-window-commit',change));ipcRenderer.on('browser-window-mirrors',(_,frames)=>ipcRenderer.send('test-window-mirrors',frames));`
);
async function makeWindow() {
  const host = new BrowserWindow({
    width: 940,
    height: 760,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload,
    },
  });
  await host.loadURL(
    'data:text/html,<body style="margin:0;background:%23f5f5f7;font:14px system-ui"><div style="height:70px;padding:20px">Kudium Browser · disposable window test</div></body>'
  );
  created.push(host);
  return host;
}
const layout = (apps, selectedId) => ({
  apps,
  focusedId: selectedId,
  visible: selectedId
    ? [{ id: selectedId, x: 0, y: 70, width: 940, height: 650 }]
    : [],
});
(async () => {
  await app.whenReady();
  await require('esbuild').build({
    entryPoints: [path.join(project, 'src/main/browserWindows.ts')],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(directory, 'windows.cjs'),
    plugins: [
      {
        name: 'disposable-lock-policy',
        setup(build) {
          build.onResolve({ filter: /^\.\/groupLocks$/ }, () => ({
            path: lockMock,
          }));
        },
      },
    ],
  });
  const { BrowserWindows } = require(path.join(directory, 'windows.cjs'));

  server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<title>Research</title><style>body{font:18px system-ui;background:#fafafa;padding:24px}input{font:inherit;width:80%}</style><h1>Research workspace</h1><input id="draft"><div style="height:6000px"></div>'
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = session.fromPartition('persist:original-login');
  await profile.cookies.set({ url: origin, name: 'signed-in', value: 'yes' });
  root = await makeWindow();
  root.show();
  root.focus();
  windows = new BrowserWindows(makeWindow);
  windows.register(root);
  persisted = ['one', 'two'].map((id) => ({
    id,
    sessionId: 'research',
    sessionProfileId: 'original-login',
    name: `Research ${id}`,
    url: `${origin}/${id}`,
    icon: '',
    pinned: true,
  }));
  for (const tab of persisted) {
    const view = new WebContentsView({
      webPreferences: {
        session: profile,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    pages.set(tab.id, view);
    root.contentView.addChildView(view);
    await view.webContents.loadURL(tab.url);
    view.setVisible(false);
  }
  windows.attach({ view: (id) => pages.get(id), state: () => undefined });
  const off = windows.subscribe(() => {
    const merged = windows.mergedLayout();
    for (const [id, view] of pages) {
      if (view.webContents.isDestroyed()) continue;
      windows.place(id, view);
      const slot = merged.visible.find((item) => item.id === id);
      view.setVisible(Boolean(slot));
      if (slot)
        view.setBounds({
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
        });
    }
  });
  ipcMain.on('test-window-commit', (event, change) => {
    assert.equal(event.sender, root.webContents);
    persisted = [
      ...persisted.filter(
        (tab) =>
          !change.remove.includes(tab.id) &&
          !change.tabs.some((item) => item.id === tab.id)
      ),
      ...change.tabs,
    ];
    windows.setLayout(
      root,
      layout(persisted, change.tabs[0]?.id || persisted[0]?.id)
    );
    windows
      .request(root, { action: 'commit-complete', token: change.token })
      .catch(console.error);
  });
  ipcMain.on('test-window-mirrors', (event, frames) => {
    mirrors.set(event.sender.id, frames);
  });
  windows.setLayout(root, layout(persisted, 'one'));
  const first = pages.get('one').webContents;
  await first.executeJavaScript(
    'document.querySelector("#draft").value="A draft that must survive";window.scrollTo(0,420);window.marker={unique:42};'
  );
  const originalId = first.id;
  let navigations = 0;
  first.on('did-start-navigation', () => {
    navigations += 1;
  });
  const detached = await windows.open(root, 'temporary', 'one');
  const detachedState = windows.snapshot(detached);
  windows.setLayout(detached, layout(detachedState.tabs, 'one'));
  await until(() => detached.contentView.children.includes(pages.get('one')));
  assert.equal(first.id, originalId);
  assert.equal(detachedState.tabs[0].sessionProfileId, 'original-login');
  assert.equal(detachedState.tabs[0].pinned, false);
  assert.equal(detachedState.tabs[0].favorite, false);
  assert.notEqual(detachedState.tabs[0].sessionId, 'research');
  assert.deepEqual(
    await first.executeJavaScript(
      '({draft:document.querySelector("#draft").value,scroll:window.scrollY,marker:window.marker.unique})'
    ),
    { draft: 'A draft that must survive', scroll: 420, marker: 42 }
  );
  assert(
    (await first.executeJavaScript('document.cookie')).includes('signed-in=yes')
  );
  await first.executeJavaScript(
    'document.cookie="updated=from-detached;path=/"'
  );
  assert(
    (
      await pages.get('two').webContents.executeJavaScript('document.cookie')
    ).includes('updated=from-detached')
  );
  const token = crypto.randomUUID();
  await windows.request(detached, {
    action: 'begin-drag',
    token,
    id: 'one',
    kind: 'tab',
  });
  await windows.request(root, { action: 'drop', token, targetId: 'two' });
  await until(
    () =>
      detached.isDestroyed() &&
      persisted.some((tab) => tab.id === 'one' && tab.sessionId === 'research')
  );
  assert.equal(first.id, originalId);
  assert.equal(
    await first.executeJavaScript('document.querySelector("#draft").value'),
    'A draft that must survive'
  );
  const grouped = await windows.open(root, 'groups', 'one');
  windows.setLayout(grouped, layout(persisted, 'one'));
  await until(() => grouped.contentView.children.includes(pages.get('one')));
  await until(() =>
    (mirrors.get(root.webContents.id) || []).some(
      (frame) => frame.id === 'one' && frame.image.startsWith('data:image/png')
    )
  );
  root.focus();
  await until(() => root.contentView.children.includes(pages.get('one')));
  assert.equal(first.id, originalId);
  assert.equal(await first.executeJavaScript('window.marker.unique'), 42);
  assert.equal(
    navigations,
    0,
    'Window handoffs must not navigate the live page'
  );
  const another = await windows.open(root, 'workspace');
  assert.equal(windows.snapshot(another).kind, 'workspace');
  grouped.close();
  another.close();
  assert(
    !first.isDestroyed(),
    'Closing secondary group windows preserves the shared page'
  );
  const dismissed = await windows.open(root, 'temporary', 'one');
  windows.setLayout(dismissed, layout(windows.snapshot(dismissed).tabs, 'one'));
  dismissed.close();
  await until(() => !persisted.some((tab) => tab.id === 'one'));
  assert.equal(windows.snapshot(root).reservedIds.length, 0);
  off();
  console.log(
    'PASS: single-tab detach, shared cookies, unsaved draft/scroll/runtime state, drag-back, whole-group windows, snapshot mirrors, focus handoff, new workspace window, safe secondary close and temporary dismissal; zero page navigations.'
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const view of pages.values())
      if (!view.webContents.isDestroyed())
        view.webContents.close({ waitForBeforeUnload: false });
    created.forEach((host) => {
      if (!host.isDestroyed()) host.destroy();
    });
    if (server) await new Promise((resolve) => server.close(resolve));
    app.exit(process.exitCode || 0);
  });

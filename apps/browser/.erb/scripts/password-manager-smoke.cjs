/* eslint-disable promise/catch-or-return */
// Disposable native vault/IPC/autofill regression. No personal profile or network.
const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-password-smoke-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/passwordManager/index.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'manager.cjs'),
});

fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('vault',request=>ipcRenderer.invoke('password-manager',request));`
);
(async () => {
  await app.whenReady();
  session.defaultSession.protocol.handle(
    'https',
    () =>
      new Response(
        '<form><input autocomplete="username"><input type="password"><button>Sign in</button></form>',
        { headers: { 'content-type': 'text/html' } }
      )
  );
  const ui = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  const page = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  const manager = require(path.join(root, 'manager.cjs'));
  manager.registerPasswordManager((contents) => contents === ui.webContents, {
    canUseOSAuthentication: async () => false,
  });
  manager.registerPasswordPage(page.webContents);
  await ui.loadURL('data:text/html,Password Manager');
  await page.loadURL('https://vault.test/login');
  const invoke = (request) =>
    ui.webContents.executeJavaScript(
      `window.vault(${JSON.stringify(request)})`
    );
  await invoke({ action: 'create', password: 'long smoke master password' });
  await invoke({
    action: 'save',
    item: {
      id: 'login',
      title: 'Test',
      origin: 'https://vault.test',
      kind: 'login',
      username: 'person',
      password: 'secret-test-value',
      fields: [],
      allowAI: true,
    },
  });
  const status = await invoke({ action: 'status' });
  assert(!JSON.stringify(status).includes('secret-test-value'));
  let untrusted = false;
  try {
    await page.webContents.executeJavaScript("window.vault({action:'status'})");
  } catch {
    untrusted = true;
  }
  assert(untrusted, 'Website IPC must be rejected');
  dialog.showMessageBox = async () => ({ response: 1 });
  const result = await invoke({
    action: 'fill',
    id: 'login',
    pageId: page.webContents.id,
  });
  assert.equal(result.filled, 2);
  assert.equal(
    await page.webContents.executeJavaScript(
      "document.querySelector('input[type=password]').value"
    ),
    'secret-test-value'
  );
  assert(!JSON.stringify(result).includes('secret-test-value'));
  await page.loadURL('https://different.test');
  await assert.rejects(manager.fillSavedItem(page.webContents, 'login'));
  await invoke({ action: 'lock' });
  await assert.rejects(manager.fillSavedItem(page.webContents, 'login'));
  ui.destroy();
  page.destroy();
  console.log(
    'Password Manager native smoke passed: serialized filling, secret-free receipts, trusted IPC, origin and lock boundaries.'
  );
  app.quit();
})()
  .catch((error) => {
    console.error(error);
    app.exit(1);
  })
  .finally(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

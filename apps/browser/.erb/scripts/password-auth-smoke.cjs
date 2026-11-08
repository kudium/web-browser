/* eslint-disable promise/catch-or-return */
// Native IPC/lifetime regression with a fake OS prompt; never authenticates the user.
const { app, BrowserWindow, powerMonitor } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-auth-smoke-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/passwordManager/index.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'manager.cjs'),
});

require('esbuild').buildSync({
  entryPoints: ['src/main/passwordManager/authentication.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'authentication.cjs'),
});

fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('vault',r=>ipcRenderer.invoke('password-manager',r));"
);
(async () => {
  await app.whenReady();
  const keeper = new BrowserWindow({ show: false });
  const keyProtection = require(path.join(root, 'authentication.cjs'));
  await keyProtection.initializeLocalStorage();
  keyProtection.writeOSCredential('native-key-storage-test');
  assert.equal(keyProtection.readOSCredential(), 'native-key-storage-test');
  assert(
    !fs
      .readFileSync(path.join(root, 'password-manager/os-key'))
      .includes(Buffer.from('native-key-storage-test'))
  );
  assert.throws(() => keyProtection.writeOSCredential('replacement-key'));

  let ui;
  const trusted = new Set();
  let credential;
  let prompts = 0;
  let cancel = false;
  const manager = require(path.join(root, 'manager.cjs'));
  await manager.initializeLocalStorage();
  manager.registerPasswordManager((c) => trusted.has(c), {
    canUseOSAuthentication: async () => true,
    usesOSAuthentication: () => !!credential,
    newOSCredential: () => 'generated-test-credential-123',
    writeOSCredential: (p) => {
      credential = p;
    },
    readOSCredential: () => credential,
    authenticateOS: async () => {
      prompts += 1;
      if (cancel) throw new Error('Cancelled');
    },
  });
  const open = async () => {
    ui = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        preload: path.join(root, 'preload.cjs'),
      },
    });
    trusted.add(ui.webContents);
    await ui.loadURL('data:text/html,Preferences');
  };
  const invoke = (r) =>
    ui.webContents.executeJavaScript(`window.vault(${JSON.stringify(r)})`);
  await open();
  await invoke({ action: 'authenticate' });
  assert.equal(prompts, 1);
  await invoke({
    action: 'save',
    item: {
      id: 'account',
      title: 'Example',
      origin: 'https://example.com',
      kind: 'login',
      username: 'person',
      password: 'local-secret',
      fields: [],
      allowAI: false,
    },
  });
  assert.equal(
    prompts,
    1,
    'Authorized preferences window should not re-prompt'
  );
  ui.destroy();
  await open();
  const beforeAdd = prompts;
  await invoke({
    action: 'save',
    scope: 'group:test',
    item: {
      id: '',
      title: 'Local profile',
      origin: '',
      kind: 'profile',
      username: '',
      password: '',
      fields: [{ name: 'email', value: 'local@example.com', secret: false }],
      allowAI: true,
    },
  });
  assert.equal(prompts, beforeAdd, 'Adding a record must not authenticate');
  assert(
    (await invoke({ action: 'status' })).locked,
    'Adding must not grant password access'
  );
  await invoke({
    action: 'save',
    item: {
      id: '',
      title: 'Global profile',
      origin: '',
      kind: 'profile',
      username: '',
      password: '',
      fields: [{ name: 'email', value: 'global@example.com', secret: false }],
      allowAI: true,
    },
  });
  const scoped = await invoke({ action: 'status', scope: 'group:test' });
  assert(scoped.items.some((item) => item.scope === 'group:test'));
  assert(!scoped.items.some((item) => item.fields || item.password));
  let status = await invoke({ action: 'status' });
  assert(status.locked);
  assert.equal(status.items.length, 2);
  assert(!JSON.stringify(status).includes('local-secret'));
  manager.withPersonalData((vault) => vault.settings(true, true, true));
  const result = manager.withPersonalData((vault) =>
    vault.search('email', 'group:test')
  );
  assert(result.some((item) => item.excerpt.includes('local@example.com')));
  assert(!JSON.stringify(result).includes('local-secret'));
  assert((await invoke({ action: 'status' })).locked);
  const publicRecord = scoped.items.find(
    (item) => item.title === 'Local profile'
  );
  const beforePublicEdit = prompts;
  const editable = await invoke({
    action: 'edit',
    id: publicRecord.id,
    scope: 'group:test',
  });
  assert.equal(editable.fields[0].value, 'local@example.com');
  await invoke({
    action: 'save',
    scope: 'group:test',
    item: { ...editable, title: 'Updated local profile' },
  });
  assert.equal(
    prompts,
    beforePublicEdit,
    'Editing basic facts must not authenticate'
  );
  assert(
    (await invoke({ action: 'status' })).locked,
    'Editing basic facts must not grant password access'
  );
  let downgradeRejected = false;
  try {
    await invoke({
      action: 'unlock',
      password: 'generated-test-credential-123',
    });
  } catch {
    downgradeRejected = true;
  }
  assert(
    downgradeRejected,
    'OS-backed vault must not downgrade to a master password request'
  );
  const item = await invoke({ action: 'reveal', id: 'account' });
  assert.equal(item.password, 'local-secret');
  assert.equal(prompts, 2);
  await invoke({ action: 'reveal', id: 'account' });
  assert.equal(prompts, 2);
  powerMonitor.emit('lock-screen');
  status = await invoke({ action: 'status' });
  assert(status.locked);
  cancel = true;
  let rejected = false;
  try {
    await invoke({ action: 'reveal', id: 'account' });
  } catch {
    rejected = true;
  }
  assert(rejected);
  assert((await invoke({ action: 'status' })).locked);
  cancel = false;
  await invoke({ action: 'reveal', id: 'account' });
  assert(!(await invoke({ action: 'status' })).locked);
  ui.destroy();
  await open();
  assert((await invoke({ action: 'status' })).locked);
  ui.destroy();
  keeper.destroy();
  console.log(
    'Password authentication smoke passed: OS setup, public list, reveal gate, window reuse/reopen, screen lock and cancelled authentication.'
  );
  app.quit();
})()
  .catch((e) => {
    console.error(e);
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));

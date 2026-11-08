/* Diagnostic: actual store dependency with cached local CRX-shaped unpacked data. */
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  crypto = require('crypto'),
  assert = require('assert/strict');
const root = path.resolve(__dirname, '../..'),
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-install-scope-'));
app.setPath('userData', temporary);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const deadline = setTimeout(() => {
  console.error('Install scope probe timed out');
  app.exit(1);
}, 30000);
app
  .whenReady()
  .then(async () => {
    const bundle = path.join(temporary, 'extensions.cjs');
    await require('esbuild').build({
      entryPoints: [path.join(root, 'src/main/extensions.ts')],
      bundle: true,
      platform: 'node',
      external: [
        'electron',
        require.resolve('electron-chrome-extensions'),
        require.resolve('electron-chrome-web-store'),
      ],
      alias: {
        'electron-chrome-extensions': require.resolve(
          'electron-chrome-extensions'
        ),
        'electron-chrome-web-store': require.resolve(
          'electron-chrome-web-store'
        ),
      },
      outfile: bundle,
      plugins: [
        {
          name: 'controlled-native-review',
          setup(build) {
            build.onLoad({ filter: /\/src\/main\/dialogs\.ts$/ }, () => ({
              contents:
                'export const showBrowserDialog=(...args)=>global.__installScopeReview(...args);',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const publicKey = crypto
      .generateKeyPairSync('rsa', { modulusLength: 1024 })
      .publicKey.export({ type: 'spki', format: 'der' });
    const id = hash(publicKey)
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    const manifest = {
      manifest_version: 3,
      name: 'Permissionless local scope fixture',
      version: '1.0.0',
      key: publicKey.toString('base64'),
    };
    const extensionPath = path.join(temporary, 'Extensions', id, '1.0.0_0');
    fs.mkdirSync(extensionPath, { recursive: true });
    fs.writeFileSync(
      path.join(extensionPath, 'manifest.json'),
      JSON.stringify(manifest)
    );
    fs.writeFileSync(
      path.join(temporary, 'extensions.json'),
      JSON.stringify([
        {
          id,
          path: extensionPath,
          name: manifest.name,
          enabled: false,
          scope: 'selected',
          profiles: ['a'],
          excluded: [],
        },
      ])
    );
    const manager = require(bundle),
      owner = new BrowserWindow({ show: false, width: 600, height: 400 });
    const a = session.fromPartition('persist:install-target-a'),
      b = session.fromPartition('persist:install-other-b'),
      storeSession = session.fromPartition('persist:install-store');
    await manager.applyExtensions(a, 'a', 'Approved Target A', owner);
    await manager.applyExtensions(b, 'b', 'Other B', owner);
    await manager.applyExtensions(
      storeSession,
      'store',
      'Chrome Web Store',
      owner
    );
    manager.setExtensionInstallTarget('store', 'a');
    const loads = [];
    for (const [profile, profileSession] of [
      ['a', a],
      ['b', b],
      ['store', storeSession],
    ])
      profileSession.extensions.on('extension-loaded', (_event, extension) => {
        if (extension.id === id) loads.push(profile);
      });
    const preload = path.join(temporary, 'invoke.cjs');
    fs.writeFileSync(
      preload,
      "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{begin:details=>ipcRenderer.invoke('chromeWebstore.beginInstall',details)});"
    );
    const view = new WebContentsView({
      webPreferences: {
        session: storeSession,
        preload,
        sandbox: true,
        contextIsolation: true,
      },
    });
    owner.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 600, height: 400 });
    const reviews = [];
    global.__installScopeReview = async (_host, options) => {
      reviews.push({ message: options.message, scopes: options.scope });
      return { response: 1 };
    };
    storeSession.protocol.handle(
      'https',
      () =>
        new Response('<title>Local store installation fixture</title>', {
          headers: { 'content-type': 'text/html' },
        })
    );
    manager.configureExtensionStore(view.webContents, 'store');
    await view.webContents.loadURL('https://chromewebstore.google.com/fixture');
    const details = {
      id,
      localizedName: manifest.name,
      manifest: JSON.stringify(manifest),
      iconUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8MhIAAAAASUVORK5CYII=',
    };
    const reply = await view.webContents.executeJavaScript(
      `window.fixture.begin(${JSON.stringify(
        details
      )}).then(result=>({result}),error=>({error:error.message}))`
    );
    // Drain the application's serialized reconciliation triggered by extension-loaded.
    for (
      let attempt = 0;
      attempt < 100 &&
      (storeSession.extensions.getExtension(id) ||
        !a.extensions.getExtension(id));
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(reply.result.result, 'success');
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].scopes[1].label, 'Approved Target A');
    assert(loads.includes('store'));
    assert(loads.includes('a'));
    assert(!loads.includes('b'));
    const report = {
      recordedAt: new Date().toISOString(),
      runtime: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      probeSha256: hash(fs.readFileSync(__filename)),
      sourceHashes: Object.fromEntries(
        ['src/main/extensions.ts', 'src/main/ipcRequestBinding.ts'].map(
          (file) => [file, hash(fs.readFileSync(path.join(root, file)))]
        )
      ),
      dependencyHashes: Object.fromEntries(
        ['electron-chrome-extensions', 'electron-chrome-web-store'].map(
          (name) => [name, hash(fs.readFileSync(require.resolve(name)))]
        )
      ),
      reply,
      reviews,
      nativeLoadOrder: loads,
      finalLoaded: {
        a: !!a.extensions.getExtension(id),
        b: !!b.extensions.getExtension(id),
        store: !!storeSession.extensions.getExtension(id),
      },
      scope:
        'Actual dependency chromeWebstore.beginInstall native IPC, controlled review approving only Target A, local cached permissionless MV3 package with generated public key. Reports native extension-loaded events; no background script execution or remote download verified.',
    };
    fs.writeFileSync(
      path.join(
        root,
        'docs/benchmarks/extension-install-scope-diagnostic.json'
      ),
      JSON.stringify(report, null, 2) + '\n'
    );
    console.log(
      'REPRODUCED: Target A approved; native store-session load preceded target-profile load.'
    );
    manager.releaseExtensionOwner(owner);
    owner.destroy();
    clearTimeout(deadline);
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

/* Actual engine/native install tests; disposable cached packages and controlled review. */
const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
} = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  crypto = require('crypto'),
  assert = require('assert/strict');
const root = path.resolve(__dirname, '../..'),
  phase = process.argv[2] || 'after',
  scenario = process.argv[3] || 'selected';
assert(['before', 'after'].includes(phase));
const nativeFailure = [
  'native identity changed',
  'navigation after native load',
  'native load failed',
  'all native failure',
].includes(scenario);
assert(!nativeFailure || phase === 'after');
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudiumbrowser-owned-install-')
);
app.setPath('userData', temporary);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const source = fs.readFileSync(
  path.join(
    root,
    phase === 'before'
      ? 'docs/benchmarks/baselines/extension-install-scope/extensions.ts.txt'
      : 'src/main/extensions.ts'
  )
);
const deadline = setTimeout(() => {
  console.error('Owned install probe timed out');
  app.exit(1);
}, 30000);
app
  .whenReady()
  .then(async () => {
    const bundle = path.join(temporary, 'extensions.cjs');
    await require('esbuild').build({
      stdin: {
        contents: source.toString(),
        loader: 'ts',
        resolveDir: path.join(root, 'src/main'),
      },
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
          name: 'controlled-review',
          setup(build) {
            build.onLoad({ filter: /\/src\/main\/dialogs\.ts$/ }, () => ({
              contents:
                'export const showBrowserDialog=(...args)=>global.__ownedReview(...args);',
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
      name: 'Permissionless owned fixture',
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
    let handlerCompletion;
    const observe =
      (handler) =>
      (...args) => {
        const pending = Promise.resolve().then(() => handler(...args));
        handlerCompletion = pending.then(
          (result) => ({ result }),
          (error) => ({ error: error.message })
        );
        return pending;
      };
    const nativeGlobalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, handler) =>
      nativeGlobalHandle(
        channel,
        channel === 'chromeWebstore.beginInstall' ? observe(handler) : handler
      );
    const manager = require(bundle),
      owner = new BrowserWindow({ show: false, width: 600, height: 400 });
    const a = session.fromPartition('persist:owned-a'),
      b = session.fromPartition('persist:owned-b'),
      storeSession = session.fromPartition('persist:owned-store');
    await manager.applyExtensions(a, 'a', 'Approved Target A', owner);
    await manager.applyExtensions(b, 'b', 'Other B', owner);
    await manager.applyExtensions(storeSession, 'store', 'Store', owner);
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
    global.__ownedReview = async (_host, options) => {
      reviews.push({
        message: options.message,
        scopes: options.scope,
        permissions: options.permissions,
      });
      if (scenario === 'target restored') {
        manager.setExtensionInstallTarget('store', 'b');
        manager.setExtensionInstallTarget('store', 'a');
      }
      if (scenario === 'callbacks refreshed') {
        await manager.applyExtensions(a, 'a', 'Approved Target A', owner);
        await manager.applyExtensions(b, 'b', 'Other B', owner);
        await manager.applyExtensions(storeSession, 'store', 'Store', owner);
      }
      if (scenario === 'navigation')
        await view.webContents.loadURL(
          'https://chromewebstore.google.com/changed'
        );
      if (scenario === 'owner restored') {
        manager.releaseExtensionOwner(owner);
        await manager.applyExtensions(a, 'a', 'Approved Target A', owner);
        await manager.applyExtensions(b, 'b', 'Other B', owner);
        await manager.applyExtensions(storeSession, 'store', 'Store', owner);
        manager.setExtensionInstallTarget('store', 'a');
      }
      const staged = fs
        .readdirSync(temporary)
        .find((name) => name.startsWith('.extension-install-'));
      const reviewedPath = staged
        ? path.join(temporary, staged)
        : extensionPath;
      if (scenario === 'package changed')
        fs.writeFileSync(
          path.join(reviewedPath, 'manifest.json'),
          JSON.stringify({ ...manifest, permissions: ['tabs'] })
        );
      if (scenario === 'file added')
        fs.writeFileSync(
          path.join(reviewedPath, 'added.js'),
          '// added after review'
        );
      if (scenario === 'source changed')
        fs.writeFileSync(
          path.join(extensionPath, 'manifest.json'),
          JSON.stringify({ ...manifest, permissions: ['tabs'] })
        );
      if (scenario === 'queued target restored')
        queueMicrotask(() => {
          manager.setExtensionInstallTarget('store', 'b');
          manager.setExtensionInstallTarget('store', 'a');
        });
      return {
        response: ['all', 'all native failure'].includes(scenario)
          ? 2
          : scenario === 'decline'
          ? 0
          : 1,
      };
    };
    storeSession.protocol.handle(
      'https',
      () =>
        new Response('<title>Owned installation fixture</title>', {
          headers: { 'content-type': 'text/html' },
        })
    );
    const nativeContentsHandle = view.webContents.ipc.handle.bind(
      view.webContents.ipc
    );
    view.webContents.ipc.handle = (channel, handler) =>
      nativeContentsHandle(
        channel,
        channel === 'chromeWebstore.beginInstall' ? observe(handler) : handler
      );
    manager.configureExtensionStore(view.webContents, 'store');
    await view.webContents.loadURL(
      scenario === 'native menu'
        ? `https://chromewebstore.google.com/detail/fixture/${id}`
        : 'https://chromewebstore.google.com/fixture'
    );
    const details = {
      id,
      localizedName: manifest.name,
      manifest: JSON.stringify(manifest),
      iconUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8MhIAAAAASUVORK5CYII=',
    };
    if (scenario === 'actual permissions')
      fs.writeFileSync(
        path.join(extensionPath, 'manifest.json'),
        JSON.stringify({ ...manifest, permissions: ['tabs'] })
      );
    const nativeLoad = a.extensions.loadExtension.bind(a.extensions);
    const siblingLoad = b.extensions.loadExtension.bind(b.extensions);
    if (scenario === 'all native failure')
      b.extensions.loadExtension = async () => {
        throw new Error('Controlled sibling load failure');
      };
    if (nativeFailure) {
      a.extensions.loadExtension = async (packagePath) => {
        if (scenario === 'native load failed')
          throw new Error('Controlled native load failure');
        if (scenario === 'native identity changed') {
          const changedKey = crypto
            .generateKeyPairSync('rsa', { modulusLength: 1024 })
            .publicKey.export({ type: 'spki', format: 'der' })
            .toString('base64');
          fs.writeFileSync(
            path.join(packagePath, 'manifest.json'),
            JSON.stringify({ ...manifest, key: changedKey })
          );
        }
        const extension = await nativeLoad(packagePath);
        if (scenario === 'navigation after native load')
          await view.webContents.loadURL(
            'https://chromewebstore.google.com/changed'
          );
        return extension;
      };
    }
    const rendererReply =
      scenario === 'native menu'
        ? manager.installStoreExtension(view.webContents, owner).then(
            (result) => ({ result }),
            (error) => ({ error: error.message })
          )
        : view.webContents
            .executeJavaScript(
              `window.fixture.begin(${JSON.stringify(
                details
              )}).then(result=>({result}),error=>({error:error.message}))`
            )
            .catch((error) => ({ error: error.message }));
    if (scenario === 'native menu') handlerCompletion = rendererReply;
    for (let attempt = 0; attempt < 100 && !handlerCompletion; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert(handlerCompletion);
    const reply = await handlerCompletion;
    if (!['navigation', 'navigation after native load'].includes(scenario))
      await rendererReply;
    const shouldSucceed =
      scenario !== 'decline' &&
      (phase === 'before' ||
        [
          'selected',
          'native menu',
          'all',
          'actual permissions',
          'source changed',
          'callbacks refreshed',
        ].includes(scenario));
    for (
      let attempt = 0;
      attempt < 100 &&
      shouldSucceed &&
      (!a.extensions.getExtension(id) ||
        (scenario !== 'all' && storeSession.extensions.getExtension(id)) ||
        (scenario === 'all' && !b.extensions.getExtension(id)));
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(reply.result?.result === 'success', shouldSucceed);
    if (!shouldSucceed)
      assert.equal(
        loads.length,
        ['navigation after native load', 'all native failure'].includes(
          scenario
        )
          ? 1
          : 0
      );
    else {
      assert(loads.includes('a'));
      assert.equal(
        loads.includes('store'),
        phase === 'before' || scenario === 'all'
      );
      assert.equal(loads.includes('b'), scenario === 'all');
    }
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].scopes[1].label, 'Approved Target A');
    if (scenario === 'actual permissions')
      assert.equal(reviews[0].permissions.includes('tabs'), phase === 'after');
    if (scenario === 'source changed')
      assert.equal(
        (a.extensions.getExtension(id).manifest.permissions || []).includes(
          'tabs'
        ),
        phase === 'before'
      );
    let retry;
    if (nativeFailure) {
      for (const target of [a, b, storeSession])
        assert.equal(
          target.extensions.getAllExtensions().length,
          0,
          'Failed install must leave no native extension'
        );
      const recovered = JSON.parse(
        fs.readFileSync(path.join(temporary, 'extensions.json'))
      );
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0].id, id);
      assert.equal(recovered[0].path, extensionPath);
      assert.equal(recovered[0].enabled, false);
      assert.deepEqual(fs.readdirSync(path.join(temporary, 'Extensions', id)), [
        '1.0.0_0',
      ]);
      a.extensions.loadExtension = nativeLoad;
      b.extensions.loadExtension = siblingLoad;
      await view.webContents.loadURL(
        'https://chromewebstore.google.com/fixture'
      );
      retry = await view.webContents.executeJavaScript(
        `window.fixture.begin(${JSON.stringify(details)})`
      );
      assert.equal(
        retry.result,
        'success',
        'Failed native load must permit a clean retry'
      );
      assert(a.extensions.getExtension(id));
      assert.equal(
        !!b.extensions.getExtension(id),
        scenario === 'all native failure'
      );
      assert.equal(
        !!storeSession.extensions.getExtension(id),
        scenario === 'all native failure'
      );
      assert.equal(reviews.length, 2);
    }
    const report = {
      phase,
      scenario,
      runtime: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      probeSha256: hash(fs.readFileSync(__filename)),
      sourceSha256: hash(source),
      currentDependencySourceHashes: Object.fromEntries(
        ['src/main/extensionPackage.ts', 'src/main/ipcRequestBinding.ts'].map(
          (file) => [file, hash(fs.readFileSync(path.join(root, file)))]
        )
      ),
      reply,
      retry,
      reviews,
      nativeLoadOrder: loads,
      finalLoaded: {
        a: !!a.extensions.getExtension(id),
        b: !!b.extensions.getExtension(id),
        store: !!storeSession.extensions.getExtension(id),
      },
      navigationListeners: view.webContents.listenerCount(
        'did-start-navigation'
      ),
      stagingDirectories: fs
        .readdirSync(temporary)
        .filter((name) => name.startsWith('.extension-install-')),
      scope:
        'Actual native beginInstall IPC and installed engines. Local cached MV3 package with controlled review/perturbations. Counts first native loads and final state. Recovery cases perturb the native loader response or navigate after an actual load, and verify cleanup followed by retry. No remote store download, hung native-ack/crash interruption or cross-platform claim.',
    };
    const output = path.join(
        root,
        nativeFailure
          ? 'docs/benchmarks/extension-install-recovery.json'
          : 'docs/benchmarks/extension-install-owned.json'
      ),
      accumulated = fs.existsSync(output)
        ? JSON.parse(fs.readFileSync(output))
        : {};
    accumulated[phase] ||= {};
    accumulated[phase][scenario] = report;
    fs.writeFileSync(output, JSON.stringify(accumulated, null, 2) + '\n');
    manager.releaseExtensionOwner(owner);
    owner.destroy();
    clearTimeout(deadline);
    fs.rmSync(temporary, { recursive: true, force: true });
    console.log(
      'PASS ' +
        phase +
        ' / ' +
        scenario +
        ': native loads ' +
        JSON.stringify(loads)
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

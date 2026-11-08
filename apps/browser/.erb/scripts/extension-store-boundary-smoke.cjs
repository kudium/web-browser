/* Native IPC fault probe. Disposable sessions, synthetic catalog; no remote store. */
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert/strict'),
  crypto = require('crypto');
const root = path.resolve(__dirname, '../..'),
  phase = process.argv[2] || 'after';
assert(['before', 'after'].includes(phase));
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'touchbox-store-boundary-')
);
app.setPath('userData', temporary);
const source = fs.readFileSync(
  path.join(
    root,
    phase === 'before'
      ? 'docs/benchmarks/baselines/extension-store-boundary/extensions.ts.txt'
      : 'src/main/extensions.ts'
  )
);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const deadline = setTimeout(() => {
  console.error('Store probe timed out');
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
      external: ['electron'],
      outfile: bundle,
      plugins: [
        {
          name: 'fixture-extension-engines-and-review',
          setup(build) {
            build.onResolve(
              { filter: /^electron-chrome-(extensions|web-store)$/ },
              (args) => ({ path: args.path, namespace: 'fixture' })
            );
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
              contents:
                args.path === 'electron-chrome-extensions'
                  ? 'export class ElectronChromeExtensions {static handleCRXProtocol(){} }'
                  : 'export const installChromeWebStore=async()=>{};export const updateExtensions=async()=>{};',
            }));
            build.onLoad({ filter: /\/src\/main\/dialogs\.ts$/ }, () => ({
              contents:
                'export const showBrowserDialog=(...args)=>global.__touchboxStoreReview(...args);',
              loader: 'js',
            }));
          },
        },
      ],
    });
    console.log('STAGE bundled');
    const manager = require(bundle),
      owner = new BrowserWindow({ show: false, width: 600, height: 400 });
    const catalog = path.join(temporary, 'extensions.json'),
      id = 'a'.repeat(32);
    const seed = () =>
      fs.writeFileSync(
        catalog,
        JSON.stringify([
          {
            id,
            path: path.join(temporary, 'missing-extension'),
            name: 'Synthetic extension',
            enabled: true,
            scope: 'all',
            profiles: [],
            excluded: [],
          },
        ])
      );
    seed();
    const a = session.fromPartition('store-test-a'),
      b = session.fromPartition('store-test-b'),
      storeSession = session.fromPartition('store-test-store');
    await manager.applyExtensions(a, 'a', 'Target A', owner);
    await manager.applyExtensions(b, 'b', 'Target B', owner);
    await manager.applyExtensions(storeSession, 'store', 'Store', owner);
    console.log('STAGE profiles');
    const preload = path.join(temporary, 'preload.cjs');
    fs.writeFileSync(
      preload,
      "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{invoke:(channel,...args)=>ipcRenderer.invoke(channel,...args)});"
    );
    // Subframe preload is fixture-only, to attack the handler through actual native IPC.
    const view = new WebContentsView({
      webPreferences: {
        session: storeSession,
        preload,
        contextIsolation: true,
        sandbox: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    owner.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 600, height: 400 });
    storeSession.protocol.handle(
      'https',
      (request) =>
        new Response(
          new URL(request.url).pathname === '/child'
            ? '<title>Child</title>'
            : '<title>Store fixture</title><iframe src="/child"></iframe>',
          { headers: { 'content-type': 'text/html' } }
        )
    );
    view.webContents.on('console-message', (event) =>
      console.log('PAGE', event.message)
    );
    let handlerCompletion;
    const nativeHandle = view.webContents.ipc.handle.bind(view.webContents.ipc);
    view.webContents.ipc.handle = (channel, handler) =>
      nativeHandle(channel, (...args) => {
        const pending = Promise.resolve().then(() => handler(...args));
        if (channel === 'chrome.management.uninstall')
          handlerCompletion = pending.then(
            (result) => ({ result }),
            (error) => ({ error: error.message })
          );
        return pending;
      });
    manager.configureExtensionStore(view.webContents, 'store');
    const load = () =>
      view.webContents.loadURL('https://chromewebstore.google.com/fixture');
    await load();
    console.log('STAGE loaded');
    const invoke = (frame, channel, args) =>
      frame.executeJavaScript(
        `window.fixture.invoke(${JSON.stringify(channel)},...${JSON.stringify(
          args
        )}).then(result=>({result}),error=>({error:error.message}))`
      );
    const results = [];
    const iframeReply = await invoke(
      view.webContents.mainFrame.frames[0],
      'chromeWebstore.getExtensionStatus',
      [id, '{"manifest_version":3}']
    );
    assert.equal(!!iframeReply.error, phase === 'after');
    if (phase === 'before') assert.equal(iframeReply.result, 'enabled');
    results.push({ name: 'same-origin child frame', ...iframeReply });
    for (const name of [
      'navigation',
      'target restored',
      'queued target restored',
      'owner restored',
      'normal',
    ]) {
      console.log('STAGE ' + name);
      seed();
      manager.setExtensionInstallTarget('store', 'a');
      await load();
      let approve, started;
      const ready = new Promise((resolve) => {
        started = resolve;
      });
      global.__touchboxStoreReview = () =>
        new Promise((resolve) => {
          approve = resolve;
          started();
        });
      const pending = invoke(
        view.webContents.mainFrame,
        'chrome.management.uninstall',
        [id]
      ).catch((error) => ({ error: error.message }));
      await ready;
      if (name === 'navigation')
        await view.webContents.loadURL(
          'https://chromewebstore.google.com/changed'
        );
      if (name === 'target restored') {
        manager.setExtensionInstallTarget('store', 'b');
        manager.setExtensionInstallTarget('store', 'a');
      }
      if (name === 'owner restored') {
        manager.releaseExtensionOwner(owner);
        await manager.applyExtensions(a, 'a', 'Target A', owner);
        await manager.applyExtensions(b, 'b', 'Target B', owner);
        await manager.applyExtensions(storeSession, 'store', 'Store', owner);
        manager.setExtensionInstallTarget('store', 'a');
      }
      approve({ response: 1 });
      if (name === 'queued target restored')
        queueMicrotask(() => {
          manager.setExtensionInstallTarget('store', 'b');
          manager.setExtensionInstallTarget('store', 'a');
        });
      const result = await handlerCompletion;
      if (name !== 'navigation') await pending;
      const changed = JSON.parse(fs.readFileSync(catalog))[0].excluded.includes(
        'a'
      );
      assert.equal(changed, phase === 'before' || name === 'normal');
      if (name === 'normal') assert.equal(result.result, 'success');
      results.push({
        name,
        ...result,
        catalogChanged: changed,
        navigationSubscriptions: view.webContents.listenerCount(
          'did-start-navigation'
        ),
      });
    }
    const output = path.join(
      root,
      'docs/benchmarks/extension-store-boundary.json'
    );
    const report = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output))
      : {};
    report[phase] = {
      sourceSha256: hash(source),
      probeSha256: hash(fs.readFileSync(__filename)),
      bindingSha256: hash(
        fs.readFileSync(path.join(root, 'src/main/ipcRequestBinding.ts'))
      ),
      results,
      scope:
        'Actual native main/child frame IPC and filesystem catalog policy mutations. HTTPS origin served by local session protocol. Extension engine/web-store initialization and native review are fixture adapters; synthetic extension is not installed. Subframe-enabled fixture preload solely exposes IPC attacks. No live store install, dependency router, signed packaging or physical input claim.',
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    manager.releaseExtensionOwner(owner);
    owner.destroy();
    clearTimeout(deadline);
    fs.rmSync(temporary, { recursive: true, force: true });
    console.log(
      'PASS ' +
        phase +
        ': native child IPC, navigation/target/queued invalidation and approved catalog removal.'
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

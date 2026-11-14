// Native frame/classic/module worker compatibility in disposable profiles.
const { app, session, BrowserWindow } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  crypto = require('crypto'),
  assert = require('assert/strict');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-extension-workers-')
);
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const before = process.argv.includes('--before');
const deadline = setTimeout(() => {
  console.error('Worker compatibility timed out');
  app.exit(1);
}, 20000);
app
  .whenReady()
  .then(async () => {
    const sourceFile = require.resolve('electron-chrome-extensions/preload');
    const source = fs.readFileSync(sourceFile, 'utf8');
    const alias =
      /        \/\/ Kudium: shared WebExtension compatibility APIs v1\n        const browser = globalThis.browser;\n        if \(browser && browser !== chrome\) \{\n          Object.defineProperty\(browser, apiName, \{\n            value: chrome\[apiName\],\n            enumerable: true,\n            configurable: true\n          \}\);\n        \}/;
    assert(alias.test(source), 'Run the reproducible namespace patch first');
    const copied = path.join(root, 'compatibility-preload.cjs');
    fs.writeFileSync(copied, before ? source.replace(alias, '') : source);
    const results = [];
    for (const type of ['classic', 'module']) {
      const dir = path.join(root, type);
      fs.mkdirSync(dir);
      const key = crypto
        .generateKeyPairSync('rsa', { modulusLength: 1024 })
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64');
      const manifest = {
        manifest_version: 3,
        name: `${type} worker`,
        version: '1',
        key,
        permissions: ['storage'],
        background: {
          service_worker: 'worker.js',
          ...(type === 'module' ? { type: 'module' } : {}),
        },
        commands: { fixture: { description: 'Fixture command' } },
      };
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(manifest)
      );
      fs.writeFileSync(path.join(dir, 'page.html'), '<title>Fixture</title>');
      fs.writeFileSync(
        path.join(dir, 'worker.js'),
        `(async () => {
      const api = globalThis.browser || globalThis.chrome;
      const result = { hasCommands: !!api.commands, shared: api.commands === chrome.commands,
        nativeStorage: typeof api.storage.local.get === 'function', commands: [] };
      if(api.commands) {
        const listener = () => {};
        api.commands.onCommand.addListener(listener);
        result.commands = await api.commands.getAll();
      }
      await chrome.storage.local.set({ workerResult: result });
    })().catch(error => console.error('FIXTURE_WORKER_ERROR '+error.message));`
      );
      for (const profile of ['a', 'b']) {
        const target = session.fromPartition(`persist:${type}-${profile}`);
        const errors = [];
        target.serviceWorkers.on('console-message', (_event, details) => {
          if (details.level >= 3) errors.push(details.message);
        });
        const api = new ElectronChromeExtensions({ session: target });
        for (const preload of target.getPreloadScripts())
          target.unregisterPreloadScript(preload.id);
        target.registerPreloadScript({ type: 'frame', filePath: copied });
        target.registerPreloadScript({
          type: 'service-worker',
          filePath: copied,
        });
        const extension = await target.extensions.loadExtension(dir);
        const owner = new BrowserWindow({
          show: false,
          webPreferences: {
            session: target,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        api.addTab(owner.webContents, owner);
        await owner.loadURL(`chrome-extension://${extension.id}/page.html`);
        let worker;
        for (let i = 0; i < 100 && !worker; i++) {
          worker = await owner.webContents.executeJavaScript(
            `chrome.storage.local.get('workerResult').then(value=>value.workerResult)`
          );
          if (!worker) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert(worker, 'Actual worker must write a result');
        assert.equal(worker.hasCommands, !before);
        if (!before) {
          assert(worker.shared && worker.nativeStorage);
          assert.deepEqual(
            worker.commands.map((command) => command.name),
            ['fixture']
          );
        }
        assert.deepEqual(errors, []);
        const frame = await owner.webContents.executeJavaScript(
          `({ hasCommands: !!browser.commands, shared: browser.commands === chrome.commands })`
        );
        assert.equal(frame.hasCommands, !before);
        if (!before) assert(frame.shared);
        assert.deepEqual(
          await owner.webContents.executeJavaScript(
            `chrome.storage.local.get('profileMarker')`
          ),
          {},
          'A fresh profile must not inherit another profile marker'
        );
        await owner.webContents.executeJavaScript(
          `chrome.storage.local.set({ profileMarker: '${profile}' })`
        );
        const other = await owner.webContents.executeJavaScript(
          `chrome.storage.local.get('profileMarker')`
        );
        assert.equal(other.profileMarker, profile);
        await owner.loadURL('data:text/html,<title>Normal website</title>');
        assert(
          await owner.webContents.executeJavaScript(
            `typeof globalThis.browser?.commands === 'undefined' && typeof globalThis.chrome?.commands === 'undefined'`
          )
        );
        results.push({ type, profile, worker, frame });
        target.extensions.removeExtension(extension.id);
        owner.destroy();
      }
    }
    const report = {
      phase: before ? 'before' : 'after',
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        arch: process.arch,
      },
      results,
      preloadSha256: crypto.createHash('sha256').update(source).digest('hex'),
      probeSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .digest('hex'),
    };
    const file = 'docs/benchmarks/extension-worker-compatibility.json';
    const reports = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : {};
    reports[report.phase] = report;
    fs.writeFileSync(file, JSON.stringify(reports, null, 2) + '\n');
    clearTimeout(deadline);
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    console.log(
      `PASS ${report.phase}: classic/module workers and frames, browser/chrome APIs, native command metadata, website containment`
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

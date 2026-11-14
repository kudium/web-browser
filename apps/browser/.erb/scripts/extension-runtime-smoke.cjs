// Compare native messaging semantics with the compatibility adapter in disposable sessions.
const { app, session, BrowserWindow } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-runtime-api-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => app.exit(1), 30000);
app
  .whenReady()
  .then(async () => {
    const results = [];
    for (const mode of ['native', 'adapter']) {
      const dir = path.join(root, mode);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          manifest_version: 3,
          name: 'Runtime messaging fixture',
          version: '1',
          permissions: ['storage'],
          background: { service_worker: 'worker.js', type: 'module' },
        })
      );
      fs.writeFileSync(
        path.join(dir, 'page.html'),
        '<title>Runtime messaging fixture</title>'
      );
      fs.writeFileSync(
        path.join(dir, 'worker.js'),
        `
      // No other context receives this startup request; runtime.sendMessage excludes its sender.
      chrome.runtime.sendMessage({command: 'getUserPremiumStatus'}).then(
        () => chrome.storage.local.set({startup: {unexpectedSuccess: true}}),
        error => chrome.storage.local.set({startup: {message: error.message, browserPresent: typeof browser !== 'undefined'}})
      );
    `
      );
      const target = session.fromPartition(`persist:runtime-${mode}`);
      const api =
        mode === 'adapter'
          ? new ElectronChromeExtensions({ session: target })
          : undefined;
      const extension = await target.extensions.loadExtension(dir);
      // Let the initial worker request finish before introducing a page context.
      for (
        let attempt = 0;
        attempt < 100 &&
        !Object.keys(target.serviceWorkers.getAllRunning()).length;
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          session: target,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      api?.addTab(window.webContents, window);
      await window.loadURL(`chrome-extension://${extension.id}/page.html`);
      let startup;
      for (let attempt = 0; attempt < 100; attempt++) {
        startup = await window.webContents.executeJavaScript(
          'chrome.storage.local.get("startup").then(result => result.startup)'
        );
        if (startup) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.match(startup?.message, /Receiving end does not exist/);
      const callback = await window.webContents
        .executeJavaScript(`new Promise(resolve => {
      chrome.runtime.sendMessage({command: 'noListener'}, () => {
        const message = chrome.runtime.lastError?.message;
        setTimeout(() => resolve({message, leaked: !!chrome.runtime.lastError}), 0);
      });
    })`);
      assert.match(callback.message, /Receiving end does not exist/);
      assert.equal(callback.leaked, false);
      const promise = await window.webContents.executeJavaScript(
        'chrome.runtime.sendMessage({command: "noListener"}).then(() => null, error => error.message)'
      );
      assert.match(promise, /Receiving end does not exist/);
      results.push({ mode, startup, callback, promise });
      target.extensions.removeExtension(extension.id);
      window.destroy();
    }
    assert.deepEqual(results[0].callback, results[1].callback);
    assert.equal(results[0].startup.message, results[1].startup.message);
    const report = {
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        arch: process.arch,
      },
      results,
      scope:
        'Minimal extension reproduces Bitwarden startup self-message behavior; native comparison has no ElectronChromeExtensions adapter. No vault operations tested.',
      probeSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .digest('hex'),
    };
    fs.writeFileSync(
      'docs/benchmarks/extension-runtime-messaging.json',
      JSON.stringify(report, null, 2) + '\n'
    );
    clearTimeout(deadline);
    fs.rmSync(root, { recursive: true, force: true });
    console.log(
      'PASS: native/adapter sender exclusion, promise rejection and scoped callback lastError'
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

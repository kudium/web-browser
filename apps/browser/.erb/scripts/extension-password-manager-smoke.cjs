// Optional live Bitwarden package/worker/popup acceptance; never logs into a vault.
const { app, session, BrowserWindow } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { downloadExtension } = require('electron-chrome-web-store');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  crypto = require('crypto'),
  assert = require('assert/strict');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-password-extension-')
);
app.setPath('userData', root);
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => {
  console.error('Password extension timed out');
  app.exit(1);
}, 90000);
app
  .whenReady()
  .then(async () => {
    const id = 'nngceckbapebfimnlniiiahkandclblb';
    const dir =
      process.argv[2] ||
      (await downloadExtension(id, path.join(root, 'packages')));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'manifest.json'))
    );
    const target = session.fromPartition('persist:bitwarden-fixture');
    const errors = [];
    target.serviceWorkers.on('console-message', (_event, details) => {
      if (details.level >= 3) errors.push(details.message);
    });
    const api = new ElectronChromeExtensions({
      session: target,
      createTab: async (details) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            session: target,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        });
        await window.loadURL(details.url || 'about:blank');
        return [window.webContents, window];
      },
    });
    const extension = await target.extensions.loadExtension(dir);
    assert.equal(extension.id, id);
    const popup = new BrowserWindow({
      show: false,
      webPreferences: {
        session: target,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    api.addTab(popup.webContents, popup);
    const popupErrors = [];
    popup.webContents.on('console-message', (event) => {
      if (event.level >= 3) popupErrors.push(event.message);
    });
    await popup.loadURL(
      `chrome-extension://${id}/${manifest.action.default_popup}`
    );
    let text = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      text = await popup.webContents.executeJavaScript(
        'document.body.innerText'
      );
      if (/log in|login|create.*account|email address/i.test(text)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(
      /log in|login|create.*account|email address/i.test(text),
      'Actual password-manager onboarding must render'
    );
    assert(
      Object.values(target.serviceWorkers.getAllRunning()).some(
        (worker) => worker.scope === `chrome-extension://${id}/`
      ),
      'Actual password-manager worker must run'
    );
    const report = {
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        arch: process.arch,
      },
      extension: {
        id,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
      },
      outcome: errors.length || popupErrors.length ? 'incomplete' : 'passed',
      workerErrors: errors,
      popupErrors,
      verified: [
        'authenticated CRX package',
        'actual background worker runs',
        'real onboarding popup',
      ],
      scope:
        'No real vault sign-in, unlock, autofill, OTP or vendor desktop pairing tested.',
      probeSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .digest('hex'),
    };
    fs.writeFileSync(
      'docs/benchmarks/extension-password-manager.json',
      JSON.stringify(report, null, 2) + '\n'
    );
    assert.deepEqual(errors, [], 'Worker must initialize without errors');
    assert.deepEqual(popupErrors, [], 'Popup must initialize without errors');
    target.extensions.removeExtension(id);
    BrowserWindow.getAllWindows().forEach((window) => window.destroy());
    clearTimeout(deadline);
    console.log('PASS: actual Bitwarden package, worker and onboarding popup');
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

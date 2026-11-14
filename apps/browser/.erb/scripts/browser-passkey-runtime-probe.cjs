// Verifies a compiled runtime exposes our API; no credential ceremony is performed.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const inputs = require('../../patches/electron/runtime-inputs.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-passkey-runtime-'));
app.setPath('userData', root);
app
  .whenReady()
  .then(() => {
    assert.equal(process.platform, 'darwin');
    assert.equal(process.versions.electron, inputs.electronVersion);
    assert.equal(process.versions.chrome, inputs.chromiumVersion);
    assert.equal(process.versions.node, inputs.nodeVersion.slice(1));
    assert.equal(Number(process.versions.modules), inputs.nodeModuleVersion);
    assert.equal(
      typeof app.isBrowserPasskeySupported,
      'function',
      'Stock Electron cannot pass the custom-runtime gate'
    );
    const supported = app.isBrowserPasskeySupported();
    assert.equal(typeof supported, 'boolean');
    const result = {
      arch: process.arch,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      modules: process.versions.modules,
      browserPasskeyApiPresent: true,
      browserPasskeyAvailable: supported,
      nativePasskeyAcceptance: 'unverified',
    };
    fs.rmSync(root, { recursive: true, force: true });
    process.stdout.write(
      'KUDIUM_RUNTIME_PROBE:' + JSON.stringify(result) + '\n',
      () => app.exit(0)
    );
  })
  .catch((error) => {
    fs.rmSync(root, { recursive: true, force: true });
    console.error(error.message);
    app.exit(1);
  });

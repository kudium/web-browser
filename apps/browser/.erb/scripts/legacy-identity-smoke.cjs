/* eslint-disable */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
if (process.versions.electron) {
  const { app, safeStorage } = require('electron');
  const [root, bundle, phase] = process.argv.slice(2);
  app.on('window-all-closed', () => {});
  app.setPath('userData', root);
  app.setName(phase === 'legacy' ? 'Electron' : 'Kudium Browser');
  const local = phase === 'legacy' ? undefined : require(bundle);
  const displayName = phase === 'legacy' ? 'Electron' : phase === 'rebrand' ? 'Kudium Preview' : 'Kudium Browser';
  app.whenReady().then(async () => {
    const file = path.join(root, 'ai-tasks.bin');
    if (phase === 'legacy') fs.writeFileSync(file, await safeStorage.encryptStringAsync('[]'));
    else {
      const storage = await local.initializeLocalStorage();
      assert.equal(app.getName(), 'Kudium Browser');
      if (phase === 'rebrand') {
        const { BrowserWindow } = require('electron');
        const window = new BrowserWindow({ show: false, title: displayName });
        assert.equal(window.getTitle(), displayName); window.destroy();
      }
      assert(storage.isEncryptionAvailable());
      assert(storage.isFileAvailable(file));
      assert.equal(storage.decryptString(fs.readFileSync(file)), '[]');
      for (const relative of ['password-manager/os-key', 'ai-settings.json', 'password-manager/vault.json']) {
        const input = path.join(root, relative);
        if (!fs.existsSync(input)) continue;
        let ciphertext = fs.readFileSync(input);
        if (relative.endsWith('.json')) {
          const value = JSON.parse(ciphertext);
          ciphertext = Buffer.from(relative === 'ai-settings.json' ? value.key : value.summary.osEncrypted, 'base64');
        }
        assert(storage.isFileAvailable(input));
        assert(storage.decryptString(ciphertext).length > 0);
      }
    }
    console.log(`Legacy identity ${phase}: passed`);
    app.exit(0);
  }).catch(error => { console.error(error.message); app.exit(1); });
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-identity-smoke-'));
  const bundle = path.join(root, 'local-storage.cjs');
  try {
    require('esbuild').buildSync({ entryPoints: [path.resolve(__dirname, '../../src/main/localStorage.ts')], bundle: true, platform: 'node', external: ['electron'], outfile: bundle });
    fs.copyFileSync(path.join(__dirname, 'legacy-storage-decrypt.cjs'), path.join(root, 'legacy-storage-decrypt.cjs'));
    const phases = ['legacy', 'current', 'restart', 'rebrand'];
    for (const phase of phases) {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(require('electron'), [__filename, root, bundle, phase], { env, encoding: 'utf8', timeout: 30000 });
      process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
      assert.equal(result.status, 0, `${phase} failed`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

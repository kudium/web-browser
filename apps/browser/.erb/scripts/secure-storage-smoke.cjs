/* eslint-disable */
// Verify Electron's real async OS encryptor, legacy migration and restart recovery.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.versions.electron) {
  const { app, safeStorage } = require('electron');
  const [root, bundle, phase] = process.argv.slice(2);
  app.setPath('userData', root);
  app.whenReady().then(async () => {
    const { LocalSecureStorage } = require(bundle);
    assert(await safeStorage.isAsyncEncryptionAvailable(), 'Secure OS storage unavailable');
    assert.notEqual(safeStorage.getSelectedStorageBackend?.(), 'basic_text');
    const file = path.join(root, 'ai-conversations.bin');
    const legacyChat = JSON.stringify({ selectedId: 'fixture', chats: [{ id: 'fixture', title: 'Synthetic legacy chat', draft: '', updatedAt: 1700000000000, history: [{ type: 'user', text: 'legacy private chat 🔐' }] }] });
    if (phase === 'write') {
      fs.writeFileSync(file, await safeStorage.encryptStringAsync(legacyChat));
    }
    const storage = new LocalSecureStorage(root, safeStorage);
    await storage.initialize();
    assert.equal(storage.decryptString(fs.readFileSync(file)), legacyChat);
    if (phase === 'write') {
      fs.writeFileSync(path.join(root, 'roundtrip.bin'), storage.encryptString('new private chat'));
    } else {
      assert.equal(storage.decryptString(fs.readFileSync(path.join(root, 'roundtrip.bin'))), 'new private chat');
    }
    storage.dispose();
    console.log(`Secure storage ${phase}: passed`);
    app.exit(0);
  }).catch((error) => { console.error(error); app.exit(1); });
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-secure-smoke-'));
  const bundle = path.join(root, 'secure-storage.cjs');
  try {
    require('esbuild').buildSync({
      entryPoints: [path.resolve(__dirname, '../../src/main/secureStorage.ts')],
      bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    });
    for (const phase of ['write', 'read']) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(require('electron'), [__filename, root, bundle, phase], {
        encoding: 'utf8', env, timeout: 30000,
      });
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      assert.equal(result.status, 0, `${phase} failed`);
      assert(!/safeStorage.*deprecated/.test(result.stderr || ''), 'Deprecated OS storage API used');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

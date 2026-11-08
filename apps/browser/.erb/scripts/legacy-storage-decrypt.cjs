/* eslint-disable */
// Development-only recovery under the app identity that created legacy OS keys.
// Only the parent IPC pipe receives decrypted values; nothing is logged or saved.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!process.send) app.exit(1);
else {
  const identity = process.argv[2];
  if (!identity || identity.length > 200) app.exit(1);
  else {
    app.setName(identity);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-legacy-decrypt-'));
    app.setPath('userData', temporary);
    const ready = app.whenReady().then(async () => {
      if (!(await safeStorage.isAsyncEncryptionAvailable()) || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
        throw new Error('Secure OS encryption is unavailable.');
    });
    process.on('message', async (request) => {
      if (!request || typeof request.id !== 'string' || typeof request.ciphertext !== 'string' || request.ciphertext.length > 180 * 1024 * 1024) return;
      try {
        await ready;
        const { result } = await safeStorage.decryptStringAsync(Buffer.from(request.ciphertext, 'base64'));
        if (process.connected) process.send({ id: request.id, result });
      } catch {
        if (process.connected) process.send({ id: request.id, error: 'Legacy OS ciphertext could not be decrypted.' });
      }
    });
    process.on('disconnect', () => {
      fs.rmSync(temporary, { recursive: true, force: true });
      app.exit(0);
    });
  }
}

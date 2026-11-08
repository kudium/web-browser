// Two fresh Electron processes share only an isolated encrypted checkpoint.
const { app, safeStorage } = require('electron');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const stage = process.argv[3];
if (!root || !['save', 'restore'].includes(stage)) throw new Error('Pass disposable directory and save/restore');
app.setPath('userData', root);
require('esbuild').buildSync({ entryPoints: ['src/main/aiCheckpoint.ts'], bundle: true, platform: 'node', outfile: path.join(root,'checkpoint.cjs') });
const { AICheckpointStore } = require(path.join(root,'checkpoint.cjs'));
app.whenReady().then(async () => {
  require('esbuild').buildSync({ entryPoints: ['src/main/secureStorage.ts'], bundle: true, platform: 'node', outfile: path.join(root, 'secure-storage.cjs') });
  const { LocalSecureStorage } = require(path.join(root, 'secure-storage.cjs'));
  const storage = new LocalSecureStorage(root, safeStorage);
  await storage.initialize();
  assert(storage.isEncryptionAvailable(), 'Native OS encryption unavailable');
  assert.notEqual(safeStorage.getSelectedStorageBackend?.(), 'basic_text');
  const filename = path.join(root,'paused.bin');
  const store = new AICheckpointStore(filename, storage);
  if (stage === 'save') {
    store.save({ messages: [{role:'user',content:'Resume disposable task'}], step: 2, endpoint:'https://example.com/v1', expires: Date.now()+60000 });
    assert(!fs.readFileSync(filename).includes(Buffer.from('Resume disposable task')));
  } else {
    const saved = store.load();
    assert.equal(saved.step,2);
    assert.equal(saved.messages[0].content,'Resume disposable task');
    store.clear(); assert.equal(store.load(),undefined);
  }
  console.log('PASS: native encrypted checkpoint '+stage+' in fresh process');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });

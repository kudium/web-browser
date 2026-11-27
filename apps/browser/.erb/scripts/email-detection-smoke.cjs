/* Real isolated-world detection against fictional webmail in a disposable session. */
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mail-detection-'));
app.setPath('userData', path.join(root, 'profile'));
require('esbuild').buildSync({ entryPoints: [path.resolve('src/main/emailBrowserDetection.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(root, 'detector.cjs') });
const { detectBrowserEmail } = require(path.join(root, 'detector.cjs'));
const timer = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(async () => {
  const profile = session.fromPartition('mail-detection-smoke');
  await profile.protocol.handle('https', request => {
    assert.equal(new URL(request.url).hostname, 'mail.google.com');
    return new Response('<html><body><button aria-label="Google Account: Atlas Studio (ops@atlas-studio.example)">Account</button><main>From sender@unrelated.example. Verification code 482913.</main><input value="private@unrelated.example"></body></html>', { headers: { 'content-type': 'text/html' } });
  });
  const win = new BrowserWindow({ show: false, width: 420, height: 760, webPreferences: { session: profile, sandbox: true, contextIsolation: true } });
  const tab = { id: 'mail', sessionId: 'studio', sessionProfileId: 'studio', name: 'Inbox', url: 'https://mail.google.com/mail/u/1/', icon: '' };
  await win.loadURL(tab.url);
  const result = await detectBrowserEmail({ tabs: () => [tab], contents: () => win.webContents }, JSON.stringify(['studio', 'default']), 'google');
  assert.deepEqual(result, { accounts: [{ address: 'ops@atlas-studio.example', tabId: 'mail', url: tab.url }] });
  console.log('Email detection smoke passed: real isolated-world probe, account address only, correct Gmail route.');
  win.destroy(); clearTimeout(timer); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });

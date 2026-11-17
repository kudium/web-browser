// Site-independent native regression for document, frame and worker identity.
const { app, BrowserWindow, session } = require('electron');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-identity-'));
const bundled = path.join(root, 'identity.cjs');
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../../src/main/browserIdentity.ts')], bundle: true, platform: 'node', outfile: bundled });
const { browserUserAgent } = require(bundled);
app.setPath('userData', root);
// Match production branding: Electron emits KudiumBrowser, without the space.
app.setName('Kudium Browser');
app.userAgentFallback = browserUserAgent(app.userAgentFallback);
app.on('will-quit', () => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const requests = [];
const server = http.createServer((request, response) => {
  requests.push({ url: request.url, ua: request.headers['user-agent'] });
  response.setHeader('Content-Type', 'text/html');
  if (request.url === '/') response.end(`<iframe src="http://localhost:${server.address().port}/frame"></iframe>`);
  else if (request.url === '/frame') response.end('<script>fetch("/frame-fetch");new Worker("/worker.js").onmessage = event => { window.workerIdentity = event.data; document.title = "complete"; };</script>');
  else if (request.url === '/worker.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end('fetch("/worker-fetch").then(() => postMessage(navigator.userAgent))');
  }
  else response.end('OK');
});
(async () => {
  await new Promise(resolve => server.listen(0, resolve));
  await app.whenReady();
  const profile = session.fromPartition('persist:identity-fixture');
  const window = new BrowserWindow({ show: false, webPreferences: { session: profile, sandbox: true } });
  const ua = browserUserAgent(window.webContents.getUserAgent());
  profile.setUserAgent(ua);
  window.webContents.setUserAgent(ua);
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const deadline = Date.now() + 10000;
  while (!requests.some(request => request.url === '/worker-fetch') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert(requests.some(request => request.url === '/worker-fetch'), 'Cross-site worker must issue its fetch');
  for (const request of requests) assert.strictEqual(request.ua, ua, `${request.url} used a different identity`);
  assert(!/Electron|touch-?box|kudium/i.test(ua), 'Remove normalized production branding');
  assert(ua.includes(`Chrome/${process.versions.chrome}`), 'Keep the real Chromium version');
  assert.strictEqual(await window.webContents.executeJavaScript('navigator.userAgent'), ua);
  const frame = window.webContents.mainFrame.frames.find(item => item.url.includes('/frame'));
  assert(frame, 'Cross-site frame exists');
  assert.strictEqual(await frame.executeJavaScript('navigator.userAgent'), ua);
  const workerIdentity = await frame.executeJavaScript(`new Promise(resolve => {
    if (window.workerIdentity) return resolve(window.workerIdentity);
    const timer = setInterval(() => {
      if (window.workerIdentity) { clearInterval(timer); resolve(window.workerIdentity); }
    }, 25);
    setTimeout(() => { clearInterval(timer); resolve(null); }, 5000);
  })`);
  assert.strictEqual(workerIdentity, ua, 'Worker JavaScript identity matches requests');
  // A new private session with no per-tab override must use the global fallback.
  const privateWindow = new BrowserWindow({ show: false, webPreferences: { partition: 'identity-private', sandbox: true } });
  await privateWindow.loadURL(`http://127.0.0.1:${server.address().port}/private`);
  assert.strictEqual(await privateWindow.webContents.executeJavaScript('navigator.userAgent'), ua);
  assert.strictEqual(requests.find(request => request.url === '/private').ua, ua);
  console.log('PASS: documents, cross-site frames, worker scripts/fetches, and a fresh private session share the actual Chromium identity');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });

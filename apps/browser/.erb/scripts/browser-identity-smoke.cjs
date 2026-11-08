// Native regression: cross-site iframe fetches must retain the tab's identity.
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
  else if (request.url === '/frame') response.end('<script>fetch("/frame-fetch").then(() => document.title = "complete")</script>');
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
  while (!requests.some(request => request.url === '/frame-fetch') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert(requests.some(request => request.url === '/frame-fetch'), 'Cross-site iframe must issue its fetch');
  for (const request of requests) assert.strictEqual(request.ua, ua, `${request.url} used a different identity`);
  assert(!/Electron|touch-?box/i.test(ua));
  assert(ua.includes(`Chrome/${process.versions.chrome}`), 'Keep the real Chromium version');
  console.log('PASS: main page, cross-site iframe, and iframe fetch share the actual Chromium identity');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });

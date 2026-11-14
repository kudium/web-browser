// Run from apps/browser: npx electron .erb/scripts/favicon-navigation-smoke.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
require('ts-node').register({ transpileOnly: true });
const { FaviconResolver } = require('../../src/main/faviconResolver');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-favicon-'));
app.setPath('userData', directory);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4f8AAAAASUVORK5CYII=',
  'base64'
);
let server;
let window;
let resolver;
let documents = 0;
let icons = 0;
let releaseFrame;
let frameStarted;
function finish(code) {
  resolver?.clear();
  if (window && !window.isDestroyed()) window.destroy();
  server?.close();
  fs.rmSync(directory, { recursive: true, force: true });
  app.exit(code);
}
(async () => {
  await app.whenReady();
  const frameRequest = new Promise((resolve) => {
    frameStarted = resolve;
  });
  server = http.createServer((request, response) => {
    if (request.url === '/late-frame') {
      releaseFrame = () => {
        response.end('<p>Late embedded frame</p>');
      };
      frameStarted();
    } else if (request.url === '/favicon.ico') {
      icons += 1;
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(png);
    } else {
      documents += 1;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<title>Favicon navigation fixture</title><p>Document stays loaded</p>'
      );
    }
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/page`;
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const contents = window.webContents;
  let navigations = 0;
  let loadingStarts = 0;
  contents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) navigations += 1;
  });
  contents.on('did-start-loading', () => {
    loadingStarts += 1;
  });
  await window.loadURL(url);
  const reloaded = new Promise((resolve) => {
    contents.once('did-finish-load', resolve);
  });
  contents.reload();
  await reloaded;
  assert.equal(
    documents,
    2,
    'One Reload should request one additional document'
  );
  const originalFetch = contents.session.fetch;
  resolver = new FaviconResolver();
  const before = { documents, navigations, loadingStarts };
  try {
    // eslint-disable-next-line no-restricted-syntax -- exercise both cases on the same page
    for (const status of [403, 200]) {
      // Simulate blocked downloads and HTML challenges in the separate request;
      // the fallback still performs an actual Chromium request in the page.
      contents.session.fetch = async () =>
        new Response('challenge', { status });
      let resolved;
      // eslint-disable-next-line no-await-in-loop -- navigation counters require sequential cases
      await resolver.resolve('fixture', contents, [], (icon) => {
        resolved = icon;
      });
      assert(resolved?.startsWith('data:image/png;base64,'));
      assert.equal(contents.getURL(), url);
      assert.equal(
        documents,
        before.documents,
        'Favicon caused a document request'
      );
      assert.equal(
        navigations,
        before.navigations,
        'Favicon caused navigation'
      );
      assert.equal(
        loadingStarts,
        before.loadingStarts,
        'Favicon restarted loading UI'
      );
    }
  } finally {
    contents.session.fetch = originalFetch;
  }
  assert(icons >= 2, 'Expected actual page-context icon requests');
  await contents.executeJavaScript(`
    const frame = document.createElement('iframe');
    frame.src = '/late-frame';
    document.body.appendChild(frame);
  `);
  await frameRequest;
  assert(contents.isLoading(), 'Expected late iframe activity');
  assert(
    !contents.isLoadingMainFrame(),
    'Late iframe must not mark the main document as loading'
  );
  releaseFrame();
  console.log(
    JSON.stringify({
      passed: true,
      cases: ['403 response', '200 HTML challenge', 'late iframe loading'],
      documents,
      navigations,
      loadingStarts,
      pageIconRequests: icons,
    })
  );
})()
  .then(() => finish(0))
  .catch((error) => {
    console.error(error);
    finish(1);
  });

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const assert = require('assert');
const http = require('http');
const { app, BrowserWindow } = require('electron');
const runtime = fs.mkdtempSync(
  path.join(require('os').tmpdir(), 'kudiumbrowser-navigation-')
);
app.setPath('userData', path.join(runtime, 'profile'));
require(path.join(root, 'node_modules/esbuild')).buildSync({
  entryPoints: [path.join(root, 'src/main/windowNavigation.ts')],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtime, 'navigation.cjs'),
});
const { protectWindowNavigation } = require(path.join(
  runtime,
  'navigation.cjs'
));
const server = http.createServer((request, response) => {
  response.end(
    '<title>Trusted fixture</title><a id="escape" href="/outside">Escape</a>'
  );
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = `${base}/app?view=main`;
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const launches = [];
    protectWindowNavigation(window.webContents, url, async (value) => {
      launches.push(value);
    });
    await window.loadURL(url);
    const attempted = new Promise((resolve) =>
      window.webContents.once('will-navigate', (event) =>
        resolve(event.defaultPrevented)
      )
    );
    await window.webContents.executeJavaScript(
      "document.getElementById('escape').click();undefined"
    );
    assert(await attempted, 'navigation was not prevented');
    await wait(100);
    assert.equal(window.webContents.getURL(), url);
    await window.webContents.executeJavaScript(
      "window.open('https://kudium.com');undefined",
      true
    );
    await wait(100);
    assert.deepEqual(launches, ['https://kudium.com/']);
    await window.webContents.executeJavaScript(
      "window.open('file:///tmp/private');undefined",
      true
    );
    await wait(100);
    assert.equal(launches.length, 1);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    await window.webContents.executeJavaScript(
      "location.hash='section';undefined"
    );
    await wait(100);
    assert.equal(window.webContents.getURL(), `${url}#section`);
    console.log(
      'PASS: actual renderer navigation blocked, safe external popup routed, file popup denied, fragments retained, no extra window'
    );
    window.destroy();
    server.close();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => app.exit(1), 20000).unref();

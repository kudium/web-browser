/* Runs the actual sandboxed preload on a local fixture, without the app profile. */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert'),
  http = require('http');
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    '<!doctype html><html><head><title>Hook runtime fixture</title></head><body><main>Route fixture</main></body></html>'
  );
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-hook-native-'));
app.setPath('userData', path.join(dir, 'profile'));
const file = fs.readFileSync(
  path.join(__dirname, '../../src/main/siteDeveloper.ts'),
  'utf8'
);
const template = file.slice(
  file.indexOf('String.raw`') + 11,
  file.indexOf('`;\nlet preloadPath')
);
const ts = require('typescript');
const runtime = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../../../packages/hooks/runtime.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(runtime);
const source = new Function('installPersonalDataAutofill','createPersonalDataMatching','pageHookBody',`return String.raw\`${template}\``)(()=>{},()=>({score:()=>0}),runtime.pageHookBody);
fs.writeFileSync(path.join(dir, 'preload.cjs'), source);
const events = [];
let sequence = 0;
let config = {
  enabled: true,
  before: "log('before-marker');",
  after: '',
  css: 'body { --hook-css: applied; }',
  hooks: [
    {
      id: 'route',
      name: 'Route hook',
      path: '/route',
      enabled: true,
      before: '',
      after:
        "const style=document.createElement('style');style.id='native-hook-style';document.head.append(style);context.onCleanup(()=>style.remove());context.setInterval(()=>log('tick'),20);",
      css: '',
    },
  ],
};
ipcMain.on('site-developer-config', (event) => {
  const url = new URL(event.senderFrame.url);
  event.returnValue = {
    ...config,
    token: 'native-' + ++sequence,
    hooks: config.hooks.filter((h) => h.enabled && h.path === url.pathname),
  };
});
ipcMain.on('site-developer-event', (_event, message) => events.push(message));
const wait = async (fn) => {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('Timed out waiting for native hook state');
};
app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({
      show: false,
      width: 900,
      height: 700,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(dir, 'preload.cjs'),
      },
    });
    window.webContents.on('did-navigate-in-page', () =>
      window.webContents.send('site-developer-route')
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await window.loadURL(`http://127.0.0.1:${server.address().port}/route`);
    await wait(() =>
      window.webContents.executeJavaScript(
        "!!document.getElementById('native-hook-style')"
      )
    );
    await wait(() => events.some((e) => e.value.includes('tick')));
    assert.strictEqual(
      await window.webContents.executeJavaScript(
        "getComputedStyle(document.body).getPropertyValue('--hook-css').trim()"
      ),
      'applied'
    );
    await window.webContents.executeJavaScript(
      "history.pushState({},'', '/other')"
    );
    await wait(() =>
      window.webContents.executeJavaScript(
        "!document.getElementById('native-hook-style')"
      )
    );
    assert.strictEqual(
      events.filter((e) => e.value.endsWith(': before-marker')).length,
      1
    );
    const paused = events.filter((e) => e.value.includes('tick')).length;
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(
      events.filter((e) => e.value.includes('tick')).length,
      paused
    );
    await window.webContents.executeJavaScript('history.back()');
    await wait(() =>
      window.webContents.executeJavaScript(
        "!!document.getElementById('native-hook-style')"
      )
    );
    window.webContents.send('site-developer-stop');
    await wait(() =>
      window.webContents.executeJavaScript(
        "!document.getElementById('native-hook-style') && getComputedStyle(document.body).getPropertyValue('--hook-css').trim() !== 'applied'"
      )
    );
    console.log(
      'Native Electron sandbox: initial run, owned interval, inserted CSS, route filtering, back navigation, before-load semantics and live cleanup passed.'
    );
    window.destroy();
    server.close();
    // Retain the temporary profile until Chromium finishes shutting down.
    app.quit();
  } catch (error) {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    server.close();
    // Retain the temporary profile until Chromium finishes shutting down.
    app.exit(1);
  }
});

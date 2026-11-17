// Real browser-owned picker UI; source enumeration is synthetic, not an OS capture.
const { app, BrowserWindow, desktopCapturer } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-screen-picker-'));
app.setPath('userData', root);
const output =
  process.env.KUDIUMBROWSER_SMOKE_OUTPUT ||
  path.resolve(__dirname, '../../release', `local-screen-picker-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
require('esbuild').buildSync({
  entryPoints: [path.resolve(__dirname, '../../src/main/screenSharing.ts')],
  bundle: true,
  platform: 'node',
  external: ['electron', './preferences', './siteSettings'],
  outfile: path.join(root, 'screen.cjs'),
});
fs.writeFileSync(
  path.join(root, 'preferences.js'),
  "exports.getBrowserPreferences=()=>({permissions:'ask'});",
);
fs.writeFileSync(
  path.join(root, 'siteSettings.js'),
  'exports.siteOrigin=url=>new URL(url).origin;exports.getSiteSettings=()=>({permissions:{}});',
);
const { screenSharingHandler } = require(path.join(root, 'screen.cjs'));
const sources = [
  { id: 'window:fixture:0', name: 'Fixture window' },
  { id: 'screen:fixture:0', name: 'Fixture screen' },
];
desktopCapturer.getSources = async () => sources;
const until = async (operation) => {
  for (let index = 0; index < 100; index++) {
    const result = await operation();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Screen picker timed out');
};
const server = http.createServer((_req, res) =>
  res.end('<title>Disposable sharing fixture</title>'),
);
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await app.whenReady();
  const owner = new BrowserWindow({
    show: true,
    webPreferences: { sandbox: true },
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await owner.loadURL(origin);
  const handler = screenSharingHandler('fixture', (contents) =>
    contents === owner.webContents ? owner : undefined,
  );
  const start = () =>
    new Promise((resolve) =>
      handler(
        {
          frame: owner.webContents.mainFrame,
          securityOrigin: origin,
          videoRequested: true,
          audioRequested: false,
          userGesture: true,
        },
        resolve,
      ),
    );
  const picker = () =>
    until(async () => {
      const modal = BrowserWindow.getAllWindows().find(
        (window) => window !== owner && !window.isDestroyed(),
      );
      return (
        modal &&
        modal.isVisible() &&
        modal.getOpacity() === 1 &&
        !modal.webContents.isLoading() &&
        (await modal.webContents.executeJavaScript(
          "!!document.querySelector('[data-input=source]')",
        )) &&
        modal
      );
    });
  let result = start();
  let modal = await picker();
  assert.equal(
    await modal.webContents.executeJavaScript(
      "document.querySelector('[data-input=source]').options.length",
    ),
    3,
  );
  const layout = await modal.webContents.executeJavaScript(`(()=>{
    const input=document.querySelector('[data-input=source]').getBoundingClientRect();
    const content=document.querySelector('.content').getBoundingClientRect();
    const footer=document.querySelector('footer').getBoundingClientRect();
    return {visible:input.top>=content.top && input.bottom<=content.bottom,
      footerVisible:footer.top>=0 && footer.bottom<=innerHeight};
  })()`);
  assert.equal(layout.visible, true, 'Source selector must be fully visible');
  assert.equal(layout.footerVisible, true, 'Actions must be fully visible');
  fs.writeFileSync(
    path.join(output, 'screen-sharing-picker.png'),
    (await modal.capturePage()).toPNG(),
  );
  await modal.webContents.executeJavaScript(
    "document.getElementById('cancel').click();undefined",
  );
  assert.deepEqual(await result, {});
  result = start();
  modal = await picker();
  await modal.webContents.executeJavaScript(
    "const input=document.querySelector('[data-input=source]');input.value='0';input.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('confirm').click();undefined",
  );
  assert.deepEqual(await result, { video: sources[0] });
  result = start();
  await picker();
  await owner.loadURL(`${origin}/navigated`);
  assert.deepEqual(await result, {});
  await until(
    () =>
      BrowserWindow.getAllWindows().filter((window) => window !== owner)
        .length === 0,
  );
  fs.writeFileSync(
    path.join(output, 'screen-sharing-picker-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          platform: process.platform,
          arch: process.arch,
        },
        verified: [
          'Actual source selector is rendered',
          'Source selector and actions are fully visible after native sizing',
          'Cancel shares nothing',
          'Explicit selection returns only the chosen source',
          'Navigation cancels and closes the picker',
        ],
        limitations: [
          'Source list is synthetic; OS source enumeration, recording permission and real screen pixels are not tested.',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: real source-picker UI, selection, cancellation and navigation cleanup',
  );
  owner.destroy();
  server.close();
  app.quit();
})().catch((error) => {
  console.error(error);
  server.close();
  app.exit(1);
});
setTimeout(() => {
  console.error('Screen picker timed out');
  app.exit(1);
}, 30000).unref();

// Disposable native document checks; no profile or network access.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-theme-'));
app.setPath('userData', root);
require('esbuild').buildSync({ entryPoints: ['src/utils/websiteTheme.ts'], platform: 'node', bundle: true, outfile: path.join(root, 'theme.cjs') });
const probe = `(${require(path.join(root, 'theme.cjs')).extractWebsitePrimaryColor.toString()})()`;
(async () => {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const header = '<header style="height:90px;background:rgb(252,215,43)">Brand</header>';
  const cases = [
    [header, '#fcd72b'],
    ['<meta name="theme-color" content="#123">' + header, '#112233'],
    ['<meta name="theme-color" content="rgb(20, 40, 60)">' + header, '#14283c'],
    ['<meta name="theme-color" media="not all" content="red">' + header, '#fcd72b'],
    ['<meta name="theme-color" content="transparent">' + header, '#fcd72b'],
    ['<meta name="theme-color" content="url(javascript:alert(1))">' + header, '#fcd72b'],
    ['<header style="height:90px;background:transparent">No color</header>', undefined],
    ['<nav style="width:100px;height:90px;background:red">Sidebar</nav>', undefined],
    ['<div style="height:56px;background:rgb(0,181,63)"><div style="height:40px"><button style="width:100px;background:orange">Action</button></div></div>', '#00b53f'],
    ['<div style="height:56px;background:rgb(0,181,63)"><header style="height:40px;background:transparent">Header contents</header></div>', '#00b53f'],
    ['<div style="height:600px;background:red">Large content block</div>', undefined],
    ['<div style="height:56px;background:red;display:none">Hidden header</div>', undefined],
    ['<meta name="THEME-COLOR" content="blue"><div style="height:56px;background:green">Header</div>', '#0000ff'],
  ];
  for (const [html, expected] of cases) {
    await window.loadURL('data:text/html,' + encodeURIComponent(html));
    assert.equal(await window.webContents.executeJavaScript(probe), expected);
  }
  console.log('PASS: 13 native primary-color cases covering metadata, semantic and div headers, transparent wrappers, CSS colors, media selection, invalid colors and unrelated content.');
  window.destroy(); app.quit();
})().catch((error) => { console.error(error); app.exit(1); }).finally(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

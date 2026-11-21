// Run from apps/browser with ELECTRON_RUN_AS_NODE unset.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-hook-css-csp-'));
app.setPath('userData', temporary);
const bundle = require('esbuild').buildSync({
  entryPoints: ['src/browser/hookExamples.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
}).outputFiles[0].text;
const exportsPath = path.join(temporary, 'examples.cjs');
fs.writeFileSync(exportsPath, bundle);
const { hookExamples } = require(exportsPath);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  try {
    await window.loadURL(`data:text/html,${encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'none\'"><a href="https://example.com">Link</a><input><p>Text</p>')}`);
    for (const [id, expression, expected] of [
      ['dark-mode', "getComputedStyle(document.documentElement).filter", 'invert(1) hue-rotate(180deg)'],
      ['accent-colors', "getComputedStyle(document.querySelector('a')).color", 'rgb(168, 85, 247)'],
      ['layout-outlines', "getComputedStyle(document.querySelector('p')).outlineStyle", 'solid'],
    ]) {
      const example = hookExamples.find(item => item.id === id);
      assert.strictEqual(example.stage, 'css');
      const before = await window.webContents.executeJavaScript(expression);
      const key = await window.webContents.insertCSS(example.source);
      assert.strictEqual(await window.webContents.executeJavaScript(expression), expected);
      await window.webContents.removeInsertedCSS(key);
      assert.strictEqual(await window.webContents.executeJavaScript(expression), before);
    }
    console.log('PASS: all three visual presets apply and clean up under style-src none.');
  } finally { window.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(temporary, { recursive: true, force: true }));

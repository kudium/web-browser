// Run from apps/browser: npx electron .erb/scripts/autofill-csp-smoke.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-autofill-csp-'));
app.setPath('userData', temporary);
const source = require('esbuild').buildSync({
  stdin: { contents: "export { installPersonalDataAutofill } from './src/browser/personalDataAutofill';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'autofill', write: false,
}).outputFiles[0].text;
const preload = path.join(temporary, 'preload.cjs');
fs.writeFileSync(preload, `
const { contextBridge } = require('electron');
${source}
let shadow;
const attach = HTMLElement.prototype.attachShadow;
HTMLElement.prototype.attachShadow = function (options) { shadow = attach.call(this, options); return shadow; };
contextBridge.exposeInMainWorld('fixture', {
  start: async () => {
    autofill.installPersonalDataAutofill({ on() {}, invoke: async channel => channel === 'personal-data-autofill-enabled' ? true : null }, () => 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    const input = document.querySelector('input');
    input.focus();
    if (!shadow) input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  },
  inspect: () => {
    // Exercise panel CSS without accessing any private-data IPC.
    const panel = document.createElement('div'); panel.className = 'panel'; shadow.append(panel);
    const control = shadow.querySelector('.autofill-control');
    return { sheets: shadow.adoptedStyleSheets.length, inlineStyles: shadow.querySelectorAll('style').length,
      controlDisplay: getComputedStyle(control).display, panelPosition: getComputedStyle(panel).position,
      panelRadius: getComputedStyle(panel).borderRadius, fontSize: getComputedStyle(control).fontSize };
  }
});
`);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: false } });
  window.webContents.on('console-message', (_event, ...args) => console.log(...args));
  try {
    for (const policy of ["default-src 'none'; style-src 'none'", "default-src 'none'; style-src 'nonce-fixture'"]) {
      const html = `<meta http-equiv="Content-Security-Policy" content="${policy}"><input type="email">`;
      await window.loadURL(`data:text/html,${encodeURIComponent(html)}`);
      await window.webContents.executeJavaScript('fixture.start()');
      const result = await window.webContents.executeJavaScript('fixture.inspect()');
      assert.deepStrictEqual(result, { sheets: 1, inlineStyles: 0, controlDisplay: 'inline-flex', panelPosition: 'fixed', panelRadius: '12px', fontSize: '12px' });
    }
    console.log('PASS: autofill styling survives style-src none and nonce-only CSP.');
  } finally { window.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(temporary, { recursive: true, force: true }));

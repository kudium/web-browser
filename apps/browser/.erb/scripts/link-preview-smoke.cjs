/* Disposable native hover, footer layout and mouse-through check. */
const { app, BrowserWindow, WebContentsView } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);
const { NativeTooltip } = require('../../src/main/nativeTooltip.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-link-preview-'));
app.setPath('userData', path.join(root, 'profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const timer = setTimeout(() => app.exit(1), 15000);
app.whenReady().then(async () => {
  const owner = new BrowserWindow({ width: 720, height: 520, show: true });
  try {
    await owner.loadURL('data:text/html,<body style="margin:0;background:gray">');
    const page = new WebContentsView({ webPreferences: { sandbox: true } });
    owner.contentView.addChildView(page);
    const bounds = { x: 40, y: 40, width: 600, height: 400 };
    page.setBounds(bounds);
    const url = `https://example.com/path?query=${'long-value'.repeat(40)}#section`;
    await page.webContents.loadURL('data:text/html,' + encodeURIComponent(`<a style="position:fixed;left:20px;top:20px;width:500px;height:40px" href="${url}">Hover link</a>`));
    const preview = new NativeTooltip(owner);
    let enabled = true;
    let observed = '';
    page.webContents.on('update-target-url', (_event, target) => {
      observed = target;
      if (!target || !enabled) { preview.hide(); return; }
      preview.update({ id: 'fixture', label: target, dark: true,
        anchor: { x: bounds.x, y: bounds.y + bounds.height, width: 0, height: 0 }
      }, bounds).catch(error => { console.error(error); app.exit(1); });
    });
    owner.focus();
    await pause(150);
    page.webContents.debugger.attach('1.3');
    const move = (x, y) => page.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await move(30, 30);
    await pause(300);
    assert.equal(observed, url, 'Chromium reports the full destination');
    const hint = BrowserWindow.getAllWindows().find(window => window !== owner);
    assert(hint && hint.isVisible(), 'native footer is visible');
    assert.equal(await hint.webContents.executeJavaScript("document.getElementById('hint').textContent"), url);
    const content = owner.getContentBounds();
    const rect = hint.getBounds();
    assert(rect.x >= content.x + bounds.x && rect.x + rect.width <= content.x + bounds.x + bounds.width);
    assert.equal(rect.y + rect.height, content.y + bounds.y + bounds.height);
    assert(await hint.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight"), 'no scrollbars');
    await move(30, 120);
    await pause(100);
    assert(!hint.isVisible(), 'leaving the link clears its preview');
    enabled = false;
    await move(30, 30);
    await pause(100);
    assert(!hint.isVisible(), 'disabled preview stays hidden');
    console.log('PASS real Chromium hover: full URL, native footer bounds, no scrollbars, hover exit and opt-out.');
  } finally {
    owner.destroy();
    clearTimeout(timer);
    fs.rmSync(root, { recursive: true, force: true });
    app.quit();
  }
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });

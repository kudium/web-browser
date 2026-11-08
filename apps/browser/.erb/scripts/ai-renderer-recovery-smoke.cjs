// Crash only a disposable renderer; no user browser service or settings are used.
const { app, BrowserWindow, WebContentsView } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-renderer-recovery-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/aiNavigation.ts', 'src/main/aiObservation.ts', 'src/main/aiTabs.ts'],
  bundle: true, platform: 'node', outdir: root, outExtension: { '.js': '.cjs' },
});
const { navigateAIPage } = require(path.join(root, 'aiNavigation.cjs'));
const { observeAIPage } = require(path.join(root, 'aiObservation.cjs'));
const { watchAITabDocument } = require(path.join(root, 'aiTabs.cjs'));
let page; let view; let host;
let held;
let started;
const site = http.createServer((req, res) => {
  if (req.url === '/held') { held = res; started?.(); return; }
  res.end('<title>Recovered renderer</title><h1>Ready</h1>');
});
const bounded = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Native crash recovery timed out')), 5000); timer.unref(); }),
]);
(async () => {
  await app.whenReady();
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${site.address().port}`;
  host = new BrowserWindow({ show: false });
  view = new WebContentsView(); host.contentView.addChildView(view);
  page = view.webContents;
  await page.loadURL(url);
  const baseline = page.listenerCount('render-process-gone');
  const approval = watchAITabDocument(page);
  let executionSignal;
  const observation = observeAIPage(page, new AbortController().signal, signal => {
    executionSignal = signal;
    return page.executeJavaScript('new Promise(() => {})');
  }).then(() => { throw new Error('Crashed read must not succeed'); }, error => error);
  await new Promise(resolve => setTimeout(resolve, 50));
  const reachedServer = new Promise(resolve => { started = resolve; });
  const navigation = navigateAIPage(page, url+'/held', new AbortController().signal)
    .then(() => { throw new Error('Crashed navigation must not succeed'); }, error => error);
  await bounded(reachedServer);
  approval.dispose();
  const crashApproval = watchAITabDocument(page);
  // Navigation has already invalidated the preceding read. Start another bounded
  // observation whose backend remains pending, then kill the real renderer.
  await observation;
  const crashedRead = observeAIPage(page, new AbortController().signal, signal => {
    executionSignal = signal;
    return page.executeJavaScript('new Promise(() => {})');
  }).then(() => { throw new Error('Crashed observation must not succeed'); }, error => error);
  await new Promise(resolve => setTimeout(resolve, 50));
  const gone = new Promise(resolve => page.once('render-process-gone', (_, details) => resolve(details)));
  page.forcefullyCrashRenderer();
  const details = await bounded(gone);
  assert(['crashed', 'killed'].includes(details.reason), JSON.stringify(details));
  const navError = await bounded(navigation);
  const readError = await bounded(crashedRead);
  assert.match(navError.message, /renderer exited|Navigation failed|ERR_ABORTED|ERR_FAILED/);
  assert.match(readError.message, /renderer exited|Render frame was disposed/);
  assert(executionSignal.aborted);
  assert(!page.isDestroyed(), 'Renderer exit must exercise a surviving WebContents');
  assert(crashApproval.changed());
  crashApproval.dispose();
  assert.equal(page.listenerCount('render-process-gone'), baseline);
  held.end('<h1>Late original navigation</h1>');
  await page.loadURL(url+'/recovered');
  const result = await observeAIPage(page, new AbortController().signal, () => page.executeJavaScript('document.title'));
  assert.equal(result, 'Recovered renderer');
  const fresh = watchAITabDocument(page);
  assert(!fresh.changed());
  let actualSignal;
  const actualRead = observeAIPage(page, new AbortController().signal, signal => {
    actualSignal = signal;
    return page.executeJavaScript('new Promise(() => {})');
  }).then(() => { throw new Error('Pending JavaScript read survived renderer exit'); }, error => error);
  await new Promise(resolve => setTimeout(resolve, 50));
  const secondGone = new Promise(resolve => page.once('render-process-gone', resolve));
  page.forcefullyCrashRenderer(); await bounded(secondGone);
  const actualError = await bounded(actualRead);
  assert.match(actualError.message, /renderer exited|Render frame was disposed/);
  assert(actualSignal.aborted); assert(fresh.changed()); fresh.dispose();
  await page.loadURL(url+'/final-recovery');
  assert.equal(await observeAIPage(page, new AbortController().signal, () => page.executeJavaScript('document.title')), 'Recovered renderer');
  assert.equal(page.listenerCount('render-process-gone'), baseline);
  fs.writeSync(1, 'PASS: actual renderer crash rejects pending navigation/read, invalidates approval, releases listeners and permits fresh renderer observation.\n');
  page.close(); host.destroy(); site.close(); fs.rmSync(root, { recursive: true, force: true }); app.exit(0);
})().catch(error => { console.error(error); if(page && !page.isDestroyed()) page.close(); if(host && !host.isDestroyed()) host.destroy(); held?.end(); site.close(); app.exit(1); });

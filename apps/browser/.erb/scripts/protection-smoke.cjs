// Native request/CSS integration; uses a disposable profile and deterministic rules.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const assert = require('assert/strict');
const { createHash } = require('crypto');
const { FiltersEngine } = require('@ghostery/adblocker');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-protection-'));
app.setPath('userData', root);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP news.fixture.test 127.0.0.1, MAP ads.advertising.test 127.0.0.1');
const bytes = FiltersEngine.parse('||ads.advertising.test^$third-party\nnews.fixture.test##.advertisement').serialize();
fs.writeFileSync(path.join(root, 'protection-rules.json'), JSON.stringify({ version: 1, updatedAt: Date.now(), sources: ['https://easylist.to/easylist/easylist.txt', 'https://easylist.to/easylist/easyprivacy.txt'], sha256: createHash('sha256').update(bytes).digest('hex'), engine: Buffer.from(bytes).toString('base64') }));
const source = path.resolve(__dirname, '../../src');
fs.writeFileSync(path.join(root, 'entry.ts'), `export * from ${JSON.stringify(path.join(source,'main/advancedPreferences'))}; export * from ${JSON.stringify(path.join(source,'browser/advancedPreferences'))}; export * from ${JSON.stringify(path.join(source,'main/siteSettings'))}; export * from ${JSON.stringify(path.join(source,'main/requestRules'))};`);
require('esbuild').buildSync({ entryPoints: [path.join(root,'entry.ts')], bundle: true, minify: true, platform: 'node', external: ['electron'], outfile: path.join(root,'runtime.cjs') });
const { applyAdvancedContents, waitForBrowserNetwork, defaultAdvanced, updateSiteSettings, addRequestRule } = require(path.join(root,'runtime.cjs'));
let window, server, stopRule;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { const deadline=Date.now()+5000; while(!await check()) { assert(Date.now()<deadline,'Timed out waiting for CSS'); await wait(30); } }
(async () => {
  await app.whenReady();
  server = http.createServer((request,response) => {
    response.setHeader('Content-Type','text/html');
    response.setHeader('Access-Control-Allow-Origin','*');
    response.end('<div class="advertisement">Ad fixture</div><p>Normal page content</p>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port, origin=`http://news.fixture.test:${port}`;
  window=new BrowserWindow({show:false, webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'persist:protection-fixture'}});
  const contents=window.webContents;
  const preferences={...defaultAdvanced,proxy:{...defaultAdvanced.proxy,mode:'direct'}};
  // A preexisting security rule must continue to work when protection is toggled.
  stopRule=addRequestRule(contents.session,details => new URL(details.url).pathname==='/sensitive');
  applyAdvancedContents(contents,preferences,'protection-fixture');
  await waitForBrowserNetwork(contents);
  await contents.loadURL(origin);
  const request = url => contents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(()=>true,()=>false)`);
  assert.equal(await request(`http://ads.advertising.test:${port}/ad.js`),false,'Third-party request is blocked');
  assert.equal(await request(`${origin}/normal`),true,'Normal first-party request succeeds');
  await until(async () => await contents.executeJavaScript('getComputedStyle(document.querySelector(".advertisement")).display')==='none');
  updateSiteSettings('protection-fixture',origin,{adBlocking:false});
  assert.equal(await request(`http://ads.advertising.test:${port}/ad.js`),true,'Per-site exception permits the request');
  assert.equal(await request(`${origin}/sensitive`),false,'Exception preserves security rules');
  await until(async () => await contents.executeJavaScript('getComputedStyle(document.querySelector(".advertisement")).display')!=='none');
  updateSiteSettings('protection-fixture',origin,{adBlocking:true});
  assert.equal(await request(`http://ads.advertising.test:${port}/ad.js`),false,'Re-enabling restores blocking');
  applyAdvancedContents(contents,{...preferences,adBlocking:false},'protection-fixture');
  assert.equal(await request(`http://ads.advertising.test:${port}/ad.js`),true,'Global disable permits the request');
  assert.equal(await request(`${origin}/sensitive`),false,'Global disable preserves security rules');
  console.log('PASS: native ad/tracker cancellation, cosmetic CSS, per-site reversal, global disable, and existing security-rule composition.');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {
  stopRule?.();if(window&&!window.isDestroyed())window.destroy();
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode||0);
});

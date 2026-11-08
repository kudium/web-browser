// Actual production renderer and preload, synthetic injections, disposable profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-renderer-csp-'));
app.setPath('userData', path.join(root, 'profile'));
const renderer = path.resolve(process.env.TOUCHBOX_CSP_RENDERER || 'release/app/dist/renderer');
const documentDir = path.join(root, 'renderer'); fs.mkdirSync(documentDir);
for (const entry of fs.readdirSync(renderer)) fs.symlinkSync(path.join(renderer, entry), path.join(documentDir, entry));
fs.writeFileSync(path.join(documentDir, 'untrusted-local.js'), "window.cspEffects.push('local-script');window.electron.ipcRenderer.sendMessage('ipc-event-bus',{fixture:'injected-local'});");
require('esbuild').buildSync({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'preload.cjs') });
let host, server; const received = []; const injectedIPC = [];
ipcMain.on('ipc-event-bus', (_event, value) => { if (value?.fixture?.startsWith('injected-')) injectedIPC.push(value.fixture); });
(async () => {
  await app.whenReady();
  server = http.createServer((req, res) => { received.push(new URL(req.url, 'http://fixture').pathname); res.setHeader('Access-Control-Allow-Origin', '*'); res.end('fixture'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  host = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(root, 'preload.cjs') } });
  const errors = []; host.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await host.loadFile(path.join(documentDir, 'index.html'), { query: { view: 'add-app' } });
  const evaluate = source => host.webContents.executeJavaScript(source);
  const rendered = await evaluate("({heading:document.querySelector('h2')?.textContent || document.querySelector('h1')?.textContent,inputs:document.querySelectorAll('input').length,style:getComputedStyle(document.querySelector('form')).display,bridge:typeof window.electron.ipcRenderer.sendMessage})");
  assert.equal(rendered.heading, 'Edit group'); assert(rendered.inputs >= 2); assert.equal(rendered.bridge, 'function');
  await evaluate(`window.cspEffects=[];window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
    const inline=document.createElement('script');inline.textContent="window.cspEffects.push('inline-script');window.electron.ipcRenderer.sendMessage('ipc-event-bus',{fixture:'injected-inline'});";document.body.append(inline);
    const button=document.createElement('button');button.setAttribute('onclick',"window.cspEffects.push('event-handler');window.electron.ipcRenderer.sendMessage('ipc-event-bus',{fixture:'injected-handler'});");document.body.append(button);button.click();
    const local=document.createElement('script');local.src='./untrusted-local.js';document.body.append(local);
    const object=document.createElement('object');object.data=${JSON.stringify(endpoint+'/object')};document.body.append(object);
    const frame=document.createElement('iframe');frame.name='csp-form-target';frame.src=${JSON.stringify(endpoint+'/frame')};document.body.append(frame);
    const form=document.createElement('form');form.target='csp-form-target';form.action=${JSON.stringify(endpoint+'/form')};document.body.append(form);form.submit();
    const base=document.createElement('base');base.href=${JSON.stringify(endpoint+'/base/')};document.head.append(base);
    fetch(${JSON.stringify(endpoint+'/fetch')}).catch(()=>{});navigator.sendBeacon(${JSON.stringify(endpoint+'/beacon')},'synthetic-fixture');
    undefined;`);
  await new Promise(resolve => setTimeout(resolve, 500));
  const result = await evaluate("({effects:window.cspEffects,violations:window.cspViolations,baseChanged:document.baseURI.startsWith('http:'),inputs:document.querySelectorAll('input').length,policy:document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content})");
  const before = process.env.TOUCHBOX_CSP_PHASE === 'before';
  for (const effect of ['inline-script','event-handler','local-script']) assert.equal(result.effects.includes(effect), before);
  assert.equal(result.baseChanged, before);
  assert.equal(injectedIPC.length, before ? 3 : 0);
  for (const route of ['/fetch','/beacon','/form']) assert.equal(received.includes(route), before);
  if (!before) { assert.equal(received.length, 0); for (const directive of ['script-src-elem','script-src-attr','base-uri','connect-src','frame-src','object-src','form-action']) assert(result.violations.some(event=>event.directive===directive), directive); }
  const tamperDir = path.join(root,'tampered');fs.mkdirSync(tamperDir);
  for (const entry of fs.readdirSync(renderer)) {
    if (entry !== 'renderer.js') fs.symlinkSync(path.join(renderer,entry),path.join(tamperDir,entry));
  }
  fs.writeFileSync(path.join(tamperDir,'renderer.js'),fs.readFileSync(path.join(renderer,'renderer.js'),'utf8')+'\n;window.bundleTamperExecuted=true;');
  const tampered = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.join(root,'preload.cjs')}});
  const integrityErrors=[];tampered.webContents.on('console-message',event=>integrityErrors.push(event.message));
  await tampered.loadFile(path.join(tamperDir,'index.html'),{query:{view:'add-app'}});
  const tamperExecuted=await tampered.webContents.executeJavaScript('!!window.bundleTamperExecuted');
  assert.equal(tamperExecuted,before);
  if(!before)assert(integrityErrors.some(message=>message.includes('integrity')));
  tampered.destroy();
  const report = { measuredAt: new Date().toISOString(), electron: process.versions.electron, platform: process.platform, arch: process.arch,
    probeSourceSHA256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), htmlSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(renderer,'index.html'))).digest('hex'), rendererSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(renderer,'renderer.js'))).digest('hex'), rendered, ...result, received, injectedIPC, tamperExecuted, integrityErrors, errors,
    method: 'Actual emitted production renderer loaded from file with actual sandboxed preload. Synthetic inline/event/local-file injections, base rewrite, frame/object loads and HTTP fetch/beacon probes. No personal profile or external service.' };
  const file = 'docs/benchmarks/renderer-csp.json'; const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
  const phase = process.env.TOUCHBOX_CSP_PHASE || 'after'; if (saved[phase]) saved.confirmations=[...(saved.confirmations||[]),{phase,...report}]; else saved[phase]=report;
  fs.writeFileSync(file,JSON.stringify(saved,null,2)+'\n'); console.log('PASS renderer CSP',JSON.stringify(report));
  host.destroy();server.close();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
})().catch(error=>{console.error(error);host?.destroy();server?.close();app.exit(1);});

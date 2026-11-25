process.on('warning', warning => console.error(warning.stack));
// Run after npm run build. Uses a disposable user-data directory and local test websites.
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog } = require('electron');
const path = require('path'),
  fs = require('fs'),
  assert = require('assert'),
  ts = require('typescript'),
  http = require('http');
if (process.argv.includes('--private-only') || process.argv.includes('--real-sites-only') || process.argv.includes('--compatibility-only')) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if ((process.argv.includes('--real-sites-only') || process.argv.includes('--kuditrust-only')) && process.argv.includes('--inspect')) app.commandLine.appendSwitch('remote-debugging-port','9222');
const nativePrivateDialogs=process.argv.includes('--native-private-dialogs');
let idleCheck;
const realInterval = global.setInterval;
if (process.argv.includes('--tab-discard-only')) global.setInterval = (callback, milliseconds, ...args) => {
  if (milliseconds === 60000) idleCheck = callback;
  return realInterval(callback, milliseconds, ...args);
};
const runtimeDir = fs.mkdtempSync(
  path.join(require('os').tmpdir(), 'kudiumbrowser-desktop-smoke-')
);
const out =
  process.env.KUDIUMBROWSER_SMOKE_OUTPUT || path.join(runtimeDir, 'screenshots');
fs.mkdirSync(out, { recursive: true });
for (const [source, target] of [
  
  ['src/main/browser.ts', 'browser.js'],
  ['src/main/browserIdentity.ts', 'browserIdentity.js'],

  

  ['src/main/dialogs.ts', 'dialogs.js'],
  ['src/main/browserDialogStyles.ts', 'browserDialogStyles.js'],
  ['src/main/siteSettings.ts', 'siteSettings.js'],
  ['src/utils/EventBus.ts', 'EventBus.js'],
  ['src/utils/constant.ts', 'constant.js'],
])
  fs.writeFileSync(
    path.join(runtimeDir, target),
    ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
  );
require('esbuild').buildSync({entryPoints:['src/main/siteSettings.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(runtimeDir,'siteSettings.js')});
require('esbuild').buildSync({entryPoints:['src/main/dialogs.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(runtimeDir,'dialogs-production.js')});
// esbuild exposes getter-only exports. Use a writable fixture facade so the
// controlled dialog responses below actually replace the production function.
fs.writeFileSync(path.join(runtimeDir,'dialogs.js'),"module.exports={...require('./dialogs-production.js')};");
require('esbuild').buildSync({entryPoints:['src/main/privateSessions.ts'],bundle:true,platform:'node',outfile:path.join(runtimeDir,'privateSessions.js')});
require('esbuild').buildSync({entryPoints:['src/main/downloads.ts'],bundle:true,platform:'node',external:['electron','./preferences','./privateSessions'],outfile:path.join(runtimeDir,'downloads.js')});
require('esbuild').buildSync({entryPoints:['src/main/websitePermissions.ts'],bundle:true,platform:'node',external:['electron','./preferences','./dialogs','./siteSettings'],outfile:path.join(runtimeDir,'websitePermissions.js')});
fs.writeFileSync(path.join(runtimeDir,'browser-entry.ts'),`export * from ${JSON.stringify(path.resolve('src/main/electronBrowser'))};export * from ${JSON.stringify(path.resolve('src/main/groupLocks'))};export * from ${JSON.stringify(path.resolve('src/main/browserWindows'))};export * from ${JSON.stringify(path.resolve('src/main/privateBrowsing'))};export {registerTaskManagerWindow} from ${JSON.stringify(path.resolve('src/main/taskManager'))};export {registerSidebarPanelWindow,sidebarPanelsFor} from ${JSON.stringify(path.resolve('src/main/sidebarPanels'))};export {showHookPanel} from ${JSON.stringify(path.resolve('src/main/hookPanels'))};export {safeStorage as fixtureSecureStorage} from ${JSON.stringify(path.resolve('src/main/localStorage'))};`);
require('esbuild').buildSync({entryPoints:[path.join(runtimeDir,'browser-entry.ts')],bundle:true,platform:'node',external:['electron','./extensions','./preferences','./downloads','./dialogs','./siteSettings','./history','./privateSessions',require.resolve('node-pty')],alias:{'node-pty':require.resolve('node-pty')},outfile:path.join(runtimeDir,'electronBrowser.js')});
require('fs').copyFileSync(require.resolve('electron-chrome-extensions/preload'),path.join(runtimeDir,'chrome-extension-api.preload.js'));
require('fs').copyFileSync(require.resolve('electron-chrome-web-store/preload'),path.join(runtimeDir,'chrome-web-store.preload.js'));
require('esbuild').buildSync({entryPoints:['src/main/extensions.ts'],bundle:true,platform:'node',external:['electron','./dialogs',require.resolve('electron-chrome-extensions'),require.resolve('electron-chrome-web-store')],alias:{'electron-chrome-extensions':require.resolve('electron-chrome-extensions'),'electron-chrome-web-store':require.resolve('electron-chrome-web-store')},outfile:path.join(runtimeDir,'extensions.js')});
require('esbuild').buildSync({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(runtimeDir,'preload.js')});
require('esbuild').buildSync({entryPoints:['src/main/preferences.ts'],bundle:true,platform:'node',external:['electron','./extensions','./dialogs'],outfile:path.join(runtimeDir,'preferences.js')});
require('esbuild').buildSync({entryPoints:['src/main/nativeUi.ts'],bundle:true,platform:'node',external:['electron','./dialogs'],outfile:path.join(runtimeDir,'nativeUi.js')});
require(path.join(runtimeDir,'nativeUi.js')).registerNativeUi(contents=>Object.values(windows).some(window=>window.webContents===contents));
let nativeContextMenu;
let nativeMenuClosedCount=0;
const buildNativeMenu=Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate=(template)=>{const menu=buildNativeMenu(template);const closePopup=menu.closePopup.bind(menu);menu.closePopup=(...args)=>{nativeMenuClosedCount+=1;return closePopup(...args);};const popup=menu.popup.bind(menu);menu.popup=(options)=>{nativeContextMenu=menu;popup(options);};return menu;};
if(!nativePrivateDialogs) require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:1});
require(path.join(runtimeDir, 'preferences.js')).registerPreferences((section)=>{ if(windows.settings) {windows.settings.show(); windows.settings.webContents.send('preferences-section',section);} },contents=>Object.values(windows).some(win=>!win.isDestroyed()&&win.webContents===contents),contents=>windows.settings?.webContents===contents);
require('esbuild').buildSync({entryPoints:['src/main/history.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(runtimeDir,'history.js')});
require(path.join(runtimeDir,'history.js')).registerHistory(contents=>Object.values(windows).some(win=>win.webContents===contents));
if(process.argv.includes('--developer-sidebar-only')) {
  const mainDir=path.join(runtimeDir,'dist/main');fs.mkdirSync(mainDir,{recursive:true});
  fs.renameSync(path.join(runtimeDir,'electronBrowser.js'),path.join(mainDir,'electronBrowser.js'));
  fs.writeFileSync(path.join(runtimeDir,'electronBrowser.js'),"module.exports=require('./dist/main/electronBrowser.js');");
  for(const name of ['extensions','preferences','downloads','dialogs','siteSettings','history','privateSessions']) fs.writeFileSync(path.join(mainDir,name+'.js'),`module.exports=require('../../${name}.js');`);
  for(const name of ['chrome-extension-api.preload.js','chrome-web-store.preload.js']) fs.copyFileSync(path.join(runtimeDir,name),path.join(mainDir,name));
  fs.symlinkSync(path.resolve('release/app/dist/renderer'),path.join(runtimeDir,'dist/renderer'),'dir');
  fs.mkdirSync(path.join(runtimeDir,'.erb/dll'),{recursive:true});fs.copyFileSync(path.join(runtimeDir,'preload.js'),path.join(runtimeDir,'.erb/dll/preload.js'));
}
if (process.argv.includes('--compatibility-only') || process.argv.includes('--sign-in-only')) {
  app.setName('Kudium Browser');
  app.userAgentFallback = require(path.join(runtimeDir, 'browserIdentity.js')).browserUserAgent(app.userAgentFallback);
}
const { registerBrowser } = require(path.join(runtimeDir, 'browser.js'));
const { eventBus } = require(path.join(runtimeDir, 'EventBus.js'));
app.setPath('userData', path.join(runtimeDir, 'user-data'));
app.on('window-all-closed', () => {});
if (process.argv.includes('--sync-suggestion-only')) {
  ipcMain.handle('browser-storage-ready', () => ({available:true,needsRecovery:false}));
  ipcMain.handle('account-sync', () => ({phase:'off',connected:false,message:'Sync is off',remote:[]}));
}
if (process.argv.includes('--private-only') || process.argv.includes('--file-chooser-only') || process.argv.includes('--ai-composer-layout-only') || process.argv.includes('--notes-editor-only') || process.argv.includes('--production-assets-only') || process.argv.includes('--ai-chat-scroll-only')) ipcMain.handle('browser-storage-ready', () => ({available:false,needsRecovery:false}));
let notesFixture, notesSaves = [];
if (process.argv.includes('--notes-editor-only')) {
  notesFixture = {id:'production-note',kind:'note',title:'Production editor fixture: Property Detail — 12 Units of Uncompleted Two Bedroom Apartments with Parking and Amenities',notes:'# Fixture heading\n\nOriginal **bold** text.\n\n```js\nconst fixture = true;\n```',fields:[],origin:'',username:'',password:'',allowAI:false};
  ipcMain.handle('password-manager', (_event, request) => {
    if(request.action === 'notes')return [{...notesFixture,notes:undefined}];
    if(request.action === 'edit')return {...notesFixture};
    if(request.action === 'save'){notesFixture={...notesFixture,...request.item};notesSaves.push({...notesFixture});return notesFixture;}
    return {};
  });
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const windows = {};
let groupAuthenticationCalls=0, cancelGroupAuthentication=false, finishGroupAuthentication;
require(path.join(runtimeDir,'electronBrowser.js')).registerGroupLocks(contents=>Object.values(windows).some(win=>!win.isDestroyed()&&win.webContents===contents),{
  available:async()=>process.argv.includes('--group-locks-only'),
  authenticate:async()=>{groupAuthenticationCalls+=1;if(cancelGroupAuthentication)throw new Error('Authentication cancelled');if(finishGroupAuthentication!==undefined)await new Promise(resolve=>{finishGroupAuthentication=resolve;});}
});
eventBus.registerOnMain(ipcMain, windows);
const evaluate = async (win, code) => { try { return await win.webContents.executeJavaScript(code); } catch (error) { console.error('Failed UI expression:', code); throw error; } };
const createSpace = async(win) => {
  await evaluate(win, `document.querySelector('.system-space-switcher button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);
  await wait(100);nativeContextMenu.items.find(item=>item.label==='Create space…').click();nativeContextMenu.closePopup(win);await wait(100);
};
const input = (win, id, value) =>
  evaluate(
    win,
    `(()=>{const el=document.querySelector(${JSON.stringify(
      id
    )});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(
      value
    )});el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`
  );
const tab = (win, name) =>
  evaluate(
    win,
    `(()=>{const el=Array.from(document.querySelectorAll('[role="tab"]')).find(el=>el.textContent.includes(${JSON.stringify(
      name
    )}));el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));})();undefined`
  );
app
  .whenReady()
  .then(async () => {
    let stalledNewTabResponse;
    let primaryColorLoads = 0;
    let primaryColorReload;
    let popupHits = 0;
    const popupForms = [];
    let expiredChildHits = 0;
    let earlyDownloadPageHits = 0;
    let earlyFileHits = 0;
    const activeDownloadResponses = [];
    let releaseActiveDownload = false;
    let activeDownloadPageHits = 0;
    const aiBodies = [];
    const server = http
      .createServer((req, res) => {
        if (req.url === '/v1/chat/completions') {
          let raw=''; req.on('data', chunk=>raw+=chunk);
          req.on('end',()=>{const body=JSON.parse(raw);const title=!body.tools?.length;
            if(!title)aiBodies.push(body);
            const privatePrompt=JSON.stringify(body.messages).includes('PRIVATE_CHAT_MARKER');
            res.setHeader('Content-Type','application/json');
            let message={role:'assistant',content:title?'Fixture chat':privatePrompt?'Private answer':'Regular answer'};
            if(!title&&privatePrompt){
              const calls=body.messages.flatMap(entry=>entry.tool_calls||[]);
              const next=!calls.some(call=>call.function.name==='list_tabs')?'list_tabs':!calls.some(call=>call.function.name==='read_page')?'read_page':undefined;
              if(next)message={role:'assistant',content:null,tool_calls:[{id:'private-'+next,type:'function',function:{name:next,arguments:JSON.stringify(next==='read_page'?{tabId:'private-fixture'}:{})}}]};
            }
            res.end(JSON.stringify({choices:[{message}]}));
          }); return;
        }
        if (req.url === '/v1/models') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'gpt-4.1'}]}));return;}
        if (req.url === '/theme-fixture') {res.setHeader('Content-Type','text/html');res.end('<title>Header theme fixture</title><header style="height:90px;background:rgb(252,215,43)">Brand header</header><p>Native CSS theme fallback</p>');return;}
        if (req.url.startsWith('/favorite-theme?')) {
          const color = new URL(req.url, 'http://localhost').searchParams.get('color');
          res.setHeader('Content-Type', 'text/html');
          res.end('<title>Favorite color fixture</title>' + (/^[0-9a-f]{6}$/i.test(color || '') ? '<meta name="theme-color" content="#' + color + '">' : '') + '<p>Favorite theme fixture</p>');
          return;
        }
        if (req.url === '/primary-color-cache') {
          primaryColorLoads += 1;
          res.setHeader('Content-Type', 'text/html');
          if (primaryColorLoads === 2) { primaryColorReload = res; return; }
          res.end('<title>Cached color fixture</title><div style="height:56px;background:#fcd72b">Header</div>'); return;
        }
        if (req.url === '/primary-color-redirect') {res.writeHead(302, {Location:url.replace('127.0.0.1','localhost')+'/primary-color-empty'});res.end();return;}
        if (req.url === '/primary-color-empty') {res.setHeader('Content-Type','text/html');res.end('<title>No header color</title><p>Another origin</p>');return;}
        if (req.url === '/capture-fixture') {res.end(`<title>Capture fixture</title><style>body{margin:0;min-height:2600px;background:#f7f7ff;color:#171725;font-family:Arial}h1{padding:24px}#box{margin:24px;width:240px;height:120px;background:#eb4b4b}#below{margin-top:1900px;padding:24px;background:#37c392}.print-only{display:none}@media print{.screen-only{display:none}.print-only{display:block}body{background:white}}</style><h1>Capture marker top</h1><div id="box"></div><p class="screen-only">SCREEN ONLY MARKER</p><p class="print-only">PDF PRINT LAYOUT MARKER</p><div id="below">Below the fold marker</div><script>window.captureClicks=0;document.addEventListener('click',()=>window.captureClicks++);</script>`);return;}
        if (req.url === '/ai-guarded-close') {res.end(`<title>Guarded close fixture</title><button onclick="window.onbeforeunload=()=>''">Arm close guard</button><script>window.addEventListener('unload',()=>{localStorage.closeUnloadCount=Number(localStorage.closeUnloadCount||0)+1;})</script>`);return;}
        if (req.url.startsWith('/ai-dialog-tab')) {res.end(`<title>AI dialog destination</title><script>window.dialogResult=confirm('Native browser navigation fixture')</script><p>Dialog destination loaded</p>`);return;}
        if (req.url === '/ai-tab-redirect') {res.writeHead(302,{Location:'/popup-tab'});res.end();return;}
        if (req.url === '/ai-stalled-new-tab') {stalledNewTabResponse=res;return;}
        if (req.url === '/permission-child') {
          res.end(`<script>navigator.geolocation.getCurrentPosition(()=>parent.postMessage('permission-allowed','*'),()=>parent.postMessage('permission-denied','*'));</script>`);return;
        }
        if (req.url === '/download-fixture') {
          res.setHeader('Content-Disposition', 'attachment; filename="kudiumbrowser-download-test.txt"');
          res.end('KudiumBrowser download fixture'); return;
        }
        if (req.url === '/new-tab-icon.png') {res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVR4nO3OIQEAAAgDsOckJ/0gxs3E/JKdqxIQEBAQEBAQEBAQEBAQEGgHHuoPNHkTKkJmAAAAAElFTkSuQmCC','base64'));return;}
        if (req.url.startsWith('/active-download-child')) {activeDownloadPageHits+=1;res.end('<title>Active download child</title><a id="file" href="/active-child-file" download>Download</a><script>if(!localStorage.getItem("active-child-started:"+location.search)){localStorage.setItem("active-child-started:"+location.search,"yes");document.getElementById("file").click();}</script>');return;}
        if (req.url === '/active-child-file') {
          const offset=Number((req.headers.range || '').match(/bytes=(\d+)-/)?.[1] || 0);
          res.writeHead(offset ? 206 : 200,{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="active-child.txt"','Content-Length':4096-offset,'Accept-Ranges':'bytes','ETag':'"active-child-fixture"',...(offset ? {'Content-Range':`bytes ${offset}-4095/4096`} : {})});
          const first=Math.min(1024,4096-offset);res.write('x'.repeat(first));
          if(releaseActiveDownload)res.end('x'.repeat(4096-offset-first));
          else activeDownloadResponses.push({response:res,remaining:4096-offset-first});return;
        }
        if (req.url.startsWith('/early-download-child')) {earlyDownloadPageHits+=1;res.end('<title>Early download child</title><a id="file" href="/early-child-file" download>Download</a><input type="file" aria-label="Attach downloaded file"><script>const key="early-download-started:"+location.search;if(!localStorage.getItem(key)){localStorage.setItem(key,"yes");document.getElementById("file").click();}</script>');return;}
        if (req.url === '/early-child-file') {earlyFileHits+=1;res.writeHead(200,{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="early-child.txt"'});res.end('Child download before adoption');return;}
        if (req.url === '/nested-child') {res.end('<title>Nested child</title><input aria-label="Nested value">');return;}
        if (req.url === '/self-close') {res.end('<title>Self-closing child</title><script>window.close()</script>');return;}
        if (req.url === '/adoption-timeout') {expiredChildHits+=1;res.end('<title>Unadopted child</title>Waiting');return;}
        if (req.url === '/command-link') {res.end('<title>Command link destination</title><h1>Command link destination</h1>');return;}
        if (req.url === '/popup-tab') {popupHits+=1;res.end('<title>Destination page identity</title><link rel="icon" href="/new-tab-icon.png"><h1>New page</h1>');return;}
        if (req.url === '/popup-form') {
          let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{popupForms.push({method:req.method,body});res.end('<title>Submitted child</title><p>Form received</p>');});return;
        }
        if (req.url === '/late-image') {setTimeout(()=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');},2500);return;}
        if (req.url === '/early-document') {res.end('<title>Early document</title><h1>Ready before images</h1><img src="/late-image">');return;}
        if (req.url.includes('/connection-benchmark')) {setTimeout(()=>res.end('<title>Benchmark</title><h1>Ready</h1>'),700);return;}
        if (req.url.includes('/slow-connection')) {setTimeout(()=>res.end('<title>Connection ready</title><h1>Loaded</h1>'),4500);return;}
        if (req.url.includes('/slow-loading')) {
          setTimeout(() => res.end('<title>Slow page</title><h1>Loaded</h1>'), 1800);
          return;
        }
        res.end(
          `<html><meta name="viewport" content="width=device-width, initial-scale=1"><title>${
            req.url.includes('message') ? 'Messages' : 'Home'
          }</title><style>body{font:15px -apple-system;background:#f6f8fc;color:#283048;margin:0;padding:60px}small{color:#747d91}h1{letter-spacing:-1px;font-size:32px}.card{margin-top:32px;background:white;border:1px solid #e2e6ef;border-radius:15px;padding:28px;max-width:550px}</style><small>KUDIUMBROWSER · LOCAL BROWSER VERIFICATION</small><h1>Your pages, one session.</h1><p>This local page is used to verify session isolation and tab navigation.</p><div class=card>Each horizontal tab shares this session.<br><br>Other sidebar sessions keep their cookies separate.</div></html>`
        );
      })
      .listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const create = async (view, width, height) => {
      const win = new BrowserWindow({
        width,
        height,
        show: true,
        titleBarStyle: 'hiddenInset',
        ...(view === 'main' && { trafficLightPosition: { x: 12, y: 13 } }),
        vibrancy: 'sidebar',
        webPreferences: {
          preload: path.join(runtimeDir, 'preload.js'),
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });
      windows[view] = win;
      win.webContents.on('console-message', (event) => {
        if (event.level === 'error') console.error('RENDER', event.message);
      });
      if (view === 'main') {
        const api = require(path.join(runtimeDir, 'electronBrowser.js'));
        const coordinator = api.getBrowserWindows() || api.registerBrowserWindows(() => create('main-secondary', 1160, 900));
        coordinator.register(win);
        if(process.argv.includes('--folder-group-switch-only'))api.registerSidebarPanelWindow(win);
        registerBrowser(win);
      }
      if (view === 'task-manager') { win.setParentWindow(windows.main); require(path.join(runtimeDir,'electronBrowser.js')).registerTaskManagerWindow(win); }
      if (view === 'main-secondary') { win.loadFile(path.resolve('release/app/dist/renderer/index.html'), { query: { view: 'main' } }).catch(console.error); return win; }
      await win.loadFile(path.resolve(process.env.KUDIUMBROWSER_SMOKE_RENDERER || 'release/app/dist/renderer', 'index.html'), {
        query: { view },
      });
      await wait(600);
      return win;
    };
    if (process.argv.includes('--private-only')) {
      const api = require(path.join(runtimeDir, 'electronBrowser.js'));
      const downloads = require(path.join(runtimeDir,'downloads.js'));
      downloads.registerDownloadLibrary(()=>{},contents=>Object.values(windows).some(win=>!win.isDestroyed()&&win.webContents===contents));
      // Disposable secure-store substitute avoids prompting the real Keychain.
      const crypto=require('crypto'),storageKey=crypto.randomBytes(32);
      Object.assign(api.fixtureSecureStorage,{
        isEncryptionAvailable:()=>true,isFileAvailable:()=>true,getSelectedStorageBackend:()=>'fixture',
        encryptString:value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',storageKey,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},
        decryptString:value=>{const decipher=crypto.createDecipheriv('aes-256-gcm',storageKey,value.subarray(0,12));decipher.setAuthTag(value.subarray(12,28));return Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8');}
      });
      const regularWindow = await create('main', 1160, 900);
      await evaluate(regularWindow, `window.electron.ai.settings({endpoint:${JSON.stringify(url+'/v1')},model:'fixture',key:'fixture-session-key',remember:false})`);
      let settingsBefore = fs.readFileSync(path.join(app.getPath('userData'),'ai-settings.json'));
      const scratchBefore = new Set(fs.readdirSync(app.getPath('temp')).filter(name=>name.startsWith('kudium-private-ai-')));
      let target = api.createPrivateSession();
      const createPrivateShell = async () => {
        const win = new BrowserWindow({ width:1160, height:900, titleBarStyle:'hiddenInset', trafficLightPosition:{x:12,y:13}, webPreferences:{session:target,preload:path.join(runtimeDir,'preload.js'),contextIsolation:true,sandbox:true} });
        windows['private-'+win.id]=win;
        const manager = api.registerPrivateBrowserWindow(win, createPrivateShell);
        api.attachPrivateWindow(win,target);
        if (!manager.hasOtherWindows(win)) registerBrowser(win);
        await win.loadFile(path.resolve('release/app/dist/renderer/index.html'),{query:{view:'main',private:'1'}});
        await wait(500);
        return win;
      };
      // Regular coordinator is retained while private windows use their own manager.
      const privateWindow = await createPrivateShell();
      const scratch = fs.readdirSync(app.getPath('temp')).filter(name=>name.startsWith('kudium-private-ai-')&&!scratchBefore.has(name));
      assert.equal(scratch.length,1);
      assert.equal(target.isPersistent(),false);
      assert(await evaluate(privateWindow,"!!document.querySelector('.workspace-sidebar') && !!document.querySelector('[data-private]')"),'Private mode must reuse the existing workspace/sidebar');
      const item={id:'private-fixture',sessionId:'private-group',name:'Private test',url:url+'/home',icon:'',spaceId:'default',pinned:false};
      privateWindow.webContents.send('browser-tab-request',{action:'create',app:item});
      for(let i=0;i<100;i++){if(privateWindow.contentView.children.some(v=>v instanceof WebContentsView&&v.webContents.getURL()===item.url))break;await wait(50);}
      const page=privateWindow.contentView.children.find(v=>v instanceof WebContentsView&&v.webContents.getURL()===item.url);
      assert(page,'Existing tab UI must create the private page');assert.equal(page.webContents.session,target);
      assert.equal(page.webContents.getLastWebPreferences().preload,undefined);
      await require('electron').session.defaultSession.cookies.set({url,name:'regular',value:'keep'});
      assert.deepEqual(await target.cookies.get({name:'regular'}),[]);
      await target.cookies.set({url,name:'private',value:'temporary'});
      await page.webContents.executeJavaScript("window.open('/popup-tab','private-test');true",true);
      for(let i=0;i<100;i++){if(privateWindow.contentView.children.some(v=>v instanceof WebContentsView&&v.webContents.getURL().endsWith('/popup-tab')))break;await wait(50);}
      const popup=privateWindow.contentView.children.find(v=>v instanceof WebContentsView&&v.webContents.getURL().endsWith('/popup-tab'));
      assert(popup,'Existing tab adoption must handle private popups');assert.equal(popup.webContents.session,target);
      assert.equal(await popup.webContents.executeJavaScript('!!window.opener'),true);
      // Exercise the OAuth popup transport without real accounts or credentials.
      await page.webContents.executeJavaScript(`window.oauthResult=undefined;addEventListener('message',event=>{if(event.origin===location.origin&&event.data.state==='fixture-state')window.oauthResult=event.data.code;});undefined`);
      await popup.webContents.executeJavaScript(`document.cookie='oauth_fixture=private; path=/';opener.postMessage({state:'fixture-state',code:'fixture-code'},location.origin);undefined`);
      for(let i=0;i<50&&!(await page.webContents.executeJavaScript('window.oauthResult'));i++)await wait(20);
      assert.equal(await page.webContents.executeJavaScript('window.oauthResult'),'fixture-code');
      assert.equal((await target.cookies.get({name:'oauth_fixture'})).length,1);
      assert.deepEqual(await require('electron').session.defaultSession.cookies.get({name:'oauth_fixture'}),[]);

      // Keep fixture documents observable on a locked/headless Mac. This is
      // test-only; production retains its normal foreground visibility policy.
      if(!nativePrivateDialogs) page.webContents.setBackgroundThrottling(false);
      privateWindow.show();privateWindow.focus();
      await evaluate(privateWindow,`document.getElementById('page-tab-private-fixture').click();undefined`);await wait(300);
      console.log('Private fixture: popup transport passed; testing permissions.');
      // Actual Chromium requests use the ordinary website permission handler.
      const savedSites=require(path.join(runtimeDir,'siteSettings.js'));
      const siteFile=path.join(app.getPath('userData'),'site-settings.json');
      const sitesBefore=fs.existsSync(siteFile)?fs.readFileSync(siteFile):undefined;
      const dialogs=require(path.join(runtimeDir,'dialogs.js'));
      const originalDialog=dialogs.showBrowserDialog;let permissionPrompts=0;
      dialogs.showBrowserDialog=async(_window,options)=>{assert.equal(options.siteOrigin,url);permissionPrompts++;console.log('Private permission request:',options.message);return nativePrivateDialogs?originalDialog(_window,options):{response:0};};
      try {
        assert.equal(await page.webContents.executeJavaScript(`new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve('allowed'),error=>resolve(error.code),{timeout:${nativePrivateDialogs?120000:3000}}))`),1);
        assert.equal(await page.webContents.executeJavaScript(`new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve('allowed'),error=>resolve(error.code),{timeout:${nativePrivateDialogs?120000:3000}}))`),1);
        assert.equal(permissionPrompts,1,'Private denial is remembered for this session');
        const privateProfile=`private:${privateWindow.id}:private-group`;
        assert.equal(await page.webContents.executeJavaScript(`navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream=>{stream.getTracks().forEach(track=>track.stop());return 'allowed';},error=>error.name)`),'NotAllowedError');
        assert.equal(permissionPrompts,2,'Camera/microphone must use the website prompt');
        assert.equal(savedSites.getSiteSettings(privateProfile,url).permissions.geolocation,'block');
        assert.equal(savedSites.getSiteSettings(privateProfile,url).permissions.camera,'block');assert.equal(savedSites.getSiteSettings(privateProfile,url).permissions.microphone,'block');
        assert.deepEqual(savedSites.getSiteSettings('private-group',url).permissions,{});
      } finally {dialogs.showBrowserDialog=originalDialog;}
      assert.deepEqual(fs.existsSync(siteFile)?fs.readFileSync(siteFile):undefined,sitesBefore,'Private permission decisions never persist');

      await require('./webauthn-fixture.cjs')(page.webContents,url.replace('127.0.0.1','localhost'));
      assert.equal(page.webContents.session,target,'WebAuthn must retain the private session');
      await page.webContents.loadURL(item.url);await wait(100);
      await page.webContents.executeJavaScript(`document.body.insertAdjacentHTML('beforeend','<p>Private find marker</p>');undefined`);
      const found=new Promise(resolve=>page.webContents.on('found-in-page',(_event,result)=>{if(result.finalUpdate)resolve(result);}));
      await evaluate(privateWindow,`window.electron.browser.command({id:'private-fixture',action:'find',url:'Private find marker'})`);
      assert.equal((await found).matches,1,'Private find must search the native page');
      await evaluate(privateWindow,`window.electron.browser.command({id:'private-fixture',action:'zoom-in'})`);await wait(50);
      assert.equal(page.webContents.getZoomLevel(),0.5);
      await evaluate(privateWindow,`window.electron.browser.command({id:'private-fixture',action:'zoom-reset'})`);await wait(50);
      assert.equal(page.webContents.getZoomLevel(),0);
      // Trusted native right-click uses the existing page context menu.
      await page.webContents.executeJavaScript(`document.body.insertAdjacentHTML('beforeend','<a id="context-link" href="/private-context-target" style="position:fixed;left:20px;top:20px;z-index:99999;padding:16px;background:white;color:black">Private context link</a>');undefined`);
      nativeContextMenu=undefined;
      page.webContents.sendInputEvent({type:'mouseDown',button:'right',x:40,y:40,clickCount:1});
      page.webContents.sendInputEvent({type:'mouseUp',button:'right',x:40,y:40,clickCount:1});
      for(let i=0;i<100&&!nativeContextMenu;i++)await wait(20);
      assert(nativeContextMenu,'Private native right-click must open the standard page menu');
      assert(nativeContextMenu.items.some(entry=>entry.label==='Save Page As…'));
      assert(nativeContextMenu.items.some(entry=>entry.label==='Print…'));
      const contextOpen=nativeContextMenu.items.find(entry=>entry.label==='Open Link in New Tab');
      assert(contextOpen,'Private link menu must offer standard tab creation');
      contextOpen.click();nativeContextMenu.closePopup(privateWindow);
      let contextPage;
      for(let i=0;i<100;i++){contextPage=privateWindow.contentView.children.find(view=>view.webContents?.getURL()===url+'/private-context-target');if(contextPage)break;await wait(30);}
      assert(contextPage,'Native context action must create a real private page');
      assert.equal(contextPage.webContents.session,target);
      assert.equal((await contextPage.webContents.session.cookies.get({name:'private'})).length,1);

      // Real beforeunload with controlled answers; cancel preserves the page,
      // approved unload destroys it exactly once and retains temporary tab metadata.
      const guarded={...item,id:'private-guarded',name:'Guarded private page',url:url+'/ai-guarded-close'};
      privateWindow.webContents.send('browser-tab-request',{action:'create',app:guarded});
      let guardedPage;
      for(let i=0;i<100;i++){guardedPage=privateWindow.contentView.children.find(view=>view.webContents?.getURL()===guarded.url);if(guardedPage)break;await wait(30);}
      assert(guardedPage,'Private guarded tab must load');
      const guardedContents=guardedPage.webContents;let guardedDestructions=0;
      guardedContents.on('destroyed',()=>guardedDestructions++);
      await guardedContents.executeJavaScript(`document.querySelector('button').click();undefined`,true);
      let unloadPrompts=0;
      const savedDialog=dialogs.showBrowserDialog;
      try {
        dialogs.showBrowserDialog=async(_owner,options)=>{assert.equal(options.message,'Unload this tab with unsaved changes?');unloadPrompts++;return {response:0};};
        await evaluate(privateWindow,`window.electron.browser.command({id:'private-guarded',action:'unload-tab'})`);
        for(let i=0;i<100&&!unloadPrompts;i++)await wait(20);await wait(100);
        assert.equal(unloadPrompts,1);
        assert(!guardedContents.isDestroyed(),'Canceled private unload must keep the actual page');
        assert.equal(guardedDestructions,0);
        assert.equal(await guardedContents.executeJavaScript('localStorage.closeUnloadCount'),null);
        dialogs.showBrowserDialog=async()=>({response:1});
        await evaluate(privateWindow,`window.electron.browser.command({id:'private-guarded',action:'unload-tab'})`);
        for(let i=0;i<100&&!guardedContents.isDestroyed();i++)await wait(20);
        assert(guardedContents.isDestroyed(),'Confirmed private unload must destroy the guarded page');
        assert.equal(guardedDestructions,1,'Confirmed private unload destroys its native contents once');
        assert(api.getBrowserWindows(privateWindow).mergedLayout().apps.some(tab=>tab.id==='private-guarded'&&!tab.archived),'Unloading private tabs must retain their temporary metadata');
      } finally {dialogs.showBrowserDialog=savedDialog;}
      privateWindow.webContents.send('browser-tab-request',{action:'select',id:'private-fixture'});await wait(150);
      console.log('Private fixture: permissions, find/zoom, native context menu and guarded unload passed; testing downloads.');
      // Real downloads; destination selection is controlled in this fixture.
      // The native picker itself remains a manual acceptance item.
      const historyFile=path.join(app.getPath('userData'),'download-history.json');
      const historyBefore=fs.existsSync(historyFile)?fs.readFileSync(historyFile):undefined;
      const savedFile=path.join(runtimeDir,'private-saved.txt');
      const receive=(destination,native=false)=>new Promise(resolve=>target.once('will-download',(_event,item)=>{
        assert.equal(item.getSavePath(),'','Private download must request a destination even with automatic regular downloads');
        assert.equal(item.getSaveDialogOptions().title,'Save private download');
        if(native) item.setSaveDialogOptions({...item.getSaveDialogOptions(),defaultPath:destination});
        else item.setSavePath(destination);resolve(item);
      }));
      const received=receive(savedFile,nativePrivateDialogs);
      page.webContents.downloadURL(url+'/download-fixture');
      const completedItem=await received;console.log('Private fixture: received completed-file DownloadItem');
      await new Promise(resolve=>completedItem.once('done',resolve));
      assert.equal(fs.readFileSync(savedFile,'utf8'),'KudiumBrowser download fixture');
      const privateDownloads=await evaluate(privateWindow,`window.electron.browser.downloads('get')`);
      assert.equal(privateDownloads.length,1);assert.equal(privateDownloads[0].state,'completed');
      assert.deepEqual(await evaluate(regularWindow,`window.electron.browser.downloads('get')`),[]);
      await evaluate(privateWindow,`window.electron.browser.downloads('open')`);await wait(100);
      assert(await evaluate(privateWindow,`!!document.querySelector('.download-sidebar-panel') && document.querySelector('.download-library-list').textContent.includes('private-saved.txt')`),'Existing Downloads sidebar must show private files');
      if(nativePrivateDialogs){
        const canceledFile=path.join(runtimeDir,'private-cancelled.txt');
        const receivingCancel=receive(canceledFile,true);
        page.webContents.downloadURL(url+'/download-fixture');
        const canceledItem=await receivingCancel;
        await new Promise(resolve=>canceledItem.once('done',resolve));
        assert.equal(canceledItem.getState(),'cancelled');
        assert(!fs.existsSync(canceledFile),'Canceling native Save must not create a file');
        console.log('Private fixture: native Save selection and cancellation passed.');
      }
      await evaluate(privateWindow,`window.electron.browser.downloads('clear')`);
      assert.equal(fs.readFileSync(savedFile,'utf8'),'KudiumBrowser download fixture');
      const pendingReceived=receive(path.join(runtimeDir,'private-pending.txt'));
      page.webContents.downloadURL(url+'/active-child-file');
      const pendingItem=await pendingReceived;console.log('Private fixture: received pending DownloadItem');
      for(let i=0;i<50&&!pendingItem.getReceivedBytes();i++)await wait(20);
      const pendingRecord=(await evaluate(privateWindow,`window.electron.browser.downloads('get')`))[0];
      await evaluate(privateWindow,`window.electron.browser.downloads('pause',${JSON.stringify(pendingRecord.id)})`);assert(pendingItem.isPaused());
      await evaluate(privateWindow,`window.electron.browser.downloads('resume',${JSON.stringify(pendingRecord.id)})`);assert(!pendingItem.isPaused());
      assert.deepEqual(fs.existsSync(historyFile)?fs.readFileSync(historyFile):undefined,historyBefore,'Private downloads never write normal history');

      const inherited = await evaluate(privateWindow,'window.electron.ai.settings()');
      assert.equal(inherited.endpoint,url+'/v1','Private chat reuses the configured provider');
      assert.equal(inherited.hasKey,true,'Private chat inherits the session-only provider key');
      await evaluate(regularWindow, `window.electron.ai.settings({endpoint:${JSON.stringify(url+'/v1')},model:'fixture-updated',key:'fixture-session-key',remember:false})`);
      assert.equal((await evaluate(privateWindow,'window.electron.ai.settings()')).model,'fixture-updated','Private chat follows configured provider changes');
      settingsBefore=fs.readFileSync(path.join(app.getPath('userData'),'ai-settings.json'));
      assert.equal((await evaluate(privateWindow,"window.electron.ai.mcpStatus()")).enabled,false,'Regular external control is not inherited');
      await evaluate(privateWindow,"document.querySelector('.chat-toolbar-button').click();undefined");
      await wait(200);
      assert(await evaluate(privateWindow,"!!document.querySelector('.ai-sidebar')"),'Existing Chat sidebar must open privately');
      assert(await evaluate(privateWindow,"(()=>{const r=document.querySelector('.private-browsing-badge').getBoundingClientRect();return r.left>100||r.top>40})()"),'Private badge must clear traffic lights');
      const regularBefore = await evaluate(regularWindow,'window.electron.ai.conversations()');
      await Promise.all([
        evaluate(privateWindow,"window.electron.ai.run('PRIVATE_CHAT_MARKER')"),
        evaluate(regularWindow,"window.electron.ai.run('REGULAR_CHAT_MARKER')")
      ]);
      for(let i=0;i<160;i++){
        const status=await Promise.all([evaluate(privateWindow,'window.electron.ai.taskStatus()'),evaluate(regularWindow,'window.electron.ai.taskStatus()')]);
        if(status.every(s=>!s.busy))break;await wait(50);
      }
      const privateChats = await evaluate(privateWindow,'window.electron.ai.conversations()');
      const regularChats = await evaluate(regularWindow,'window.electron.ai.conversations()');
      assert(privateChats.history.some(e=>e.text==='Private answer'),'Private AI must respond');
      assert(regularChats.history.some(e=>e.text==='Regular answer'),'Regular AI must respond simultaneously');
      assert(!JSON.stringify(privateChats).includes('REGULAR_CHAT_MARKER'));
      assert(!JSON.stringify(regularChats).includes('PRIVATE_CHAT_MARKER'));
      assert.notEqual(privateChats.selectedId,regularBefore.selectedId);
      const privateBody=aiBodies.find(body=>JSON.stringify(body.messages).includes('PRIVATE_CHAT_MARKER'));
      assert(privateBody&&!JSON.stringify(privateBody).includes('REGULAR_CHAT_MARKER'),'Provider requests must isolate conversation context');
      assert(aiBodies.some(body=>body.messages.some(entry=>entry.role==='tool'&&entry.content.includes('Private find marker'))),'Private AI must read its own native browser page');
      assert.deepEqual(fs.readFileSync(path.join(app.getPath('userData'),'ai-settings.json')),settingsBefore,'Private chat must not alter regular settings');
      assert(!privateChats.storageNotice,'Memory-only private chat must not report a Keychain error');
      fs.writeFileSync(path.join(out,'private-shared-shell.png'),(await privateWindow.capturePage()).toPNG());
      assert(!fs.existsSync(path.join(app.getPath('userData'),'browsing-history.json')),'Private visits must not create persistent history');
      privateWindow.close();
      for(let i=0;i<100&&(await target.cookies.get({name:'private'})).length;i++)await wait(50);
      assert.deepEqual(await target.cookies.get({name:'private'}),[]);
      assert.equal(pendingItem.getState(),'cancelled','Final close cancels unfinished private downloads');
      assert.deepEqual(downloads.getDownloadHistory(target),[]);
      assert.equal(fs.readFileSync(savedFile,'utf8'),'KudiumBrowser download fixture');
      assert.deepEqual(savedSites.getSiteSettings(`private:${privateWindow.id}:private-group`,url).permissions,{});
      for(let i=0;i<100&&fs.existsSync(path.join(app.getPath('temp'),scratch[0]));i++)await wait(50);
      assert(!fs.existsSync(path.join(app.getPath('temp'),scratch[0])),'Private AI scratch files must be removed on final close');
      assert.equal((await require('electron').session.defaultSession.cookies.get({name:'regular'})).length,1);
      assert((await evaluate(regularWindow,'window.electron.ai.conversations()')).history.some(e=>e.text==='Regular answer'),'Closing private AI must preserve regular handlers/history');
      target = api.createPrivateSession();
      const fresh = await createPrivateShell();
      assert.deepEqual(await evaluate(fresh,`window.electron.browser.downloads('get')`),[],'Fresh private window must have no download history');
      assert.deepEqual((await evaluate(fresh,'window.electron.ai.conversations()')).history,[],'New private windows must start with empty chat history');
      fresh.close();
      regularWindow.close();
      if(nativePrivateDialogs) fs.writeFileSync(path.join(out,'private-native-dialogs-results.json'),JSON.stringify({
        measuredAt:new Date().toISOString(),electron:process.versions.electron,
        verified:['actual location/media dialog Deny buttons','remembered session-only denials','actual macOS Save acceptance and cancellation','saved file contents and preservation after final close','canceled file absent','private history and final cleanup'],
        limitations:['Media devices are fake; actual device/OS grants are not tested.','The website/provider is a local disposable fixture.']
      },null,2));
      console.log('PASS: private AI reads/responses, regular/private isolation, shared shell, popup messaging, Chromium permission denials, virtual WebAuthn signatures/iframe policy, find/zoom, native context menus, guarded unload, memory-only downloads and final-window cleanup. Screenshot: '+path.join(out,'private-shared-shell.png'));
      server.close();app.quit();return;
    }
    if (process.argv.includes('--downloads-only')) {
      const downloads = require(path.join(runtimeDir, 'downloads.js'));
      downloads.registerDownloadLibrary(() => {}, contents => Object.values(windows).some(win => win.webContents === contents));
      const library = await create('downloads', 1020, 780);
      const prefs = require(path.join(runtimeDir, 'preferences.js'));
      app.setPath('downloads', runtimeDir);
      prefs.updateBrowserPreferences({ askDownloadLocation: false });
      const session = library.webContents.session;
      downloads.trackDownloads(session);
      const done = new Promise(resolve => session.once('will-download', (_, item) => item.once('done', resolve)));
      session.downloadURL(url + '/download-fixture');
      await done; await wait(500);
      assert.equal(downloads.getDownloadHistory()[0].state, 'completed');
      assert(await evaluate(library, "document.querySelector('.download-library-list').textContent.includes('kudiumbrowser-download-test.txt')"));
      await input(library, '[aria-label="Search downloads"]', 'no match'); await wait(100);
      assert.equal(await evaluate(library, "document.querySelectorAll('.download-library-row').length"), 0);
      await input(library, '[aria-label="Search downloads"]', ''); await wait(100);
      for (const width of [1020, 420]) {
        library.setSize(width, 700); await wait(150);
        assert(await evaluate(library, 'document.documentElement.scrollWidth <= innerWidth + 1'));
        assert(await evaluate(library, "Array.from(document.querySelectorAll('.download-library-actions button')).every(button => button.getBoundingClientRect().right <= innerWidth)"));
        fs.writeFileSync(path.join(out, 'downloads-' + width + '.png'), (await library.capturePage()).toPNG());
      }
      await evaluate(library, "Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Clear history')).click();undefined");
      await wait(100);
      await evaluate(library, "Array.from(document.querySelectorAll('[role=dialog] button')).find(button => button.textContent.includes('Clear history')).click();undefined");
      await wait(300);
      assert.equal(downloads.getDownloadHistory().length, 0);
      assert(fs.existsSync(path.join(runtimeDir, 'kudiumbrowser-download-test.txt')));
      console.log('Download library passed: real download, search, clear preserves file, desktop and narrow layouts. Screenshots: ' + out);
      server.close(); app.exit(0); return;
    }
    const main = await create('main', 1160, 850);
    if (process.argv.includes('--sign-in-only')) {
      await require('./browser-signin-acceptance.cjs')({main,evaluate,out,url});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.exit(0);return;
    }
    if (process.argv.includes('--project-folder-drop-only')) {
      await require('./project-folder-drop-acceptance.cjs')({main,evaluate,runtimeDir,out,url});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--space-search-only')) {
      await require('./space-search-acceptance.cjs')({ main, evaluate, out, url, nativeMenu: () => nativeContextMenu });
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--primary-color-cache-only')) {
      await require('./primary-color-cache-acceptance.cjs')({ main, evaluate, url, finishReload: () => {
        assert(primaryColorReload, 'A reload response is waiting');
        primaryColorReload.end('<title>Fresh color fixture</title><div style="height:56px;background:#00b53f">Fresh header</div>');
      } });
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--group-toolbar-only')) {
      await require('./group-toolbar-acceptance.cjs')({ main, evaluate, out, runtimeDir, url, dialog });
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--sync-suggestion-only')) {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await evaluate(main, `!!document.querySelector('.account-sync-suggestion')`)) break;
        await wait(30);
      }
      assert(await evaluate(main, `!!document.querySelector('.account-sync-suggestion')`), 'Offer account sync on startup');
      await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='240px';undefined`);
      await wait(350);
      assert(await evaluate(main, `(()=>{const card=document.querySelector('.account-sync-suggestion'),r=card.getBoundingClientRect(),s=document.querySelector('.workspace-sidebar').getBoundingClientRect();return r.width>0&&r.left>=s.left&&r.right<=s.right&&card.scrollWidth<=card.clientWidth+1})()`), 'Suggestion fits narrow sidebar');
      fs.writeFileSync(path.join(out, 'account-sync-startup.png'), (await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('.workspace').classList.add('compact-sidebar');undefined`);
      assert(await evaluate(main, `getComputedStyle(document.querySelector('.account-sync-suggestion')).display==='none'`), 'Collapsed sidebar hides the suggestion');
      await evaluate(main, `document.querySelector('.workspace').classList.remove('compact-sidebar');document.querySelector('[aria-label="Dismiss sync suggestion"]').click();undefined`);
      assert(await evaluate(main, `!document.querySelector('.account-sync-suggestion')`), 'Dismissal hides the suggestion');
      await main.reload();
      await wait(500);
      assert(await evaluate(main, `!!document.querySelector('.sidebar-bottom')&&!document.querySelector('.account-sync-suggestion')`), 'Dismissal survives browser reload');
      console.log('PASS: account sync startup suggestion, narrow and collapsed sidebar, persistent dismissal. Evidence: ' + out);
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--space-footer-only')) {
      await require('./space-footer-acceptance.cjs')({main,evaluate,out});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--ai-chat-scroll-only')) {
      await require('./ai-chat-scroll-acceptance.cjs')({main,evaluate,out});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--tab-switcher-only')) {
      await require('./tab-switcher-acceptance.cjs')({main,evaluate,out,url});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--production-assets-only')) {
      await require('./production-assets-acceptance.cjs')({main,evaluate,runtimeDir,out,url});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--notes-editor-only')) {
      await evaluate(main, `window.noteCSPViolations=[];document.addEventListener('securitypolicyviolation',event=>window.noteCSPViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));localStorage.setItem('kudiumbrowser-ai-page-pane',JSON.stringify('notes'));window.dispatchEvent(new CustomEvent('ai-page-preference-changed',{detail:'kudiumbrowser-ai-page-pane'}));document.querySelector('[aria-label^="Toggle Chat sidebar"]').click();undefined`);
      await wait(300);
      await evaluate(main, `localStorage.setItem('kudiumbrowser-ai-page-pane',JSON.stringify('notes'));window.dispatchEvent(new CustomEvent('ai-page-preference-changed',{detail:'kudiumbrowser-ai-page-pane'}));undefined`);
      await wait(600);
      await evaluate(main, `const note=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Production editor fixture'));if(!note)throw new Error('Fixture note missing');note.click();undefined`);
      await wait(1200);
      const loaded = await evaluate(main, `({rich:!!document.querySelector('[aria-label="Note content"]'),heading:document.querySelector('.notes-rich-editor h1')?.textContent,bold:document.querySelector('.notes-rich-editor strong')?.textContent,code:document.querySelector('.notes-rich-editor pre code')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),violations:window.noteCSPViolations})`);
      fs.writeFileSync(path.join(out,'notes-editor-load.json'),JSON.stringify(loaded,null,2));
      const noteLayouts = [];
      for (const width of [520, 320, 240]) {
        await evaluate(main, `document.querySelector('.ai-sidebar').style.width='${width}px';document.querySelector('.ai-panel-slot').style.width='${width+8}px';undefined`);
        await wait(120);
        const layout = await evaluate(main, `(()=>{const title=document.querySelector('[aria-label="Note title"]'),r=title.getBoundingClientRect(),alert=document.querySelector('.notes-editor [role="alert"]'),buttons=alert?[...alert.querySelectorAll('button')]:[];const header=document.querySelector('.notes-toolbar'),h=header.getBoundingClientRect(),controls=[...header.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return {width:${width},headerFits:controls.every(b=>b.left>=h.left&&b.right<=h.right)&&controls.every((a,i)=>controls.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1)),title:title.value,titleHeight:r.height,lineHeight:parseFloat(getComputedStyle(title).lineHeight),titleFits:title.scrollWidth<=title.clientWidth+1&&title.scrollHeight<=title.clientHeight+1,buttonsFit:buttons.every(b=>{const bRect=b.getBoundingClientRect(),a=alert.getBoundingClientRect();return bRect.left>=a.left&&bRect.right<=a.right&&bRect.width>=90&&bRect.height>=32}),buttonsSeparated:buttons.length<2||(()=>{const a=buttons[0].getBoundingClientRect(),b=buttons[1].getBoundingClientRect();return b.left>=a.right+7||b.top>=a.bottom+7})()}})()`);
        assert(layout.headerFits, 'View and navigation controls fit without overlap at '+width+'px');
        assert.equal(layout.title, notesFixture.title, 'The complete note title is retained');
        assert(layout.titleFits && layout.titleHeight > layout.lineHeight * 1.5, 'The full title wraps without clipping at '+width+'px: '+JSON.stringify(layout));
        assert(layout.buttonsFit && layout.buttonsSeparated, 'Recovery buttons fit without touching at '+width+'px: '+JSON.stringify(layout));
        noteLayouts.push(layout);
        fs.writeFileSync(path.join(out,'notes-layout-'+width+'.png'),(await main.capturePage()).toPNG());
      }
      fs.writeFileSync(path.join(out,'notes-layout.json'),JSON.stringify(noteLayouts,null,2));
      await evaluate(main, `document.querySelector('.ai-sidebar').style.width='';document.querySelector('.ai-panel-slot').style.width='';undefined`);
      if (process.argv.includes('--notes-editor-tampered')) {
        assert.equal(loaded.rich,false,'Modified lazy chunk must be refused');
        assert(loaded.alerts.some(alert=>alert.includes('Note editor could not be displayed')));
        assert.equal(await evaluate(main,'!!window.notesTamperExecuted'),false,'Modified code must not execute');
        await evaluate(main, `[...document.querySelectorAll('button')].find(button=>button.textContent==='Use plain text').click();undefined`);
        await wait(150);
        assert.equal(await evaluate(main, `document.querySelector('[aria-label="Note Markdown source"]').value`),notesFixture.notes);
        assert.equal(notesSaves.length,0,'Failed editor must not alter saved notes');
        fs.writeFileSync(path.join(out,'notes-editor-results.json'),JSON.stringify({outcome:'passed',checks:['Modified packaged lazy chunk is refused','Modified code never executes','Plain-text recovery preserves original draft'],loaded},null,2));
        console.log('PASS: modified lazy chunk refused; original draft preserved. Artifacts: '+out);
        Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
      }
      assert.equal(loaded.rich,true,JSON.stringify(loaded));
      assert.equal(loaded.heading,'Fixture heading');assert.equal(loaded.bold,'bold');assert(loaded.code.includes('const fixture = true;'));
      assert.equal(await evaluate(main, `!!document.querySelector('.notes-toolbar [aria-label="Format note"]')`),false,'Formatting settings stay out of the header');
      await evaluate(main, `document.querySelector('[aria-label="Note options"]').click();undefined`);
      await wait(150);
      await evaluate(main, `document.querySelector('[aria-label="Increase note text size"]').click();undefined`);
      await wait(100);
      assert.equal(await evaluate(main, `getComputedStyle(document.querySelector('.notes-rich-editor')).fontSize`),'17px','Text size works from the options menu');
      fs.writeFileSync(path.join(out,'notes-options.png'),(await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('[aria-label="Reset note text size"]').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);
      await wait(100);

      await evaluate(main, `const editor=document.querySelector('[aria-label="Note content"]');editor.focus();document.execCommand('selectAll');document.execCommand('insertText',false,'Edited in the rich editor');undefined`);
      await wait(1200);
      assert(notesSaves.some(note=>note.notes.includes('Edited in the rich editor')),'Rich editor must autosave edited Markdown');
      const switchMode = async(label) => {
        const click = async(expression) => {
          const point = await evaluate(main, `(()=>{const element=${expression};if(!element)throw new Error('View control missing');const r=element.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
          main.focus();
          main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
          main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
        };
        await click(`document.querySelector('[aria-label="Change note view"]')`);
        for(let attempt=0;attempt<50;attempt++) {
          if(await evaluate(main,`[...document.querySelectorAll('[role=menuitemradio]')].some(button=>button.textContent.trim()===${JSON.stringify(label)})`))break;
          await wait(40);
        }
        await click(`[...document.querySelectorAll('[role=menuitemradio]')].find(button=>button.textContent.trim()===${JSON.stringify(label)})`);
        await wait(250);
      };
      await switchMode('Markdown');
      assert((await evaluate(main, `document.querySelector('[aria-label="Note Markdown source"]').value`)).includes('Edited in the rich editor'));
      await switchMode('Visual');
      assert((await evaluate(main, `document.querySelector('[aria-label="Note content"]').textContent`)).includes('Edited in the rich editor'));
      fs.writeFileSync(path.join(out,'notes-editor.png'),(await main.capturePage()).toPNG());
      assert.equal(loaded.violations.length,0,'Lazy editor must load without CSP violations');
      fs.writeFileSync(path.join(out,'notes-editor-results.json'),JSON.stringify({outcome:'passed',runtime:{electron:process.versions.electron,chromium:process.versions.chrome},checks:['Production lazy editor loads with CSP enabled','Markdown headings, bold and highlighted code render','Rich edit autosaves Markdown','Markdown/visual mode switching preserves edits'],loaded},null,2));
      console.log('PASS: production lazy notes editor, Markdown rendering and autosave. Artifacts: '+out);
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--compatibility-only')) {
      await require('./browser-compatibility-acceptance.cjs')({main,evaluate,runtimeDir,out,windows});
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--ai-composer-layout-only')) {
      await evaluate(main, `document.querySelector('[aria-label^="Toggle Chat sidebar"]').click();undefined`);
      await wait(500);
      const measured=[];
      for(const width of [520,420,380,320,260,240]) {
        await evaluate(main, `document.querySelector('.ai-sidebar').style.width='${width}px';document.querySelector('.ai-panel-slot').style.width='${width+8}px';undefined`);
        await wait(150);
        const layout=await evaluate(main, `(()=>{const button=document.querySelector('.ai-access-picker'),icon=button.querySelector('svg'),composer=button.closest('.ai-composer'),r=button.getBoundingClientRect(),i=icon.getBoundingClientRect(),c=composer.getBoundingClientRect();return {width:document.querySelector('.ai-sidebar').getBoundingClientRect().width,visible:getComputedStyle(icon).display!=='none'&&i.width>0&&i.height>0,inside:r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom,enabled:!button.disabled};})()`);
        assert(layout.visible,'AI permission shield must stay visible at '+width+'px');
        assert(layout.inside,'Permission button must fit inside the composer at '+width+'px');
        assert(layout.enabled,'Permission button must remain usable at '+width+'px');
        await evaluate(main, `document.querySelector('.ai-access-picker').click();undefined`);await wait(80);
        assert(await evaluate(main, `!!document.querySelector('.ai-access-popover')&&['Ask first','Standard','Full access'].every(label=>document.querySelector('.ai-access-popover').textContent.includes(label))`),'Permission menu must open at '+width+'px');
        await evaluate(main, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);await wait(80);
        measured.push(layout);
        fs.writeFileSync(path.join(out,'ai-composer-'+width+'.png'),(await main.capturePage()).toPNG());
      }
      fs.writeFileSync(path.join(out,'ai-composer-layout-results.json'),JSON.stringify({outcome:'passed',measured},null,2));
      console.log('PASS: AI permissions remain visible, contained and usable at 240–520px. Screenshots: '+out);
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.quit();return;
    }
    if (process.argv.includes('--task-manager-only')) {
      await require('./task-manager-acceptance.cjs')({main,create,evaluate,runtimeDir,out,url,windows});
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--shortcuts-layout-only')) {
      const settings = await create('settings', 1080, 800);
      await tab(settings, 'Keyboard shortcuts'); await wait(200);
      for (const [name, width, height] of [['desktop',1080,800], ['narrow',480,700]]) {
        settings.setSize(width,height); await wait(150);
        assert(await evaluate(settings, `document.documentElement.scrollWidth <= innerWidth + 1`), 'Shortcut preferences must fit the window');
        assert(await evaluate(settings, `(()=>{const toolbar=document.querySelector('.shortcut-toolbar'); const r=toolbar.getBoundingClientRect(); return [...toolbar.querySelectorAll('button,input')].every(el=>{const b=el.getBoundingClientRect();return !b.width || (b.left>=r.left && b.right<=r.right+1);});})()`), 'Shortcut toolbar controls must stay inside the card');
        fs.writeFileSync(path.join(out,`keyboard-shortcuts-${name}.png`), (await settings.capturePage()).toPNG());
      }
      console.log('PASS: keyboard shortcut preferences fit desktop and narrow windows');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--real-sites-only') || process.argv.includes('--kuditrust-only')) {
      const report = await require(process.argv.includes('--kuditrust-only') ? './kuditrust-acceptance.cjs' : './real-sites-acceptance.cjs')({main,evaluate,create,windows,runtimeDir,out,url,registerBrowser});
      server.close();
      if (!process.argv.includes('--inspect')) app.exit(report.outcome === 'passed' ? 0 : 1);
      return;
    }

    if (process.argv.includes('--windows-only')) {
      const api = require(path.join(runtimeDir, 'electronBrowser.js'));
      const coordinator = api.getBrowserWindows();
      const tabs = [
        { id:'window-one', name:'Research', sessionId:'window-research', sessionName:'Research', url:url+'/window-one', icon:'' },
        { id:'window-two', name:'Reference', sessionId:'window-research', sessionName:'Research', url:url+'/window-two', icon:'' },
      ];
      await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','window-one');undefined`);
      main.reload(); await wait(900);
      const untilUI = async (win, expression) => { for(let i=0;i<100;i++){ if(await evaluate(win,expression))return; await wait(60); } throw new Error('Timed out: '+expression); };
      await untilUI(main, `!!document.querySelector('[id="page-tab-window-one"]')`);
      await evaluate(main, `document.getElementById('page-tab-window-one').click();undefined`);
      await wait(300);
      const live = main.contentView.children.find(view=>view.webContents?.getURL().endsWith('/window-one'));
      assert(live, 'Live page created');
      const originalId=live.webContents.id;
      await live.webContents.executeJavaScript(`window.retainedMarker=42;const field=document.createElement('input');field.id='draft';field.value='Retain this draft';document.body.append(field);undefined`);
      await evaluate(main, `window.electron.browser.windowRequest({action:'open-tab',id:'window-one'});undefined`);
      await wait(700);
      const detached=windows['main-secondary'];
      await untilUI(detached, `!!document.getElementById('page-tab-window-one')`);
      assert.equal(live.webContents.id, originalId);
      assert(detached.contentView.children.includes(live), 'Original native view moved to detached window');
      assert.equal(await live.webContents.executeJavaScript('window.retainedMarker'),42);
      assert.equal(await evaluate(main, `!!document.getElementById('page-tab-window-one')`),false,'Detached tab left its original strip');
      const detachedState=coordinator.snapshot(detached);
      assert.equal(detachedState.kind,'temporary');assert.equal(detachedState.tabs.length,1);assert.equal(detachedState.tabs[0].pinned,false);
      assert(await evaluate(detached, `document.querySelectorAll('[aria-label="Unpinned groups"] .sidebar-app').length===1`),'Detached group is visible in the unpinned section');
      fs.writeFileSync(path.join(out,'detached-tab.png'),(await detached.capturePage()).toPNG());
      const token=require('crypto').randomUUID();
      await evaluate(detached, `window.electron.browser.windowRequest({action:'begin-drag',token:${JSON.stringify(token)},kind:'tab',id:'window-one'});undefined`);
      await evaluate(main, `window.electron.browser.windowRequest({action:'drop',token:${JSON.stringify(token)},targetId:'window-two'});undefined`);
      await untilUI(main, `!!document.getElementById('page-tab-window-one')`);
      await wait(350);
      assert(detached.isDestroyed(),'Empty detached window closed after drag-back');
      assert.equal(live.webContents.id,originalId);
      assert.equal(await live.webContents.executeJavaScript('document.querySelector("#draft").value'),'Retain this draft');
      assert.equal(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(tab=>tab.id==='window-one').sessionId`),'window-research');
      await evaluate(main, `window.electron.browser.windowRequest({action:'open-group',id:'window-one'});undefined`);
      await wait(750);const grouped=windows['main-secondary'];
      await untilUI(grouped, `document.querySelectorAll('.horizontal-tab').length===2`);
      await untilUI(main, `!!document.querySelector('.browser-window-mirror')`);
      fs.writeFileSync(path.join(out,'shared-page-inactive.png'),(await main.capturePage()).toPNG());
      main.focus();
      // Locked/headless macOS cannot deliver native foreground focus.
      if(process.argv.includes('--simulate-focus')) main.emit('focus');
      await wait(350);assert(main.contentView.children.includes(live));assert.equal(live.webContents.id,originalId);
      main.webContents.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['meta']});main.webContents.sendInputEvent({type:'keyUp',keyCode:'N',modifiers:['meta']});await wait(650);
      assert.equal(coordinator.snapshot(windows['main-secondary']).kind,'workspace');
      console.log('Window UI passed: production React page, single-tab detach, original live view and draft, parent-group drag-back, unpinned temporary group, whole-group window, dimmed snapshot and New Window shortcut'+(process.argv.includes('--simulate-focus')?' (foreground focus event simulated)':'')+'. Screenshots: '+out);
      Object.values(windows).forEach(win=>{if(!win.isDestroyed())win.destroy();});server.close();app.exit(0);return;
    }

    if (process.argv.includes('--page-capture-only')) {
      const {nativeImage,clipboard,ClipboardItem}=require('electron');
      const fixture=[{id:'capture-page',name:'Capture fixture',sessionId:'capture-group',sessionName:'Capture',url:url+'/capture-fixture',icon:''}];
      await evaluate(main,`localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('user_last_app_id','capture-page');undefined`);main.reload();await wait(800);
      const source=main.contentView.children.find(view=>view.webContents?.getURL().endsWith('/capture-fixture')).webContents;
      const until=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(main,expression))return;await wait(60);}throw new Error('Timed out: '+expression)};
      const clickText=async(text)=>{await evaluate(main,`Array.from(document.querySelectorAll('button,[role="menuitem"]')).find(el=>el.textContent.trim()===${JSON.stringify(text)}).click();undefined`);await wait(100)};
      const openSettings=async()=>{await evaluate(main,`document.querySelector('[aria-label="Site settings"]').click();undefined`);await until(`!!document.querySelector('.site-settings-dialog')`)};
      const openCapture=async(label)=>{await openSettings();await evaluate(main,`document.querySelector('[aria-label="Capture page"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);await until(`!!document.querySelector('[role="menuitem"]')`);await clickText(label);await until(`!!document.querySelector('.page-capture-stage img')&&document.querySelector('.page-capture-stage img').naturalWidth>0`)};
      const checkLayout=()=>evaluate(main,`(()=>{const dialog=document.querySelector('.page-capture-dialog'),r=dialog.getBoundingClientRect();return {overflow:dialog.scrollWidth>dialog.clientWidth,bounds:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,buttons:[...dialog.querySelectorAll('button')].every(b=>{const q=b.getBoundingClientRect();return q.left>=r.left&&q.right<=r.right&&q.bottom<=r.bottom})}})()`);
      const shot=async(name)=>{await wait(160);fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());};
      let saveMode='cancel';const saveCalls=[];dialog.showSaveDialog=async(_host,options)=>{saveCalls.push(options);return saveMode==='cancel'?{canceled:true}:{canceled:false,filePath:saveMode==='error'?path.join(runtimeDir,'missing','page.png'):path.join(runtimeDir,options.filters[0].extensions[0]==='pdf'?'page.pdf':'page.png')}};
      for(const theme of ['light','dark']) {
        await evaluate(main,`localStorage.setItem('kudiumbrowser-appearance','${theme}');window.dispatchEvent(new Event('kudiumbrowser-appearance-change'));undefined`);
        for(const width of [1160,480]) {
          main.setSize(width,720);await wait(200);await openSettings();await shot(`capture-menu-${theme}-${width}`);await evaluate(main,`document.querySelector('[aria-label="Capture page"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);await wait(100);await shot(`capture-options-${theme}-${width}`);await clickText('Capture area');await until(`!!document.querySelector('.page-capture-stage img')&&document.querySelector('.page-capture-stage img').naturalWidth>0`);
          await evaluate(main,`document.querySelector('.page-capture-stage').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);await wait(80);
          const layout=await checkLayout();assert(!layout.overflow&&layout.bounds&&layout.buttons,JSON.stringify(layout));await shot(`capture-area-${theme}-${width}`);
          await clickText('Cancel');await until(`!document.querySelector('.page-capture-dialog')`);
        }
      }
      main.setSize(1160,720);await wait(160);await openCapture('Capture area');
      const bounds=await evaluate(main,`(()=>{const r=document.querySelector('.page-capture-stage img').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
      const start={x:Math.round(bounds.x+bounds.width*.1),y:Math.round(bounds.y+bounds.height*.1)},end={x:Math.round(bounds.x+bounds.width*.5),y:Math.round(bounds.y+bounds.height*.5)};
      main.webContents.sendInputEvent({type:'mouseMove',...start});main.webContents.sendInputEvent({type:'mouseDown',...start,button:'left',clickCount:1});main.webContents.sendInputEvent({type:'mouseMove',...end});main.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1});await wait(180);
      const dimensions=await evaluate(main,`document.querySelector('.page-capture-footer > span').textContent.split(' × ').map(Number)`);assert(dimensions.every(n=>n>0));assert.equal(await source.executeJavaScript('window.captureClicks'),0,'Crop selection never interacts with the webpage');await shot('capture-area-pointer');
      const previousClipboard=await Promise.all((await clipboard.read()).map(async(item)=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async(type)=>[type,await item.getType(type)]))))));
      try {await clickText('Copy');await until(`document.querySelector('.page-capture-footer > span').textContent==='Copied to clipboard'`);const item=(await clipboard.read()).find(item=>item.types.includes('image/png'));assert(item);const blob=await item.getType('image/png');const size=nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize();assert.equal(size.width,dimensions[0]);assert.equal(size.height,dimensions[1]);}finally{if(previousClipboard.length)await clipboard.write(previousClipboard);else await clipboard.clear();}
      saveMode='error';await clickText('Save image');await until(`!!document.querySelector('.page-capture-error')`);await shot('capture-save-error');main.setSize(480,720);await wait(160);const errorLayout=await checkLayout();assert(!errorLayout.overflow&&errorLayout.bounds&&errorLayout.buttons,JSON.stringify(errorLayout));await shot('capture-save-error-480');main.setSize(1160,720);await wait(160);saveMode='cancel';await clickText('Save image');assert(await evaluate(main,`!!document.querySelector('.page-capture-stage')`),'Cancel native save keeps preview');saveMode='save';await clickText('Save image');await until(`!document.querySelector('.page-capture-dialog')`);const cropSize=nativeImage.createFromPath(path.join(runtimeDir,'page.png')).getSize();assert.deepEqual(cropSize,{width:dimensions[0],height:dimensions[1]});const cropPixels=nativeImage.createFromPath(path.join(runtimeDir,'page.png')).toBitmap();let redPixels=0;for(let i=0;i<cropPixels.length;i+=4){if(cropPixels[i+2]>200&&cropPixels[i+1]<100&&cropPixels[i]<100)redPixels++;}assert(redPixels>100,'Area image contains actual webpage pixels');
      await openCapture('Full page');const fullDims=await evaluate(main,`document.querySelector('.page-capture-footer > span').textContent.split(' × ').map(Number)`);assert(fullDims[1]>2000,'Full-page capture includes below the fold');await shot('capture-full-page');await clickText('Save image');await until(`!document.querySelector('.page-capture-dialog')`);assert(nativeImage.createFromPath(path.join(runtimeDir,'page.png')).getSize().height>2000);assert.equal(await source.executeJavaScript('scrollY'),0,'Full capture preserves scroll position');
      source.setZoomFactor(1.5);await openCapture('Visible page');await shot('capture-zoomed-visible');await clickText('Save image');await until(`!document.querySelector('.page-capture-dialog')`);source.setZoomFactor(1);
      const originalCapture=source.capturePage.bind(source);source.capturePage=async(...args)=>{await wait(650);return originalCapture(...args)};await openSettings();await evaluate(main,`document.querySelector('[aria-label="Capture page"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);await clickText('Visible page');await until(`!!document.querySelector('.page-capture-status')`);await shot('capture-loading');await until(`!!document.querySelector('.page-capture-stage img')`);await clickText('Cancel');source.capturePage=originalCapture;
      await openSettings();await clickText('Save PDF');await until(`!document.querySelector('.page-capture-dialog')&&${JSON.stringify(path.join(runtimeDir,'page.pdf'))}!==''`);await wait(100);const bytes=fs.readFileSync(path.join(runtimeDir,'page.pdf'));assert(bytes.subarray(0,4).toString()==='%PDF');
      const pdfjs=await import(require('url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);globalThis.pdfjsWorker=await import(require('url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href);const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(item=>item.str||'').join(' ');}assert(text.includes('PDF PRINT LAYOUT MARKER')&&text.includes('Below the fold marker'));assert(!text.includes('SCREEN ONLY MARKER'));await pdf.destroy();
      const rogue=new BrowserWindow({show:false,width:600,height:500,webPreferences:{preload:path.join(runtimeDir,'preload.js'),contextIsolation:true}});await rogue.loadURL('about:blank');assert(await evaluate(rogue,`window.electron.browser.capture({action:'capture',tabId:'capture-page',mode:'visible'}).then(()=>false,error=>error.message.includes('Untrusted'))`));rogue.close();
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({widths:[1160,480],themes:['light','dark'],verified:['production Site settings actions','area selection with real mouse events','crop image pixels','clipboard copy and restoration','native save cancellation','full page below fold','scroll position retained','zoomed visible capture','PDF print layout and text','foreign-window IPC rejected'],nativeSaveDialog:'stubbed with disposable output paths'},null,2));console.log('PASS: page screenshots, native crop/clipboard/save, full page and PDF print layout. Evidence: '+out);server.close();app.exit(0);return;
    }

    if (process.argv.includes('--ai-context-only')) {
      const fixture=[
        {id:'context-first',sessionId:'context-work',sessionName:'Research',sessionIconEmoji:'📚',name:'First reference',url:url+'/first-reference',icon:''},
        {id:'context-target',sessionId:'context-work',sessionName:'Research',sessionIconEmoji:'📚',name:'Target reference',url:url+'/target-reference',icon:''},
        {id:'context-other',sessionId:'context-other',sessionName:'Other',name:'Other reference',url:url+'/other-reference',icon:''},
      ];
      await evaluate(main,`localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('user_last_app_id','context-first');undefined`);
      main.reload();await wait(650);
      const addFromMenu = async (selector) => {
        await evaluate(main,`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(160);
        const action=nativeContextMenu.items.find(item=>item.label==='Add to AI');assert(action,'Native context menu offers Add to AI');action.click();nativeContextMenu.closePopup(main);await wait(260);
      };
      await addFromMenu('[data-tab-motion="horizontal-main-context-target"]');
      assert(await evaluate(main,`document.querySelector('.ai-panel-slot').getAttribute('aria-hidden')==='false'`),'Menu opens AI sidebar');
      assert(await evaluate(main,`!!document.querySelector('[aria-label="Tab: Target reference"]')`));
      await addFromMenu('.sidebar-app.active');
      assert(await evaluate(main,`!!document.querySelector('[aria-label="Group: Research"]')`));
      await evaluate(main,`document.querySelector('[aria-label="Remove Research context"]').click();undefined`);await wait(100);

      const providerBodies=[];
      const provider=http.createServer((req,res)=>{if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'fixture-model'}]}));let text='';req.on('data',c=>text+=c);req.on('end',()=>{const body=JSON.parse(text);providerBodies.push(body);const observations=body.messages.filter(message=>message.role==='tool');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:observations.length>=2?{role:'assistant',content:'Read the attached target page.'}:{role:'assistant',content:null,tool_calls:[{id:'context-step-'+observations.length,type:'function',function:{name:observations.length?'read_page':'select_tab',arguments:JSON.stringify(observations.length?{format:'compact'}:{})}}]}}]}));});});
      await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
      await evaluate(main,`window.electron.ai.settings({endpoint:'http://127.0.0.1:${provider.address().port}/v1',key:'fixture-only',model:'fixture-model',remember:false})`);await wait(150);
      const saved=await evaluate(main,`JSON.parse(localStorage.getItem('user_apps')).map(({id,sessionId,url})=>({id,sessionId,url}))`);
      const sourceDrop=async(selector,kind,id)=>{
        await evaluate(main,`(()=>{const source=document.querySelector(${JSON.stringify(selector)});window.contextTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.contextTransfer}));})()`);await wait(100);
        const payload=await evaluate(main,`JSON.parse(window.contextTransfer.getData('application/x-kudiumbrowser-ai-context'))`);assert.deepEqual(payload,{kind,id});
        await evaluate(main,`(()=>{const ai=document.querySelector('.ai-sidebar');ai.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.contextTransfer}));ai.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.contextTransfer}));document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:window.contextTransfer}));})()`);await wait(220);
        assert.deepEqual(await evaluate(main,`JSON.parse(localStorage.getItem('user_apps')).map(({id,sessionId,url})=>({id,sessionId,url}))`),saved,'Context drop must not move or remove tabs');
        assert(await evaluate(main,`!document.querySelector('.tab-drag-preview')`),'Drag preview cleaned up');
      };
      await sourceDrop('[data-tab-motion="horizontal-main-context-target"]','tab','context-target');
      assert(await evaluate(main,`!!document.querySelector('[aria-label="Tab: Target reference"]')`));
      await evaluate(main,`document.querySelector('[aria-label="Send AI task"]').click();undefined`);await wait(1700);
      assert(providerBodies.length>=3,'AI reads the attached page on demand');const observation=providerBodies.at(-1).messages.filter(message=>message.role==='tool').at(-1);assert(observation.content.includes('/target-reference'),'Default read_page target must be the attached tab rather than focused tab: '+observation.content);
      const groupId=JSON.stringify(['context-work','default']);
      await sourceDrop('.sidebar-app.active','group',groupId);
      assert(await evaluate(main,`!!document.querySelector('[aria-label="Group: Research"] .group-icon-slot')`),'Shared group icon used');
      for(const width of [1160,800]){main.setSize(width,700);await wait(160);fs.writeFileSync(path.join(out,'browser-context-'+width+'.png'),(await main.webContents.capturePage()).toPNG());}
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({verified:['native tab and group Add to AI menu actions','menu opens sidebar','production horizontal and sidebar drag sources','copy semantics and unchanged tab membership','shared GroupIcon','real provider read_page follows attached tab'],syntheticDragEvents:true},null,2));
      console.log('PASS: production tab/group drag sources, copy semantics and attached-page AI read. Evidence: '+out);provider.close();server.close();app.exit(0);return;
    }

    if (process.argv.includes('--external-links-only')) {
      const fixture = [
        {id:'work-tab',name:'Work',sessionName:'Research',sessionId:'work-group',sessionProfileId:'shared-login',sessionIconEmoji:'📚',sessionSlug:'research',folderId:'reading',spaceId:'default',pinned:true,url:url+'/work',icon:''},
        {id:'other-tab',name:'Other',sessionName:'Other',sessionId:'other-group',sessionProfileId:'shared-login',spaceId:'default',url:url+'/external-one',icon:''},
      ];
      const seed = async (apps, selectedId) => {
        await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(apps))});localStorage.setItem('user_last_app_id',${JSON.stringify(selectedId)});localStorage.setItem('kudiumbrowser-active-space','default');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{id:'default',name:'Personal',color:'iris',folders:[{id:'reading',name:'Reading'}],selectedAppId:selectedId}]))});undefined`);
        await main.reload(); await wait(600);
      };
      await seed(fixture,'work-tab');
      for (const suffix of ['external-one','external-two']) main.webContents.send('browser-tab-request',{action:'open-external',url:url+'/'+suffix});
      await wait(600);
      const saved = () => evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      let apps = await saved();
      const incoming = apps.filter(tab=>!fixture.some(old=>old.id===tab.id));
      assert.equal(incoming.length,2,'Both queued external links open');
      for(const tab of incoming) {
        assert.equal(tab.sessionId,'work-group','External URLs stay in active group, including a URL existing in another group');
        assert.equal(tab.sessionProfileId,'shared-login');assert.equal(tab.sessionIconEmoji,'📚');assert.equal(tab.folderId,'reading');assert.equal(tab.pinned,true);assert.equal(tab.sessionSlug,'research');
      }
      main.webContents.send('browser-tab-request',{action:'open-external',url:url+'/external-one'});await wait(300);
      assert.equal((await saved()).length,4,'Reuse a matching tab in current group');
      main.webContents.send('browser-tab-request',{action:'open-external',url:'javascript:alert(1)'});await wait(100);assert.equal((await saved()).length,4);
      await seed([],'');
      for (const suffix of ['empty-one','empty-two']) main.webContents.send('browser-tab-request',{action:'open-external',url:url+'/'+suffix});
      await wait(500);apps=await saved();assert.equal(apps.length,2);assert.equal(apps[0].sessionId,apps[1].sessionId,'Cold-start burst creates one group');
      let defaultState=false; const registrations=[];
      app.isDefaultProtocolClient=()=>defaultState;
      app.setAsDefaultProtocolClient=protocol=>{registrations.push(protocol);defaultState=true;return true;};
      const settings=await create('settings',1080,800);
      const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await settings.webContents.capturePage()).toPNG());
      assert(await evaluate(settings,"!!document.querySelector('.default-browser-banner')"));
      for(const theme of ['light','dark']) for(const width of [1080,480]) {
        settings.setSize(width,700);
        await evaluate(settings,`document.querySelectorAll('.radix-themes').forEach(el=>{el.classList.remove('light','dark');el.classList.add('${theme}');});undefined`);await wait(180);
        assert(await evaluate(settings,`(()=>{const b=document.querySelector('.default-browser-banner'),r=b.getBoundingClientRect(),c=b.querySelector('button').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&c.right<=r.right-12&&c.bottom<=r.bottom-12&&document.documentElement.scrollWidth<=innerWidth})()`));
        await evaluate(settings,"document.querySelector('.default-browser-banner button').focus();undefined");
        await capture('default-browser-'+theme+'-'+width);
      }
      app.setAsDefaultProtocolClient=protocol=>{registrations.push(protocol);return false;};
      await evaluate(settings,"document.querySelector('.default-browser-banner button').click();undefined");await wait(200);
      assert(await evaluate(settings,"document.querySelector('.default-browser-banner').textContent.includes('Default Apps')"));
      await capture('default-browser-pending-480');
      app.setAsDefaultProtocolClient=protocol=>{registrations.push(protocol);defaultState=true;return true;};
      await evaluate(settings,"document.querySelector('.default-browser-banner button').click();undefined");await wait(200);
      assert.deepEqual(registrations,['http','https','http','https']);assert(!await evaluate(settings,"!!document.querySelector('.default-browser-banner')"),'Banner disappears only after confirmed default status');
      console.log('PASS: active-group external links, queued cold-start links, reuse/isolation, default-browser banner and OS-registration adapters (stubbed). Evidence: '+out);
      server.close();app.exit(0);return;
    }

    if (process.argv.includes('--ai-sidebar-only')) {
      await evaluate(main, `document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);
      await wait(300);
      const checkAI = () => evaluate(main, `(()=>{const panel=document.querySelector('.ai-sidebar').getBoundingClientRect(), page=document.querySelector('.browser-viewport').getBoundingClientRect();return {panel:panel.width,right:page.right,left:panel.left,visible:document.querySelector('.ai-panel-slot').getAttribute('aria-hidden')==='true'?0:panel.height,top:panel.top,pageTop:page.top,bottom:panel.bottom,pageBottom:page.bottom,labels:!!document.querySelector('#ai-key')}})()`);
      let layout=await checkAI();assert(layout.visible>0);assert(Math.abs(layout.top-layout.pageTop)<1 && Math.abs(layout.bottom-layout.pageBottom)<1,'AI must align with webpage height');
      assert(await evaluate(main, `document.querySelector('.browser-actions').lastElementChild.getAttribute('aria-label')==='Toggle AI sidebar'`),'AI toggle must be last');assert(layout.right<=layout.left+1,'Webpage overlaps AI sidebar');
      fs.writeFileSync(path.join(out,'ai-sidebar.png'),(await main.capturePage()).toPNG());
      main.setSize(800,700);await wait(250);layout=await checkAI();assert(layout.right<=layout.left+1);assert(Math.abs(layout.top-layout.pageTop)<1 && Math.abs(layout.bottom-layout.pageBottom)<1);fs.writeFileSync(path.join(out,'ai-sidebar-narrow.png'),(await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);await wait(150);
      assert.equal((await checkAI()).visible,0,'Sidebar failed to collapse');
      await evaluate(main, `document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);await wait(150);assert((await checkAI()).visible>0);
      const aiPreferences = await create('settings',1080,800);
      await evaluate(main, `document.querySelector('[aria-label="AI settings"]').click();undefined`);await wait(200);
      assert(await evaluate(aiPreferences, `!!document.querySelector('#ai-key')`),'Sidebar settings must open the AI preference page');
      assert(!(await checkAI()).labels,'Sidebar must not contain configuration fields');
      await input(aiPreferences,'#ai-endpoint',url+'/v1');
      await input(aiPreferences,'#ai-key','local-preferences-test-key');
      await evaluate(aiPreferences, `Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Save AI settings').click();undefined`);await wait(200);
      assert((await evaluate(main, `window.electron.ai.settings()`)).hasKey,'Preferences must update the active AI configuration');
      assert(await evaluate(main, `document.querySelector('.ai-composer .ai-model-picker').textContent.includes('gpt-4.1')`),'Sidebar must refresh after saving preferences');

      fs.writeFileSync(path.join(out,'ai-preferences.png'),(await aiPreferences.capturePage()).toPNG());
      await evaluate(aiPreferences, `document.querySelector('#ai-external-tab').click();undefined`);await wait(100);
      assert(await evaluate(aiPreferences, `document.querySelector('#ai-model-panel').hidden && !document.querySelector('#ai-external-panel').hidden`),'AI settings tabs must separate panels');
      await evaluate(aiPreferences, `document.querySelector('.ai-manual-connection summary').click();undefined`);await wait(100);
      const reserveAI=http.createServer();await new Promise(resolve=>reserveAI.listen(0,'127.0.0.1',resolve));const aiPort=reserveAI.address().port;await new Promise(resolve=>reserveAI.close(resolve));
      await input(aiPreferences,'#ai-mcp-port',String(aiPort));
      await evaluate(aiPreferences, `document.querySelector('[aria-label="Enable external control"]').click();undefined`);
      for(let attempt=0;attempt<100 && !(await evaluate(aiPreferences, `document.querySelector('[aria-label="MCP configuration"]')?.value.includes('Authorization')`));attempt+=1) await wait(20);
      assert(await evaluate(aiPreferences, `!!document.querySelector('[aria-label="MCP configuration"]')`),'External service must start on the isolated fixture port');
      assert(await evaluate(aiPreferences, `document.querySelector('[aria-label="MCP configuration"]').value.includes('Authorization')`),'HTTP configuration must be visible');
      await evaluate(aiPreferences, `(()=>{const select=document.querySelector('#ai-mcp-format');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,'stdio');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(300);
      assert(await evaluate(aiPreferences, `document.querySelector('[aria-label="MCP configuration"]').value.includes('command')`),'stdio configuration must be visible');
      fs.writeFileSync(path.join(out,'ai-external-preferences.png'),(await aiPreferences.capturePage()).toPNG());
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const connection = (await evaluate(main, `window.electron.ai.mcpConnection()`)).mcpServers.kudiumbrowser;
      const agent = new Client({name:'real-renderer-tab-test',version:'1'},{capabilities:{}});
      await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
      const initialApproval = dialog.showMessageBox;
      let createdResult;
      try {
        dialog.showMessageBox = async()=>({response:1});
        createdResult = await agent.callTool({name:'new_tab',arguments:{url:`${url}/ai-tab-redirect`}});
      } finally {dialog.showMessageBox = initialApproval;}
      assert(!createdResult.isError,'Real renderer must create the agent tab');
      const createdTab = JSON.parse(createdResult.content[0].text);
      assert(createdTab.loaded && createdTab.url.endsWith('/popup-tab') && createdTab.title==='Destination page identity','new_tab must confirm final loaded page identity');
      const beforeStall=JSON.parse((await agent.callTool({name:'list_tabs',arguments:{}})).content[0].text).map(tab=>tab.id);
      const stalledRequest=agent.callTool({name:'new_tab',arguments:{url:`${url}/ai-stalled-new-tab`}});
      for(let attempt=0;attempt<100&&!stalledNewTabResponse;attempt+=1) await wait(20);
      assert(stalledNewTabResponse,'New tab navigation must reach the held-open local server');
      main.show();app.focus({steal:true});main.focus();await wait(100);
      await evaluate(main, `document.querySelector('[aria-label="Take control"]').click();undefined`);
      assert((await stalledRequest).isError,'Take over must reject the stalled new_tab request');
      await wait(100);
      assert((await evaluate(main, `window.electron.ai.mcpStatus()`)).paused,'Takeover must keep external control paused');
      const pausedRetry=await agent.callTool({name:'new_tab',arguments:{url:`${url}/popup-tab`}});
      assert(pausedRetry.isError && pausedRetry.content[0].text.includes('user has control'),'External retry must not retake the session');
      assert(!main.webContents.isFocused(),'Takeover must return focus from the sidebar to the webpage: '+JSON.stringify(main.contentView.children.map(view=>({id:view.webContents?.id,url:view.webContents?.getURL(),focused:view.webContents?.isFocused(),bounds:view.getBounds()}))));
      assert(main.contentView.children.some(view=>view.webContents?.isFocused()),'A real webpage must receive focus: '+JSON.stringify({hostFocused:main.isFocused(),children:main.contentView.children.map(view=>({url:view.webContents?.getURL(),focused:view.webContents?.isFocused(),visible:view.getVisible(),bounds:view.getBounds()}))}));
      const humanPage=main.contentView.children.find(view=>view.webContents?.isFocused()).webContents;
      await humanPage.executeJavaScript(`(()=>{const field=document.createElement('input');field.id='human-handoff';field.addEventListener('input',event=>document.body.dataset.humanInputTrusted=String(event.isTrusted));document.body.append(field);field.focus();})()`);
      humanPage.sendInputEvent({type:'char',keyCode:'h'});await wait(50);
      assert.equal(await humanPage.executeJavaScript(`document.querySelector('#human-handoff').value`),'h','Human can type immediately while external AI is paused');
      assert.equal(await humanPage.executeJavaScript(`document.body.dataset.humanInputTrusted`),'true','Handoff must preserve trusted native keyboard input');
      await evaluate(main, `document.querySelector('[aria-label="Resume external AI"]').click();undefined`);await wait(100);
      assert(!(await evaluate(main, `window.electron.ai.mcpStatus()`)).paused,'Explicit resume must reopen control');

      const afterStall=JSON.parse((await agent.callTool({name:'list_tabs',arguments:{}})).content[0].text);
      const stoppedTab=afterStall.find(tab=>!beforeStall.includes(tab.id));assert(stoppedTab,'Cancelled tab remains discoverable');
      const stoppedView=main.contentView.children.find(view=>view.webContents?.getURL()==='' || view.webContents?.getURL()==='about:blank');
      assert(stoppedView,'Stopped uncommitted tab must remain blank');
      stalledNewTabResponse.end('<title>Must not commit</title>Late response');await wait(100);
      assert(!stoppedView.webContents.getURL().includes('/ai-stalled-new-tab'),'Late response must not commit after Stop');
      const stoppedObservation=await agent.callTool({name:'read_page',arguments:{tabId:stoppedTab.id}});assert(!stoppedObservation.isError);
      assert(['','about:blank'].includes(JSON.parse(stoppedObservation.content[0].text).url),'The cancelled tab identity must remain on the uncommitted blank document');
      const recovery=await agent.callTool({name:'navigate',arguments:{tabId:stoppedTab.id,url:`${url}/popup-tab`}});
      assert(!recovery.isError && JSON.parse(recovery.content[0].text).title==='Destination page identity','Cancelled tab must recover through navigation');
      const originalMessageBox = dialog.showMessageBox;
      try {
        const decodeAI = result => { assert(!result.isError, JSON.stringify(result)); return JSON.parse(result.content[0].text); };
        const pendingDialog = decodeAI(await agent.callTool({name:'new_tab',arguments:{url:`${url}/ai-dialog-tab`}}));
        assert(pendingDialog.pending && pendingDialog.tabId && pendingDialog.dialog.type==='confirm','Native new-tab dialog must return its created tab identity');
        await wait(100);
        assert(await evaluate(main, `Array.from(document.querySelectorAll('.ai-composer button')).some(button=>button.getAttribute('aria-label')==='Stop AI task'&&!button.disabled)`),'Pending external dialog must keep the sidebar Stop action available');
        dialog.showMessageBox = async()=>({response:0});
        assert((await agent.callTool({name:'handle_dialog',arguments:{tabId:pendingDialog.tabId,dialogId:pendingDialog.dialog.id,accept:true}})).isError,'Denied dialog response must remain pending');
        dialog.showMessageBox = async()=>({response:1});
        const dialogLoaded = decodeAI(await agent.callTool({name:'handle_dialog',arguments:{tabId:pendingDialog.tabId,dialogId:pendingDialog.dialog.id,accept:true}}));
        assert(dialogLoaded.loaded && dialogLoaded.tabId===pendingDialog.tabId && dialogLoaded.title==='AI dialog destination');
        const nativeDialogPage=main.contentView.children.find(child=>child.webContents?.getURL()===`${url}/ai-dialog-tab`).webContents;
        assert.equal(await nativeDialogPage.executeJavaScript('window.dialogResult'),true,'The actual native page must receive the approved dialog response');
        assert(!nativeDialogPage.debugger.isAttached(),'Completed native page must release its debugger');
        await wait(100);
        assert(await evaluate(main, `!Array.from(document.querySelectorAll('.ai-composer button')).some(button=>button.getAttribute('aria-label')==='Stop AI task')`),'Completed dialog must clear sidebar busy state');
        decodeAI(await agent.callTool({name:'close_tab',arguments:{tabId:pendingDialog.tabId}}));
        const stopDialog=decodeAI(await agent.callTool({name:'new_tab',arguments:{url:`${url}/ai-dialog-tab?stop`}}));
        assert(stopDialog.pending);
        await wait(100);
        await evaluate(main, `Array.from(document.querySelectorAll('.ai-composer button')).find(button=>button.getAttribute('aria-label')==='Stop AI task').click();undefined`);
        await wait(150);
        const stoppedDialogPage=main.contentView.children.find(child=>child.webContents?.getURL()===`${url}/ai-dialog-tab?stop`).webContents;
        assert(!stoppedDialogPage.debugger.isAttached(),'Sidebar Stop must release the native navigation-dialog lease');
        assert((await agent.callTool({name:'handle_dialog',arguments:{tabId:stopDialog.tabId,dialogId:stopDialog.dialog.id,accept:true}})).isError,'Stopped dialog identity must be invalid');
        decodeAI(await agent.callTool({name:'read_page',arguments:{tabId:stopDialog.tabId}}));
        decodeAI(await agent.callTool({name:'navigate',arguments:{tabId:stopDialog.tabId,url:`${url}/popup-tab`}}));
        decodeAI(await agent.callTool({name:'close_tab',arguments:{tabId:stopDialog.tabId}}));
        const guardedClose=decodeAI(await agent.callTool({name:'new_tab',arguments:{tabId:createdTab.tabId,url:`${url}/ai-guarded-close`}}));
        assert(guardedClose.loaded);
        const guardedPage=main.contentView.children.find(child=>child.webContents?.getURL()===`${url}/ai-guarded-close`).webContents;
        await guardedPage.executeJavaScript(`document.querySelector('button').click()`,true);
        dialog.showMessageBox = async()=>({response:0});
        assert((await agent.callTool({name:'close_tab',arguments:{tabId:guardedClose.tabId}})).isError);
        assert(!guardedPage.isDestroyed(),'Denied guarded closure must keep the actual renderer alive');
        assert.equal(await guardedPage.executeJavaScript('localStorage.closeUnloadCount'),null,'Denied guarded closure must not unload the page');
        let closeApproval;
        dialog.showMessageBox = (_owner,options)=>new Promise(resolve=>{
          closeApproval=options;
          options.signal.addEventListener('abort',()=>resolve({response:0}),{once:true});
        });
        const cancelledClose=agent.callTool({name:'close_tab',arguments:{tabId:guardedClose.tabId}});
        for(let attempt=0;attempt<50&&!closeApproval;attempt+=1) await wait(20);
        assert(closeApproval,'Guarded close approval must be waiting before Stop');
        await wait(100);
        await evaluate(main, `Array.from(document.querySelectorAll('.ai-composer button')).find(button=>button.getAttribute('aria-label')==='Stop AI task').click();undefined`);
        assert((await cancelledClose).isError,'Sidebar Stop must cancel pending close approval');
        assert(!guardedPage.isDestroyed());
        assert.equal(await guardedPage.executeJavaScript('localStorage.closeUnloadCount'),null);
        assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.id===${JSON.stringify(guardedClose.tabId)}&&!tab.archived)`));
        dialog.showMessageBox = async()=>{
          guardedPage.once('will-prevent-unload',event=>event.preventDefault());
          await guardedPage.loadURL(`${url}/ai-guarded-close`);
          return {response:1};
        };
        const replacedClose=await agent.callTool({name:'close_tab',arguments:{tabId:guardedClose.tabId}});
        assert(replacedClose.isError && replacedClose.content[0].text.includes('changed'),'Same-URL document replacement must invalidate close approval');
        assert(!guardedPage.isDestroyed());
        assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.id===${JSON.stringify(guardedClose.tabId)}&&!tab.archived)`));
        assert.equal(await guardedPage.executeJavaScript('localStorage.closeUnloadCount'),'1','Replacement must unload the old document exactly once');
        await guardedPage.executeJavaScript(`document.querySelector('button').click()`,true);
        dialog.showMessageBox = async()=>({response:1});
        const confirmedGuardedClose=decodeAI(await agent.callTool({name:'close_tab',arguments:{tabId:guardedClose.tabId}}));
        assert(confirmedGuardedClose.closed && guardedPage.isDestroyed(),'closed:true must wait for destruction of the actual guarded renderer');
        assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.id===${JSON.stringify(guardedClose.tabId)}&&tab.archived)`));
        const sibling=main.contentView.children.find(child=>child.webContents?.getURL()===`${url}/popup-tab`).webContents;
        assert.equal(await sibling.executeJavaScript('localStorage.closeUnloadCount'),'2','Approved closure must unload once without replay');
        dialog.showMessageBox = async()=>({response:0});
        const declined = await agent.callTool({name:'close_tab',arguments:{tabId:createdTab.tabId}});
        assert(declined.isError,'Declined close must preserve the real tab');
        assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.id===${JSON.stringify(createdTab.tabId)}&&!tab.archived)`));
        dialog.showMessageBox = async()=>({response:1});
        const closed = await agent.callTool({name:'close_tab',arguments:{tabId:createdTab.tabId}});
        assert(!closed.isError && JSON.parse(closed.content[0].text).closed,'Real renderer must confirm closure');
        assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.id===${JSON.stringify(createdTab.tabId)}&&tab.archived)`),'Close must retain a recoverable archived tab');
        const recoveredClose=await agent.callTool({name:'close_tab',arguments:{tabId:stoppedTab.id}});assert(!recoveredClose.isError);
        const remaining = JSON.parse((await agent.callTool({name:'list_tabs',arguments:{}})).content[0].text);
        assert(!remaining.some(tab=>tab.id===createdTab.tabId),'Archived tab must disappear from agent session');
      } finally {
        dialog.showMessageBox = originalMessageBox;
        await agent.close();
      }
      await evaluate(aiPreferences, `document.querySelector('[aria-label="Enable external control"]').click();undefined`);await wait(200);
      aiPreferences.hide();main.focus();

      await wait(350);
      const motion = await evaluate(main, `!matchMedia('(prefers-reduced-motion: reduce)').matches`);
      const startWidth = await evaluate(main, `document.querySelector('.ai-panel-slot').getBoundingClientRect().width`);
      await evaluate(main, `document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);
      await wait(50);
      const closing = await evaluate(main, `(()=>{const slot=document.querySelector('.ai-panel-slot');return {width:slot.getBoundingClientRect().width,inert:slot.inert}})()`);
      assert(closing.inert,'Closing sidebar must not accept keyboard focus');
      if(motion) assert(closing.width>0 && closing.width<startWidth,'Expected intermediate closing width');
      await wait(220);assert.equal(await evaluate(main, `document.querySelector('.ai-panel-slot').getBoundingClientRect().width`),0);
      await evaluate(main, `document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);await wait(300);
      assert(!(await evaluate(main, `document.querySelector('.ai-panel-slot').inert`)));
      const leftWidth = await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`);
      await evaluate(main, `document.querySelector('[aria-label="Collapse sidebar"]').click();undefined`);await wait(50);
      const leftClosing = await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`);
      if(motion) assert(leftClosing>76 && leftClosing<leftWidth,'Expected animated left sidebar collapse');
      await wait(220);assert.equal(await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`),76);
      await evaluate(main, `document.querySelector('[aria-label="Expand sidebar"]').click();undefined`);await wait(50);
      const leftOpening=await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`);
      if(motion) assert(leftOpening>76 && leftOpening<leftWidth,'Expected animated left sidebar expansion');
      await wait(280);assert.equal(await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`),leftWidth);
      const resizeStart=Math.round(await evaluate(main, `document.querySelector('.ai-sidebar').getBoundingClientRect().width`));
      const grip=await evaluate(main, `(()=>{const r=document.querySelector('[aria-label="Resize AI sidebar"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+80)}})()`);
      main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...grip});await wait(80);
      main.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],x:grip.x+30,y:grip.y});await wait(80);
      main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:grip.x+30,y:grip.y});await wait(280);
      assert.equal(await evaluate(main, `document.querySelector('.ai-sidebar').getBoundingClientRect().width`),Math.max(240,resizeStart-30),'Dragging right must shrink the AI panel');
      assert.equal(await evaluate(main, `Number(localStorage.getItem('kudiumbrowser-ai-sidebar-width'))`),Math.max(240,resizeStart-30),'AI width must persist');
      await evaluate(main, `document.querySelector('[aria-label="Resize AI sidebar"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));undefined`);await wait(280);
      assert.equal(await evaluate(main, `document.querySelector('.ai-sidebar').getBoundingClientRect().width`),240);
      await evaluate(main, `document.querySelector('[aria-label="Resize AI sidebar"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));undefined`);await wait(280);
      assert.equal(await evaluate(main, `document.querySelector('.ai-sidebar').getBoundingClientRect().width`),250);
      await evaluate(main, `document.querySelector('[aria-label="Resize AI sidebar"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);await wait(280);
      assert.equal(await evaluate(main, `document.querySelector('.ai-sidebar').getBoundingClientRect().width`),resizeStart);
      console.log('PASS: AI sidebar motion/resize, API settings, takeover focus/native typing/external pause/retry refusal/explicit resume, native AI tab redirect/Stop/blank observation/recovery/closure, new-tab dialog identity/denial/response/sidebar Stop/recovery, guarded close lifecycle/Stop/same-URL approval invalidation and webpage bounds at 1160px and 800px; screenshots: '+out);
      aiPreferences.close();main.close();server.close();app.quit();return;
    }

    if (process.argv.includes('--sync-settings-only')) {
      const settings = await create('settings',1080,800);
      await tab(settings,'Sync'); await wait(200);
      const prefs = require(path.join(runtimeDir,'preferences.js'));
      assert.equal(prefs.getBrowserPreferences().cloudSync.provider,'icloud');
      assert.equal(prefs.getBrowserPreferences().cloudSync.enabled,false);
      await evaluate(settings, `document.querySelector('[aria-label="Enable sync"]').click();undefined`);await wait(200);
      assert.equal(prefs.getBrowserPreferences().cloudSync.enabled,true);
      assert(await evaluate(settings, `document.querySelector('.cloud-sync-settings').textContent.includes('Setup required') && document.querySelector('.cloud-sync-settings').textContent.includes('no data is uploaded')`));
      await evaluate(settings, `document.querySelector('[aria-label="Sync open tabs"]').click();undefined`);await wait(200);
      assert.equal(prefs.getBrowserPreferences().cloudSync.categories.openTabs,false);
      await evaluate(settings, `document.querySelector('[aria-label="Sync provider"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);await wait(100);
      await evaluate(settings, `Array.from(document.querySelectorAll('[role="option"]')).find(option=>option.textContent==='KudiumBrowser account').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);await wait(200);
      assert.equal(prefs.getBrowserPreferences().cloudSync.provider,'kudiumbrowser');
      assert(await evaluate(settings, `document.querySelector('.cloud-sync-settings').textContent.includes('KudiumBrowser account sync is planned')`));
      for (const width of [1080,760,480]) {
        settings.setSize(width,700);await wait(150);
        assert(await evaluate(settings, `document.documentElement.scrollWidth<=innerWidth+1`), `Sync page overflows at ${width}`);
        assert(await evaluate(settings, `Array.from(document.querySelectorAll('.cloud-sync-settings button')).every(button=>button.getBoundingClientRect().right<=innerWidth+1)`), `Sync controls overflow at ${width}`);
        fs.writeFileSync(path.join(out,`sync-settings-${width}.png`),(await settings.capturePage()).toPNG());
      }
      await evaluate(settings, `document.querySelector('[aria-label="Enable sync"]').click();undefined`);await wait(100);
      assert.equal(prefs.getBrowserPreferences().cloudSync.enabled,false);
      console.log('PASS: iCloud Mac default, enable intent/category persistence, KudiumBrowser provider selection, truthful disconnected status, disable and responsive settings');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--performance-settings-only')) {
      const settings = await create('settings', 1080, 800);
      await input(settings, 'input[aria-label="Search settings"]', 'performance'); await wait(250);
      await input(settings, 'input[aria-label="Put inactive tabs to sleep after"]', '47');
      await evaluate(settings, `document.querySelector('input[aria-label="Put inactive tabs to sleep after"]').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));undefined`);
      await wait(300);
      assert.equal(require(path.join(runtimeDir,'preferences.js')).getBrowserPreferences().discardAfterMinutes,47);
      await evaluate(settings, `document.querySelector('[role="switch"][aria-label="Keep pinned tabs awake"]').click();undefined`); await wait(250);
      assert.equal(require(path.join(runtimeDir,'preferences.js')).getBrowserPreferences().keepPinnedTabsAwake,true);
      await evaluate(settings, `(()=>{const field=document.querySelector('textarea[aria-label="Websites excluded from sleeping"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'example.com\\nmail.example.org');field.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`);
      await evaluate(settings, `Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Save website exclusions').click();undefined`); await wait(300);
      assert.deepEqual(require(path.join(runtimeDir,'preferences.js')).getBrowserPreferences().discardExcludedSites,['example.com','mail.example.org']);
      for (const width of [1080, 480]) {
        settings.setSize(width, 760); await wait(300);
        assert(await evaluate(settings, `(()=>{const field=document.querySelector('textarea[aria-label="Websites excluded from sleeping"]');const rect=field.getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth;})()`), 'Website exclusion field is clipped');
        fs.writeFileSync(path.join(out, `performance-settings-${width}.png`), (await settings.capturePage()).toPNG());
        await evaluate(settings, `(()=>{const pane=document.querySelector('.preferences-main');pane.scrollTop=pane.scrollHeight;})();undefined`); await wait(100);
        assert(await evaluate(settings, `(()=>{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Save website exclusions');const rect=button.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;})()`),'Exclusion save button is inaccessible');
        fs.writeFileSync(path.join(out, `performance-settings-bottom-${width}.png`), (await settings.capturePage()).toPNG());
        await evaluate(settings, `document.querySelector('.preferences-main').scrollTop=0;undefined`);

      }
      console.log('PASS: custom sleeping timeout and pinned protection persist; Performance preferences fit 1080px and 480px windows; screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--search-actions-only')) {
      const settings = await create('settings', 1080, 800);
      for (const width of [1080, 760, 480]) {
        settings.setSize(width, 800); await wait(250);
        const metrics = await evaluate(settings, `Array.from(document.querySelectorAll('.search-engine-actions')).map(group=>{const rect=group.getBoundingClientRect();const buttons=Array.from(group.querySelectorAll('button')).map(button=>{const r=button.getBoundingClientRect();return {label:button.textContent,x:r.x,y:r.y,right:r.right,height:r.height,scroll:button.scrollWidth,width:button.clientWidth}});return {left:rect.left,right:rect.right,buttons};})`);
        assert(metrics.length>=3);
        for (const row of metrics) {
          for (const button of row.buttons) assert(button.x>=row.left-1 && button.right<=row.right+1 && button.scroll<=button.width+1, `Action overflow at ${width}: ${button.label}`);
          const edit=row.buttons.find(button=>button.label==='Edit');const remove=row.buttons.find(button=>button.label==='Delete');
          assert(Math.abs(edit.y-remove.y)<=1, `Edit/Delete misaligned at ${width}`);
          assert(Math.abs(edit.height-remove.height)<=1);
          const set=row.buttons.find(button=>button.label==='Set default');
          if(set && width>620) assert(Math.abs(set.y-edit.y)<=1, `Set default misaligned at ${width}`);
        }
        const editColumns=metrics.map(row=>row.buttons.find(button=>button.label==='Edit').x);
        assert(Math.max(...editColumns)-Math.min(...editColumns)<=1, `Edit columns misaligned at ${width}`);
        fs.writeFileSync(path.join(out, `search-actions-${width}.png`), (await settings.capturePage()).toPNG());
      }
      await evaluate(settings, `document.querySelector('.search-engine-default').click();undefined`); await wait(200);
      assert.equal(await evaluate(settings, `document.querySelectorAll('.search-engine-default').length`),2);
      await evaluate(settings, `document.querySelector('.search-engine-edit').click();undefined`);await wait(150);
      assert(await evaluate(settings, `document.querySelector('[role="dialog"] textarea[aria-label="Search URL"]')!==null`), 'Edit URL is not in a dialog');
      settings.setSize(480,520);await wait(200);
      assert(await evaluate(settings, `(()=>{const d=document.querySelector('.search-engine-dialog');const r=d.getBoundingClientRect();const f=d.querySelector('.search-engine-dialog-actions').getBoundingClientRect();return r.height<=innerHeight && r.width<=innerWidth && f.bottom<=innerHeight && f.top>=r.top;})()`), 'Search editor footer is clipped');
      fs.writeFileSync(path.join(out,'search-engine-edit-dialog.png'),(await settings.capturePage()).toPNG());
      await evaluate(settings, `Array.from(document.querySelectorAll('.search-engine-dialog button')).find(button=>button.textContent==='Cancel').click();undefined`);await wait(100);
      assert(await evaluate(settings, `!document.querySelector('[role="dialog"]')`), 'Cancel did not close the editor');
      console.log('PASS: search action alignment at 1080, 760 and 480 pixels; URL editor dialog and visible footer at 480×520');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    const tabs = [
      {
        id: 'personal-home',
        name: 'Facebook',
        sessionName: 'Facebook · Personal',
        url: url + '/home',
        icon: '',
        sessionId: 'personal',
        spaceId: 'default',
        pinned: true,
      },
      {
        id: 'personal-messages',
        name: 'Messages',
        sessionName: 'Facebook · Personal',
        url: url + '/messages',
        icon: '',
        sessionId: 'personal',
        spaceId: 'default',
        pinned: false,
      },
      {
        id: 'work-home',
        name: 'Facebook Work',
        sessionName: 'Facebook · Work',
        url: url + '/work',
        icon: '',
        sessionId: 'work',
        spaceId: 'default',
        pinned: true,
      },
      {
        id: 'notes',
        name: 'Notes',
        sessionName: 'Notes',
        url: url + '/notes',
        icon: '',
        sessionId: 'notes',
        spaceId: 'default',
        favorite: true,
        pinned: true,
      },
    ];
    if (process.argv.includes('--folder-group-switch-only')) tabs.forEach(tab => { if (!tab.favorite) tab.groupDisplay = 'folder'; });
    if (process.argv.includes('--group-close-only') || (process.argv.includes('--folder-group-switch-only') && process.argv.includes('--shared-profile'))) tabs[2].sessionProfileId = 'personal';
    await evaluate(
      main,
      `localStorage.setItem('user_apps',${JSON.stringify(
        JSON.stringify(tabs)
      )});localStorage.setItem('kudiumbrowser-appearance','light');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(
        JSON.stringify([
          {
            id: 'default',
            name: 'Personal',
            color: 'iris',
            folders: [],
            selectedAppId: 'personal-home',
          },
          { id: 'work', name: 'Work', color: 'blue', folders: [] },
        ])
      )});undefined`
    );
    await main.reload();
    await wait(1200);
    for (let attempt=0;attempt<10 && await evaluate(main,"document.querySelectorAll('.horizontal-tab').length") !== 2;attempt++) await wait(200);
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.horizontal-tab').length`
      ),
      2
    );
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.sidebar-apps .sidebar-app').length`
      ),
      2
    );
    const initialViews = main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session);
    assert.equal(initialViews.length, 1, 'Startup should only create the selected page: '+JSON.stringify(initialViews.map(view=>({id:view.webContents.id,url:view.webContents.getURL(),visible:view.getVisible()}))));
    assert(initialViews[0].webContents.getURL().endsWith('/home'));
    if(process.argv.includes('--folder-group-switch-only')) {
      main.show();main.focus();
      await evaluate(main, `window.resizeLoopErrors=[];window.addEventListener('error',e=>{if(e.message.includes('ResizeObserver'))window.resizeLoopErrors.push(e.message)});undefined`);
      const click=async selector=>{
        const point=await evaluate(main, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
        main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
        main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
        await wait(200);
      };
      await click('.sidebar-app[aria-label="Facebook · Personal"]');
      await click('.sidebar-app[aria-label="Facebook · Work"]');
      const panelApi=require(path.join(runtimeDir,'electronBrowser.js'));
      panelApi.showHookPanel({source:initialViews[0].webContents,owner:main,groupId:'personal',sourceId:'personal-home',token:'fixture',hookId:'fixture',hookName:'URL breaker',authorized:()=>true},{id:'url',title:'URL breakdown',reveal:true,content:{type:'table',columns:['Part','Value'],rows:[['URL',url+'/home']]}});
      await wait(650);
      const panelRect=await evaluate(main,`(()=>{const r=document.querySelector('.sidebar-feature-content').getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.floor(r.right)-Math.round(r.x),height:Math.floor(r.bottom)-Math.round(r.y)}})()`);
      const nativePanel=main.contentView.children.find(v=>v instanceof WebContentsView&&v.webContents.getURL().startsWith('data:text/html'));
      assert(nativePanel,'Native hook panel must exist');
      const nativeBounds=nativePanel.getBounds();
      assert.equal(nativeBounds.x,panelRect.x,'Native panel must follow the completed shell opening transition');
      assert.equal(nativeBounds.width,panelRect.width,'Native panel must use the full slot width');
      assert(await evaluate(main,`!!document.querySelector('.sidebar-feature-content')`),'Hook panel must be open during navigation test');
      for(const width of [760,1160]){
        main.setSize(width,850);await wait(150);
        for(const id of ['work-home','personal-messages','work-home','personal-home']){
          const tab=tabs.find(tab=>tab.id===id);
          const registry=panelApi.sidebarPanelsFor(main);
          const beforeGroup=registry.activeGroup;
          registry.setTarget(beforeGroup);
          await click('.sidebar-group-tab-select[title="'+tab.url+'"]');
          const result=await evaluate(main, `({ids:[...document.querySelectorAll('.horizontal-tabs [role=tab]')].map(e=>e.id),selected:document.querySelector('.horizontal-tabs [aria-selected=true]')?.id,rootX:document.getElementById('root').scrollLeft,rootY:document.getElementById('root').scrollTop})`);
          const expected=tabs.filter(t=>t.sessionId===tab.sessionId).map(t=>'page-tab-'+t.id);
          assert.deepEqual(result.ids,expected,'Folder switch strip mismatch: '+JSON.stringify(result));
          assert.equal(result.selected,'page-tab-'+id);
          if(beforeGroup!==tab.sessionId)assert.equal(registry.targetGroup,undefined,'Pinned panel must return to Auto on a group switch');
          assert.equal(result.rootX,0);assert.equal(result.rootY,0);
          for(let attempt=0;attempt<40&&!main.contentView.children.some(v=>v instanceof WebContentsView&&v.webContents.session!==main.webContents.session&&v.getVisible()&&tabs.some(t=>t.url===v.webContents.getURL()));attempt++)await wait(50);
          const visible=main.contentView.children.filter(v=>v instanceof WebContentsView&&v.webContents.session!==main.webContents.session&&v.getVisible()&&tabs.some(t=>t.url===v.webContents.getURL()));
          assert.equal(visible.length,1);
          assert.equal(visible[0].webContents.getURL(),tab.url);
        }
      }
      assert.deepEqual(await evaluate(main,'window.resizeLoopErrors'),[],'ResizeObserver loop during group switch');
      console.log('PASS actual browser: native folder-tab clicks switch group strip, selected tab and website at 760/1160px without root scrolling.');
      Object.values(windows).forEach(win=>win.destroy());server.close();app.quit();return;
    }
    if(process.argv.includes('--developer-sidebar-only')) {
      require('esbuild').buildSync({entryPoints:['src/main/shellContextMenu.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(runtimeDir,'shellContextMenu.js')});
      const {shellContextMenu}=require(path.join(runtimeDir,'shellContextMenu.js'));
      main.webContents.on('context-menu',(_,params)=>{const items=shellContextMenu(main.webContents,params,false);if(items.length)Menu.buildFromTemplate(items).popup({window:main});});
      const until=async expression=>{for(let i=0;i<60;i++){if(await evaluate(main,expression))return;await wait(100);}throw new Error('Timed out: '+expression);};
      const site=require(path.join(runtimeDir,'siteSettings.js'));site.updateSiteSettings('personal',url,{developer:{enabled:true,before:'',after:"log('Saved hook', url);",css:''}});
      await evaluate(main,"document.querySelector('[aria-label=\"Toggle AI sidebar\"]').click();undefined");await wait(250);
      await evaluate(main,`(()=>{const input=document.querySelector('textarea[aria-label="Task for AI"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this draft');input.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`);
      const inputPoint=await evaluate(main,`(()=>{const r=document.querySelector('textarea[aria-label="Task for AI"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      nativeContextMenu=undefined;main.focus();main.webContents.focus();
      main.webContents.sendInputEvent({type:'mouseDown',button:'right',clickCount:1,...inputPoint});main.webContents.sendInputEvent({type:'mouseUp',button:'right',clickCount:1,...inputPoint});
      for(let i=0;i<30&&!nativeContextMenu;i++)await wait(50);
      assert(nativeContextMenu,'composer gets native editing menu in production');
      for(const role of ['cut','copy','paste','selectall'])assert(nativeContextMenu.items.some(item=>item.role?.toLowerCase()===role),'native editing role: '+role);
      nativeContextMenu.closePopup(main);await wait(100);
      await evaluate(main,"document.getElementById('ai-developer-tab').click();undefined");
      await evaluate(main,`document.querySelector('[aria-label="Developer group"]').click();undefined`);await until("!!document.querySelector('.group-picker [role=option]')");
      await evaluate(main,`[...document.querySelectorAll('.group-picker [role=option]')].find(option=>option.textContent.includes('Facebook · Personal')).click();undefined`);await until("document.querySelectorAll('.developer-sidebar-page').length===2");
      await until("!document.querySelector('.group-picker [role=option]')");
      assert.equal(await evaluate(main,"document.querySelectorAll('.developer-hook-status.enabled').length"),2,'saved hooks apply to both same-site pages');
      const pageViews=()=>main.contentView.children.filter(view=>view instanceof WebContentsView&&!view.webContents.isDestroyed()&&view.webContents.session!==main.webContents.session);
      const live=pageViews().length;
      const openPageMenu=async keyboard=>{
        nativeContextMenu=undefined;
        if(keyboard) await evaluate(main,`(()=>{const row=[...document.querySelectorAll('.developer-sidebar-page')].find(row=>row.textContent.includes('Messages'));row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));})();undefined`);
        else {
          const point=await evaluate(main,`(()=>{const row=[...document.querySelectorAll('.developer-sidebar-page')].find(row=>row.textContent.includes('Messages'));const r=row.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
          main.focus();main.webContents.focus();
          main.webContents.sendInputEvent({type:'mouseDown',button:'right',clickCount:1,...point});
          main.webContents.sendInputEvent({type:'mouseUp',button:'right',clickCount:1,...point});
        }
        for(let i=0;i<30&&!nativeContextMenu;i++)await wait(50);
        assert(nativeContextMenu,'Developer page opens native tab menu');
        return nativeContextMenu;
      };
      const choose=async(menu,label)=>{const item=menu.items.find(entry=>entry.label===label);assert(item&&item.enabled,label+' must be enabled');item.click();menu.closePopup(main);await wait(150);};
      let pageMenu=await openPageMenu(false);
      for(const label of ['Open tab','Manage hooks…','Add to AI','Pin tab','Duplicate Tab','Close Tab'])assert(pageMenu.items.some(item=>item.label===label),'shared tab action: '+label+'; actual: '+JSON.stringify(pageMenu.items.map(item=>item.label)));
      assert(!pageMenu.items.some(item=>item.label==='Inspect Element'),'element-specific menu replaces generic Inspect');
      assert.equal(pageViews().length,live,'opening menu does not load dormant page');
      await choose(pageMenu,'Pin tab');
      pageMenu=await openPageMenu(true);assert(pageMenu.items.some(item=>item.label==='Unpin tab'),'keyboard menu sees updated pin state');await choose(pageMenu,'Unpin tab');
      nativeContextMenu=undefined;
      await evaluate(main,`document.querySelector('[aria-label="Developer group"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);
      for(let i=0;i<30&&!nativeContextMenu;i++)await wait(50);
      assert(nativeContextMenu.items.some(item=>item.label==='Add to AI'),'group picker reuses group actions');
      nativeContextMenu.closePopup(main);await wait(100);
      assert.equal(await evaluate(main,"document.querySelectorAll('.developer-sidebar-page').length"),2,'group right-click preserves selection');
      pageMenu=await openPageMenu(false);await choose(pageMenu,'Manage hooks…');
      let editor;for(let i=0;i<60&&!editor;i++){editor=BrowserWindow.getAllWindows().find(win=>win!==main&&(win.getTitle().includes('Developer')||win.webContents.getURL().includes('view=site-developer')));if(!editor)await wait(100);}assert(editor,'opens independent editor for unloaded page');await wait(700);
      assert.equal(pageViews().length,live,'opening saved-script editor must not load dormant tabs');
      assert(await editor.webContents.executeJavaScript("document.querySelector('.cm-content').textContent.includes('Saved hook')"),'existing syntax editor displays saved hooks');
      await editor.webContents.executeJavaScript("window.electron.siteDeveloper.command({id:'wrong',url:'https://wrong.test',action:'set-site-developer',developer:{enabled:false,before:'',after:\"log('Updated saved hook');\",css:''}});undefined");
      await until("document.querySelectorAll('.developer-hook-status.enabled').length===0");assert.equal(site.getSiteSettings('personal',url).developer.after,"log('Updated saved hook');");assert.equal(pageViews().length,live,'saving hooks must not load dormant tabs');editor.close();
      const out=path.resolve('docs/evidence/developer-sidebar');fs.mkdirSync(out,{recursive:true});
      const headerOut=path.resolve('docs/evidence/ai-header');fs.mkdirSync(headerOut,{recursive:true});
      for(const [sideWidth,theme,paused] of [[600,'light',false],[368,'dark',false],[300,'light',true],[240,'dark',true]]) {
        await evaluate(main,`(()=>{document.querySelector('.ai-sidebar').style.width='${sideWidth}px';document.querySelector('.ai-panel-slot').style.width='${sideWidth+8}px';localStorage.setItem('kudiumbrowser-appearance','${theme}');window.dispatchEvent(new Event('storage'));})();undefined`);
        main.webContents.send('ai-mcp-changed',{running:paused,paused});await wait(300);
        for(const tab of ['assistant','tasks','developer']) {
          await evaluate(main,`document.getElementById('ai-${tab}-tab').click();undefined`);await wait(150);
          const layout=await evaluate(main,`(()=>{const header=document.querySelector('.ai-sidebar-header'),r=header.getBoundingClientRect(),buttons=[...header.querySelectorAll('button')],centers=buttons.map(button=>{const b=button.getBoundingClientRect();return b.top+b.height/2});return {x:r.x,y:r.y,width:r.width,height:r.height,overflow:header.scrollWidth>header.clientWidth,delta:Math.max(...centers)-Math.min(...centers),selected:header.querySelector('[aria-selected=true]').id}})()`);
          assert(await evaluate(main,"[...document.querySelectorAll('.ai-sidebar-tab-label')].every(label=>{if(getComputedStyle(label).display==='none')return true;const r=label.getBoundingClientRect(),b=label.closest('button').getBoundingClientRect();return r.left>=b.left+5&&r.right<=b.right-5})"),'segment labels retain padding');
          assert(!layout.overflow,'single row header does not overflow');assert(layout.delta<1,'header buttons align vertically');assert.equal(layout.selected,`ai-${tab}-tab`);
          fs.writeFileSync(path.join(headerOut,`${sideWidth}-${theme}-${tab}.png`),(await main.capturePage({x:Math.floor(layout.x),y:Math.floor(layout.y),width:Math.ceil(layout.width),height:Math.ceil(layout.height)})).toPNG());
        }
        await evaluate(main,"(()=>{const tab=document.getElementById('ai-developer-tab');tab.focus();tab.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));})();undefined");
        assert(await evaluate(main,"document.activeElement.id==='ai-assistant-tab'&&document.getElementById('ai-assistant-tab').getAttribute('aria-selected')==='true'"),'keyboard selection and focus preserved');
      }
      main.webContents.send('ai-mcp-changed',{running:false,paused:false});
      await evaluate(main,"document.querySelector('.ai-sidebar').style.removeProperty('width');document.querySelector('.ai-panel-slot').style.removeProperty('width');document.getElementById('ai-developer-tab').click();undefined");await wait(200);

      for(const [width,theme] of [[1160,'light'],[740,'dark']]) {
        main.setContentSize(width,700);await evaluate(main,`localStorage.setItem('kudiumbrowser-appearance',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));undefined`);await wait(300);
        const bounds=await evaluate(main,"(()=>{const panel=document.querySelector('.developer-sidebar'),picker=panel.querySelector('.group-picker-trigger'),tabs=document.querySelector('.ai-sidebar-tabs');return {width:panel.clientWidth,overflow:panel.scrollWidth>panel.clientWidth,picker:picker.getBoundingClientRect().width,tabsOverflow:tabs.scrollWidth>tabs.clientWidth,tabHeights:[...tabs.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height),labelLines:picker.querySelector('.group-picker-label').getBoundingClientRect().height}})()");assert(!bounds.overflow&&!bounds.tabsOverflow,'narrow panel has no horizontal overflow');assert(bounds.picker<=bounds.width);assert(bounds.tabHeights.every(height=>height<=36),'tabs remain single-line');assert(bounds.labelLines<=20,'group label remains single-line');fs.writeFileSync(path.join(out,`${width}-${theme}.png`),(await main.capturePage()).toPNG());
      }
      await evaluate(main,"document.querySelector('[aria-label=\"Developer group\"]').click();undefined");await until("!!document.querySelector('.group-picker [role=option]')");assert(await evaluate(main,"!!document.querySelector('.group-picker .group-icon-slot')"),'picker reuses GroupIcon');
      await evaluate(main,"[...document.querySelectorAll('.group-picker [role=option]')].find(option=>option.textContent.includes('Facebook · Work')).click();undefined");await until("document.querySelectorAll('.developer-sidebar-page').length===1");assert(await evaluate(main,"document.querySelector('.developer-hook-status').textContent==='No hooks'"),'other login profile remains isolated');
      await evaluate(main,"document.getElementById('ai-assistant-tab').click();undefined");assert.equal(await evaluate(main,"document.querySelector('textarea[aria-label=\"Task for AI\"]').value"),'Keep this draft','switching panels preserves AI draft');
      await evaluate(main,"document.getElementById('ai-developer-tab').click();undefined");const api=require(path.join(runtimeDir,'electronBrowser.js'));await api.getGroupLocks().change('protect','work');await until("!document.querySelector('.developer-sidebar-page')");
      assert(await evaluate(main,"window.electron.siteDeveloper.pages('work-home').then(()=>false,error=>error.message.includes('Unlock'))"),'locked library access denied');
      console.log('PASS: native AI tab/group menus, pin/unpin, keyboard context menu, hook editor actions; Developer sidebar group picker/icons, hook summaries, search-ready page list, offline editor/save, scoped profile isolation, AI draft preservation, locks and narrow light/dark layout');main.destroy();server.close();app.quit();return;
    }
    if(process.argv.includes('--group-locks-only')) {
      const api=require(path.join(runtimeDir,'electronBrowser.js'));
      const lock=async(action,groupId='personal')=>evaluate(main,`window.electron.groupLocks.request(${JSON.stringify({action,groupId})})`);
      const attemptLock=async(action)=>evaluate(main,`window.electron.groupLocks.request(${JSON.stringify({action,groupId:'personal'})}).catch(error=>({error:String(error)}))`);
      const until=async(expression)=>{for(let i=0;i<60;i++){if(await evaluate(main,expression))return;await wait(100);}throw new Error('Timed out: '+expression);};
      const views=()=>main.contentView.children.filter(v=>v instanceof WebContentsView && !v.webContents.isDestroyed() && v.webContents.session!==main.webContents.session);
      const page=views()[0].webContents;
      await lock('protect');await until("!!document.querySelector('.group-access-gate')");assert(page.isDestroyed(),'protecting group unloads its live page');assert.equal(views().length,0);
      assert.equal(await evaluate(main,"document.querySelectorAll('.horizontal-tab').length"),0,'locked group hides subtabs');
      const row=await evaluate(main,"(()=>{const r=[...document.querySelectorAll('.sidebar-app')].find(e=>e.textContent.includes('Personal'));return {title:r.title,draggable:r.draggable,lock:!!r.querySelector('.sidebar-group-lock')}})()");assert(row.title.includes('@') && row.title.includes('Locked group'));assert(!row.draggable && row.lock);
      await evaluate(main,`window.electron.browser.sync({apps:${JSON.stringify(tabs)},visible:[{id:'personal-home',x:310,y:80,width:700,height:500}],focusedId:'personal-home'})`);await wait(300);assert.equal(views().length,0,'forged layout cannot reveal locked group');
      const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
      await evaluate(main,`window.electron.ai.mcpUpdate({enabled:true,port:${port}})`);const connection=(await evaluate(main,'window.electron.ai.mcpConnection()')).mcpServers.kudiumbrowser;
      const agent=new Client({name:'group-lock-boundary',version:'1'},{capabilities:{}});await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
      const listed=await agent.callTool({name:'list_tabs',arguments:{}});assert(!JSON.stringify(listed.content).includes('personal-home'),'MCP must not list locked tabs');
      const read=await agent.callTool({name:'read_page',arguments:{tabId:'personal-home'}});assert(read.isError,'MCP cannot read a locked page');await agent.close();
      const receiver=ipcMain._invokeHandlers.get('browser-group-lock');await assert.rejects(receiver({sender:main.webContents,senderFrame:{}},{action:'unlock',groupId:'personal'}),/Untrusted/);await assert.rejects(receiver({sender:main.webContents,senderFrame:main.webContents.mainFrame},{action:'bypass',groupId:'personal'}),/Invalid/);
      const out=path.resolve('docs/evidence/group-locks');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'locked-light.png'),(await main.capturePage()).toPNG());
      cancelGroupAuthentication=true;assert((await attemptLock('unlock')).error.includes('cancelled'));assert(api.getGroupLocks().locked('personal'));cancelGroupAuthentication=false;
      await lock('unlock');await until("document.querySelectorAll('.horizontal-tab').length===2");await until("!document.querySelector('.group-access-gate')");assert.equal(groupAuthenticationCalls,2);
      await lock('unlock');assert.equal(groupAuthenticationCalls,2,'reuse session grant');
      main.reload();await wait(1000);assert(!api.getGroupLocks().locked('personal'),'renderer reload retains browser-session grant');
      require('electron').powerMonitor.emit('lock-screen');await until("!!document.querySelector('.group-access-gate')");assert(api.getGroupLocks().locked('personal'));assert.equal(views().length,0);
      await evaluate(main,"localStorage.setItem('kudiumbrowser-appearance','dark');window.dispatchEvent(new Event('storage'))");main.setContentSize(640,600);await wait(300);fs.writeFileSync(path.join(out,'locked-dark-narrow.png'),(await main.capturePage()).toPNG());
      finishGroupAuthentication=()=>{};const pending=attemptLock('unlock');for(let i=0;i<30&&groupAuthenticationCalls<3;i++)await wait(50);require('electron').powerMonitor.emit('suspend');finishGroupAuthentication();assert((await pending).error.includes('locked during authentication'));finishGroupAuthentication=undefined;assert(api.getGroupLocks().locked('personal'));
      await lock('unlock');await lock('unprotect');assert(!api.getGroupLocks().snapshot().protected.includes('personal'));
      const longSlug='personal-group-with-a-long-reference-for-tooltip-checking';
      await evaluate(main,`localStorage.setItem('user_apps',JSON.stringify(JSON.parse(localStorage.getItem('user_apps')).map(tab=>tab.sessionId==='personal'?{...tab,sessionSlug:${JSON.stringify(longSlug)}}:tab)));undefined`);main.reload();await wait(1000);
      assert(await evaluate(main,`(()=>{const row=[...document.querySelectorAll('.sidebar-app')].find(row=>row.textContent.includes('Personal'));return row.title.includes('…')&&!row.title.includes(${JSON.stringify(longSlug)});})()`),'Native tooltip truncates long group slug');
      require(path.join(runtimeDir,'preferences.js')).updateBrowserPreferences({tabDisplayMode:'hover'});await wait(300);main.focus();main.webContents.focus();
      const point=await evaluate(main,`(()=>{const row=[...document.querySelectorAll('.sidebar-app')].find(row=>row.textContent.includes('Personal'));const r=row.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      main.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});main.webContents.sendInputEvent({type:'mouseMove',...point});await wait(500);await until("!!document.querySelector('.anchored-tab-preview small')");
      assert(await evaluate(main,`(()=>{const label=document.querySelector('.tab-preview-title small');const r=label.getBoundingClientRect();return label.textContent===${JSON.stringify('@'+longSlug)}&&label.scrollWidth>label.clientWidth&&r.right<=innerWidth;})()`),'Hover preview shows an ellipsized slug within window bounds');fs.writeFileSync(path.join(out,'slug-hover-dark-narrow.png'),(await main.capturePage()).toPNG());
      console.log('PASS: group OS-auth boundary, live-page unloading, cancellation, session grants, lock/suspend revocation, tool/layout denial and locked UI');main.destroy();server.close();app.quit();return;
    }
    if (process.argv.includes('--html-drag-only')) {
      await wait(500);await evaluate(main,`document.querySelector('[aria-label="Toggle AI sidebar"]').click();undefined`);await wait(200);
      const web=main.contentView.children.find(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).webContents;
      await web.executeJavaScript(`(()=>{const source=document.createElement('div');source.setAttribute('role','button');source.setAttribute('aria-label','Native HTML source');source.draggable=true;source.style='position:fixed;left:20px;top:40px;width:80px;height:40px;background:lightblue;z-index:9999';source.ondragstart=event=>{window.nativeHTMLStarted=event.isTrusted;event.dataTransfer.setData('text/plain','Native browser HTML payload');event.dataTransfer.effectAllowed='copy';};const target=document.createElement('div');target.setAttribute('role','button');target.setAttribute('aria-label','Native HTML target');target.style='position:fixed;left:220px;top:40px;width:100px;height:40px;background:lightgreen;z-index:9999';target.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';};target.ondrop=event=>{event.preventDefault();window.nativeHTMLDrop={trusted:event.isTrusted,text:event.dataTransfer.getData('text/plain')};};document.body.append(source,target);})()`);
      const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
      await evaluate(main,`window.electron.ai.mcpUpdate({enabled:true,port:${port}})`);const connection=(await evaluate(main,'window.electron.ai.mcpConnection()')).mcpServers.kudiumbrowser;
      const agent=new Client({name:'native-html-drag',version:'1'},{capabilities:{}});await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
      const decode=result=>{assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
      const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
      try {
        const page=decode(await agent.callTool({name:'read_page',arguments:{tabId:'personal-home'}}));const source=page.elements.find(element=>element.label==='Native HTML source'),target=page.elements.find(element=>element.label==='Native HTML target');assert(source&&target);
        const args={tabId:'personal-home',elementId:source.id,toElementId:target.id,snapshotId:page.snapshotId};
        const first=await agent.callTool({name:'drag',arguments:args});assert(!first.isError,JSON.stringify(first));assert.deepEqual(await web.executeJavaScript('nativeHTMLDrop'),{trusted:true,text:'Native browser HTML payload'});
        await web.executeJavaScript('delete window.nativeHTMLStarted;delete window.nativeHTMLDrop;undefined');
        const original=web.debugger.sendCommand;let started=false;
        web.debugger.sendCommand=async function(method,params,...rest){const result=await original.call(this,method,params,...rest);if(method==='Input.dispatchMouseEvent'&&params?.type==='mouseMoved'&&params.buttons===1&&await web.executeJavaScript('window.nativeHTMLStarted===true')){started=true;return new Promise(()=>{});}return result;};
        try {
          const pending=agent.callTool({name:'drag',arguments:args});for(let attempt=0;attempt<50&&!started;attempt++)await wait(20);assert(started,'Actual native HTML drag must begin before sidebar Stop');
          await evaluate(main,`Array.from(document.querySelectorAll('.ai-composer button')).find(button=>button.getAttribute('aria-label')==='Stop AI task').click();undefined`);assert((await pending).isError);
        } finally {web.debugger.sendCommand=original;}
        await wait(150);assert(!web.debugger.isAttached());assert.equal(await web.executeJavaScript('window.nativeHTMLDrop'),undefined,'Sidebar Stop must not deliver HTML drop');
        const recovery=await agent.callTool({name:'drag',arguments:args});assert(!recovery.isError,JSON.stringify(recovery));assert.equal((await web.executeJavaScript('nativeHTMLDrop')).text,'Native browser HTML payload');assert(!web.debugger.isAttached());
        console.log('PASS: actual React/native browser trusted HTML drag payload, sidebar Stop without drop, debugger cleanup and native drag recovery');
      } finally {dialog.showMessageBox=savedApproval;await agent.close();}
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }

    if (process.argv.includes('--file-chooser-only')) {
      await wait(500);
      await evaluate(main, `document.querySelector('[aria-label^="Toggle Chat sidebar"]').click();undefined`);await wait(200);
      const web=main.contentView.children.find(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).webContents;
      await web.executeJavaScript(`(()=>{window.chooserTrusted=false;window.waitingClicks=0;const input=document.createElement('input');input.id='native-hidden-file';input.type='file';input.style.display='none';document.body.append(input);const choose=document.createElement('button');choose.textContent='Choose native artifact';choose.style='position:fixed;left:20px;top:20px;z-index:9999';choose.onclick=event=>{window.chooserTrusted=event.isTrusted;input.click();};document.body.append(choose);const wait=document.createElement('button');wait.textContent='Wait for chooser';wait.style='position:fixed;left:20px;top:70px;z-index:9999';wait.onclick=()=>window.waitingClicks++;document.body.append(wait);})()`);
      const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
      await evaluate(main,`window.electron.ai.mcpUpdate({enabled:true,port:${port}})`);
      const connection=(await evaluate(main,'window.electron.ai.mcpConnection()')).mcpServers.kudiumbrowser;
      const agent=new Client({name:'native-file-chooser',version:'1'},{capabilities:{}});await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
      const decode=result=>{assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
      const file=path.join(runtimeDir,'native-artifact.txt');fs.writeFileSync(file,'Native chooser fixture');
      const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
      try {
        const target=decode(await agent.callTool({name:'find_element',arguments:{tabId:'personal-home',label:'Choose native artifact',role:'button'}}));
        const chosen=decode(await agent.callTool({name:'upload_files',arguments:{tabId:'personal-home',elementId:target.elementId,snapshotId:target.snapshotId,paths:[file]}}));
        assert(chosen.attached && chosen.files[0].name==='native-artifact.txt');
        assert.equal(await web.executeJavaScript('chooserTrusted'),true);
        assert.equal(await web.executeJavaScript('document.querySelector("#native-hidden-file").files[0].text()'),'Native chooser fixture');
        assert(!web.debugger.isAttached(),'Native chooser completion must release its session');
        const waiting=decode(await agent.callTool({name:'find_element',arguments:{tabId:'personal-home',label:'Wait for chooser',role:'button'}}));
        const pending=agent.callTool({name:'upload_files',arguments:{tabId:'personal-home',elementId:waiting.elementId,snapshotId:waiting.snapshotId,paths:[file]}});
        for(let attempt=0;attempt<50&&!await web.executeJavaScript('waitingClicks');attempt++)await wait(20);
        await wait(100);
        await evaluate(main,`Array.from(document.querySelectorAll('.ai-composer button')).find(button=>button.getAttribute('aria-label')==='Stop AI task').click();undefined`);
        assert((await pending).isError,'Actual sidebar Stop must cancel pending file chooser');
        assert(!web.debugger.isAttached());
        assert.equal(await web.executeJavaScript('document.querySelector("#native-hidden-file").files[0].name'),'native-artifact.txt','Stop must preserve prior file selection');
        const retry=decode(await agent.callTool({name:'find_element',arguments:{tabId:'personal-home',label:'Choose native artifact',role:'button'}}));
        decode(await agent.callTool({name:'upload_files',arguments:{tabId:'personal-home',elementId:retry.elementId,snapshotId:retry.snapshotId,paths:[file]}}));
        assert(!web.debugger.isAttached());
        const secondFile=path.join(runtimeDir,'native-second.txt');fs.writeFileSync(secondFile,'Second chooser fixture');
        await web.executeJavaScript(`document.querySelector('#native-hidden-file').multiple=true;undefined`);
        const multipleTarget=decode(await agent.callTool({name:'find_element',arguments:{tabId:'personal-home',label:'Choose native artifact',role:'button'}}));
        decode(await agent.callTool({name:'upload_files',arguments:{tabId:'personal-home',elementId:multipleTarget.elementId,snapshotId:multipleTarget.snapshotId,paths:[file,secondFile]}}));
        assert.equal(await web.executeJavaScript('document.querySelector("#native-hidden-file").files.length'),2,'Multiple selection must deliver both files');
        assert.deepEqual(await web.executeJavaScript('Promise.all(Array.from(document.querySelector("#native-hidden-file").files,file=>file.text()))'),['Native chooser fixture','Second chooser fixture']);
        assert(!web.debugger.isAttached(),'Multiple selection must release its session');
        const folder=path.join(runtimeDir,'native-folder');fs.mkdirSync(path.join(folder,'nested'),{recursive:true});
        for(let index=0;index<100;index++)fs.writeFileSync(path.join(folder,`file-${index}.txt`),String(index));
        fs.writeFileSync(path.join(folder,'.hidden'),'Hidden native artifact');fs.writeFileSync(path.join(folder,'nested','one.txt'),'Nested one');fs.writeFileSync(path.join(folder,'nested','two.txt'),'Nested two');
        await web.executeJavaScript(`document.querySelector('#native-hidden-file').webkitdirectory=true;undefined`);
        const folderTarget=decode(await agent.callTool({name:'find_element',arguments:{tabId:'personal-home',label:'Choose native artifact',role:'button'}}));
        const folderArgs={tabId:'personal-home',elementId:folderTarget.elementId,snapshotId:folderTarget.snapshotId,paths:[folder]};
        dialog.showMessageBox=async()=>({response:0});assert((await agent.callTool({name:'upload_files',arguments:folderArgs})).isError,'Denied native folder selection must not replace files');
        assert.equal(await web.executeJavaScript('document.querySelector("#native-hidden-file").files[0].name'),'native-artifact.txt');
        let folderApproval;dialog.showMessageBox=async(_window,options)=>{folderApproval=options;return {response:1};};
        const nativeId=web.id;const folderReceipt=decode(await agent.callTool({name:'upload_files',arguments:folderArgs}));
        assert.equal(folderReceipt.fileCount,103);assert.equal(folderReceipt.files.length,100);assert(folderReceipt.truncated,'Large folder receipt must stay bounded');
        assert(folderApproval.detail.includes(folder) && folderApproval.detail.includes('103 files') && folderApproval.detail.includes('hidden files'),'Native folder approval must disclose full recursive selection');
        assert.equal(web.id,nativeId,'Folder uploads must preserve the actual page renderer');
        assert.equal(await web.executeJavaScript('document.querySelector("#native-hidden-file").files.length'),103,'Browser must receive every file despite bounded receipt');
        assert.equal(await web.executeJavaScript(`Array.from(document.querySelector('#native-hidden-file').files).find(file=>file.webkitRelativePath==='native-folder/nested/two.txt').text()`),'Nested two');
        assert(!web.debugger.isAttached());
        fs.writeFileSync(path.join(out,'file-input-results.json'),JSON.stringify({outcome:'passed',measuredAt:new Date().toISOString(),runtime:{electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform,arch:process.arch},verified:['Trusted click and hidden file input','Single and multiple file selection with exact bytes','Sidebar Stop preserves previous selection','Denied directory selection preserves previous files','103-file directory selection with relative paths','Debugger cleanup'],limitations:['Chromium chooser interception is automated through CDP; native macOS Open sheets are not driven.','Synthetic files and approved local fixture actions only.']},null,2));
        console.log('PASS: React/native browser hidden file chooser, trusted input, sidebar Stop/recovery, denied folder preservation, complete 103-file directory selection with relative paths and bounded receipt');

      } finally {dialog.showMessageBox=savedApproval;await agent.close();}
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }

    if (process.argv.includes('--tab-discard-only')) {
      require(path.join(runtimeDir,'preferences.js')).updateBrowserPreferences({discardAfterMinutes:15});
      await initialViews[0].webContents.executeJavaScript('document.body.style.height="4000px";window.scrollTo(0,200);undefined');
      await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);
      await wait(500);
      assert.equal(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).length, 2);
      const actualNow = Date.now;
      Date.now = () => actualNow() + 16 * 60000;
      const originalContents = initialViews[0].webContents;
      idleCheck();
      for (let attempt=0; attempt<50 && !originalContents.isDestroyed(); attempt++) await wait(100);
      assert(originalContents.isDestroyed(), 'Idle page did not unload');
      assert.equal(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).length, 1);
      assert.equal(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).length`), 4, 'Sleeping deleted a saved tab');
      await evaluate(main, `document.getElementById('page-tab-personal-home').click();undefined`);
      await wait(700);
      const awake = main.contentView.children.find(view => view.webContents?.getURL().endsWith('/home'));
      assert(awake && !awake.webContents.isDestroyed(), 'Sleeping tab did not reload');
      assert.equal(awake.webContents.session, main.contentView.children.find(view => view.webContents?.getURL().endsWith('/messages')).webContents.session);
      // Editors are conservatively protected even without unload handlers.
      await awake.webContents.executeJavaScript('document.body.appendChild(document.createElement("textarea"));undefined');
      await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);
      await wait(200);
      Date.now = () => actualNow() + 32 * 60000;
      idleCheck(); await wait(1100);
      assert(!awake.webContents.isDestroyed(), 'Editor page was discarded');
      await awake.webContents.executeJavaScript('document.querySelector("textarea").remove();undefined');
      // A beforeunload listener must protect the hidden page from sleeping.
      await awake.webContents.executeJavaScript('window.testUnload=event=>{event.preventDefault();event.returnValue=""};window.addEventListener("beforeunload",window.testUnload);undefined');
      await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);
      await wait(200);
      Date.now = () => actualNow() + 48 * 60000;
      idleCheck(); await wait(1100);
      assert(!awake.webContents.isDestroyed(), 'Page with unload warning was discarded');
      await awake.webContents.executeJavaScript('window.removeEventListener("beforeunload",window.testUnload);undefined');
      Date.now = actualNow; global.setInterval = realInterval;
      console.log('PASS: idle page unloads without deleting tabs; wakes in the same session; editors and beforeunload pages stay loaded');
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--lazy-restore-only')) {
      await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);
      await wait(500);
      const visited = main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session);
      assert.equal(visited.length, 2, 'Visiting a tab should create only that page');
      assert(visited.some(view => view.webContents.getURL().endsWith('/messages')));
      await evaluate(main, `document.getElementById('page-tab-personal-home').click();undefined`);
      await wait(300);
      assert.equal(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).length, 2);
      assert.equal(initialViews[0].webContents.getURL(), url + '/home');
      console.log('PASS: startup loads only the selected page; unvisited pages have no views; visited tabs are retained');
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    // Existing scenarios need these pages: visit them rather than preload them.
    if (!process.argv.includes('--website-tabs-only') && !process.argv.includes('--opener-flow-only')) {
    await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);
    await wait(300);
    for (const id of ['work-home', 'notes', 'personal-home']) {
      // Identify fixture tabs by ID: loaded titles and group labels can change.
      main.webContents.send('browser-tab-request',{action:'select',id});
      await wait(300);
    }
    await evaluate(main, `document.getElementById('page-tab-personal-home').click();undefined`);
    await wait(300);
    }
    const views = main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session);
    assert.equal(views.length, (process.argv.includes('--website-tabs-only') || process.argv.includes('--opener-flow-only')) ? 1 : 4);
    if (process.argv.includes('--ipc-boundaries-only')) {
      const before=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session);
      await evaluate(main, `window.electron.browser.sync({apps:[],visible:null});window.electron.browser.sync({apps:[null],visible:[]});window.electron.browser.command(null);window.electron.browser.command({id:'personal-home',action:'navigate',url:{}});undefined`);await wait(150);
      assert.deepEqual(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session),before,'Malformed IPC changed existing views');
      const outsider=new BrowserWindow({show:false,webPreferences:{preload:path.join(runtimeDir,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
      await outsider.loadURL(url+'/untrusted-ipc');
      const rejected=await evaluate(outsider,`Promise.all([
        window.electron.browser.preferences('get'),
        window.electron.browser.preferenceAction('reset'),
        window.electron.browser.nativeMenu([{id:'x',label:'Unsafe'}]),
        window.electron.browser.confirm({message:'Unsafe',detail:'',confirm:'Continue'}),
        window.electron.browser.history('get'),
      ].map(request=>request.then(()=>false,()=>true)))`);
      assert(rejected.every(Boolean),'Untrusted window gained access to app IPC');
      await evaluate(outsider,`window.preferenceEvents=0;window.electron.browser.onPreferences(()=>window.preferenceEvents++);window.electron.browser.sync({apps:[],visible:[]});window.electron.browser.command({id:'personal-home',action:'navigate',url:'https://example.com'});undefined`);
      await evaluate(main,`window.preferenceEvents=0;window.electron.browser.onPreferences(()=>window.preferenceEvents++);undefined`);
      const prefs=require(path.join(runtimeDir,'preferences.js'));
      prefs.updateBrowserPreferences({showExtensionIcons:!prefs.getBrowserPreferences().showExtensionIcons});await wait(150);
      assert.equal(await evaluate(outsider,'window.preferenceEvents'),0,'Preference metadata leaked to an untrusted window');
      assert(await evaluate(main,'window.preferenceEvents>0'),'Trusted app did not receive preference changes');
      assert.deepEqual(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session),before,'Untrusted IPC changed views');
      assert(before.every(view=>view.webContents.getURL().startsWith(url)),'Untrusted command navigated a website');
      outsider.close();
      console.log('PASS: malformed layouts/commands preserve views; real untrusted IPC rejects preferences, dialogs, menus and history; preference broadcasts reach only trusted UI');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--browser-data-consent-only')) {
      const target=views[0].webContents;
      const other=views.find(view=>view.webContents.session!==target.session).webContents;
      const fixture=path.join(runtimeDir,'protected-storage-extension');fs.mkdirSync(fixture);
      fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'Protected Storage',version:'1.0',permissions:['storage'],action:{default_title:'Protected Storage',default_popup:'popup.html'}}));
      fs.writeFileSync(path.join(fixture,'popup.html'),'<html><body style="width:240px;height:120px">Storage fixture</body></html>');
      const extension=await target.session.extensions.loadExtension(fixture);await wait(400);
      const manager=require(path.join(runtimeDir,'extensions.js'));
      const openPopup=async()=>{
        let created;
        manager.getExtensionProfile('personal').api.once('browser-action-popup-created',popup=>{created=popup;});
        await evaluate(main, `document.querySelector('.extension-toolbar browser-action-list').shadowRoot.getElementById(${JSON.stringify(extension.id)}).click();undefined`);
        for(let attempt=0;attempt<30&&!created;attempt++)await wait(100);
        assert(created,'Storage fixture popup failed to open');await created.whenReady();return created.browserWindow;
      };
      let popup=await openPopup();
      await evaluate(popup, `chrome.storage.local.set({sentinel:'keep-extension'})`);popup.close();await wait(100);
      await target.session.cookies.set({url,name:'sentinel',value:'clear-website'});
      await other.session.cookies.set({url,name:'sentinel',value:'keep-other-session'});
      await target.executeJavaScript(`localStorage.setItem('site-sentinel','clear-website');undefined`);
      const reloaded=new Promise(resolve=>target.once('did-finish-load',()=>resolve(true)));
      await evaluate(main, `window.electron.browser.command({id:'personal-home',action:'clear-data'});undefined`);
      assert(await Promise.race([reloaded,wait(5000).then(()=>false)]),'Clear data did not finish/reload its original website');
      for(let attempt=0;attempt<30&&(await target.session.cookies.get({url,name:'sentinel'})).length;attempt++)await wait(100);
      assert.equal((await target.session.cookies.get({url,name:'sentinel'})).length,0,'Browser command retained website cookies');
      assert.equal((await other.session.cookies.get({url,name:'sentinel'}))[0].value,'keep-other-session','Clear data crossed session boundary');
      for(let attempt=0;attempt<30&&target.isLoading();attempt++)await wait(100);
      assert.equal(await target.executeJavaScript(`localStorage.getItem('site-sentinel')`),null,'Website localStorage survived clear');
      popup=await openPopup();
      assert.equal(await evaluate(popup, `chrome.storage.local.get('sentinel').then(value=>value.sentinel)`),'keep-extension','Browser command erased extension storage');
      popup.close();
      console.log('PASS: real browser clear-data command removes website cookies/localStorage, preserves another session and installed extension chrome.storage.local');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--local-images-only')) {
      const {nativeImage}=require('electron');
      const originalPicker=dialog.showOpenDialog;
      const normal=path.join(runtimeDir,'selected-icon.png');
      fs.writeFileSync(normal,nativeImage.createFromBitmap(Buffer.alloc(32*32*4,170),{width:32,height:32}).toPNG());
      let selected=normal,canceled=false;
      dialog.showOpenDialog=async()=>({canceled,filePaths:[selected]});
      try {
        for(const file of [normal,path.resolve('assets/icon.icns')]) {
          selected=file;
          const data=await evaluate(main,`window.electron.browser.chooseSpaceIcon()`);
          assert.equal(nativeImage.createFromDataURL(data).getSize().width,32);
        }
        canceled=true;assert.equal(await evaluate(main,`window.electron.browser.chooseSpaceIcon()`),null);canceled=false;
        const giant=fs.readFileSync(normal);giant.writeUInt32BE(32767,16);giant.writeUInt32BE(32767,20);selected=path.join(runtimeDir,'oversized-icon.png');fs.writeFileSync(selected,giant);
        assert(await evaluate(main,`window.electron.browser.chooseSpaceIcon().then(()=>false,error=>error.message.includes('40 megapixels'))`));
        const rogue=new BrowserWindow({show:false,webPreferences:{preload:path.join(runtimeDir,'preload.js'),contextIsolation:true}});await rogue.loadURL('about:blank');
        assert(await evaluate(rogue,`window.electron.browser.chooseSpaceIcon().then(()=>false,error=>error.message.includes('Untrusted'))`));rogue.destroy();
        const downloads=require(path.join(runtimeDir,'downloads.js'));downloads.registerDownloadLibrary(()=>{},contents=>contents===main.webContents);
        app.setPath('downloads',runtimeDir);require(path.join(runtimeDir,'preferences.js')).updateBrowserPreferences({askDownloadLocation:false});
        const session=views[0].webContents.session;const done=new Promise(resolve=>session.once('will-download',(_,item)=>item.once('done',resolve)));
        session.downloadURL(url+'/new-tab-icon.png');await done;
        const record=downloads.getDownloadHistory().find(entry=>entry.name.endsWith('.png'));assert(record);
        const results=await evaluate(main,`Promise.all(Array.from({length:3},()=>window.electron.browser.downloadThumbnail(${JSON.stringify(record.id)})))`);
        assert(results.every(data=>typeof data==='string'&&data===results[0]));assert(nativeImage.createFromDataURL(results[0]).getSize().width<=40);
        fs.writeFileSync(path.join(out,'local-images-results.json'),JSON.stringify({verified:['production preload icon IPC','real PNG/ICNS icon decode','cancel','oversized header rejection','foreign-window denial','real downloaded PNG thumbnail and cache deduplication'],nativePicker:'controlled selection of local fixture files'},null,2));
        console.log('PASS: production preload PNG/ICNS icons, cancellation, oversize/foreign-window rejection and real downloaded image thumbnails');
      } finally {dialog.showOpenDialog=originalPicker;}
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--native-ui-boundaries-only')) {
      nativeContextMenu=undefined;
      const denied=await evaluate(main, `Promise.all([
        window.electron.browser.nativeMenu([null]),
        window.electron.browser.nativeMenu([{label:'Bad',id:{}}]),
        window.electron.browser.nativeMenu([{label:'Bad',enabled:'false'}]),
        window.electron.browser.nativeMenu([{id:'same',label:'One'},{id:'same',label:'Two'}]),
        window.electron.browser.confirm({message:42,detail:'',confirm:'Continue'}),
      ].map(request=>request.then(()=>false,()=>true)))`);
      assert(denied.every(Boolean),'Invalid native UI request was accepted');
      assert.equal(nativeContextMenu,undefined,'Invalid menu opened native UI');
      const baseline=main.webContents.listenerCount('did-start-navigation');
      await evaluate(main, `window.menuResult='pending';window.electron.browser.nativeMenu([{id:'choose',label:'Choose'}]).then(result=>{window.menuResult=result;});undefined`);await wait(100);
      assert.equal(main.webContents.listenerCount('did-start-navigation'),baseline+1);
      nativeContextMenu.items[0].click();nativeContextMenu.closePopup(main);await wait(100);
      assert.equal(await evaluate(main,'window.menuResult'),'choose');
      assert.equal(main.webContents.listenerCount('did-start-navigation'),baseline);
      await evaluate(main, `window.oldMenu='pending';window.electron.browser.nativeMenu([{id:'old',label:'Old'}]).then(result=>{window.oldMenu=result;});undefined`);await wait(100);
      await evaluate(main, `window.newMenu='pending';window.electron.browser.nativeMenu([{id:'new',label:'New'}]).then(result=>{window.newMenu=result;});undefined`);await wait(100);
      assert.equal(await evaluate(main,'window.oldMenu'),null,'Replaced menu did not cancel');
      nativeContextMenu.items[0].click();nativeContextMenu.closePopup(main);await wait(100);
      assert.equal(await evaluate(main,'window.newMenu'),'new');
      await evaluate(main, `window.electron.browser.nativeMenu([{id:'stale',label:'Stale'}]);undefined`);await wait(100);
      const closedBefore=nativeMenuClosedCount;
      main.reload();await wait(1200);
      assert(nativeMenuClosedCount>closedBefore,'Document reload did not close pending native menu');
      assert.equal(main.webContents.listenerCount('did-start-navigation'),baseline,'Menu navigation listener leaked after reload');
      console.log('PASS: real native UI rejects invalid payloads, returns valid selection, cancels replaced/reloaded menus and releases navigation listeners');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--download-history-boundaries-only')) {
      const downloads=require(path.join(runtimeDir,'downloads.js'));
      downloads.registerDownloadLibrary(()=>{},contents=>contents===main.webContents);
      const file=path.join(runtimeDir,'download-file.txt');
      const other=path.join(runtimeDir,'other-file.txt');
      fs.writeFileSync(file,'download');fs.writeFileSync(other,'other');
      const record={id:'download-boundary',name:'download-file.txt',path:file,mime:'text/plain',startedAt:1,receivedBytes:8,totalBytes:8,state:'completed'};
      const raw=JSON.stringify([record,{...record,path:other},{...record,id:'relative',path:'../outside'},null]);
      const historyFile=path.join(app.getPath('userData'),'download-history.json');
      fs.writeFileSync(historyFile,raw);
      const records=await evaluate(main, `window.electron.browser.downloads('get')`);
      assert.equal(records.length,1,'Malformed/duplicate native history was accepted');assert.equal(records[0].path,file);
      const recovery=fs.readdirSync(app.getPath('userData')).find(name=>name.startsWith('download-history.json.recovery-'));
      assert(recovery,'Native download recovery copy missing');
      assert.deepEqual(await evaluate(main, `window.electron.browser.downloadRecovery()`),{status:'recovered',canReveal:true});
      assert.equal(fs.readFileSync(path.join(app.getPath('userData'),recovery),'utf8'),raw);
      assert.equal(fs.readFileSync(historyFile,'utf8'),raw,'Reading history changed original input');
      const icon=await evaluate(main, `window.electron.browser.downloadThumbnail('download-boundary')`);
      assert(icon?.startsWith('data:image/'),'Regular file did not resolve native icon');
      fs.unlinkSync(file);fs.symlinkSync(other,file);
      const denied=await evaluate(main, `Promise.all([
        window.electron.browser.downloads('open-file','download-boundary'),
        window.electron.browser.downloads('reveal','download-boundary'),
        window.electron.browser.downloads('open-file',{}),
        window.electron.browser.downloadThumbnail({}),
      ].map(request=>request.then(()=>false,()=>true)))`);
      assert(denied.every(Boolean),'Replaced or malformed file request reached native file action');
      assert.equal(await evaluate(main, `window.electron.browser.downloadThumbnail('download-boundary')`),null,'Cached icon bypassed file-target validation');
      fs.unlinkSync(file);fs.mkdirSync(file);
      assert(await evaluate(main, `window.electron.browser.downloads('open-file','download-boundary').then(()=>false,()=>true)`),'Directory replacement was opened');
      const cleared=await evaluate(main, `window.electron.browser.downloads('clear')`);
      assert.equal(cleared.length,0);assert.equal(fs.readFileSync(other,'utf8'),'other','Clear deleted a file');
      assert.deepEqual(await evaluate(main, `window.electron.browser.downloadRecovery()`),{status:'none',canReveal:false});
      assert.equal(fs.readFileSync(path.join(app.getPath('userData'),recovery),'utf8'),raw,'Clearing removed recovery data');
      console.log('PASS: real native download history recovery/deduplication, malformed request rejection, regular-file icons, symlink/directory rejection and metadata-only clearing');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--shortcuts-only')) {
      const web = views[0].webContents;
      const key = (contents, keyCode, modifiers) => { contents.sendInputEvent({type:'keyDown', keyCode, modifiers}); contents.sendInputEvent({type:'keyUp', keyCode, modifiers}); };
      await web.loadURL(url + '/history-one'); await web.loadURL(url + '/history-two');
      key(web, '[', ['meta','shift']); await wait(300);
      assert(web.getURL().endsWith('/history-one'), 'Command+{ did not navigate the focused website back');
      key(web, ']', ['meta','shift']); await wait(300);
      assert(web.getURL().endsWith('/history-two'), 'Command+} did not navigate forward');
      const prefs = require(path.join(runtimeDir,'preferences.js'));
      const initial = prefs.getBrowserPreferences().shortcuts;
      prefs.updateBrowserPreferences({shortcuts:{...initial, back:['Alt+KeyB']}});
      key(web, '[', ['meta']); await wait(120);
      assert(web.getURL().endsWith('/history-two'), 'Old shortcut still ran after customization');
      key(web, 'B', ['alt']); await wait(300);
      assert(web.getURL().endsWith('/history-one'), 'Updated shortcut did not apply live');
      prefs.updateBrowserPreferences({shortcuts:initial});
      const settings = await create('settings', 1080, 800);
      await tab(settings, 'Keyboard shortcuts'); await wait(200);
      assert(await evaluate(settings, `!!document.querySelector('input[aria-label="Search keyboard shortcuts"]')`));
      await input(settings,'input[aria-label="Search keyboard shortcuts"]','Go back'); await wait(100);
      await evaluate(settings, `document.querySelector('button[aria-label="Change Go back shortcut"]').click();undefined`); await wait(200);
      key(settings.webContents, 'B', ['alt']); await wait(100);
      await evaluate(settings, `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent==='Save').click();undefined`); await wait(200);
      assert.deepEqual(prefs.getBrowserPreferences().shortcuts.back, ['Alt+KeyB']);
      await evaluate(settings, `document.querySelector('button[aria-label="Add Go back alternate shortcut"]').click();undefined`);await wait(100);
      key(settings.webContents, 'C', ['alt']);await wait(100);
      await evaluate(settings, `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent==='Save').click();undefined`);await wait(150);
      assert.deepEqual(prefs.getBrowserPreferences().shortcuts.back, ['Alt+KeyB','Alt+KeyC']);
      await evaluate(settings, `Array.from(document.querySelectorAll('button')).find(button=>button.getAttribute('aria-label')?.startsWith('Remove Go back shortcut')&&button.getAttribute('aria-label').includes('B')).click();undefined`);await wait(150);
      assert.deepEqual(prefs.getBrowserPreferences().shortcuts.back, ['Alt+KeyC']);

      settings.setSize(480,520); await wait(100);
      assert(await evaluate(settings, `document.documentElement.scrollWidth<=innerWidth+1`), 'Shortcut page overflows a narrow window');
      fs.writeFileSync(path.join(out,'keyboard-shortcuts.png'), (await settings.capturePage()).toPNG());
      console.log('PASS: real shifted-bracket navigation, live remapping, old binding disabled, capture/save in dedicated preference page and narrow layout');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--extension-toolbar-only')) {
      const prefs=require(path.join(runtimeDir,'preferences.js'));
      if(process.argv.includes('--header-address')) { prefs.updateBrowserPreferences({addressBarPlacement:'header'});await wait(200); }
      const manager=require(path.join(runtimeDir,'extensions.js'));
      const installed=[];
      for(const name of ['Toolbar First','Toolbar Second']) {
        const fixture=path.join(runtimeDir,name.replaceAll(' ','-'));fs.mkdirSync(fixture);
        fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name,version:'1.0',action:{default_title:name,default_popup:'popup.html'}}));
        fs.writeFileSync(path.join(fixture,'popup.html'),'<html><body style="width:240px;height:120px">'+name+'</body></html>');
        installed.push(await views[0].webContents.session.extensions.loadExtension(fixture));
      }
      await wait(500);
      const [first,second]=installed.map(extension=>extension.id);
      const toolbarHidden=async id=>evaluate(main,`document.querySelector('.extension-toolbar browser-action-list').shadowRoot.getElementById(${JSON.stringify(id)})?.hidden`);
      const openPicker=async()=>{await evaluate(main, `document.querySelector('button[aria-label=Extensions]').click();undefined`);await wait(200);};
      const manage=async()=>{nativeContextMenu=undefined;await evaluate(main,`Array.from(document.querySelectorAll('.extension-picker button')).find(button=>button.textContent==='Manage extensions…').click();undefined`);await wait(150);};
      await evaluate(main, "window.electron.browser.preferences('update',{showExtensionIcons:false})");await wait(150);
      assert(await evaluate(main, `!document.querySelector('.extension-toolbar browser-action-list')`));
      await openPicker();
      assert(await evaluate(main, `document.querySelector('.extension-picker browser-action-list').shadowRoot.querySelectorAll('.picker-row').length===2`));
      await manage();assert(nativeContextMenu.items.some(item=>item.label==='Chrome Web Store…'));nativeContextMenu.closePopup(main);
      const oldBindings=prefs.getBrowserPreferences().shortcuts;
      prefs.updateBrowserPreferences({showExtensionIcons:true,shortcuts:{...oldBindings,extensions:['Alt+KeyE']}});await wait(150);
      const live=views.find(view=>view.getVisible());
      live.webContents.sendInputEvent({type:'keyDown',keyCode:'E',modifiers:['alt']});live.webContents.sendInputEvent({type:'keyUp',keyCode:'E',modifiers:['alt']});await wait(200);
      assert(await evaluate(main, `!!document.querySelector('.extension-picker')`),'Custom shortcut did not open picker');
      await evaluate(main, `document.querySelector('.extension-picker browser-action-list').shadowRoot.querySelector('[aria-label="Unpin Toolbar First"]').click();undefined`);await wait(150);
      assert.deepEqual(prefs.getBrowserPreferences().extensionToolbarOrder,[second]);
      assert(await toolbarHidden(first),'Inline unpin did not update toolbar');
      await evaluate(main, `(()=>{const input=document.querySelector('input[aria-label="Search extensions"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Second');input.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`);await wait(100);
      assert(await evaluate(main, `document.querySelector('.extension-picker browser-action-list').shadowRoot.getElementById(${JSON.stringify(first)}).parentElement.hidden`),'Search did not hide nonmatching row');
      main.setSize(480,520);await wait(150);
      assert(await evaluate(main, `(()=>{const rect=document.querySelector('.extension-picker-popover').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1;})()`),'Picker overflows narrow window');
      assert(await evaluate(main, `(()=>{const label=document.querySelector('.extension-picker browser-action-list').shadowRoot.getElementById(${JSON.stringify(second)}).parentElement.querySelector('.picker-name');return label.scrollWidth<=label.clientWidth+1;})()`),'Short extension name was needlessly truncated');
      fs.writeFileSync(path.join(out,'extension-picker.png'),(await main.capturePage()).toPNG());
      let actionPopup;
      manager.getExtensionProfile('personal').api.once('browser-action-popup-created',popup=>{actionPopup=popup;});
      await evaluate(main, `document.querySelector('input[aria-label="Search extensions"]').focus();undefined`);
      main.focus();main.webContents.focus();
      main.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(100);
      assert(await evaluate(main, `document.querySelector('.extension-picker browser-action-list').shadowRoot.activeElement?.className==='picker-name'`),'Keyboard traversal did not reach matching extension');
      main.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
      for(let attempt=0;attempt<30&&!actionPopup;attempt++)await wait(100);
      assert(actionPopup,'Picker label did not activate actual extension popup');await actionPopup.whenReady();await wait(200);
      assert(actionPopup.browserWindow.isVisible(),'Extension popup invisible');
      assert.equal(actionPopup.browserWindow.webContents.session,views[0].webContents.session);
      assert(await evaluate(main, `!document.querySelector('.extension-picker')`),'Picker did not dismiss on activation');
      actionPopup.browserWindow.close();await wait(150);
      await openPicker();await manage();
      nativeContextMenu.items.find(item=>item.label==='Toolbar First').submenu.items.find(item=>item.label==='Pin to toolbar').click();nativeContextMenu.closePopup(main);await wait(200);
      assert.deepEqual(prefs.getBrowserPreferences().extensionToolbarOrder,[second,first]);
      await openPicker();await manage();
      nativeContextMenu.items.find(item=>item.label==='Toolbar First').submenu.items.find(item=>item.label==='Move icon earlier').click();nativeContextMenu.closePopup(main);await wait(200);
      assert.deepEqual(prefs.getBrowserPreferences().extensionToolbarOrder,[first,second]);
      assert.equal(await evaluate(main, `Array.from(document.querySelector('.extension-toolbar browser-action-list').shadowRoot.querySelectorAll('.action')).map(node=>node.id).join(',')`),[first,second].join(','));
      await openPicker();await manage();nativeContextMenu.items.find(item=>item.label==='Show all extension icons').click();nativeContextMenu.closePopup(main);await wait(150);
      assert.equal(prefs.getBrowserPreferences().extensionToolbarOrder,null);
      prefs.updateBrowserPreferences({shortcuts:oldBindings});
      console.log('PASS: actual local extensions in compact picker, search, inline pinning, real popup activation/profile, narrow layout, native management, persistent reorder/reset and toolbar focus order. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--storage-recovery-only')) {
      const original=JSON.stringify([{id:'recovered-tab',name:'Recovery',url:url+'/',sessionId:'recovery-account',spaceId:'work',folderId:'reading',icon:''},null]);
      await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(original)});localStorage.setItem('kudiumbrowser-spaces','{broken');localStorage.setItem('kudiumbrowser-active-space','work');localStorage.setItem('user_last_app_id','recovered-tab');undefined`);
      await main.reload();await wait(700);
      assert(await evaluate(main, `document.querySelector('.folder-heading')?.textContent.includes('Recovered folder')`), 'Missing folder did not recover visibly');
      assert(await evaluate(main, `(()=>{const row=document.querySelector('.tab-folder [data-tab-motion="sidebar-recovered-tab"] .sidebar-app');return !!row && row.getBoundingClientRect().height>0;})()`), 'Valid session not reachable inside recovered folder');
      assert.equal(await evaluate(main, "localStorage.getItem('user_apps.recovery')"), original, 'Original apps were not preserved');
      assert.equal(await evaluate(main, "localStorage.getItem('kudiumbrowser-spaces.recovery')"), '{broken', 'Original spaces were not preserved');
      assert(await evaluate(main, `Array.from(document.querySelectorAll('[role=status]')).some(item=>item.textContent.includes('saved layout data needed recovery'))`), 'Recovery notice missing');
      assert(await evaluate(main, `Array.from(document.querySelectorAll('button')).some(item=>item.textContent==='Copy recovery data')`), 'Recovery data control missing');
      assert.equal(await evaluate(main, "JSON.parse(localStorage.getItem('user_apps'))[0].sessionId"), 'recovery-account');
      fs.writeFileSync(path.join(out,'storage-recovery.png'),(await main.capturePage()).toPNG());
      console.log('PASS: corrupt layout starts safely, original data preserved, valid session/login retained, recovered spaces/folders reachable, visible recovery controls');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--folder-actions-only')) {
      const folderTabs=[{id:'folder-one',name:'First page',sessionName:'Reading',url:url+'/first',icon:'',spaceId:'default',folderId:'reading',sessionId:'reader',sessionProfileId:'shared-reader',pinned:true},{id:'folder-two',name:'Second page',url:url+'/second',icon:'',spaceId:'default',folderId:'reading',sessionId:'reader',sessionProfileId:'shared-reader',pinned:true}];
      const folderSpaces=[{id:'default',name:'Personal',color:'iris',folders:[{id:'reading',name:'Reading'}]},{id:'work',name:'Work',color:'blue',folders:[{id:'reading',name:'Existing folder'}]}];
      await evaluate(main,`localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(folderTabs))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify(folderSpaces))});localStorage.setItem('kudiumbrowser-active-space','default');undefined`);
      await main.reload();await wait(700);
      const openFolderMenu=async()=>{nativeContextMenu=undefined;await evaluate(main,`document.querySelector('.folder-heading').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(100);assert(nativeContextMenu,'Folder native menu missing');};
      await openFolderMenu();
      assert(nativeContextMenu.items.some(item=>item.label==='Copy all links as Markdown'));
      // Capture the renderer clipboard call without changing the user's clipboard.
      await evaluate(main,`window.folderCopiedText=undefined;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.folderCopiedText=text;}}});undefined`);
      nativeContextMenu.items.find(item=>item.label==='Copy all links').click();nativeContextMenu.closePopup(main);await wait(200);
      assert.equal(await evaluate(main,`window.folderCopiedText`),folderTabs.map(tab=>tab.url).join('\n'));
      assert(await evaluate(main,`document.querySelector('.tab-folder [role=status]')?.textContent==='Links copied'`));
      await openFolderMenu();
      nativeContextMenu.items.find(item=>item.label==='Copy all links as Markdown').click();nativeContextMenu.closePopup(main);await wait(150);
      const markdown=await evaluate(main,`window.folderCopiedText`);
      assert(markdown.includes(`](<${folderTabs[0].url}>)`)&&markdown.includes(`](<${folderTabs[1].url}>)`));
      await evaluate(main,`navigator.clipboard.writeText=async()=>{throw new Error('clipboard unavailable');};undefined`);
      await openFolderMenu();nativeContextMenu.items.find(item=>item.label==='Copy all links').click();nativeContextMenu.closePopup(main);await wait(150);
      assert(await evaluate(main,`document.querySelector('.tab-folder [role=status]')?.textContent.includes('Could not copy links')`));
      await openFolderMenu();
      nativeContextMenu.items.find(item=>item.label==='Move to space').submenu.items.find(item=>item.label==='Work').click();nativeContextMenu.closePopup(main);await wait(200);
      const moved=await evaluate(main,`JSON.parse(localStorage.getItem('user_apps'))`);
      assert(moved.every(tab=>tab.spaceId==='work'&&tab.folderId!=='reading'));
      assert.deepEqual(moved.map(tab=>[tab.id,tab.sessionId,tab.sessionProfileId]),folderTabs.map(tab=>[tab.id,tab.sessionId,tab.sessionProfileId]));
      const savedSpaces=await evaluate(main,`JSON.parse(localStorage.getItem('kudiumbrowser-spaces'))`);
      assert.equal(savedSpaces[0].folders.length,0);assert.equal(savedSpaces[1].folders.length,2);
      await evaluate(main,`localStorage.setItem('kudiumbrowser-active-space','work');undefined`);await main.reload();await wait(500);
      assert(await evaluate(main,`!!document.querySelector('.tab-folder [data-tab-motion="sidebar-folder-one"]')`),'Moved session missing in destination folder');
      fs.writeFileSync(path.join(out,'folder-actions.png'),(await main.capturePage()).toPNG());
      console.log('PASS: native folder copy/menu feedback and cross-space move preserve shared login identities and resolve folder ID collision');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--organization-only')) {
      const favoriteTabs = Array.from({length:25},(_,index)=>({id:`favorite-${index}`,name:`Favorite ${index}`,sessionName:`Favorite ${index}`,url:url+`/favorite-${index}`,icon:'',sessionId:`favorite-${index}`,spaceId:'default',favorite:true,pinned:true}));
      await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify([...tabs,...favoriteTabs]))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{id:'default',name:'Personal',color:'iris',folders:[{id:'reading',name:'Reading'}],selectedAppId:'personal-home'}]))});undefined`);
      await main.reload(); await wait(700);
      const metrics = await evaluate(main, `(()=>{const grid=document.querySelector('.favorites-grid');return {count:grid.querySelectorAll('.sidebar-app').length,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,scroll:grid.scrollHeight>grid.clientHeight};})()`);
      assert.equal(metrics.count,26); assert.equal(metrics.columns,4); assert(metrics.scroll, 'Large favorites collection is not scrollable');
      await evaluate(main, `document.querySelector('.favorites-grid .sidebar-app').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`); await wait(100);
      assert(await evaluate(main, `(()=>{const input=document.querySelector('[role="dialog"] input[aria-label="Favorite name"]');return !!input && input.getBoundingClientRect().width>30;})()`), 'Favorite rename dialog is hidden');
      await evaluate(main, `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent==='Cancel').click();undefined`); await wait(100);
      await evaluate(main, `document.querySelector('.favorites-grid .sidebar-app').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`); await wait(100);
      await input(main, 'input[aria-label="Favorite name"]', 'Reading favorites');
      await evaluate(main, `document.querySelector('.favorite-rename-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));undefined`);await wait(100);
      assert(await evaluate(main, `!!document.querySelector('.favorites-grid [aria-label="Reading favorites"]')`), 'Favorite rename did not update the accessible title');

      await evaluate(main, `(()=>{const source=document.querySelector('.favorites-grid button[aria-label="Favorite 1"]');const transfer=new DataTransfer();window.testFolderTransfer=transfer;source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));})()`); await wait(200);
      await evaluate(main, `document.querySelector('.folder-heading').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.testFolderTransfer}));undefined`); await wait(200);
      assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.id==='favorite-1').folderId==='reading'`), 'Dropping favorite did not move it into folder');
      assert(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.id==='favorite-1').sessionId==='favorite-1'`), 'Folder drop changed login partition');
      assert(await evaluate(main, `document.querySelector('.tab-folder .sidebar-app')!==null`), 'Moved session did not appear inside folder');
      await evaluate(main, `document.querySelector('.folder-heading').click();undefined`);await wait(100);
      assert(await evaluate(main, `document.querySelector('.folder-heading').getAttribute('aria-expanded')==='false' && !document.querySelector('.tab-folder .sidebar-app')`));
      await main.reload(); await wait(700);
      assert(await evaluate(main, `document.querySelector('.folder-heading').getAttribute('aria-expanded')==='false' && !document.querySelector('.tab-folder .sidebar-app')`), 'Folder collapse did not survive reload');
      await evaluate(main, `document.querySelector('.folder-heading').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));undefined`); await wait(100);
      assert(await evaluate(main, `document.querySelector('.folder-heading').getAttribute('aria-expanded')==='true'`), 'Right arrow did not expand folder');
      await evaluate(main, `document.querySelector('.folder-heading').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));undefined`);
      assert(await evaluate(main, `document.activeElement.matches('.tab-folder .sidebar-app')`), 'Right arrow did not enter expanded folder');
      await evaluate(main, `document.querySelector('.folder-heading').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));undefined`); await wait(100);
      assert(await evaluate(main, `document.querySelector('.folder-heading').getAttribute('aria-expanded')==='false'`), 'Left arrow did not collapse folder');
      main.setSize(480,520);await wait(150);
      assert(await evaluate(main, `document.querySelector('.favorites-grid').getBoundingClientRect().bottom<innerHeight && !!document.querySelector('input.location-label').closest('form')`));
      fs.writeFileSync(path.join(out,'favorites-and-folders.png'),(await main.capturePage()).toPNG());
      console.log('PASS: 26 favorites across four columns with scroll, responsive favorite rename dialog, folder drop preserves session, collapse persists after reload, keyboard expand/enter/collapse, narrow sidebar layout');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--webauthn-only')) {
      const web = views[0].webContents;
      await require('./webauthn-fixture.cjs')(web,url.replace('127.0.0.1','localhost'));
      assert.notEqual(web.session,views[2].webContents.session,'Login profiles must use separate sessions');
      const preferences=web.getLastWebPreferences();
      assert.equal(preferences.webSecurity,true);assert.equal(preferences.contextIsolation,true);
      assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.sandbox,true);
      console.log('PASS: virtual resident WebAuthn registration/discoverable authentication, external signature/challenge/origin/RP verification, tamper rejection, user verification and cancellation. System passkeys are not tested.');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--move-tab-session-only')) {
      await views[0].webContents.loadURL(url.replace('127.0.0.1','localhost')+'/cross-site');await wait(100);
      const drag=async(target)=>{
        await evaluate(main,`window.moveTransfer=new DataTransfer();document.getElementById('page-tab-personal-home').closest('.horizontal-tab').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.moveTransfer}));undefined`);await wait(100);
        await evaluate(main,`document.querySelector('.sidebar-app[aria-label="${target}"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.moveTransfer}));undefined`);await wait(500);
      };
      await drag('Facebook · Work');
      let stored=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(stored.find(item=>item.id==='personal-home').sessionId==='work');
      assert(stored.find(item=>item.id==='personal-messages').sessionId==='personal');
      const current=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).find(view=>view.getVisible());
      assert.equal(current.webContents.session,require('electron').session.fromPartition('persist:kudiumbrowser-work'));
      main.webContents.send('browser-tab-request',{action:'create',background:true,app:{id:'shared-target',name:'Shared group',sessionName:'Shared group',sessionId:'shared-group',sessionProfileId:'work',spaceId:'default',url:url+'/shared',icon:'',pinned:true}});await wait(150);
      await drag('Shared group');
      stored=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(stored.find(item=>item.id==='personal-home').sessionId==='shared-group');
      const moved=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).find(view=>view.getVisible());
      assert.equal(moved.webContents,current.webContents,'Shared-profile moves must keep the live view');
      await moved.webContents.executeJavaScript(`window.open('${url}/after-move','_blank');undefined`);await wait(200);
      assert((await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))")).some(item=>item.url===url+'/after-move' && item.sessionId==='shared-group' && item.sessionProfileId==='work'),'Links after moving must inherit the destination session');
      console.log('PASS: cross-site tab transfer preserves other tabs, adopts target cookies; shared-profile transfer keeps live view and new links inherit destination');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--shared-login-only')) {
      const { session }=require('electron');
      const target=session.fromPartition('persist:kudiumbrowser-work');
      await target.cookies.set({url,name:'shared-login-test',value:'work-account'});
      const before=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      await evaluate(main,`document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(100);
      nativeContextMenu.items.find(item=>item.label==='Edit Session').click();nativeContextMenu.closePopup(main);await wait(150);
      await evaluate(main,`document.querySelector('[aria-label="Session login"]').click();undefined`);await wait(100);
      await input(main,'[aria-label="Search session login"]','Facebook · Work');
      await evaluate(main,`document.querySelector('.session-picker-results button').click();undefined`);
      await evaluate(main,`document.querySelector('.session-editor button[type=submit]').click();undefined`);await wait(500);
      const after=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(after.filter(item=>item.sessionId==='personal').every(item=>item.sessionProfileId==='work'));
      assert.deepEqual(after.map(item=>[item.id,item.sessionId,item.name]),before.map(item=>[item.id,item.sessionId,item.name]));
      const current=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).find(view=>view.getVisible());
      assert.equal(current.webContents.session,target);
      assert((await current.webContents.session.cookies.get({url,name:'shared-login-test'})).some(cookie=>cookie.value==='work-account'));
      console.log('PASS: searchable login picker shares live cookie partition while preserving separate tab groups and metadata');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--group-close-only')) {
      const before = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps'))`);
      const personalViews = views.filter(view=>/\/(home|messages)$/.test(view.webContents.getURL()));
      const otherViews = views.filter(view=>!personalViews.includes(view));
      const personalContents = personalViews.map(view=>view.webContents);
      const personalSession = personalContents[0].session;
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);
      await wait(100);
      const menuClose = nativeContextMenu.items.find(item=>item.label==='Unload Group');
      assert(menuClose, 'Group menu must offer Unload Group');
      assert(await evaluate(main, `document.querySelector('.sidebar-app-row .sidebar-app-close').title==='Unload group'`));
      menuClose.click();nativeContextMenu.closePopup(main);
      await wait(400);
      assert(personalContents.every(contents=>contents.isDestroyed()), 'Group views must unload');
      assert((await evaluate(main, `JSON.parse(localStorage.getItem('user_apps'))`)).filter(tab=>tab.sessionId==='personal').every(tab=>tab.sessionChromeCollapsed===true),'Unloading collapses all folder tabs');
      assert(otherViews.every(view=>!view.webContents.isDestroyed()), 'Other groups must stay loaded');
      const after = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps'))`);
      assert.deepEqual(after.map(tab=>[tab.id,tab.sessionId,tab.url,tab.archived]),before.map(tab=>[tab.id,tab.sessionId,tab.url,tab.archived]));
      assert(await evaluate(main, `!!document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]')`), 'Closed group stays in sidebar');
      fs.writeFileSync(path.join(out,'group-closed.png'),(await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').click();undefined`);await wait(100);await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').closest('.sidebar-app-row').parentElement.querySelector('.sidebar-group-tab-select').click();undefined`);
      await wait(500);
      const awake = main.contentView.children.filter(view=>view instanceof WebContentsView&&/\/(home|messages)$/.test(view.webContents.getURL()));
      assert.equal(awake.length,1,'Reopening loads only the selected tab');
      assert.equal(awake[0].webContents.session,personalSession);
      assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`),2,'Both tabs remain saved');
      await evaluate(main, `document.getElementById('page-tab-personal-messages').click();undefined`);await wait(400);
      const loadedPersonal = main.contentView.children.filter(view=>view instanceof WebContentsView&&/\/(home|messages)$/.test(view.webContents.getURL()));
      assert.equal(loadedPersonal.length,2);
      const protectedContents = loadedPersonal[0].webContents;
      await protectedContents.executeJavaScript('window.testUnload=e=>{e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",window.testUnload);undefined');
      require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:0});
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').closest('.sidebar-app-row').querySelector('.sidebar-app-close').click();undefined`);await wait(500);
      assert(!protectedContents.isDestroyed(),'Cancelled unsaved changes must stay loaded');
      require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:1});
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').closest('.sidebar-app-row').querySelector('.sidebar-app-close').click();undefined`);await wait(1200);
      assert(protectedContents.isDestroyed(),'Group close button must unload too');
      for (const selector of ['.sidebar-app[aria-label="Facebook · Work"]', '.favorites-grid .sidebar-app']) {
        await evaluate(main, `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(100);
        nativeContextMenu.items.find(item=>item.label==='Unload Group').click();nativeContextMenu.closePopup(main);await wait(250);
      }
      assert(await evaluate(main, `!!document.querySelector('.browser-showcase, .browser-onboarding')`),'Closing last group must leave a resting browser');
      assert.equal(main.contentView.children.filter(view=>view instanceof WebContentsView&&view.webContents.session!==main.webContents.session).length,0,'All closed groups must stay unloaded');
      assert.equal(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).filter(tab=>!tab.archived).length`),4);
      fs.writeFileSync(path.join(out,'all-groups-closed.png'),(await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').click();undefined`);await wait(100);await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').closest('.sidebar-app-row').parentElement.querySelector('.sidebar-group-tab-select').click();undefined`);await wait(400);
      for (const appearance of ['light','dark']) {
        await evaluate(main, `localStorage.setItem('kudiumbrowser-appearance',${JSON.stringify(appearance)});undefined`);
        main.reload();await wait(1000);
        for (const width of [1080,480]) {
          main.setSize(width,720);await wait(200);
          await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(100);
          assert(nativeContextMenu.items.some(item=>item.label==='Unload Group'));
          fs.writeFileSync(path.join(out,`group-menu-${appearance}-${width}.png`),(await main.capturePage()).toPNG());
          nativeContextMenu.closePopup(main);
        }
      }
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Work"]').click();document.querySelector('.sidebar-app[aria-label="Facebook · Work"]').closest('.sidebar-app-row').parentElement.querySelector('.sidebar-group-tab-select').click();undefined`);await wait(300);
      const keptViews=main.contentView.children.filter(view=>view instanceof WebContentsView&&/\/(home|messages)$/.test(view.webContents.getURL()));
      const discardedOthers=main.contentView.children.filter(view=>view instanceof WebContentsView&&view.webContents.session!==main.webContents.session&&!keptViews.includes(view));
      await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(100);
      const discardedContents=discardedOthers.map(view=>view.webContents);
      const unloadOthers=nativeContextMenu.items.find(item=>item.label==='Unload other groups');assert(unloadOthers,'Group menu must offer Unload other groups');
      unloadOthers.click();nativeContextMenu.closePopup(main);await wait(700);
      assert(discardedContents.every(contents=>contents.isDestroyed()),'Other groups unload');
      assert(keptViews.every(view=>!view.webContents.isDestroyed()),'Clicked group remains loaded');
      assert((await evaluate(main, `JSON.parse(localStorage.getItem('user_apps'))`)).filter(tab=>tab.sessionId!=='personal').every(tab=>tab.sessionChromeCollapsed===true),'Other folders collapse');
      await evaluate(main, `document.querySelector('.space-title-menu').click();undefined`);await wait(100);
      const unloadSpace=nativeContextMenu.items.find(item=>item.label==='Unload all groups in this space');assert(unloadSpace,'Space menu offers unload all');
      unloadSpace.click();nativeContextMenu.closePopup(main);await wait(600);
      assert(main.contentView.children.filter(view=>view instanceof WebContentsView&&view.webContents.session!==main.webContents.session).length===0,'Space groups unload');
      console.log('PASS: group menu and button unload views, preserve metadata and cookies, restore tabs lazily, protect cancelled unsaved changes, keep other groups resident');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--group-home-only')) {
      const groupHomeURL = url + '/group-dashboard';
      const openSettings = async () => {
        await evaluate(main, `document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);
        await wait(100);
        nativeContextMenu.items.find(item=>item.label==='Group Settings…').click();
        nativeContextMenu.closePopup(main);
        await wait(100);
        await evaluate(main, `document.querySelector('.group-editor-advanced').open=true;undefined`);
      };
      const saveHome = async home => {
        await openSettings();
        await input(main, '[aria-label="Group home page"]', home);
        await evaluate(main, `document.querySelector('.group-editor button[type="submit"]').click();undefined`);
        await wait(250);
      };
      await saveHome(url + '/messages');
      assert.equal(await evaluate(main, `document.querySelector('.horizontal-tabs [role="tab"]').id`), 'page-tab-personal-messages');
      assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 2);
      await saveHome(groupHomeURL);
      const stored = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps'))`);
      const home = stored.find(tab=>tab.sessionId==='personal'&&tab.url===groupHomeURL);
      assert(home, 'Save must register the home tab');
      assert.equal(await evaluate(main, `document.querySelector('.horizontal-tabs [role="tab"]').id`), 'page-tab-' + home.id);
      assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 3);
      await saveHome(groupHomeURL);
      assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 3, 'Saving again must reuse home');
      await evaluate(main, `document.getElementById(${JSON.stringify('page-tab-' + home.id)}).click();undefined`);
      await wait(250);
      const visible = main.contentView.children.filter(view=>view instanceof WebContentsView && view.webContents.session!==main.webContents.session).find(view=>view.getVisible());
      assert.equal(visible.webContents.getURL(), groupHomeURL);
      for (const appearance of ['light','dark']) {
        await evaluate(main, `localStorage.setItem('kudiumbrowser-appearance',${JSON.stringify(appearance)});undefined`);
        main.reload();await wait(1200);
        for (const width of [1080,480]) {
          main.setSize(width,720); await wait(250);
          assert.equal(await evaluate(main, `document.querySelector('.horizontal-tabs [role="tab"]').id`), 'page-tab-' + home.id);
          fs.writeFileSync(path.join(out,`home-first-${appearance}-${width}.png`),(await main.capturePage()).toPNG());
        }
      }
      await saveHome('');
      assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 3, 'Clearing must preserve open pages');
      console.log('PASS: home registration, first horizontal position, reuse, same-group navigation, clearing, light/dark and narrow layouts');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--session-editor-only')) {
      const windowCount=BrowserWindow.getAllWindows().length;
      const before=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      await evaluate(main,`document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);await wait(150);
      nativeContextMenu.items.find(item=>item.label==='Edit Session').click();nativeContextMenu.closePopup(main);await wait(150);
      assert(await evaluate(main,"!!document.querySelector('.session-settings-dialog')"));assert.equal(BrowserWindow.getAllWindows().length,windowCount,'Session editing must be in-app');
      await input(main,'[aria-label="Session name"]','Research');
      await evaluate(main,`document.querySelector('[aria-label="Use 🧪 for session"]').click();undefined`);
      main.setSize(480,700);await wait(150);
      assert(await evaluate(main,"document.querySelector('.session-editor').scrollWidth<=document.querySelector('.session-editor').clientWidth+1"));
      fs.writeFileSync(path.join(out,'session-editor-narrow.png'),(await main.capturePage()).toPNG());
      await evaluate(main,"document.querySelector('.session-editor button[type=submit]').click();undefined");await wait(200);
      const after=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(after.filter(item=>item.sessionId==='personal').every(item=>item.sessionName==='Research' && item.sessionIconEmoji==='🧪'));
      assert.deepEqual(after.map(item=>[item.id,item.name,item.icon,item.url,item.sessionId]),before.map(item=>[item.id,item.name,item.icon,item.url,item.sessionId]));
      assert(await evaluate(main,"document.querySelector('.sidebar-app[aria-label=Research] .session-symbol').textContent==='🧪'"));
      console.log('PASS: in-app responsive session editor, shared rename/emoji, unchanged tab metadata and login partitions');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--address-session-only')) {
      const before=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      const web=views[0].webContents;const profile=web.session;
      const destination=url.replace('127.0.0.1','localhost')+'/different-site';
      await input(main,'[aria-label="Website address"]',destination);
      await evaluate(main,"document.querySelector('input.location-label').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));undefined");await wait(400);
      const after=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert.equal(after.length,before.length,'Address navigation must not create a session or tab');
      assert.equal(web.session,profile);assert.equal(web.getURL(),destination);
      assert(await evaluate(main,"document.getElementById('page-tab-personal-home').getAttribute('aria-selected')==='true'"));
      web.goBack();await wait(300);assert(web.getURL().endsWith('/home'),'Back must return to original site');
      console.log('PASS: cross-site address navigation stays in current tab/session and preserves back history');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--compact-tab-preview-only')) {
      const prefs=require(path.join(runtimeDir,'preferences.js'));
      prefs.updateBrowserPreferences({tabDisplayMode:'hover',folderHoverPreviews:true,addressBarPlacement:'header'});
      const bulk=Array.from({length:2000},(_,i)=>({id:'bulk-'+i,name:'Page '+i,url:url+'/page/'+i,icon:'',sessionId:'bulk',sessionName:'Bulk session',spaceId:'default',pinned:true}));
      const data=[...bulk,{id:'single',name:'Only page',sessionName:'Single session',url:url+'/single',icon:'',sessionId:'single',spaceId:'default',pinned:true},...['a','b'].map(id=>({id:'folder-'+id,name:'Folder page '+id,sessionName:'Folder app',url:url+'/folder/'+id,icon:'',sessionId:'folder-app',spaceId:'default',folderId:'preview-folder',pinned:true}))];
      await evaluate(main,`localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(data))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{id:'default',name:'Personal',color:'iris',folders:[{id:'preview-folder',name:'Preview folder'}],selectedAppId:'bulk-0'}]))});localStorage.setItem('kudiumbrowser-collapsed-folders','["preview-folder"]');localStorage.setItem('user_last_app_id','bulk-0');undefined`);
      main.reload();await wait(1400);
      for(let attempt=0;attempt<40;attempt++) {
        if(await evaluate(main,`!document.querySelector('.horizontal-tabs') && !document.querySelector('.browser-chrome') && !!document.querySelector('.sidebar-app[aria-label="Bulk session"]')`)) break;
        await wait(100);
      }
      assert(await evaluate(main,`!document.querySelector('.horizontal-tabs') && !document.querySelector('.browser-chrome')`),'Compact header must remove tab row');
      assert(await evaluate(main,`document.querySelector('#folder-content-preview-folder').querySelectorAll('.sidebar-app').length===0`),'Closed folder must not mount its sessions');
      const awaitPreview=async()=>{for(let attempt=0;attempt<20;attempt++){if(await evaluate(main,`!!document.querySelector('.anchored-tab-preview')`)) return;await wait(50);}throw new Error('Preview did not open');};
      main.focus();main.webContents.focus();
      const hover=async selector=>{
        const point=await evaluate(main,`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
        main.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});
        main.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
      };
      await hover('.sidebar-app[aria-label="Bulk session"]');await wait(80);assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview')`),'Hover preview opened before dwell');await wait(200);await awaitPreview();
      assert(await evaluate(main,`!!document.querySelector('.anchored-tab-preview')`));
      assert(await evaluate(main,`document.querySelectorAll('.tab-preview-row').length<=13`),'Large tab list must render a bounded window');
      assert(await evaluate(main,`(()=>{const popup=document.querySelector('.anchored-tab-preview').getBoundingClientRect(),anchor=document.querySelector('.sidebar-app[aria-label="Bulk session"]').getBoundingClientRect();return popup.left>=anchor.right && Math.abs(popup.top-anchor.top)<3;})()`),'Preview must anchor to vertical app');
      await evaluate(main,`const p=document.querySelector('.anchored-tab-preview');document.querySelector('.sidebar-app[aria-label="Bulk session"]').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:p}));p.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));undefined`);await wait(300);assert(await evaluate(main,`!!document.querySelector('.anchored-tab-preview')`),'Crossing popup gap must not dismiss');
      fs.writeFileSync(path.join(out,'compact-session-preview.png'),(await main.capturePage()).toPNG());
      await input(main,'input[aria-label="Search preview"]','Page 1999');await wait(100);
      assert(await evaluate(main,`document.querySelectorAll('.tab-preview-row').length===1`));
      await evaluate(main,`document.querySelector('input[aria-label="Search preview"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);await wait(200);
      assert(await evaluate(main,`JSON.parse(localStorage.getItem('kudiumbrowser-spaces'))[0].selectedAppId==='bulk-1999'`));
      assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview')`));
      await hover('.sidebar-app[aria-label="Single session"]');await wait(300);assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview')`),'Single page must not create redundant popup');
      prefs.updateBrowserPreferences({tabDisplayMode:'click'});await wait(150);
      await hover('.sidebar-app[aria-label="Bulk session"]');await wait(300);assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview')`),'Click mode must ignore hover');
      await evaluate(main,`document.querySelector('.sidebar-app[aria-label="Bulk session"]').click();undefined`);await wait(200);await awaitPreview();assert(await evaluate(main,`!!document.querySelector('.anchored-tab-preview')`));
      const togglePoint=await evaluate(main,`(()=>{const r=document.querySelector('.sidebar-app[aria-label="Bulk session"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
      main.webContents.sendInputEvent({type:'mouseDown',...togglePoint,button:'left',clickCount:1});main.webContents.sendInputEvent({type:'mouseUp',...togglePoint,button:'left',clickCount:1});await wait(150);assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview')`),'Second native click must toggle popup off');
      await hover('.folder-heading');await wait(300);await awaitPreview();assert(await evaluate(main,`document.querySelector('.anchored-tab-preview').textContent.includes('Folder app')`));
      fs.writeFileSync(path.join(out,'compact-folder-preview.png'),(await main.capturePage()).toPNG());
      await evaluate(main,`document.querySelector('.tab-preview-row button[aria-label="Folder app"]').click();undefined`);await wait(200);
      assert(await evaluate(main,`!!document.querySelector('[aria-label="Back to folder"]') && document.querySelectorAll('.tab-preview-row').length===2`),'Closed-folder app must drill into its pages at same anchor');
      await evaluate(main,`document.querySelector('[aria-label="Back to folder"]').click();undefined`);await wait(100);
      await evaluate(main,`document.querySelector('.folder-heading').click();undefined`);await wait(150);assert(await evaluate(main,`!document.querySelector('.anchored-tab-preview') && !!document.querySelector('#folder-content-preview-folder .sidebar-app')`),'Click must expand folder normally');
      for(const width of [800,480]) {
        main.setSize(width,700);await wait(200);
        await evaluate(main,`(()=>{const anchor=document.querySelector('.sidebar-app[aria-label="Bulk session"]');anchor.focus();anchor.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));})()`);await wait(200);await awaitPreview();
        fs.writeFileSync(path.join(out,'compact-preview-'+width+'.png'),(await main.capturePage()).toPNG());
        assert(await evaluate(main,`(()=>{const r=document.querySelector('.anchored-tab-preview').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()`),'Popup must fit narrow window: '+JSON.stringify(await evaluate(main,`(()=>{const r=document.querySelector('.anchored-tab-preview').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()`)));
        fs.writeFileSync(path.join(out,'compact-preview-'+width+'.png'),(await main.capturePage()).toPNG());
        await evaluate(main,`document.querySelector('input[aria-label="Search preview"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);await wait(100);
      }
      assert(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).length<6,'Previewing many tabs must not load all websites');
      console.log('PASS: 2000-page compact session, delayed hover/gap retention, bounded rows/search, single-page suppression, click toggle, closed-folder drill-down, keyboard access and 800/480 collision handling. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--address-bar-layout-only')) {
      const prefs=require(path.join(runtimeDir,'preferences.js'));
      const fullUrl=url+'/developers?filter=full-url#details';
      await views[0].webContents.loadURL(fullUrl);await wait(200);
      for(const placement of ['sidebar','header']) {
        prefs.updateBrowserPreferences({addressBarPlacement:placement,addressBarExtensionsExpanded:true});await wait(200);
        for(const width of [1160,800,480]) {
          main.setSize(width,700);await wait(200);
          const layout=await evaluate(main,`(()=>{const bar=document.querySelector('.address-bar'),form=bar.querySelector('form'),panel=bar.querySelector('.address-bar-extensions'),input=bar.querySelector('input');const r=el=>{const rect=el.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width};};return {bar:r(bar),form:r(form),panel:r(panel),input:r(input),value:input.value,placement:bar.dataset.placement,header:!!bar.closest('.browser-address-header'),tabsTop:document.querySelector('.browser-chrome').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
          assert.equal(layout.placement,placement);assert(!layout.overflow,'Address layout overflows at '+width);assert(layout.input.width>=48,'Address field lost usable space');
          assert(layout.panel.right<=layout.bar.right+1,'Extensions overflow address container');
          if(placement==='sidebar') { assert(!layout.header);assert(layout.panel.top>=layout.form.bottom-1,'Sidebar extensions must be below URL'); }
          else { assert(await evaluate(main,`!!document.querySelector('.address-bar-tools [aria-label="Browser Preferences"]') && !!document.querySelector('.address-bar-tools [aria-label="Toggle AI sidebar"]') && !document.querySelector('.browser-chrome .browser-actions') && document.querySelector('.browser-chrome').getBoundingClientRect().height===40`),'Header tools must leave a full-width single tab row');assert(layout.header);assert.equal(layout.value,fullUrl,'Header must show full URL while unfocused');assert(layout.panel.left>=layout.form.right-1,'Header extensions must share URL row');assert(layout.bar.bottom<=layout.tabsTop+1,'Header address must sit above tabs'); }
          fs.writeFileSync(path.join(out,'address-'+placement+'-'+width+'.png'),(await main.capturePage()).toPNG());
        }
        await evaluate(main,`document.querySelector('[aria-label="Toggle address bar extensions"]').click();undefined`);await wait(200);
        assert.equal(prefs.getBrowserPreferences().addressBarExtensionsExpanded,false);
        assert(await evaluate(main,"document.querySelector('.address-bar-extensions').hidden && !document.querySelector('.extension-toolbar')"),'Collapsed group must remove extension actions');
        if(placement==='header') {
          assert(await evaluate(main,`[...document.querySelectorAll('.address-bar-tools button')].every(button=>button.getBoundingClientRect().width===28)`),'Settings and AI must remain visible when extensions collapse');
          await evaluate(main,`document.querySelector('.address-bar-tools [aria-label="Toggle AI sidebar"]').click();undefined`);await wait(200);
          assert(await evaluate(main,`document.querySelector('[aria-label="Toggle AI sidebar"]').getAttribute('aria-expanded')==='true'`),'Header AI toggle must open sidebar');
          await evaluate(main,`document.querySelector('.address-bar-tools [aria-label="Toggle AI sidebar"]').click();undefined`);await wait(100);
        }
        main.reload();await wait(1200);
        assert(await evaluate(main,"document.querySelector('.address-bar-extensions').hidden"),'Collapse preference must survive reload');
        await evaluate(main,`document.querySelector('[aria-label="Toggle address bar extensions"]').click();undefined`);await wait(150);
        assert(await evaluate(main,`!!document.querySelector('.extension-toolbar [aria-label="Extensions"]')`),'Expanded group must restore picker');
      }
      main.setSize(1160,700);await evaluate(main,"localStorage.setItem('kudiumbrowser-appearance','dark');undefined");main.reload();await wait(1200);
      fs.writeFileSync(path.join(out,'address-header-dark.png'),(await main.capturePage()).toPNG());
      const settings=await create('settings',1080,800);
      await tab(settings,'Appearance');await wait(150);
      assert(await evaluate(settings,`!!document.querySelector('[aria-label="Address bar position"]') && !!document.querySelector('[aria-label="Expand address bar extensions"]')`),'Address customization controls missing');
      await evaluate(settings,`document.querySelector('[aria-label="Address bar position"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);await wait(100);
      await evaluate(settings,`[...document.querySelectorAll('[role="option"]')].find(option=>option.textContent==='Sidebar').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);await wait(200);
      assert.equal(prefs.getBrowserPreferences().addressBarPlacement,'sidebar');
      assert(await evaluate(main,`document.querySelector('.address-bar').dataset.placement==='sidebar'`),'Preference must move live address container');
      await evaluate(settings,`document.querySelector('[aria-label="Expand address bar extensions"]').click();undefined`);await wait(150);
      assert(await evaluate(main,"document.querySelector('.address-bar-extensions').hidden"),'Preference must collapse live extension group');
      fs.writeFileSync(path.join(out,'address-preferences.png'),(await settings.capturePage()).toPNG());
      console.log('PASS: sidebar/header address layouts, unfocused full URL, extension row placement, 1160/800/480 widths, collapse persistence, re-expansion and live Preferences controls. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--horizontal-tabs-layout-only')) {
      const measure = () => evaluate(main, `(()=>{const strip=document.querySelector('.session-tab-strip'),list=strip.querySelector('.horizontal-tabs'),add=strip.querySelector('.horizontal-tab-add'),tools=document.querySelector('.browser-actions');const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};return {strip:rect(strip),list:rect(list),add:rect(add),tools:rect(tools),tabs:[...list.querySelectorAll('.horizontal-tab')].map(rect),scrolls:list.scrollWidth>list.clientWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
      main.setSize(1280,700);await wait(200);
      let layout=await measure();
      assert(layout.add.left-layout.list.right<=8,'New tab button must follow tabs without empty stretch');
      assert(layout.tabs.every(tab=>tab.width<=201),'Tabs must retain a compact maximum width');
      fs.writeFileSync(path.join(out,'horizontal-tabs-few.png'),(await main.capturePage()).toPNG());
      for(let index=0;index<7;index++) main.webContents.send('browser-tab-request',{action:'create',background:true,app:{id:'layout-'+index,name:'Hocasa: Apartment in '+['Toronto','Ottawa','Montreal','Vancouver','Calgary','Victoria','Halifax'][index],url:url+'/homes/'+index,icon:'',sessionId:'personal',spaceId:'default',pinned:false}});
      await wait(250);
      for(const width of [1280,900,600,480]) {
        main.setSize(width,700);await wait(200);layout=await measure();
        assert(!layout.overflow,'Window must not overflow at '+width);
        if(width>640) assert(layout.add.right<=layout.tools.left+1,'Tabs must not overlap browser tools at '+width);
        assert(layout.list.right<=layout.add.left+1,'New tab button must stay outside scroll area');
        assert(layout.tabs.every(tab=>tab.width>=119 && tab.width<=201),'Tabs must shrink within readable limits');
        fs.writeFileSync(path.join(out,'horizontal-tabs-'+width+'.png'),(await main.capturePage()).toPNG());
      }
      main.setSize(1280,700);await wait(200);
      const controls=await evaluate(main,`[...document.querySelectorAll('.browser-chrome .chrome-icon-button')].map(button=>{const rect=button.getBoundingClientRect(),style=getComputedStyle(button),icon=button.querySelector('svg');return {width:rect.width,height:rect.height,top:rect.top,radius:style.borderRadius,color:style.color,background:style.backgroundColor,iconWidth:icon.getAttribute('width'),stroke:icon.getAttribute('stroke-width')};})`);
      assert(controls.length>=3,'Chrome controls must use the shared component');
      assert(controls.every(control=>JSON.stringify(control)===JSON.stringify(controls[0])),'Chrome controls must share size, alignment, material and icon weight: '+JSON.stringify(controls));
      main.setSize(480,700);await wait(200);
      assert(layout.scrolls,'Crowded narrow strip must scroll');
      await evaluate(main,"document.getElementById('page-tab-layout-6').click();undefined");await wait(200);
      assert(await evaluate(main,`(()=>{const tab=document.getElementById('page-tab-layout-6').getBoundingClientRect(),list=document.querySelector('.horizontal-tabs').getBoundingClientRect();return tab.left>=list.left-1 && tab.right<=list.right+1;})()`),'Selected overflow tab must scroll into view');
      await evaluate(main,"document.getElementById('page-tab-layout-6').focus();document.getElementById('page-tab-layout-6').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));undefined");await wait(150);
      assert(await evaluate(main,"document.getElementById('page-tab-layout-5').getAttribute('aria-selected')==='true'"),'Arrow keys must select neighboring tab');
      main.setSize(1280,700);await evaluate(main,"localStorage.setItem('kudiumbrowser-appearance','dark');undefined");main.reload();await wait(1200);
      fs.writeFileSync(path.join(out,'horizontal-tabs-dark.png'),(await main.capturePage()).toPNG());
      console.log('PASS: compact tabs, adjacent new-tab action, separate tools, 1280/900/600/480 layouts, overflow selection and keyboard navigation. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--smart-tab-labels-only')) {
      for(const [id,city] of [['smart-a','Toronto'],['smart-b','Ottawa']]) main.webContents.send('browser-tab-request',{action:'create',background:true,app:{id,name:'Hocasa: Apartment in '+city,url:url+'/homes/'+city.toLowerCase(),icon:'',sessionId:'personal',spaceId:'default',pinned:false}});
      await wait(200);
      assert(await evaluate(main,"document.querySelector('#page-tab-smart-a > span:last-child').textContent==='Toronto' && document.querySelector('#page-tab-smart-b > span:last-child').textContent==='Ottawa'"));
      assert(await evaluate(main,"document.getElementById('page-tab-smart-a').title==='Hocasa: Apartment in Toronto'"),'Hover must retain full title');
      const preferences=require(path.join(runtimeDir,'preferences.js'));
      preferences.updateBrowserPreferences({smartTabLabels:false});await wait(150);
      assert(await evaluate(main,"document.querySelector('#page-tab-smart-a > span:last-child').textContent==='Hocasa: Apartment in Toronto'"),'Preference must restore full titles');
      preferences.updateBrowserPreferences({smartTabLabels:true});await wait(150);
      assert(await evaluate(main,"document.querySelector('#page-tab-smart-a > span:last-child').textContent==='Toronto'"));
      console.log('PASS: distinguishing horizontal labels, full-title tooltip, and live preference off/on');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--crowded-sidebar-only')) {
      for(let index=0;index<18;index++) main.webContents.send('browser-tab-request',{action:'create',background:true,app:{id:'crowded-'+index,name:'Crowded '+index,sessionName:'Crowded '+index,url:url+'/crowded-'+index,icon:'',sessionId:'crowded-'+index,spaceId:'default',pinned:index<9}});
      await wait(300); main.setSize(800,550); await wait(200);
      const layout=await evaluate(main,`(()=>{const list=document.querySelector('.sidebar-apps');const sections=Array.from(list.querySelectorAll('.sidebar-section'));return {scrolls:list.scrollHeight>list.clientHeight,sections:sections.map(section=>{const rows=Array.from(section.querySelectorAll('.sidebar-app-row'));return {height:section.getBoundingClientRect().height,total:rows.reduce((sum,row)=>sum+row.getBoundingClientRect().height,0),overlap:rows.some((row,index)=>index>0 && row.getBoundingClientRect().top<rows[index-1].getBoundingClientRect().bottom-1)};}),tools:document.querySelector('.session-list-tools').getBoundingClientRect().top,pinnedBottom:sections[0].getBoundingClientRect().bottom};})()`);
      assert(layout.scrolls,'Crowded list must scroll');assert(layout.sections.every(section=>section.height>=section.total && !section.overlap),'Section must retain full row heights');assert(layout.tools>=layout.pinnedBottom,'Tabs must not overlap divider controls');
      fs.writeFileSync(path.join(out,'crowded-sidebar.png'),(await main.capturePage()).toPNG());
      assert(await evaluate(main,"Array.from(document.querySelectorAll('[data-tab-motion]')).every(element=>element.getAnimations().filter(animation=>animation.effect.getKeyframes().some(frame=>frame.transform)).length===0)"),'Ordinary tab updates must not trigger reorder motion');
      console.log('PASS: crowded pinned/regular sections scroll without compression, overlapping rows or controls, and no reorder motion on ordinary updates. Screenshot: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--sidebar-sections-only')) {
      const original=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      for (const section of ['Favorite sessions','Regular sessions','Pinned sessions','Favorite sessions','Pinned sessions']) {
        const beforeDrag=await evaluate(main,"document.querySelector('.space-heading').getBoundingClientRect().top");
        await evaluate(main, `window.sectionTransfer=new DataTransfer();document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.sectionTransfer}));undefined`); await wait(150);
        assert.equal(await evaluate(main,"document.querySelector('.space-heading').getBoundingClientRect().top"),beforeDrag,'Drag hints must not shift the sidebar');
        assert(await evaluate(main,"!!document.querySelector('.tab-drag-preview')"),'Compact drag preview missing');
        await evaluate(main, `document.querySelector('[aria-label="${section}"]').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.sectionTransfer}));undefined`); await wait(100);
        await evaluate(main, `document.querySelector('[aria-label="${section}"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.sectionTransfer}));undefined`); await wait(200);
        const items=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
        assert(items.filter(item=>item.sessionId==='personal').every(item=>item.favorite===(section==='Favorite sessions') && item.pinned===(section!=='Regular sessions')));
        assert.deepEqual(items.map(item=>[item.id,item.sessionId,item.url]),original.map(item=>[item.id,item.sessionId,item.url]));
        assert(await evaluate(main,"!document.querySelector('[role=dialog]')"),'Placement must not prompt for login transfer');
      }
      assert(await evaluate(main,"!document.querySelector('.tab-drag-preview')"),'Drag preview must be cleaned up');
      console.log('PASS: bidirectional drops between favorites, pinned and regular sections, preserving tabs and login partitions');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--sidebar-close-only')) {
      main.focus(); main.webContents.focus();
      const before=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(await evaluate(main,"!document.querySelector('.favorites-grid .sidebar-app-close')"));
      await evaluate(main,"document.querySelector('.sidebar-app-row .sidebar-app').focus();undefined"); await wait(150);
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.sidebar-app-close')).opacity==='1'"),'Keyboard focus must reveal close');
      const point=await evaluate(main,"(()=>{const r=document.querySelector('.sidebar-app-row').getBoundingClientRect();return {x:Math.round(r.x+15),y:Math.round(r.y+15)}})()");
      await evaluate(main,"document.activeElement.blur();undefined");
      main.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y}); await wait(150);
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.sidebar-app-close')).opacity==='1'"),'Hover must reveal close');
      await evaluate(main,"document.querySelector('.sidebar-app-close').click();undefined"); await wait(300);
      const after=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert.equal(after.length,before.length,'Closing must preserve restorable metadata');
      assert(after.filter(item=>item.sessionId==='personal').every(item=>item.archived),'Close row must archive session tabs');
      assert(after.filter(item=>item.sessionId!=='personal').every(item=>!item.archived),'Other sessions must stay open');
      assert(await evaluate(main,"!Array.from(document.querySelectorAll('.sidebar-apps .sidebar-app')).some(item=>item.textContent.includes('Facebook · Personal'))"));
      console.log('PASS: hover and keyboard focus reveal sidebar close; session closes without deleting metadata or affecting other sessions');
      Object.values(windows).forEach(win=>win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--panel-menus-only')) {
      const live=views.find(view=>view.getVisible());
      await evaluate(main,"document.querySelector('.workspace-sidebar').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined");await wait(150);
      for(const label of ['Change Space Icon…','New Tab…','New Folder','Sort Sessions by Name','Archive Unpinned Sessions','Manage Spaces…']) assert(nativeContextMenu.items.some(item=>item.label===label));
      assert(live.getVisible()); nativeContextMenu.closePopup(main);await wait(100);
      await evaluate(main,"document.querySelector('.horizontal-tabs').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined");await wait(150);
      for(const label of ['New Tab in This Session…','Reload Tab','Duplicate Tab','Close Other Tabs','Close Tab']) assert(nativeContextMenu.items.some(item=>item.label===label));
      assert(live.getVisible());
      nativeContextMenu.items.find(item=>item.label==='Close Other Tabs').click();nativeContextMenu.closePopup(main);await wait(200);
      const tabs=await evaluate(main,"JSON.parse(localStorage.getItem('user_apps'))");
      assert(tabs.find(item=>item.id==='personal-messages').archived);
      assert(!tabs.find(item=>item.id==='personal-home').archived);
      assert(!tabs.find(item=>item.id==='work-home').archived);
      console.log('PASS: sidebar and empty horizontal strip show contextual native actions; close other tabs preserves current tab and other sessions; website remains live');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--space-title-only')) {
      assert(await evaluate(main,"!!document.querySelector('.space-title-toggle .space-symbol')"));
      assert(await evaluate(main,"(()=>{const title=document.querySelector('.space-title-toggle .space-symbol').getBoundingClientRect();const tab=document.querySelector('.sidebar-apps .app-icon').getBoundingClientRect();return Math.abs((title.left+title.width/2)-(tab.left+tab.width/2))<2;})()"),'Space icon should align with sidebar tab icons');
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.space-title-icon > svg:last-child')).opacity==='0'"),'Expanded space chevron should be hidden at rest');
      const titleBounds = await evaluate(main,"(()=>{const r=document.querySelector('.space-title-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
      main.webContents.sendInputEvent({type:'mouseMove',x:Math.round(titleBounds.x),y:Math.round(titleBounds.y)});await wait(150);
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.space-title-icon > svg:last-child')).opacity==='1' && getComputedStyle(document.querySelector('.space-title-icon > :first-child')).opacity==='0'"),'Hover must replace the space icon with the chevron');
      main.webContents.sendInputEvent({type:'mouseMove',x:500,y:500});await wait(150);
      await evaluate(main,"document.querySelector('.space-title-toggle').click();undefined");await wait(150);
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.space-title-icon > svg:last-child')).opacity==='0'"),'Collapsed space keeps its icon until hover');
      assert(await evaluate(main,"document.querySelector('.space-title-toggle').getAttribute('aria-expanded')==='false' && getComputedStyle(document.querySelector('.sidebar-apps')).display==='none'"));
      await main.reload();await wait(700);
      assert(await evaluate(main,"document.querySelector('.space-title-toggle').getAttribute('aria-expanded')==='false' && getComputedStyle(document.querySelector('.sidebar-apps')).display==='none'"),'Space collapse did not survive reload');
      await evaluate(main,"document.querySelector('.space-title-toggle').click();undefined");await wait(100);
      const visibilityChanges=[];
      const liveView=views.find(view=>view.getVisible());
      const originalVisibility=liveView.setVisible.bind(liveView);
      liveView.setVisible=(visible)=>{visibilityChanges.push(visible);originalVisibility(visible);};
      await evaluate(main,"document.querySelector('.space-title-menu').focus();document.querySelector('.space-title-menu').click();undefined");await wait(100);
      assert(liveView.getVisible(),'Native space menu must keep the live website visible');
      assert(!visibilityChanges.includes(false),'Opening a native space menu must not hide the website');
      assert(await evaluate(main,"(()=>{const row=document.querySelector('.space-heading').getBoundingClientRect();const button=document.querySelector('.space-title-menu').getBoundingClientRect();return Math.abs(row.right-button.right)<1 && button.width===24;})()"),'Space options must align to the right edge at a fixed compact width');

      for (const label of ['Change Space Icon…','Rename Space…','Edit Theme Color…','New Folder','Manage Spaces…']) assert(nativeContextMenu.items.some(item=>item.label===label));
      nativeContextMenu.items.find(item=>item.label==='Rename Space…').click();nativeContextMenu.closePopup(main);await wait(150);
      await input(main,'[aria-label="Space name"]','Personal renamed');
      await evaluate(main,"Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent==='Save changes').click();undefined");await wait(200);
      const saved=await evaluate(main,"JSON.parse(localStorage.getItem('kudiumbrowser-spaces'))");
      assert.equal(saved.length,2);assert.equal(saved.find(space=>space.id==='default').name,'Personal renamed');
      assert(await evaluate(main,"document.querySelector('.space-title-toggle').textContent.includes('Personal renamed')"));
      for(const width of [1160,480]) { main.setSize(width,700);await wait(150);assert(await evaluate(main,"document.querySelector('.space-title-toggle').scrollWidth <= document.querySelector('.space-title-toggle').clientWidth + 1"));fs.writeFileSync(path.join(out,'space-title-'+width+'.png'),(await main.capturePage()).toPNG()); }
      console.log('PASS: compact icon/title row, collapse/expand, native options menu, rename updates existing space, responsive layouts. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--sidebar-footer-only')) {
      require(path.join(runtimeDir,'downloads.js')).registerDownloadLibrary(()=>main.webContents.send('browser-shortcut','downloads'),contents=>contents===main.webContents);
      assert(await evaluate(main, `document.querySelectorAll('.system-space-switcher button').length===1 && document.querySelectorAll('.space-switcher button').length===2 && !document.querySelector('.sidebar-bottom .sidebar-tools')`));
      await evaluate(main, `document.querySelector('[aria-label="System spaces"] button').click();undefined`);await wait(300);
      assert(await evaluate(main,"!!document.querySelector('.download-sidebar-panel')"));
      await evaluate(main, `document.querySelector('[aria-label="System spaces"] button').click();undefined`);await wait(300);
      assert(await evaluate(main,"!!document.querySelector('.sidebar-apps')"));
      main.webContents.send('browser-shortcut','history');await wait(300);
      await evaluate(main, `document.querySelector('[aria-label="Choose system space"]').click();undefined`);await wait(100);
      assert(nativeContextMenu.items.some(item=>item.label==='Downloads'));
      assert(nativeContextMenu.items.some(item=>item.label==='History'));
      assert(nativeContextMenu.items.some(item=>item.label==='Settings…'));
      nativeContextMenu.items.find(item=>item.label==='Downloads').click();nativeContextMenu.closePopup(main);await wait(300);
      assert(await evaluate(main,"!!document.querySelector('.download-sidebar-panel')"));
      for(const width of [1160,480]) { main.setSize(width,700);await wait(150);assert(await evaluate(main,"Array.from(document.querySelectorAll('.sidebar-bottom button')).every(button=>button.getBoundingClientRect().right<=document.querySelector('.workspace-sidebar').getBoundingClientRect().right)"));fs.writeFileSync(path.join(out,'sidebar-footer-'+width+'.png'),(await main.capturePage()).toPNG()); }
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.sidebar-bottom')).borderTopWidth === '0px' && getComputedStyle(document.querySelector('.system-space-switcher')).borderRightWidth === '0px'"));
      assert(await evaluate(main,`(()=>{const group=document.querySelector('.space-switcher').getBoundingClientRect();const buttons=Array.from(document.querySelectorAll('.space-switcher button')).map(button=>button.getBoundingClientRect());return Math.abs((buttons[0].left+buttons.at(-1).right)/2-(group.left+group.right)/2)<1;})()`));
      await evaluate(main,`document.querySelector('[aria-label="Create space"]').focus();undefined`);await wait(150);
      assert(await evaluate(main,"getComputedStyle(document.querySelector('.footer-create-space')).opacity === '1'"));
      fs.writeFileSync(path.join(out,'sidebar-footer-create-visible.png'),(await main.capturePage()).toPNG());
      await evaluate(main,`document.querySelector('[aria-label="Create space"]').click();undefined`);await wait(150);
      assert(await evaluate(main,`!!document.querySelector('[role=dialog] [aria-label="Space name"]')`));
      console.log('PASS: single system button, centered user spaces, borderless footer, focus-revealed create action, toggle, native system menu, responsive footer. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--space-customization-only')) {
      await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs.map((tab,index)=>index===0?{...tab,favorite:true}:tab)))});undefined`);
      await main.reload(); await wait(1200);
      assert(await evaluate(main, `(()=>{const address=document.querySelector('input.location-label').closest('form').getBoundingClientRect();const favorites=document.querySelector('.favorites-grid').getBoundingClientRect();const heading=document.querySelector('.space-heading').getBoundingClientRect();return Math.abs((favorites.top-address.bottom)-(heading.top-favorites.bottom))<1;})()`));
      assert(await evaluate(main,"!!document.querySelector('.space-heading .space-symbol')"));
      await createSpace(main); await wait(150);
      await input(main, '[aria-label="Space name"]', 'Creative');
      await evaluate(main, `document.querySelector('[aria-label="Use 🎨 for Space icon"]').click();undefined`);
      await input(main, '[aria-label="Custom Space color"]', '#446688'); await wait(100);
      assert(await evaluate(main, `!!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Emoji picker…')`));
      fs.writeFileSync(path.join(out,'space-customization-dialog.png'),(await main.capturePage()).toPNG());
      await evaluate(main, `Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent==='Create space').click();undefined`);await wait(300);
      const created = await evaluate(main, `JSON.parse(localStorage.getItem('kudiumbrowser-spaces')).find(space=>space.name==='Creative')`);
      assert.equal(created.iconEmoji,'🎨');assert.equal(created.customColor,'#446688');
      assert(await evaluate(main,"document.querySelector('.space-heading .space-symbol-emoji').textContent==='🎨'"));
      assert(await evaluate(main,"document.querySelector('.workspace').style.getPropertyValue('--sidebar-material').includes('#446688')"));
      fs.writeFileSync(path.join(out,'space-customized-sidebar.png'),(await main.capturePage()).toPNG());
      console.log('PASS: balanced Favorites spacing, heading icon, emoji recommendation and native picker availability, custom color creation and application. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--sidebar-navigation-only')) {
      require(path.join(runtimeDir,'downloads.js')).registerDownloadLibrary(()=>main.webContents.send('browser-shortcut','downloads'), contents=>contents===main.webContents);
      assert(await evaluate(main, "document.querySelectorAll('.system-space-switcher button').length === 1"));
      assert(await evaluate(main, `document.querySelector('[aria-label="Website address"]').classList.contains('form-control-input')`));
      const current = () => evaluate(main, "document.querySelector('[data-sidebar-page]').dataset.sidebarPage");
      const wheel = (x,y) => evaluate(main, `document.querySelector('.sidebar-pager').dispatchEvent(new WheelEvent('wheel',{deltaX:${x},deltaY:${y},bubbles:true,cancelable:true}));undefined`);
      assert.equal(await current(), 'default');
      await wheel(0,100); await wait(100); assert.equal(await current(),'default');
      await wheel(20,0); await wait(25);
      assert.equal(await current(),'default','Page must follow gesture before committing');
      assert(await evaluate(main, "document.querySelector('.sidebar-page').style.transform.includes('-20px')"),'Sidebar does not follow live swipe');
      await wait(300); assert.equal(await current(),'default','Short swipe must snap back');
      assert(await evaluate(main,"!document.querySelector('.sidebar-page').style.transform"));
      await wheel(80,0); await wait(25);
      assert.equal(await current(),'work','Swipe must snap without waiting for gesture inactivity');
      await wheel(90,0); await wheel(75,0); await wait(15);
      assert(await evaluate(main,"!!document.querySelector('.sidebar-outgoing').firstElementChild?.inert && document.querySelectorAll('[data-sidebar-page]').length === 1"),'Outgoing transition must be inert and keep a single live page');
      await wait(250);
      assert(await evaluate(main,"!document.querySelector('.sidebar-outgoing').childElementCount"),'Outgoing snapshot must be released');
      assert.equal(await current(),'work', 'Momentum must switch only one space');
      await wheel(80,0); await wait(250); assert.equal(await current(),'@downloads');
      await wheel(80,0); await wait(250); assert.equal(await current(),'@history');
      await wheel(-80,0); await wait(250); assert.equal(await current(),'@downloads');
      assert(await evaluate(main, `!document.querySelector('[aria-label="Close library"]') && !document.querySelector('.sidebar-library-tabs')`));
      await evaluate(main, `document.querySelector('.system-space-switcher button').click();undefined`); await wait(250); assert.equal(await current(),'work');
      main.webContents.send('browser-shortcut','history'); await wait(250); assert.equal(await current(),'@history');
      main.webContents.send('browser-shortcut','next-space'); await wait(250); assert.equal(await current(),'default');
      for (const page of ['downloads','history']) {
        main.webContents.send('browser-shortcut',page); await wait(250);
        for (const width of [1160,480]) { main.setSize(width,700);await wait(150); assert(await evaluate(main,'document.documentElement.scrollWidth <= innerWidth + 1')); fs.writeFileSync(path.join(out, page.replaceAll(' ','-')+'-space-'+width+'.png'),(await main.capturePage()).toPNG()); }
      }
      main.webContents.debugger.attach('1.3');
      await main.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await wait(200); await wheel(80,0); await wait(120);
      assert(await evaluate(main,"document.querySelector('.sidebar-page').getAnimations().length === 0 && !document.querySelector('.sidebar-outgoing').childElementCount"));
      main.webContents.debugger.detach();
      console.log('PASS: built-in spaces, horizontal swipes, vertical scrolling retained, momentum lock, dock toggles, keyboard sequence, responsive layouts and reduced motion. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--address-focus-only')) {
      main.focus(); main.webContents.focus();
      await evaluate(main, `document.querySelector('[aria-label="Website address"]').focus();undefined`);
      await wait(180);
      const style = await evaluate(main, `(()=>{const field=document.querySelector('[aria-label="Website address"]');const css=getComputedStyle(field);return {outline:css.outlineStyle,shadow:css.boxShadow,background:css.backgroundColor,selected:field.selectionEnd>field.selectionStart};})()`);
      assert.equal(style.outline,'none'); assert.equal(style.shadow,'none'); assert.equal(style.background,'rgba(0, 0, 0, 0)'); 
      await evaluate(main, `document.querySelector('[aria-label="Website address"]').select();undefined`);
      fs.writeFileSync(path.join(out,'address-focus.png'),(await main.capturePage()).toPNG());
      console.log('PASS: focused address field has no inner outline, background or shadow; URL selection styling captured. Screenshot: '+out);
      Object.values(windows).forEach(win=>win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--website-tabs-only') || process.argv.includes('--opener-flow-only') || process.argv.includes('--early-tab-close-only')) {
      await evaluate(main, `document.getElementById('page-tab-personal-home').click();undefined`);
      await wait(300);
      const web = views[0].webContents;
      const windowCount = BrowserWindow.getAllWindows().length;
      let recoverySettingsWindowCreated = false;
      const storedTabs = () => evaluate(main, "JSON.parse(localStorage.getItem('user_apps'))");
      const before = await storedTabs();
      if (!process.argv.includes('--opener-flow-only') && !process.argv.includes('--early-tab-close-only')) {
      await web.executeJavaScript(`document.body.innerHTML='<a href="${url}/command-link" style="display:block;width:200px;height:80px">Open link</a>';undefined`);
      await web.executeJavaScript(`window.mouseTrace=[];for(const name of ['mousedown','mouseup','click'])document.addEventListener(name,event=>mouseTrace.push({name,trusted:event.isTrusted,meta:event.metaKey,target:event.target.tagName,x:event.clientX,y:event.clientY}));undefined`);
      const point = await web.executeJavaScript("(()=>{const r=document.querySelector('a').getBoundingClientRect();return {x:Math.round(r.x+20),y:Math.round(r.y+20)}})()");
      main.show(); app.focus({steal:true}); main.focus(); web.focus();
      await wait(300);
      web.debugger.attach('1.3');
      await web.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
      await web.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...point,modifiers:4});
      await web.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1,modifiers:4});
      await web.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1,modifiers:4});
      web.debugger.detach();
      await wait(500);
      assert(await web.executeJavaScript("mouseTrace.some(event=>event.name==='click'&&event.meta&&event.trusted&&event.target==='A')"),'Command-click must reach the actual source link as trusted input');
      const after = await storedTabs();
      assert.equal(after.length, before.length + 1, 'Command-click must create a tab');
      assert(after.some(item => item.url === url + '/command-link' && item.sessionId === 'personal' && item.name==='Command link destination' && item.icon===''));
      assert(await evaluate(main, "document.getElementById('page-tab-personal-home').getAttribute('aria-selected')==='true'"), 'Command-click must keep source selected');
      }
      await web.executeJavaScript(`window.childMessage='';window.addEventListener('message',event=>{if(event.source===window.childRef)window.childMessage=event.data});window.childRef=window.open('${url}/popup-tab','_blank');undefined`,true);
      await wait(500);
      for(let attempt=0;attempt<10 && !(await storedTabs()).some(item=>item.url===url+'/popup-tab' && item.name==='Destination page identity' && item.icon);attempt++) await wait(100);
      assert((await storedTabs()).some(item => item.url === url + '/popup-tab' && item.sessionId === 'personal' && item.name==='Destination page identity' && item.icon), 'New page must resolve its own title and favicon');
      assert.equal(BrowserWindow.getAllWindows().length, windowCount, 'Website must not create a popup window');
      assert.equal(popupHits,1,'Adoption must not replay the child GET');
      const child = main.contentView.children.find(view=>view.webContents?.getURL()===`${url}/popup-tab`).webContents;
      assert.equal(child.session,web.session,'Child must retain the source session');
      assert(await web.executeJavaScript('!!window.childRef'),'window.open must return the actual child reference');
      assert.equal(await child.executeJavaScript('opener.location.href'),`${url}/home`);
      await child.executeJavaScript(`opener.postMessage('child-ready',location.origin);undefined`);
      await wait(100);
      assert.equal(await web.executeJavaScript('window.childMessage'),'child-ready','Child messages must retain real opener/source identity');
      await web.executeJavaScript(`window.blankRef=window.open('about:blank','form-child');blankRef.document.write('<title>Script-written child</title><p>Script-written content</p><input aria-label="Child value">');blankRef.document.close();undefined`,true);
      await wait(500);
      const blank = main.contentView.children.find(view=>view.webContents?.getURL()==='about:blank').webContents;
      assert.equal(blank.getTitle(),'Script-written child','Adoption must not reset a script-written blank page');
      const runtime = async (contents, expression) => {
        contents.debugger.attach('1.3');
        try { const result=await contents.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!result.exceptionDetails,JSON.stringify(result));return result.result.value; }
        finally { contents.debugger.detach(); }
      };
      assert.equal(await runtime(blank,'opener.location.href'),`${url}/home`);
      const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
      const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
      await evaluate(main, `window.electron.ai.mcpUpdate({enabled:true,port:${port}})`);
      const connection=(await evaluate(main,`window.electron.ai.mcpConnection()`)).mcpServers.kudiumbrowser;
      const agent=new Client({name:'native-opener-handoff',version:'1'},{capabilities:{}});
      await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
      const decode = result=>{assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
      const listed=decode(await agent.callTool({name:'list_tabs',arguments:{}}));
      const blankTab=listed.find(tab=>tab.url==='about:blank'&&tab.title==='Script-written child');
      assert(blankTab && blankTab.openerTabId==='personal-home','MCP must expose the source tab for the adopted blank child');
      const target=decode(await agent.callTool({name:'find_element',arguments:{tabId:blankTab.id,label:'Child value',role:'textbox'}}));
      const originalApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
      try {
        decode(await agent.callTool({name:'type',arguments:{tabId:blankTab.id,elementId:target.elementId,snapshotId:target.snapshotId,text:'Agent child value'}}));
        assert.equal(await runtime(blank,'document.querySelector("input").value'),'Agent child value');
        await runtime(web,`const form=document.createElement('form');form.method='POST';form.action='${url}/popup-form';form.target='form-child';const input=document.createElement('input');input.name='value';input.value='preserved body';form.appendChild(input);document.body.appendChild(form);form.submit();undefined`);
        for(let attempt=0;attempt<50&&blank.getURL()!==`${url}/popup-form`;attempt+=1)await wait(50);
        await wait(250);
        assert.deepEqual(popupForms,[{method:'POST',body:'value=preserved+body'}],'Named-target form submission must preserve its POST body without GET replay');
        assert.equal(blank.getURL(),`${url}/popup-form`);
        const submitted=decode(await agent.callTool({name:'read_page',arguments:{tabId:blankTab.id}}));
        assert(submitted.text.includes('Form received'),'Agent must continue in the same adopted child after submission');
        await runtime(web,'blankRef.close();undefined');await wait(300);
        assert(blank.isDestroyed(),'Closing the child reference must close its tab');
        assert(!main.isDestroyed(),'Closing a child must preserve the KudiumBrowser window');
        assert(!decode(await agent.callTool({name:'list_tabs',arguments:{}})).some(tab=>tab.id===blankTab.id));
      } finally {dialog.showMessageBox=originalApproval;await agent.close();}
      // Hold actual renderer acknowledgement to exercise pre-adoption lifecycle.
      const heldAdoption = async (destination, timeout) => {
        const listeners = ipcMain.listeners('browser-sync');
        let stale;
        let created;
        const record = (_event, contents) => { created = contents; };
        app.on('web-contents-created', record);
        listeners.forEach(listener => ipcMain.removeListener('browser-sync', listener));
        const hold = (event, layout) => {
          if (event.sender !== main.webContents) {
            listeners.forEach(listener => listener(event, layout)); return;
          }
          if (!stale && layout.apps?.some(tab => tab.url === destination)) stale = { event, layout };
        };
        ipcMain.on('browser-sync', hold);
        try {
          await runtime(web, `window.earlyChild=window.open('${destination}','_blank');undefined`);
          await wait(timeout ? 10500 : 600);
          assert(created && created.isDestroyed(), 'Unadopted child must retire its renderer');
          assert(!main.isDestroyed(), 'Early child close must preserve the host');
          assert(stale, 'Fixture must capture an actual delayed renderer acknowledgement');
          ipcMain.removeListener('browser-sync', hold);
          listeners.forEach(listener => ipcMain.on('browser-sync', listener));
          listeners.forEach(listener => listener(stale.event, stale.layout));
          await wait(300);
          assert(!main.contentView.children.some(view => view.webContents?.getURL() === destination), 'Late acknowledgement must not recreate a retired child');
          assert(!(await storedTabs()).some(tab => !tab.archived && tab.url === destination), 'Retired child must remain archived');
          if (timeout) {
            const expiredTab = stale.layout.apps.find(tab => tab.url === destination);
            assert.equal(expiredChildHits,1,'Expiry must not replay its load');
            main.webContents.send('browser-shortcut','reopen-tab');
            await wait(500);
            const restoredTab = (await storedTabs()).find(tab => tab.id === expiredTab.id);
            assert(!restoredTab.archived && restoredTab.restorationId && !restoredTab.openerTabId,'Human reopen must retain identity and use a fresh independent generation');
            const restored = main.contentView.children.find(view=>view.webContents?.getURL()===destination).webContents;
            assert.equal(await runtime(restored,'opener'),null,'Restoring archived content must not invent a live opener');
            listeners.forEach(listener => listener(stale.event,stale.layout));
            await wait(250);
            assert(!restored.isDestroyed() && !(await storedTabs()).find(tab=>tab.id===expiredTab.id).archived,'Stale acknowledgement must not archive or replace a human-restored tab');
            assert.equal(expiredChildHits,2,'Explicit restoration must load exactly once');
            const recoveryAgent=new Client({name:'retired-tab-recovery',version:'1'},{capabilities:{}});
            await recoveryAgent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
            const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
            try {
              const observed=decode(await recoveryAgent.callTool({name:'read_page',arguments:{tabId:expiredTab.id}}));
              assert(observed.text.includes('Waiting'),'MCP must observe the restored tab using its original ID');
              decode(await recoveryAgent.callTool({name:'close_tab',arguments:{tabId:expiredTab.id}}));
              recoverySettingsWindowCreated = !windows.settings;
              const archiveSettings = windows.settings || await create('settings',1080,800);
              archiveSettings.webContents.send('preferences-section','archive');await wait(250);
              await evaluate(archiveSettings, `Array.from(document.querySelectorAll('.app-row')).find(row=>row.textContent.includes('${destination}')).querySelector('button').click();undefined`);
              archiveSettings.hide();
              await evaluate(main, `document.getElementById('page-tab-${expiredTab.id}').click();undefined`);
              await wait(500);
              const second=(await storedTabs()).find(tab=>tab.id===expiredTab.id);
              assert(!second.archived && second.restorationId!==restoredTab.restorationId,'Repeated reopen must advance its restore generation');
              assert.equal(expiredChildHits,3);
              decode(await recoveryAgent.callTool({name:'close_tab',arguments:{tabId:expiredTab.id}}));
            } finally {dialog.showMessageBox=savedApproval;await recoveryAgent.close();}
          }

        } finally {
          app.removeListener('web-contents-created', record);
          ipcMain.removeListener('browser-sync', hold);
          listeners.forEach(listener => {
            if (!ipcMain.listeners('browser-sync').includes(listener)) ipcMain.on('browser-sync', listener);
          });
        }
      };
      await heldAdoption(`${url}/self-close`, false);
      if (process.argv.includes('--early-tab-close-only')) {
        console.log('PASS: actual Electron pre-adoption self-close destroys the child renderer, preserves the host, refuses late adoption and retains archived metadata');
        main.destroy();server.close();app.quit();return;
      }
      await heldAdoption(`${url}/adoption-timeout`, true);
      assert.equal(expiredChildHits, 3, 'Only explicit human restorations may reload the expired child');
      const restorationSource='src/components/View/Main/Main.tsx';
      const crypto=require('crypto');const ref='de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
      const report={measuredAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,method:'Actual Electron/production React renderer with held child adoption, timed native retirement, late IPC replay, keyboard reopen and subsequent Archive restore; disposable profile.',before:{baselineRef:ref,sourceSHA256:crypto.createHash('sha256').update(require('child_process').execFileSync('git',['show',ref+':'+restorationSource])).digest('hex'),observed:'The same test failed at restored WebContents lookup: restored metadata was active but actual browser-sync focus remained on a neighboring tab; destination native view was absent.'},after:{sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(restorationSource)).digest('hex'),keyboardRestoration:true,lateAcknowledgementPreservesRestoredView:true,archiveRestoration:true,originalTabIdPreserved:true,explicitLoads:expiredChildHits},limitations:['This is correctness/lifecycle evidence, not measured CPU/RAM or whole-app latency.','The broader opener/download workflow has its own final result; reaching this report alone does not prove later stages.']};
      const reportPath='docs/benchmarks/opener-restoration.json';
      if(fs.existsSync(reportPath)){const original=JSON.parse(fs.readFileSync(reportPath,'utf8'));original.confirmations=[...(original.confirmations||[]),report];fs.writeFileSync(reportPath,JSON.stringify(original,null,2)+'\n');}else fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');

      const verifyEarlyDownload = async (retireBeforeAdoption = false) => {
        const destination = `${url}/early-download-child${retireBeforeAdoption ? '?retired=1' : ''}`;
        const listeners = ipcMain.listeners('browser-sync');
        let held;
        listeners.forEach(listener => ipcMain.removeListener('browser-sync', listener));
        const hold = (event, layout) => {
          if (event.sender !== main.webContents) {listeners.forEach(listener => listener(event,layout));return;}
          if (layout.apps?.some(tab => tab.url === destination)) held = {event,layout};
        };
        ipcMain.on('browser-sync',hold);
        const originalDirectory = app.getPath('downloads');
        const downloadPreferences = require(path.join(runtimeDir,'preferences.js'));
        const originalAskLocation = downloadPreferences.getBrowserPreferences().askDownloadLocation;
        downloadPreferences.updateBrowserPreferences({askDownloadLocation:false});
        const directory = path.join(runtimeDir,'early-child-downloads');
        fs.mkdirSync(directory,{recursive:true});app.setPath('downloads',directory);
        const downloads = require(path.join(runtimeDir,'downloads.js'));
        let earlyTab;
        let retiredContentsId;
        try {
          const previousIds = new Set(downloads.getDownloadHistory().map(item=>item.id));
          await runtime(web, `window.downloadChild=window.open('${destination}','_blank');undefined`);
          let record;
          for(let attempt=0;attempt<100;attempt++) {
            record = downloads.getDownloadHistory().find(item => !previousIds.has(item.id) && item.state === 'completed');
            if(record && held) break;
            await wait(50);
          }
          assert(record && held,'Child must complete its actual download before renderer adoption: '+JSON.stringify({held:!!held,earlyDownloadPageHits,earlyFileHits,history:downloads.getDownloadHistory()}));
          earlyTab = held.layout.apps.find(tab => tab.url === destination);
          assert.equal(record.sourceKey,JSON.stringify(['personal',earlyTab.id]),'Early download must persist its exact child/session ownership');
          const persisted=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'download-history.json'),'utf8')).find(item=>item.id===record.id);
          assert.equal(persisted.sourceKey,record.sourceKey,'Completed artifact ownership must be present in the on-disk history');
          assert.equal(fs.readFileSync(record.path,'utf8'),'Child download before adoption');
          assert(record.path.startsWith(directory + path.sep),'Fixture download must remain in disposable storage');
          if (retireBeforeAdoption) {
            const pending=main.contentView.children.find(view=>view.webContents?.getURL()===destination).webContents;
            retiredContentsId=pending.id;
            await runtime(web,'downloadChild.close();undefined');await wait(250);
            assert(pending.isDestroyed(),'Pending download child must really close before acknowledgement');
          }
          ipcMain.removeListener('browser-sync',hold);
          listeners.forEach(listener => ipcMain.on('browser-sync',listener));
          listeners.forEach(listener => listener(held.event,held.layout));
          await wait(300);
          if (retireBeforeAdoption) {
            assert((await storedTabs()).find(tab=>tab.id===earlyTab.id).archived,'Late acknowledgement must leave download child archived');
            main.webContents.send('browser-shortcut','reopen-tab');await wait(500);
            const restored=(await storedTabs()).find(tab=>tab.id===earlyTab.id);
            assert(!restored.archived && restored.restorationId,'Explicit restore must recover the original child identity');
          }
          const transferAgent = new Client({name:'early-child-download',version:'1'},{capabilities:{}});
          await transferAgent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
          const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
          try {
            const owned = decode(await transferAgent.callTool({name:'list_downloads',arguments:{tabId:earlyTab.id}}));
            assert(owned.downloads.some(item => item.id === record.id),'MCP must discover the pre-adoption download after handoff');
            const artifact = decode(await transferAgent.callTool({name:'get_download',arguments:{tabId:earlyTab.id,downloadId:record.id}}));
            assert(artifact.available);assert.equal(artifact.file.path,record.path);
            assert((await transferAgent.callTool({name:'get_download',arguments:{tabId:'personal-home',downloadId:record.id}})).isError,'The opener must not inherit its child download ownership');
            const target = decode(await transferAgent.callTool({name:'find_element',arguments:{tabId:earlyTab.id,label:'Attach downloaded file'}}));
            decode(await transferAgent.callTool({name:'upload_files',arguments:{tabId:earlyTab.id,elementId:target.elementId,snapshotId:target.snapshotId,paths:[artifact.file.path]}}));
            const page=main.contentView.children.find(view=>view.webContents?.getURL()===destination).webContents;
            if(retireBeforeAdoption) assert.notEqual(page.id,retiredContentsId,'Recovery must use a genuinely replacement renderer');
            assert.equal(await runtime(page,'document.querySelector("input").files[0].name'),record.name);
            assert.equal(earlyDownloadPageHits,retireBeforeAdoption ? 3 : 1,'Only explicit restoration may reload the child page');
            assert.equal(earlyFileHits,retireBeforeAdoption ? 2 : 1,'Restoring the fixture must not create a duplicate download');
            decode(await transferAgent.callTool({name:'close_tab',arguments:{tabId:earlyTab.id}}));
          } finally {dialog.showMessageBox=savedApproval;await transferAgent.close();}
        } finally {
          downloadPreferences.updateBrowserPreferences({askDownloadLocation:originalAskLocation});
          app.setPath('downloads',originalDirectory);
          ipcMain.removeListener('browser-sync',hold);
          listeners.forEach(listener=>{if(!ipcMain.listeners('browser-sync').includes(listener))ipcMain.on('browser-sync',listener);});
        }
      };
      await verifyEarlyDownload();
      await verifyEarlyDownload(true);
      const verifyDirectDownload = async () => {
        const downloads=require(path.join(runtimeDir,'downloads.js'));
        const preferences=require(path.join(runtimeDir,'preferences.js'));
        const previousIds=new Set(downloads.getDownloadHistory().map(item=>item.id));
        const originalDirectory=app.getPath('downloads');
        const originalAsk=preferences.getBrowserPreferences().askDownloadLocation;
        const directory=path.join(runtimeDir,'direct-child-downloads');fs.mkdirSync(directory,{recursive:true});
        app.setPath('downloads',directory);preferences.updateBrowserPreferences({askDownloadLocation:false});
        try {
          await runtime(web,`window.directDownload=window.open('${url}/early-child-file','_blank');undefined`);
          let record;
          for(let attempt=0;attempt<100;attempt++) {
            record=downloads.getDownloadHistory().find(item=>!previousIds.has(item.id)&&item.state==='completed');
            if(record)break;await wait(50);
          }
          assert(record && record.sourceKey,'Initial attachment response must retain child ownership');
          const [profile,id]=JSON.parse(record.sourceKey);assert.equal(profile,'personal');
          const tabs=await storedTabs();const source=tabs.find(tab=>tab.id===id);
          assert(!(await runtime(web,'directDownload.closed')),'Direct download child must remain open');
          assert(source && !source.archived,'Direct attachment child must remain available for agent artifact lookup');
          const directAgent=new Client({name:'direct-attachment',version:'1'},{capabilities:{}});
          await directAgent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
          const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
          try {
            const artifact=decode(await directAgent.callTool({name:'get_download',arguments:{tabId:id,downloadId:record.id}}));
            assert(artifact.available && artifact.file.path===record.path,'Agent must retrieve the direct-response artifact');
            let directContents=main.contentView.children.map(view=>view.webContents).find(contents=>downloads.getDownloadsForContents(contents).some(item=>item.id===record.id));
            assert(!directContents.isLoadingMainFrame(),'Direct download must leave an idle initial document');
            assert(main.contentView.children.find(view=>view.webContents===directContents).getVisible(),'Direct download must not leave an endless initial-loading overlay');
            const blank=decode(await directAgent.callTool({name:'read_page',arguments:{tabId:id}}));
            assert(Array.isArray(blank.elements),'Direct download tab must retain an observable blank document');
            decode(await directAgent.callTool({name:'close_tab',arguments:{tabId:id}}));
            main.webContents.send('browser-shortcut','reopen-tab');await wait(500);
            const restoredSource=(await storedTabs()).find(tab=>tab.id===id);
            assert(!restoredSource.archived && restoredSource.restorationId && !restoredSource.openerTabId,'Direct-download restoration must retain its original identity without a stale opener');
            directContents=main.contentView.children.map(view=>view.webContents).find(contents=>downloads.getDownloadsForContents(contents).some(item=>item.id===record.id));
            assert(main.contentView.children.find(view=>view.webContents===directContents).getVisible(),'Restored direct attachment must not remain behind its loading overlay');
            assert(Array.isArray(decode(await directAgent.callTool({name:'read_page',arguments:{tabId:id}})).elements),'Restored direct-response blank must be observable');
            assert(decode(await directAgent.callTool({name:'get_download',arguments:{tabId:id,downloadId:record.id}})).available,'Explicit direct-response restoration must retain its original artifact');

            const navigated=decode(await directAgent.callTool({name:'navigate',arguments:{tabId:id,url:`${url}/nested-child`}}));
            assert.equal(navigated.url,`${url}/nested-child`,'Agent must continue navigation in the download tab');
            const followed=decode(await directAgent.callTool({name:'read_page',arguments:{tabId:id}}));
            assert(followed.elements.some(element=>element.label==='Nested value'));
            assert(decode(await directAgent.callTool({name:'get_download',arguments:{tabId:id,downloadId:record.id}})).available,'Artifact must retain ownership after follow-up navigation');


            decode(await directAgent.callTool({name:'close_tab',arguments:{tabId:id}}));
          } finally {dialog.showMessageBox=savedApproval;await directAgent.close();}
        } finally {app.setPath('downloads',originalDirectory);preferences.updateBrowserPreferences({askDownloadLocation:originalAsk});}
      };
      await verifyDirectDownload();
      const verifyActiveDownloadRecovery = async (cancelRecovered = false) => {
        releaseActiveDownload=false;
        const destination=`${url}/active-download-child${cancelRecovered ? '?cancel=1' : ''}`;
        const listeners=ipcMain.listeners('browser-sync');let held;
        listeners.forEach(listener=>ipcMain.removeListener('browser-sync',listener));
        const hold=(event,layout)=>{if(event.sender!==main.webContents){listeners.forEach(listener=>listener(event,layout));return;}if(layout.apps?.some(tab=>tab.url===destination))held={event,layout};};
        ipcMain.on('browser-sync',hold);
        const downloads=require(path.join(runtimeDir,'downloads.js'));const preferences=require(path.join(runtimeDir,'preferences.js'));
        const originalDirectory=app.getPath('downloads');const originalAsk=preferences.getBrowserPreferences().askDownloadLocation;
        const directory=path.join(runtimeDir,'active-child-downloads');fs.mkdirSync(directory,{recursive:true});app.setPath('downloads',directory);preferences.updateBrowserPreferences({askDownloadLocation:false});
        try {
          const previousIds=new Set(downloads.getDownloadHistory().map(item=>item.id));
          await runtime(web,`window.activeDownloadChild=window.open('${destination}','_blank');undefined`);
          let record;
          for(let attempt=0;attempt<100;attempt++){record=downloads.getDownloadHistory().find(item=>!previousIds.has(item.id));if(record&&held)break;await wait(50);}
          assert(record&&held&&record.active&&record.state==='progressing','Fixture must hold a real active child download before adoption: '+JSON.stringify({held:!!held,history:downloads.getDownloadHistory(),responses:activeDownloadResponses.length,pageHits:activeDownloadPageHits}));
          const source=held.layout.apps.find(tab=>tab.url===destination);
          const pending=main.contentView.children.find(view=>view.webContents?.getURL()===destination).webContents;
          const oldContentsId=pending.id;
          await runtime(web,'activeDownloadChild.close();undefined');await wait(200);
          assert(pending.isDestroyed(),'Active-download source must close before adoption');
          ipcMain.removeListener('browser-sync',hold);listeners.forEach(listener=>ipcMain.on('browser-sync',listener));listeners.forEach(listener=>listener(held.event,held.layout));await wait(200);
          main.webContents.send('browser-shortcut','reopen-tab');await wait(500);
          const page=main.contentView.children.find(view=>view.webContents?.getURL()===destination).webContents;
          assert.notEqual(page.id,oldContentsId);
          const agent=new Client({name:'active-download-recovery',version:'1'},{capabilities:{}});await agent.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
          const savedApproval=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
          try {
            const recovered=decode(await agent.callTool({name:'list_downloads',arguments:{tabId:source.id}})).downloads.find(item=>item.id===record.id);
            assert(recovered.active&&recovered.state==='progressing','Closing the source tab must preserve the active browser-session download');
            if(cancelRecovered) {
              const cancelled=decode(await agent.callTool({name:'control_download',arguments:{tabId:source.id,downloadId:record.id,action:'cancel'}}));
              assert(cancelled.confirmed,'Replacement renderer must cancel its original active download');
              const final=decode(await agent.callTool({name:'list_downloads',arguments:{tabId:source.id}})).downloads.find(item=>item.id===record.id);
              assert(!final.active&&final.state==='cancelled','Cancellation must reach the actual manager state');
              assert(!decode(await agent.callTool({name:'get_download',arguments:{tabId:source.id,downloadId:record.id}})).available,'Cancelled partial download must not be exposed as a completed artifact');
              decode(await agent.callTool({name:'close_tab',arguments:{tabId:source.id}}));
              return;
            }

            dialog.showMessageBox=async()=>({response:0});
            assert((await agent.callTool({name:'control_download',arguments:{tabId:source.id,downloadId:record.id,action:'pause'}})).isError,'Declined pause must fail');
            assert(!downloads.getDownloadHistory().find(item=>item.id===record.id).paused,'Declined pause must preserve the background download');
            await evaluate(main,`const button=document.querySelector('[aria-label="Toggle AI sidebar"]');if(button.getAttribute('aria-expanded')!=='true')button.click();undefined`);await wait(200);
            let approval;
            dialog.showMessageBox=(_owner,options)=>new Promise(resolve=>{approval=options;options.signal.addEventListener('abort',()=>resolve({response:0}),{once:true});});
            const stopped=agent.callTool({name:'control_download',arguments:{tabId:source.id,downloadId:record.id,action:'pause'}});
            for(let attempt=0;attempt<50&&!approval;attempt++)await wait(20);
            assert(approval,'Download approval must be waiting before sidebar Stop');await wait(100);
            await evaluate(main,`Array.from(document.querySelectorAll('.ai-composer button')).find(button=>button.getAttribute('aria-label')==='Stop AI task').click();undefined`);
            assert((await stopped).isError,'Actual sidebar Stop must cancel the pending download action');
            const untouched=downloads.getDownloadHistory().find(item=>item.id===record.id);
            assert(untouched.active && !untouched.paused && untouched.state==='progressing','Stop before approval must not cancel or pause the existing session download');
            dialog.showMessageBox=async()=>({response:1});

            const paused=decode(await agent.callTool({name:'control_download',arguments:{tabId:source.id,downloadId:record.id,action:'pause'}}));assert(paused.confirmed,'Replacement renderer must control its original active download');
            assert((await agent.callTool({name:'control_download',arguments:{tabId:'personal-home',downloadId:record.id,action:'cancel'}})).isError,'Opener must not control the child download');
            const resumed=decode(await agent.callTool({name:'control_download',arguments:{tabId:source.id,downloadId:record.id,action:'resume'}}));assert(resumed.confirmed);
            releaseActiveDownload=true;
            activeDownloadResponses.forEach(({response,remaining})=>{if(!response.destroyed)response.end('x'.repeat(remaining));});
            for(let attempt=0;attempt<100&&downloads.getDownloadHistory().find(item=>item.id===record.id).state!=='completed';attempt++)await wait(50);
            const artifact=decode(await agent.callTool({name:'get_download',arguments:{tabId:source.id,downloadId:record.id}}));assert(artifact.available);assert.equal(fs.readFileSync(artifact.file.path,'utf8'),'x'.repeat(4096));
            assert.equal(activeDownloadPageHits,2,'Only explicit restoration may reload the source page');
            decode(await agent.callTool({name:'close_tab',arguments:{tabId:source.id}}));
          } finally {dialog.showMessageBox=savedApproval;await agent.close();}
        } finally {
          activeDownloadResponses.forEach(({response})=>{if(!response.destroyed)response.destroy();});
          app.setPath('downloads',originalDirectory);preferences.updateBrowserPreferences({askDownloadLocation:originalAsk});
          ipcMain.removeListener('browser-sync',hold);listeners.forEach(listener=>{if(!ipcMain.listeners('browser-sync').includes(listener))ipcMain.on('browser-sync',listener);});
        }
      };
      await verifyActiveDownloadRecovery();
      await verifyActiveDownloadRecovery(true);
      assert.equal(activeDownloadPageHits,4,'Each active source must load only at creation and explicit restoration');


      await runtime(child, `window.nestedRef=window.open('${url}/nested-child','_blank');undefined`);
      await wait(500);
      const nested = main.contentView.children.find(view => view.webContents?.getURL() === `${url}/nested-child`).webContents;
      assert.equal(nested.session, child.session, 'Nested child must retain the same signed-in session');
      const finalAgent = new Client({name:'native-source-close',version:'1'}, {capabilities:{}});
      await finalAgent.connect(new StreamableHTTPClientTransport(new URL(connection.url), {requestInit:{headers:connection.headers}}));
      const savedApproval = dialog.showMessageBox;
      dialog.showMessageBox = async () => ({response:1});
      try {
        const tabs = decode(await finalAgent.callTool({name:'list_tabs',arguments:{}}));
        const parentTab = tabs.find(tab => tab.url === `${url}/popup-tab`);
        const nestedTab = tabs.find(tab => tab.url === `${url}/nested-child`);
        assert.equal(nestedTab.openerTabId, parentTab.id, 'Nested opener must identify its immediate parent');
        assert.equal(await runtime(nested,'opener.location.href'), `${url}/popup-tab`);
        await evaluate(main, `document.getElementById('page-tab-personal-home').click();document.querySelector('.sidebar-app[aria-label="Facebook · Personal"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));undefined`);
        await wait(100);
        const groupSettings=nativeContextMenu.items.find(item=>item.label==='Group Settings…');assert(groupSettings,'Current group menu must expose settings');groupSettings.click();
        nativeContextMenu.closePopup(main);
        await wait(150);
        await evaluate(main, `document.querySelector('[aria-label="Group placement"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);
        await wait(100);
        await evaluate(main, `const regular=[...document.querySelectorAll('[role=option]')].find(option=>option.textContent==='Regular');if(!regular)throw new Error('Regular placement missing');regular.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);
        await wait(100);
        await evaluate(main, `document.querySelector('.session-settings-dialog button[type=submit]').click();undefined`);
        await wait(200);
        assert((await storedTabs()).find(tab => tab.id === 'personal-home').pinned === false, 'Fixture must explicitly unpin root through the human UI');
        await runtime(child,'window.savedOpener=opener;undefined');
        const closed = decode(await finalAgent.callTool({name:'close_tab', arguments:{tabId:'personal-home'}}));
        assert(closed.closed && web.isDestroyed(), 'Source closure must be confirmed before handoff');
        assert(!main.isDestroyed() && !child.isDestroyed() && !nested.isDestroyed(), 'Source closure must preserve child tabs and host');
        assert.equal(await runtime(child,'savedOpener.closed'), true, 'Child must observe the real closed opener');
        const observed = decode(await finalAgent.callTool({name:'read_page', arguments:{tabId:nestedTab.id}}));
        assert(observed.elements.some(element => element.label === 'Nested value'), 'AI must observe nested child after root source closes');
        const target = decode(await finalAgent.callTool({name:'find_element', arguments:{tabId:nestedTab.id,label:'Nested value',role:'textbox'}}));
        decode(await finalAgent.callTool({name:'type', arguments:{tabId:nestedTab.id,elementId:target.elementId,snapshotId:target.snapshotId,text:'Independent child'}}));
        assert.equal(await runtime(nested,'document.querySelector("input").value'),'Independent child');
      } finally {dialog.showMessageBox=savedApproval;await finalAgent.close();}

      assert.equal(BrowserWindow.getAllWindows().length,windowCount + Number(recoverySettingsWindowCreated));
      console.log('PASS: native tab adoption, real opener messaging, script-written blank child, MCP handoff, POST preservation, child closure, pre-adoption self-close, timeout, late-acknowledgement refusal, explicit keyboard/Archive restoration, nested children, early download discovery/reattachment and pre-adoption closure/artifact recovery, direct attachment blank observation/navigation, active download recovery/pause/resume/cancellation/denial/sidebar Stop and AI handoff after root-source closure without native website windows');
      Object.values(windows).forEach(win=>win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--history-only')) {
      const history = require(path.join(runtimeDir, 'history.js'));
      const web = views[0].webContents;
      await web.loadURL(url + '/history-one'); await web.loadURL(url + '/history-two'); await wait(200);
      assert(history.getBrowsingHistory().some(record => record.url.endsWith('/history-one')));
      main.webContents.send('browser-shortcut', 'history'); await wait(200);
      assert(await evaluate(main, "!!document.querySelector('.history-sidebar-panel')"));
      await input(main, '[aria-label="Search browsing history"]', 'history-one'); await wait(100);
      assert.equal(await evaluate(main, "document.querySelectorAll('.history-sidebar-row').length"), 1);
      await evaluate(main, "document.querySelector('.history-sidebar-row > button').click();undefined"); await wait(300);
      assert(web.getURL().endsWith('/history-one'));
      await input(main, '[aria-label="Search browsing history"]', ''); await wait(100);
      main.setSize(480, 700); await wait(150);
      assert(await evaluate(main, "document.querySelector('.history-sidebar-panel').scrollWidth <= document.querySelector('.history-sidebar-panel').clientWidth + 1"));
      fs.writeFileSync(path.join(out, 'history-sidebar.png'), (await main.capturePage()).toPNG());
      await evaluate(main, "Array.from(document.querySelectorAll('.history-sidebar-panel button')).find(button=>button.textContent==='Clear history').click();undefined"); await wait(100);
      await history.flushHistory();
      const beforeClear=history.getBrowsingHistory();
      const historyFile=path.join(app.getPath('userData'),'browsing-history.json');
      const originalHistory=fs.readFileSync(historyFile);
      fs.renameSync(historyFile,historyFile+'.fixture-original');fs.mkdirSync(historyFile);
      try {
        await evaluate(main, "Array.from(document.querySelectorAll('.download-inline-confirm button')).find(button=>button.textContent==='Clear').click();undefined");await wait(100);
        assert.deepEqual(history.getBrowsingHistory(),beforeClear);
        assert(await evaluate(main, "document.querySelector('.history-sidebar-panel [role=alert]')?.textContent.includes('History could not be updated')"));
        assert(fs.readFileSync(historyFile+'.fixture-original').equals(originalHistory),'Failed worker writes must preserve original history');
      } finally {fs.rmdirSync(historyFile);fs.renameSync(historyFile+'.fixture-original',historyFile);}
      await evaluate(main, "Array.from(document.querySelectorAll('.download-inline-confirm button')).find(button=>button.textContent==='Clear').click();undefined"); await wait(100);
      await history.flushHistory();
      assert.equal(history.getBrowsingHistory().length, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(historyFile,'utf8')),[]);
      console.log('PASS: real visited pages, history tab, search, revisit, responsive sidebar, clear. Screenshots: ' + out);
      Object.values(windows).forEach(win=>win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--downloads-sidebar-only')) {
      const downloads = require(path.join(runtimeDir, 'downloads.js'));
      downloads.registerDownloadLibrary(() => main.webContents.send('browser-shortcut', 'downloads'), contents => contents === main.webContents);
      app.setPath('downloads', runtimeDir);
      require(path.join(runtimeDir, 'preferences.js')).updateBrowserPreferences({ askDownloadLocation: false });
      const session = views[0].webContents.session;
      const done = new Promise(resolve => session.once('will-download', (_, item) => item.once('done', resolve)));
      session.downloadURL(url + '/download-fixture'); await done; await wait(300);
      const count = BrowserWindow.getAllWindows().length;
      await evaluate(main, `document.querySelector('.system-space-switcher button').click();undefined`); await wait(250);
      assert(await evaluate(main, "document.querySelector('.workspace-sidebar .download-sidebar-panel').textContent.includes('kudiumbrowser-download-test.txt')"));
      const thumbnailId=downloads.getDownloadHistory()[0].id;
      const iconResults=await evaluate(main,`Promise.all(Array.from({length:3},()=>window.electron.browser.downloadThumbnail(${JSON.stringify(thumbnailId)})))`);
      assert(iconResults.every(icon=>typeof icon==='string'&&icon.startsWith('data:image/')&&icon===iconResults[0]),'Native download thumbnail missing or inconsistent');
      await evaluate(main, `(()=>{const select=document.querySelector('[aria-label="Filter downloads"]');select.value='Images';select.dispatchEvent(new Event('change',{bubbles:true}));})();undefined`);await wait(100);
      assert.equal(await evaluate(main,"document.querySelectorAll('.download-library-row').length"),0);
      await evaluate(main, `(()=>{const select=document.querySelector('[aria-label="Filter downloads"]');select.value='All';select.dispatchEvent(new Event('change',{bubbles:true}));})();undefined`);await wait(100);
      assert.equal(await evaluate(main,"document.querySelectorAll('.download-library-row').length"),1);
      assert.equal(BrowserWindow.getAllWindows().length, count);
      assert.equal(views[0].getVisible(), true, 'Website should stay visible while browsing downloads');
      for (const width of [1160, 480]) {
        main.setSize(width, 700); await wait(150);
        assert(await evaluate(main, "document.querySelector('.download-sidebar-panel').scrollWidth <= document.querySelector('.download-sidebar-panel').clientWidth + 1"), JSON.stringify(await evaluate(main, "Array.from(document.querySelectorAll('.download-sidebar-panel, .download-sidebar-panel *')).filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>[el.className,el.scrollWidth,el.clientWidth])")));
        fs.writeFileSync(path.join(out, 'downloads-sidebar-' + width + '.png'), (await main.capturePage()).toPNG());
      }
      await evaluate(main, `document.querySelector('.system-space-switcher button').click();undefined`); await wait(100);
      assert(await evaluate(main, "!document.querySelector('.download-sidebar-panel') && !!document.querySelector('.sidebar-apps')"));
      main.webContents.send('browser-shortcut','downloads'); await wait(100);
      assert(await evaluate(main, "!!document.querySelector('.download-sidebar-panel')"));
      await evaluate(main, `Array.from(document.querySelectorAll('.download-sidebar-panel button')).find(button => button.textContent.includes('Clear history')).click();undefined`); await wait(100);
      const beforeClear=downloads.getDownloadHistory();const renameDownloads=fs.renameSync;
      fs.renameSync=(source,target)=>{if(String(target).endsWith('download-history.json'))throw new Error('Disk unavailable');return renameDownloads(source,target);};
      try {
        await evaluate(main, `Array.from(document.querySelectorAll('.download-inline-confirm button')).find(button=>button.textContent==='Clear').click();undefined`);await wait(100);
        assert.deepEqual(downloads.getDownloadHistory(),beforeClear);
        assert(await evaluate(main, "document.querySelector('.download-sidebar-panel [role=alert]')?.textContent.includes('Disk unavailable')"));
      } finally {fs.renameSync=renameDownloads;}
      assert(await evaluate(main, "!!document.querySelector('.download-inline-confirm') && !document.querySelector('[role=dialog]')"));
      await evaluate(main, `Array.from(document.querySelectorAll('.download-inline-confirm button')).find(button => button.textContent === 'Clear').click();undefined`); await wait(150);
      assert.equal(downloads.getDownloadHistory().length, 0);
      assert.equal(await evaluate(main,`window.electron.browser.downloadThumbnail(${JSON.stringify(thumbnailId)})`),null,'Cleared record retained a usable thumbnail');
      assert(fs.existsSync(path.join(runtimeDir, 'kudiumbrowser-download-test.txt')));
      assert(await evaluate(main, `document.querySelectorAll('[aria-label="Close library"]').length === 0 && !document.querySelector('[aria-label="Close downloads"]')`));
      fs.writeFileSync(path.join(out, 'downloads-sidebar-empty.png'), (await main.capturePage()).toPNG());
      await evaluate(main, `document.querySelector('.system-space-switcher button').click();undefined`); await wait(100);
      assert(await evaluate(main, "!document.querySelector('.download-sidebar-panel')"));
      console.log('PASS: downloads toggle inside sidebar, history visible, no extra window, responsive widths, shortcut and close restore sessions. Screenshots: ' + out);
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--connection-handoff-only')) {
      main.webContents.send('browser-tab-request',{action:'create',app:{id:'early-document',name:'Early document',url:url+'/early-document',icon:'',sessionId:'personal',spaceId:'default',pinned:false}});
      await wait(500);
      const view=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).find(view=>view.webContents.getURL().endsWith('/early-document'));
      assert(view && view.getVisible(),'Document should be visible before its slow image finishes');
      assert(view.webContents.isLoading(),'Slow subresource must still be loading');
      assert(await evaluate(main,"!document.querySelector('.connection-scene')"),'Animation must not hold the ready document');
      console.log('PASS: DOM-ready page is visible while slow image is still loading; animation does not wait for full load');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--connection-performance-only')) {
      main.webContents.debugger.attach('1.3');
      await main.webContents.debugger.sendCommand('Performance.enable');
      const metrics=async()=>Object.fromEntries((await main.webContents.debugger.sendCommand('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
      const results=[];
      for(let index=0;index<10;index++) {
        const animated=index%2===0;
        const css=animated?null:await main.webContents.insertCSS('.connection-scene *, .connection-scene {animation:none!important;} .connection-matrix {display:none!important;} .connection-stage {opacity:1!important;}');
        const before=await metrics(); const start=performance.now();
        const id='bench-'+index;
        main.webContents.send('browser-tab-request',{action:'create',app:{id,name:'Benchmark',url:url+'/connection-benchmark?'+index,icon:'',sessionId:'personal',spaceId:'default',pinned:false}});
        let web;
        while(!web) {await wait(10);web=main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session).map(view=>view.webContents).find(contents=>contents.getURL().includes('/connection-benchmark?'+index));}
        const loaded=await new Promise(resolve=>web.once('did-finish-load',()=>resolve(performance.now()-start)));
        while(await evaluate(main,"!!document.querySelector('.connection-scene')")) await wait(10);
        const visible=performance.now()-start;const after=await metrics();
        if(index>1) results.push({animated,loadMs:Math.round(loaded),visibleMs:Math.round(visible),hostTaskMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),layoutMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000)});
        if(css) await main.webContents.removeInsertedCSS(css);
        main.webContents.send('browser-tab-request',{action:'close',id});await wait(100);
      }
      console.log(JSON.stringify(results,null,2));
      for(const animated of [true,false]) {const group=results.filter(item=>item.animated===animated);const mean=key=>Math.round(group.reduce((sum,item)=>sum+item[key],0)/group.length);console.log(JSON.stringify({animated,samples:group.length,meanLoadMs:mean('loadMs'),meanVisibleMs:mean('visibleMs'),meanHostTaskMs:mean('hostTaskMs'),meanLayoutMs:mean('layoutMs')}));}
      main.webContents.debugger.detach();Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--connection-sequence-only')) {
      main.webContents.send('browser-tab-request',{action:'create',app:{id:'connection-demo',name:'Connection demo',url:url+'/slow-connection',icon:'',sessionId:'personal',spaceId:'default',pinned:false}});
      await wait(700);
      assert(await evaluate(main,"!!document.querySelector('.connection-terminal')"),'Initial navigation must show connection sequence');
      assert(await evaluate(main,"document.querySelector('.connection-scene').textContent.includes('simulated steps')"));
      assert(await evaluate(main,"!document.querySelector('.connection-stages').textContent.includes('TLS')"),'HTTP must not pretend to negotiate TLS');
      fs.writeFileSync(path.join(out,'connection-sequence.png'),(await main.capturePage()).toPNG());
      main.setSize(480,700);await wait(150);
      assert(await evaluate(main,"document.querySelector('.connection-terminal').scrollWidth<=document.querySelector('.connection-terminal').clientWidth+1"),'Connection terminal must fit narrow content');
      fs.writeFileSync(path.join(out,'connection-sequence-narrow.png'),(await main.capturePage()).toPNG());
      await wait(4000);
      assert(await evaluate(main,"!document.querySelector('.connection-scene')"),'Sequence must yield to loaded page');
      console.log('PASS: real first-load sequence, simulated label, HTTP omits TLS, narrow layout, immediate handoff after load. Screenshots: '+out);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--page-status-only')) {
      const web = views[0].webContents;
      await web.loadURL('http://127.0.0.1:1/unavailable').catch(() => {});
      await wait(300);
      assert(await evaluate(main, "document.querySelector('.terminal-status-error').textContent.includes('This website is unavailable')"));
      assert.equal(views[0].getVisible(), false);
      web.emit('page-title-updated', {}, 'unavailable'); await wait(100);
      assert(await evaluate(main, "!!document.querySelector('.terminal-status-error [role=button]') || document.querySelector('.terminal-status-error').textContent.includes('Try again')"));
      for (const width of [1160, 480]) {
        main.setSize(width, 700); await wait(150);
        assert(await evaluate(main, 'document.documentElement.scrollWidth <= innerWidth + 1'));
        fs.writeFileSync(path.join(out, 'page-unavailable-' + width + '.png'), (await main.capturePage()).toPNG());
      }
      await web.loadURL(url + '/home'); await wait(300);
      assert.equal(views[0].getVisible(), true);
      assert(await evaluate(main, "!document.querySelector('.terminal-status-error')"));
      console.log('PASS: unavailable website page persists, responsive layout, and recovery restores native content. Screenshots: ' + out);
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--loading-only')) {
      const navigation = views[0].webContents.loadURL(url + '/slow-loading');
      await wait(250);
      assert(await evaluate(main, `!!document.querySelector('#page-tab-personal-home .loading-spinner')`), 'Loading tab spinner missing');
      assert(await evaluate(main, `!!document.querySelector('.page-loading-track')`), 'Loading progress line missing');
      assert(await evaluate(main, `document.querySelector('#browser-content').getAttribute('aria-busy')==='true'`), 'Page is not announced as busy');
      const track = await evaluate(main, `(()=>{const r=document.querySelector('.page-loading-track').getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()`);
      assert(track.bottom <= views[0].getBounds().y + 1, 'Native website covers loading feedback');
      await navigation; await wait(200);
      assert(await evaluate(main, `!document.querySelector('.loading-spinner') && !document.querySelector('.page-loading-track')`), 'Loading feedback did not clear');
      assert(await evaluate(main, `document.querySelector('#browser-content').getAttribute('aria-busy')==='false'`));
      console.log('PASS: slow navigation shows tab spinner, visible progress line, busy status, and clears when finished');
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    if (process.argv.includes('--frame-permissions-only')) {
      const permissionApi=require(path.join(runtimeDir,'websitePermissions.js'));
      const saved=require(path.join(runtimeDir,'siteSettings.js'));
      const childOrigin=url.replace('127.0.0.1','localhost');
      saved.updateSiteSettings('personal',url,{permissions:{geolocation:'allow'}});
      saved.updateSiteSettings('personal',childOrigin,{permissions:{geolocation:'block'}});
      const web=views[0].webContents;
      const checks=[];
      const requests=[];
      const check=permissionApi.websitePermissionCheckHandler('personal');
      web.session.setPermissionCheckHandler((contents,permission,origin,details)=>{const allowed=check(contents,permission,origin,details);checks.push({permission,origin,allowed});return allowed;});
      const request=permissionApi.websitePermissionHandler(main,'personal');
      web.session.setPermissionRequestHandler((contents,permission,callback,details)=>{requests.push({permission,details});return request(contents,permission,callback,details);});
      const count=BrowserWindow.getAllWindows().length;
      await web.executeJavaScript(`window.framePermissionResult=undefined;window.addEventListener('message',event=>{if(event.origin===${JSON.stringify(childOrigin)})window.framePermissionResult=event.data;});const frame=document.createElement('iframe');frame.allow='geolocation';frame.src=${JSON.stringify(childOrigin+'/permission-child')};document.body.appendChild(frame);undefined`);
      let result;
      for(let attempt=0;attempt<50;attempt++){result=await web.executeJavaScript('window.framePermissionResult');if(result)break;await wait(100);}
      assert.equal(result,'permission-denied','Cross-origin child inherited parent permission');
      assert(checks.some(item=>item.permission==='geolocation'&&item.origin===childOrigin&&!item.allowed)||requests.some(item=>item.permission==='geolocation'&&item.details.requestingUrl===childOrigin+'/permission-child'&&item.details.isMainFrame===false),'No real cross-origin permission handler observed: '+JSON.stringify({checks,requests}));
      assert.equal(BrowserWindow.getAllWindows().length,count,'Blocked child unexpectedly opened a permission prompt');
      assert.equal(saved.getSiteSettings('personal',url).permissions.geolocation,'allow');
      assert.equal(saved.getSiteSettings('personal',childOrigin).permissions.geolocation,'block');
      console.log('PASS: real cross-origin iframe is denied independently of parent grant, without prompt or changed decisions');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--site-settings-only')) {
      const click = (win, label) => evaluate(win, `document.querySelector('button[aria-label="${label}"]').click();undefined`);
      await click(main, 'Site settings');
      assert(await evaluate(main, `!!document.querySelector('[role="dialog"].site-settings-dialog')`), 'Site settings dialog did not open');
      assert(await evaluate(main, `document.querySelector('.site-connection').textContent.includes('Connection is not secure')`));
      const choose = async (label) => {
        await evaluate(main, `document.querySelector('[aria-labelledby="site-permission-geolocation"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));undefined`);
        await wait(100);
        await evaluate(main, `Array.from(document.querySelectorAll('[role="option"]')).find(el=>el.textContent===${JSON.stringify(label)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);
        await wait(150);
      };
      await choose('Block');
      const saved = require(path.join(runtimeDir, 'siteSettings.js'));
      assert.equal(saved.getSiteSettings('personal', url).permissions.geolocation, 'block');
      await choose('Allow');
      assert.equal(saved.getSiteSettings('personal', url).permissions.geolocation, 'allow');
      assert.deepEqual(saved.getSiteSettings('work', url).permissions, {});
      const dialogBounds = await evaluate(main, `(()=>{const r=document.querySelector('.site-settings-dialog').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()`);
      fs.writeFileSync(path.join(out, 'site-settings-dialog.png'), (await main.capturePage(dialogBounds)).toPNG());
      main.setSize(480, 520); await wait(200);
      assert(await evaluate(main, `(()=>{const dialog=document.querySelector('.site-settings-dialog');const r=dialog.getBoundingClientRect();const footer=dialog.querySelector('footer').getBoundingClientRect();return r.width<=innerWidth && r.height<=innerHeight && footer.bottom<=innerHeight && dialog.scrollWidth<=dialog.clientWidth+1;})()`), 'Site settings dialog overflows the small viewport');
      fs.writeFileSync(path.join(out, 'site-settings-small-window.png'), (await main.capturePage()).toPNG());
      console.log(`Site settings captures: ${out}`);
      await click(main, 'Close site settings');
      main.setSize(1160,850); await wait(200);
      const wave = Buffer.alloc(44 + 16000);
      wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
      wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
      wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
      wave.write('data', 36); wave.writeUInt32LE(16000, 40);
      for(let i=0;i<8000;i++) wave.writeInt16LE(Math.round(100*Math.sin(i*2*Math.PI*220/8000)), 44+i*2);
      await views[0].webContents.executeJavaScript(`window.testAudio=new Audio('data:audio/wav;base64,${wave.toString('base64')}');testAudio.loop=true;testAudio.play();undefined`, true);
      await wait(1200);
      assert(views[0].webContents.isCurrentlyAudible(), 'Audio playback was not detected');
      assert(await evaluate(main, `!!document.querySelector('.tab-media-button[title="Playing audio · Mute site"]')`), 'Audio indicator missing');
      await click(main, 'Mute site'); await wait(200);
      assert(views[0].webContents.isAudioMuted(), 'Mute control did not mute the website');
      assert(await evaluate(main, `!!document.querySelector('.tab-media-button[title="Site muted"]')`), 'Muted indicator missing');
      assert(saved.getSiteSettings('personal', url).muted);
      await click(main, 'Unmute site'); await wait(200);
      assert(!views[0].webContents.isAudioMuted(), 'Unmute control did not unmute the website');
      await views[0].webContents.executeJavaScript('testAudio.pause();undefined');
      await wait(500);
      assert(await evaluate(main, `document.querySelectorAll('.tab-media-button').length===0`), 'Media indicator remained after playback stopped');
      console.log('PASS: responsive site settings dialog, HTTP connection details, reversing blocked permissions, profile isolation, real audio playback indicator, mute/unmute and media stop');
      Object.values(windows).forEach(win => win.close()); server.close(); app.quit(); return;
    }
    await views[0].webContents.executeJavaScript(
      "document.cookie='account=personal;path=/'"
    );
    assert.equal(
      await views[1].webContents.executeJavaScript('document.cookie'),
      'account=personal'
    );
    assert.equal(
      await views[2].webContents.executeJavaScript('document.cookie'),
      ''
    );
    if (process.argv.includes('--popup-only')) {
      const fixture=path.join(runtimeDir,'popup-extension');fs.mkdirSync(fixture);
      fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'KudiumBrowser Popup Test',version:'1.0',permissions:['storage','tabs'],action:{default_title:'Popup test',default_popup:'popup.html'}}));
      fs.writeFileSync(path.join(fixture,'popup.html'),`<!doctype html><style>body{box-sizing:border-box;width:320px;height:220px;margin:0;padding:20px;font:14px system-ui}input{display:block;width:260px;margin:8px 0;padding:8px}button{padding:8px 16px}</style><label for="note">Note</label><input id="note"><button id="save">Save</button><button id="info">Open help</button><p id="result"></p><script src="popup.js"></script>`);
      fs.writeFileSync(path.join(fixture,'popup.js'),`document.querySelector('#save').onclick=async()=>{await chrome.storage.local.set({note:document.querySelector('#note').value});document.querySelector('#result').textContent='Saved'};document.querySelector('#info').onclick=()=>chrome.tabs.create({url:${JSON.stringify(url.replace('127.0.0.1','localhost')+'/extension-help')}});`);
      const manager=require(path.join(runtimeDir,'extensions.js'));
      const extension=await views[0].webContents.session.extensions.loadExtension(fixture);
      await wait(500);
      let actionPopup;
      manager.getExtensionProfile('personal').api.once('browser-action-popup-created',popup=>{actionPopup=popup;});
      const point=await evaluate(main,`(()=>{const button=document.querySelector('browser-action-list').shadowRoot.querySelector('button.action');const rect=button.getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2),region:getComputedStyle(button).webkitAppRegion};})()`);
      assert.equal(point.region,'no-drag','Extension icon overlaps the native window drag region');
      main.focus();main.webContents.focus();
      main.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
      main.webContents.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});
      main.webContents.sendInputEvent({type:'mouseUp',x:point.x,y:point.y,button:'left',clickCount:1});
      for(let i=0;i<30&&!actionPopup;i++)await wait(100);
      assert(actionPopup,`Physical toolbar click failed (app-region: ${point.region})`);
      await actionPopup.whenReady();await wait(250);
      const popup=actionPopup.browserWindow;
      assert(popup && popup.isVisible(),'Extension popup is hidden');
      assert(popup.getBounds().width>=300 && popup.getBounds().height>=200,'Extension popup collapsed to an unusable size');
      assert.equal(popup.webContents.session,views[0].webContents.session);
      popup.focus();popup.webContents.focus();
      const inputPoint=await popup.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#note').getBoundingClientRect();return {x:Math.round(r.x+10),y:Math.round(r.y+10)}})()`);
      popup.webContents.sendInputEvent({type:'mouseDown',...inputPoint,button:'left',clickCount:1});popup.webContents.sendInputEvent({type:'mouseUp',...inputPoint,button:'left',clickCount:1});
      await popup.webContents.insertText('works');
      const buttonPoint=await popup.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#save').getBoundingClientRect();return {x:Math.round(r.x+10),y:Math.round(r.y+10)}})()`);
      popup.webContents.sendInputEvent({type:'mouseDown',...buttonPoint,button:'left',clickCount:1});popup.webContents.sendInputEvent({type:'mouseUp',...buttonPoint,button:'left',clickCount:1});await wait(150);
      assert.equal(await popup.webContents.executeJavaScript(`document.querySelector('#result').textContent`),'Saved');
      assert.equal(await popup.webContents.executeJavaScript(`chrome.storage.local.get('note').then(value=>value.note)`),'works');
      assert.equal(await views[2].webContents.session.extensions.getAllExtensions().some(item=>item.id===extension.id),false);
      fs.writeFileSync(path.join(out,'extension-popup.png'),(await popup.capturePage()).toPNG());
      const helpPoint=await popup.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#info').getBoundingClientRect();return {x:Math.round(r.x+10),y:Math.round(r.y+10)}})()`);
      popup.webContents.sendInputEvent({type:'mouseDown',...helpPoint,button:'left',clickCount:1});popup.webContents.sendInputEvent({type:'mouseUp',...helpPoint,button:'left',clickCount:1});
      await wait(300);
      const helpWindow=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/extension-help'));
      assert(helpWindow && helpWindow.isVisible(),'Extension-created help page did not open its own window');
      assert.equal(helpWindow.webContents.session,views[0].webContents.session);
      assert.notEqual(helpWindow.webContents.session,views[2].webContents.session);
      assert.equal(helpWindow.webContents.getLastWebPreferences().sandbox,true);
      helpWindow.close();
      if(!actionPopup.isDestroyed()) actionPopup.destroy();
      const installedPath=process.env.KUDIUMBROWSER_TEST_INSTALLED_EXTENSION;
      if(installedPath) {
        const workerErrors=[];
        views[0].webContents.session.serviceWorkers.on('console-message',(_event,details)=>{if(details.level>=3)workerErrors.push(details.message);});
        const installed=await views[0].webContents.session.extensions.loadExtension(installedPath);
        await wait(500);
        let installedPopup;
        manager.getExtensionProfile('personal').api.once('browser-action-popup-created',popup=>{installedPopup=popup;});
        const installedPoint=await evaluate(main,`(()=>{const button=document.querySelector('browser-action-list').shadowRoot.querySelector('#${installed.id}');const r=button.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
        main.focus();main.webContents.focus();
        main.webContents.sendInputEvent({type:'mouseDown',...installedPoint,button:'left',clickCount:1});main.webContents.sendInputEvent({type:'mouseUp',...installedPoint,button:'left',clickCount:1});
        for(let i=0;i<20&&!installedPopup;i++)await wait(100);
        assert(installedPopup,'Installed extension failed to open a popup');
        await installedPopup.whenReady();await wait(300);
        assert(installedPopup.browserWindow.isVisible(),'Installed extension popup is hidden');
        console.log('Installed extension popup',installed.name,installedPopup.browserWindow.getBounds());
        console.log('Installed extension worker errors',workerErrors);
        fs.writeFileSync(path.join(out,'installed-extension-popup.png'),(await installedPopup.browserWindow.capturePage()).toPNG());
        installedPopup.destroy();
      }
      console.log('PASS: physical extension toolbar click, separate popup window, input, button action and profile storage');
      console.log(`UI captures: ${out}`);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    if (process.argv.includes('--split-only')) {
      // Drag the work account onto the right, preserving both profiles.
      await evaluate(main, `window.splitDrag=new DataTransfer();Array.from(document.querySelectorAll('.sidebar-app')).find(row=>row.textContent.includes('Facebook · Work')).dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.splitDrag}));undefined`);
      await wait(200);
      assert.equal(await evaluate(main, `document.querySelectorAll('.split-drop-target').length`),2);
      await evaluate(main, `document.querySelectorAll('.split-drop-target')[1].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.splitDrag}));undefined`);
      await wait(300);
      assert.equal(await evaluate(main, `document.querySelectorAll('.pane-tab-strip').length`),2);
      assert.equal(await evaluate(main, `document.querySelector('[data-pane="left"] .horizontal-tabs').children.length`),2);
      assert.equal(await evaluate(main, `document.querySelector('[data-pane="right"] .horizontal-tabs').children.length`),1);
      const visible=views.filter(view=>view.getVisible());
      assert.equal(visible.length,2);
      assert.equal(views[0].getBounds().width,views[2].getBounds().width);
      assert(views[0].getBounds().x<views[2].getBounds().x);
      await evaluate(main, `document.getElementById('page-tab-left-personal-messages').click();undefined`);
      await wait(200);
      assert(views[1].getVisible() && views[2].getVisible() && !views[0].getVisible());
      // Clicking the native website changes the active tab strip and address.
      const point = { x: 10, y: 10 };
      views[2].webContents.focus();
      views[2].webContents.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});
      views[2].webContents.sendInputEvent({type:'mouseUp',x:point.x,y:point.y,button:'left',clickCount:1});
      await wait(200);
      assert.equal(await evaluate(main, `document.querySelector('.pane-tab-strip.focused').dataset.pane`),'right');
      assert.equal(await evaluate(main, `JSON.parse(localStorage.getItem('kudiumbrowser-spaces')).find(space=>space.id==='default').selectedAppId`),'work-home');
      // Native shortcuts cycle only the focused account's tabs.
      await evaluate(main, `document.getElementById('page-tab-left-personal-messages').click();undefined`);
      views[1].webContents.focus();
      views[1].webContents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:['control']});
      await wait(200);
      assert(views[0].getVisible() && views[2].getVisible());
      // New tab starts in the chosen side's account.
      await evaluate(main, `document.querySelector('[data-pane="right"] button[aria-label="New tab in current session"]').click();undefined`);
      await wait(150);
      await input(main, 'input[aria-label="Search tabs or enter a website"]', url+'/work-extra');
      await wait(100);
      await evaluate(main, `document.querySelector('.command-dialog form').requestSubmit();undefined`);
      await wait(400);
      const extra=await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.url.endsWith('/work-extra'))`);
      assert(extra && extra.sessionId==='work');
      const extraView=main.contentView.children.find(view=>view.webContents?.getURL().endsWith('/work-extra'));
      assert(extraView && extraView.webContents.session===views[2].webContents.session);
      assert.equal(await views[0].webContents.executeJavaScript('document.cookie'),'account=personal');
      assert.equal(await evaluate(main, `document.querySelector('[data-pane="right"] .horizontal-tabs').children.length`),2);
      assert(views[0].getVisible());
      fs.writeFileSync(path.join(out,'independent-split-tabs.png'),(await main.capturePage()).toPNG());
      main.setSize(760,600);await wait(200);
      assert(await evaluate(main, `(()=>{const root=document.querySelector('.workspace');return root.scrollWidth<=root.clientWidth+1;})()`));
      main.setSize(1160,850);await wait(150);
      // Closing a pane returns the other side to the full website width.
      await evaluate(main, `document.querySelector('button[aria-label="Close right pane"]').click();undefined`);
      await wait(200);
      assert.equal(main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session && view.getVisible()).length,1);
      assert.equal(await evaluate(main, `document.querySelectorAll('.pane-tab-strip').length`),0);
      console.log('PASS: drag-to-side, independent pane tabs, native focus, account-specific new tabs, shortcuts and closing panes');
      console.log(`UI captures: ${out}`);
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
    views[0].webContents.focus();
    views[0].webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'Tab',
      modifiers: ['control'],
    });
    await wait(200);
    assert(
      await evaluate(
        main,
        "document.querySelector('#page-tab-personal-messages').getAttribute('aria-selected') === 'true'"
      )
    );
    views[1].webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'Tab',
      modifiers: ['control', 'shift'],
    });
    await wait(200);
    await input(
      main,
      'input[aria-label="Website address"]',
      `${url}/address-check`
    );
    await evaluate(
      main,
      `document.querySelector('input.location-label').closest('form').requestSubmit();undefined`
    );
    for (let attempt = 0; attempt < 40 && !views[0].webContents.getURL().endsWith('/address-check'); attempt += 1) await wait(50);
    assert(views[0].webContents.getURL().endsWith('/address-check'), `Expected address navigation, got ${views[0].webContents.getURL()}`);
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.horizontal-tab').length`
      ),
      2
    );
    const headerCenters = await evaluate(
      main,
      `['Collapse sidebar','Back','Forward','Reload'].map(label=>{const rect=document.querySelector('button[aria-label="'+label+'"]').getBoundingClientRect();return rect.y+rect.height/2;})`
    );
    assert(headerCenters.every((center) => Math.abs(center - 20) < 0.1));
    if (process.platform === 'darwin')
      assert.deepEqual(main.getWindowButtonPosition(), { x: 12, y: 13 });
    for (const appearance of ['light', 'dark']) {
      await evaluate(
        main,
        `localStorage.setItem('kudiumbrowser-appearance','${appearance}');window.dispatchEvent(new Event('kudiumbrowser-appearance-change'));undefined`
      );
      await wait(150);
      await evaluate(
        main,
        `(()=>{const item=document.querySelector('.sidebar-apps .sidebar-app');const rect=item.getBoundingClientRect();item.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:rect.x+20,clientY:rect.y+20}));})();undefined`
      );
      await wait(150);
      assert(nativeContextMenu instanceof Menu);
      assert(nativeContextMenu.items.some(item=>item.label==='Rename Session'));
      assert(nativeContextMenu.items.find(item=>item.label==='Move to Space').submenu.items.length>0);
      assert.equal(await evaluate(main, `document.querySelectorAll('.rt-BaseMenuContent').length`),0);
      if(appearance==='light') {
        const renameAction = nativeContextMenu.items.find(item=>item.label==='Rename Session');
        renameAction.click();
        nativeContextMenu.closePopup(main);
        main.focus();
        main.webContents.focus();
        await wait(150);
        assert(await evaluate(main, `(()=>{const input=document.querySelector('.inline-tab-name');const style=getComputedStyle(input);return style.backgroundColor==='rgba(0, 0, 0, 0)' && style.borderTopWidth==='0px' && style.outlineStyle==='none';})()`));
        await evaluate(main, `document.querySelector('.inline-tab-name').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);
      } else nativeContextMenu.closePopup(main);
      await wait(100);

    }
    // At minimum width, every navigation control must fit inside the sidebar.
    await evaluate(main, `document.querySelector('.sidebar-resize-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));undefined`);
    await wait(150);
    assert(await evaluate(main, `(()=>{
      const sidebar=document.querySelector('.workspace-sidebar').getBoundingClientRect();
      const buttons=Array.from(document.querySelectorAll('.sidebar-navigation button'));
      return buttons.every(button=>{const rect=button.getBoundingClientRect();return rect.left>=sidebar.left && rect.right<=sidebar.right;}) &&
        document.querySelector('.sidebar-resize-handle').getBoundingClientRect().top>=40;
    })()`));
    const reloads = await views[0].webContents.executeJavaScript('window.performance.timeOrigin');
    const reloadButton = await evaluate(main, `(()=>{const rect=document.querySelector('button[aria-label="Reload"]').getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};})()`);
    main.webContents.sendInputEvent({type:'mouseDown',...reloadButton,button:'left',clickCount:1});
    main.webContents.sendInputEvent({type:'mouseUp',...reloadButton,button:'left',clickCount:1});
    await wait(300);
    assert((await views[0].webContents.executeJavaScript('window.performance.timeOrigin'))>reloads);
    assert.equal(await evaluate(main, `localStorage.getItem('kudiumbrowser-sidebar-width')`),'240');
    await evaluate(main, `document.querySelector('.sidebar-resize-handle').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);
    await wait(350);
    // Resize across the native website region, then collapse/restore and reset.
    main.focus();
    main.webContents.focus();
    const sidebarEdge = await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().right-2`);
    main.webContents.sendInputEvent({type:'mouseDown',x:Math.round(sidebarEdge),y:250,button:'left',clickCount:1});
    await wait(150);
    main.webContents.sendInputEvent({type:'mouseMove',x:418,y:250});
    await wait(100);
    main.webContents.sendInputEvent({type:'mouseUp',x:418,y:250,button:'left',clickCount:1});
    await wait(200);
    const resizedWidth = await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`);
    assert.equal(resizedWidth,420);
    assert.equal(await evaluate(main, `localStorage.getItem('kudiumbrowser-sidebar-width')`),'420');
    assert.equal(views[0].getBounds().x,420);
    await evaluate(main, `document.querySelector('button[aria-label="Collapse sidebar"]').click();undefined`);
    await wait(350);
    assert.equal(await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`),76);
    await evaluate(main, `document.querySelector('button[aria-label="Expand sidebar"]').click();undefined`);
    await wait(350);
    assert.equal(await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`),420);
    await evaluate(main, `document.querySelector('.sidebar-resize-handle').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);
    await wait(350);
    assert.equal(await evaluate(main, `document.querySelector('.workspace-sidebar').getBoundingClientRect().width`),300);
    await evaluate(
      main,
      `localStorage.setItem('kudiumbrowser-appearance','light');window.dispatchEvent(new Event('kudiumbrowser-appearance-change'));undefined`
    );
    await wait(150);
    fs.writeFileSync(
      path.join(out, 'kudiumbrowser-hybrid.png'),
      (await main.capturePage()).toPNG()
    );
    const beforeCommandWindows = BrowserWindow.getAllWindows().length;
    await evaluate(main, `document.querySelector('button[aria-label="New tab"]').click();undefined`);
    await wait(150);
    assert(await evaluate(main, `!!document.querySelector('.smart-command')`));
    assert.equal(BrowserWindow.getAllWindows().length,beforeCommandWindows);
    await evaluate(main, `document.querySelector('input[aria-label="Search tabs or enter a website"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);
    await wait(150);
    views[0].webContents.focus();
    views[0].webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'T',
      modifiers: ['meta'],
    });
    await wait(500);
    assert(await evaluate(main, `!!document.querySelector('[role="dialog"]')`));
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.browser-snapshot').length`
      ),
      1
    );
    fs.writeFileSync(
      path.join(out, 'kudiumbrowser-command.png'),
      (await main.capturePage()).toPNG()
    );
    await input(
      main,
      'input[aria-label="Search tabs or enter a website"]',
      url + '/another'
    );
    await wait(100);
    await evaluate(
      main,
      `document.querySelector('.command-dialog form').requestSubmit();undefined`
    );
    await wait(500);
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.horizontal-tab').length`
      ),
      3
    );
    assert.equal(
      await evaluate(
        main,
        `JSON.parse(localStorage.getItem('user_apps')).at(-1).sessionId`
      ),
      'personal'
    );
    assert.equal(
      await evaluate(
        main,
        `document.querySelectorAll('.sidebar-apps .sidebar-app').length`
      ),
      2
    );
    await createSpace(main);
    await wait(200);
    await input(main, 'input[aria-label="Space name"]', 'Side project');
    await wait(100);
    await evaluate(
      main,
      `document.querySelector('[role="dialog"] form').requestSubmit();undefined`
    );
    await wait(400);
    assert.equal(
      await evaluate(
        main,
        `JSON.parse(localStorage.getItem('kudiumbrowser-spaces')).length`
      ),
      3
    );
    const add = await create('add-app', 540, 760);
    assert(
      (await evaluate(add, 'document.body.innerText')).includes('Edit session')
    );
    await wait(150);
    assert(
      await evaluate(
        add,
        `document.querySelector('#app-url').getBoundingClientRect().height>0`
      )
    );
    fs.writeFileSync(
      path.join(out, 'kudiumbrowser-custom.png'),
      (await add.capturePage()).toPNG()
    );
    const settings = await create('settings', 1080, 800);
    assert(await evaluate(settings, `!!document.querySelector('.preferences-navigation') && !!document.querySelector('input[aria-label="Search settings"]')`));
    fs.writeFileSync(path.join(out,'preferences-search.png'),(await settings.capturePage()).toPNG());
    await input(settings,'input[aria-label="Search settings"]','Allow sites to open tabs');
    await evaluate(settings, `document.querySelector('button[role="switch"]').click();undefined`);
    await wait(150);
    assert.equal((await evaluate(settings, `window.electron.browser.preferences('get')`)).allowPopups,false);
    await evaluate(settings, `document.querySelector('button[role="switch"]').click();undefined`);
    await wait(150);
    await tab(settings, 'Sessions');
    await wait(100);
    assert(await evaluate(settings, `(()=>{
      const list=document.querySelector('.app-list');
      const row=list.querySelector('.app-row');
      for(let i=0;i<25;i++)list.appendChild(row.cloneNode(true));
      const main=document.querySelector('.preferences-main');
      const sidebar=document.querySelector('.preferences-sidebar');
      const sidebarTop=sidebar.getBoundingClientRect().top;
      if(main.scrollHeight<=main.clientHeight)return false;
      list.lastElementChild.scrollIntoView({block:'end'});
      const last=list.lastElementChild.getBoundingClientRect();
      const bounds=main.getBoundingClientRect();
      return main.scrollTop>0 && last.bottom<=bounds.bottom+1 && last.top>=bounds.top && sidebar.getBoundingClientRect().top===sidebarTop;
    })()`));
    await evaluate(settings, `document.querySelector('.preferences-main').scrollTop=0;undefined`);
    await tab(settings, 'Spaces');
    await wait(150);
    assert(
      await evaluate(
        settings,
        `!!document.querySelector('input[aria-label="Rename Side project"]')`
      )
    );
    fs.writeFileSync(
      path.join(out, 'kudiumbrowser-spaces.png'),
      (await settings.capturePage()).toPNG()
    );
    await tab(settings, 'Appearance');
    await wait(150);
    await evaluate(
      settings,
      `Array.from(document.querySelectorAll('[role="radio"]')).find(el=>el.textContent.includes('Dark')).click();undefined`
    );
    await wait(200);
    assert(
      await evaluate(
        settings,
        `document.querySelector('.radix-themes').classList.contains('dark')`
      )
    );
    fs.writeFileSync(
      path.join(out, 'kudiumbrowser-appearance-dark.png'),
      (await settings.capturePage()).toPNG()
    );
    settings.setSize(760,600);
    for(const page of ['Sessions','Spaces','Appearance']) {
      await tab(settings,page);
      await wait(100);
      assert(await evaluate(settings, `(()=>{const panel=document.querySelector('.preferences-main');return panel.scrollWidth<=panel.clientWidth+1 && document.querySelector('.preferences-sidebar').getBoundingClientRect().right<=panel.getBoundingClientRect().left+1;})()`),`Preferences overflow at narrow size: ${page}`);
    }
    fs.writeFileSync(path.join(out,'preferences-narrow.png'),(await settings.capturePage()).toPNG());
    settings.setSize(1080,800);
    if (process.env.KUDIUMBROWSER_SMOKE_OUTPUT) {
      const catalog = require('../fixtures/sidebar-preview-apps.json');
      const icon = (slug) =>
        catalog.find((item) => item.slug === slug)?.iconFilled128Png || '';
      const favoriteSlugs = [
        'chatgpt',
        'make',
        'codepen',
        'youtube-music',
        'whatsapp',
        'youtube',
        'github',
        'gmail',
        'google-calendar',
      ];
      const favoriteTabs = favoriteSlugs.map((slug, index) => ({
        id: `preview-favorite-${index}`,
        name: catalog.find((item) => item.slug === slug)?.name || slug,
        sessionName: slug,
        sessionId: `preview-${slug}`,
        url: `${url}/${slug}`,
        icon: icon(slug),
        spaceId: 'default',
        favorite: true,
        pinned: true,
      }));
      const rows = [
        { name: 'Private AI Inference', icon: icon('make'), pinned: true },
        { name: 'Wimi for macOS', icon: icon('github'), pinned: true },
        {
          name: 'Automate Web Requests',
          icon: icon('make'),
          folderId: 'webhooks',
          pinned: true,
        },
        {
          name: 'WAT to EDT Converter',
          icon: icon('google-calendar'),
          folderId: 'converters',
          pinned: true,
        },
        {
          name: 'An open letter to the web',
          icon: icon('reddit'),
          pinned: false,
        },
        {
          name: 'Reddit — a new conversation',
          icon: icon('youtube'),
          pinned: false,
        },
        {
          name: 'Build 5bee0087 — kudiumbrowser',
          icon: icon('github'),
          pinned: false,
        },
      ].map((item, index) => ({
        ...item,
        id: `preview-row-${index}`,
        sessionId: `preview-row-${index}`,
        url: `${url}/preview-${index}`,
        spaceId: 'default',
      }));
      await evaluate(
        main,
        `localStorage.setItem('user_apps',${JSON.stringify(
          JSON.stringify([...favoriteTabs, ...rows])
        )});localStorage.setItem('kudiumbrowser-active-space','default');localStorage.setItem('kudiumbrowser-appearance','dark');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(
          JSON.stringify([
            {
              id: 'default',
              name: 'Simpro',
              color: 'iris',
              folders: [
                { id: 'webhooks', name: 'Webhooks' },
                { id: 'converters', name: 'Converters' },
              ],
              selectedAppId: 'preview-favorite-0',
            },
            { id: 'work', name: 'Work', color: 'blue', folders: [] },
          ])
        )});undefined`
      );
      main.reload();
      await wait(1700);
      const sidebar = await main.capturePage({
        x: 0,
        y: 0,
        width: 300,
        height: 850,
      });
      fs.writeFileSync(
        path.join(out, 'kudiumbrowser-sidebar-refined.png'),
        sidebar.toPNG()
      );
    }
    main.focus();
    main.webContents.focus();
    // Different origins must create a sidebar session, even from the horizontal plus.
    await evaluate(main, `document.querySelector('button[aria-label="New tab in current session"]').click();undefined`);
    await wait(200);
    await input(main, 'input[aria-label="Search tabs or enter a website"]', url.replace('127.0.0.1', 'localhost') + '/isolated');
    await evaluate(main, `document.querySelector('.command-dialog form').requestSubmit();undefined`);
    await wait(700);
    const created = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).at(-1)`);
    assert(created.sessionId && created.pinned);
    assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 1);
    assert.equal(created.name, 'Home');
    await evaluate(main, `document.querySelector('.horizontal-tab-select').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);
    await wait(100);
    assert(await evaluate(main, `document.activeElement.matches('.inline-tab-name')`));
    await input(main, '.horizontal-tab .inline-tab-name', 'My page');
    await evaluate(main, `document.querySelector('.inline-tab-name').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));undefined`);
    await wait(100);
    assert.equal(await evaluate(main, `document.querySelector('.horizontal-tab-select').textContent`), 'My page');
    await evaluate(main, `document.querySelector('.sidebar-app[aria-current="page"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);
    await wait(100);
    await evaluate(main, `document.querySelector('.sidebar-app .inline-tab-name').focus();undefined`);
    await input(main, '.sidebar-app .inline-tab-name', 'My account');
    await evaluate(main, `document.querySelector('.inline-tab-name').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));undefined`);
    await wait(100);
    assert.equal(await evaluate(main, `document.querySelector('.sidebar-app[aria-current="page"] strong').textContent`), 'My account');
    await evaluate(main, `document.querySelector('.horizontal-tab-select').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));undefined`);
    await wait(100);
    await input(main, '.horizontal-tab .inline-tab-name', 'Cancel this');
    await evaluate(main, `document.querySelector('.inline-tab-name').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);
    await wait(100);
    assert.equal(await evaluate(main, `document.querySelector('.horizontal-tab-select').textContent`), 'My page');
    assert(await evaluate(main, `!!document.querySelector('.browser-actions button[aria-label="Browser Preferences"]') && !!document.querySelector('.browser-actions button[aria-label="Toggle AI sidebar"]')`));
    assert(await evaluate(main, `!!document.querySelector('button[aria-label="Browser Preferences"] svg') && !document.querySelector('button[aria-label="Browser Preferences"] span')`));
    assert(await evaluate(windows.settings, `!!document.querySelector('input[aria-label="Search settings"]')`));
    // Cancelling an account change must leave the tab in its original profile.
    const cancelSource = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.id===document.querySelector('[role="tab"][aria-selected="true"]').id.replace('page-tab-',''))`);
    require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:0});
    await evaluate(main, `window.cancelTransfer=new DataTransfer();document.querySelector('.horizontal-tab').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.cancelTransfer}));undefined`);
    await wait(100);
    await evaluate(main, `document.querySelector('.session-drop-zone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.cancelTransfer}));undefined`);
    await wait(200);
    assert.equal(await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.id===${JSON.stringify(cancelSource.id)}).sessionId`),cancelSource.sessionId);
    require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:1});
    // HTML drag/drop detaches the selected page into a new cookie partition.
    const beforeDrag = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).at(-1)`);
    await evaluate(main, `window.smokeTransfer=new DataTransfer();document.querySelector('.horizontal-tab').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.smokeTransfer}));undefined`);
    await wait(100);
    assert(await evaluate(main, `!!document.querySelector('.session-drop-zone')`));
    await evaluate(main, `document.querySelector('.session-drop-zone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.smokeTransfer}));undefined`);
    await wait(500);
    const detached = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).at(-1)`);
    assert.notEqual(detached.sessionId, beforeDrag.sessionId);
    assert.equal(detached.customName, 'My page');
    await evaluate(main, `(()=>{const apps=JSON.parse(localStorage.getItem('user_apps'));apps.push({id:'merge-target',name:'Target page',sessionName:'Target account',url:${JSON.stringify(url.replace('127.0.0.1','localhost') + '/target-account')},icon:'',sessionId:'merge-target',spaceId:apps.find(item=>item.id===${JSON.stringify(detached.id)}).spaceId,pinned:true});localStorage.setItem('user_apps',JSON.stringify(apps));})();undefined`);
    main.reload();
    await wait(900);
    // Lazy restored sessions load only when selected.
    const sourceSessionLabel = await evaluate(main, `document.querySelector('.sidebar-app[aria-current="page"] strong').textContent`);
    await evaluate(main, `Array.from(document.querySelectorAll('.sidebar-app')).find(row=>row.textContent.includes('Target account')).click();undefined`);
    for (let attempt=0;attempt<60 && !main.contentView.children.some(view=>view.webContents?.getURL().endsWith('/target-account'));attempt+=1) await wait(50);
    const targetView = main.contentView.children.find(view => view.webContents?.getURL().endsWith('/target-account'));
    assert(targetView);
    await wait(300);
    await targetView.webContents.executeJavaScript("document.cookie='account=target;path=/'");
    await evaluate(main, `Array.from(document.querySelectorAll('.sidebar-app')).find(row=>row.querySelector('strong')?.textContent===${JSON.stringify(sourceSessionLabel)}).click();undefined`);
    await wait(200);
    await evaluate(main, `window.smokeTransfer=new DataTransfer();document.querySelector('.horizontal-tab').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.smokeTransfer}));undefined`);
    await wait(100);
    await evaluate(main, `Array.from(document.querySelectorAll('.sidebar-app')).find(row=>row.textContent.includes('Target account')).dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.smokeTransfer}));undefined`);
    await wait(600);
    const merged = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).find(item=>item.id===${JSON.stringify(detached.id)})`);
    assert.equal(merged.sessionId, 'merge-target');
    assert.equal(await evaluate(main, `document.querySelectorAll('.horizontal-tab').length`), 2);
    const mergedViews = main.contentView.children.filter(view => view.webContents?.session === targetView.webContents.session);
    assert.equal(mergedViews.length, 2);
    for (const view of mergedViews) assert((await view.webContents.executeJavaScript('document.cookie')).includes('account=target'));
    main.setSize(760,600);
    await wait(150);
    assert(await evaluate(main, `(()=>{const shell=document.querySelector('.workspace');const viewport=document.querySelector('.browser-viewport').getBoundingClientRect();return shell.scrollWidth<=shell.clientWidth+1 && viewport.width>0 && viewport.right<=window.innerWidth+1 && viewport.bottom<=window.innerHeight+1;})()`),'Workspace overflows at narrow window size');
    // Check the website's viewport itself, not just the renderer's placeholder.
    const verifyWebsiteViewport = async () => {
      const bounds = await evaluate(main, `(()=>{const r=document.querySelector('.browser-viewport').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
      const visibleViews = main.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.session !== main.webContents.session && view.getVisible());
      assert.equal(visibleViews.length, 1);
      const view = visibleViews[0];
      const nativeBounds = view.getBounds();
      assert(Math.abs(nativeBounds.width - bounds.width) <= 1, 'Website view does not match available width');
      assert(Math.abs(nativeBounds.x - bounds.x) <= 1, 'Website view has stale sidebar offset');
      const metrics = await view.webContents.executeJavaScript(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,zoom:devicePixelRatio,compact:matchMedia('(max-width:600px)').matches})`);
      assert(Math.abs(metrics.width - nativeBounds.width / view.webContents.getZoomFactor()) <= 1, 'Website layout viewport does not match native view');
      assert(metrics.scrollWidth <= metrics.width + 1, 'Responsive website scrolls horizontally');
      assert.equal(metrics.compact, metrics.width <= 600, 'Website responsive breakpoint is incorrect');
    };
    await verifyWebsiteViewport();
    await evaluate(main, `document.querySelector('button[aria-label="Collapse sidebar"]').click();undefined`);
    await wait(200);
    await verifyWebsiteViewport();
    await evaluate(main, `document.querySelector('button[aria-label="Expand sidebar"]').click();undefined`);
    main.setSize(1160,850);
    await wait(200);
    await verifyWebsiteViewport();
    // The store lives in the workspace and repeated requests reuse its app.
    const extensionManager = require(path.join(runtimeDir, 'extensions.js'));
    const windowCount = BrowserWindow.getAllWindows().length;
    extensionManager.extensionMenu(main).find(item => item.label === 'Chrome Web Store…').click();
    await wait(500);
    const firstStore = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).filter(item=>item.url==='https://chromewebstore.google.com/')`);
    assert.equal(firstStore.length, 1);
    assert(firstStore[0].extensionInstallTarget);
    extensionManager.extensionMenu(main).find(item => item.label === 'Chrome Web Store…').click();
    await wait(500);
    const repeatedStore = await evaluate(main, `JSON.parse(localStorage.getItem('user_apps')).filter(item=>item.url==='https://chromewebstore.google.com/')`);
    assert.equal(repeatedStore.length, 1);
    assert.equal(repeatedStore[0].id, firstStore[0].id);
    assert.equal(BrowserWindow.getAllWindows().length, windowCount);
    console.log(
      'PASS: hybrid session groups, horizontal pages, cookie sharing/isolation, native shortcuts, aligned header, native menus/submenus, overlay snapshots, new tabs, space creation, custom form, spaces settings and dark appearance'
    );
    console.log(`UI captures: ${out}`);
    Object.values(windows).forEach((win) => win.close());
    server.close();
    app.quit();
  })
  .catch((err) => {
    console.error(err);
    app.exit(1);
  });
setTimeout(() => {
  console.error('UI check timed out');
  app.exit(1);
}, process.argv.includes('--sign-in-only') ? 150000 : process.argv.includes('--compatibility-only') ? 120000 : (process.argv.includes('--real-sites-only') || process.argv.includes('--kuditrust-only')) ? (process.argv.includes('--inspect') ? 600000 : 240000) : nativePrivateDialogs?180000:(process.argv.includes('--compact-tab-preview-only') || process.argv.includes('--website-tabs-only') || process.argv.includes('--opener-flow-only')) ? 45000 : 30000).unref();

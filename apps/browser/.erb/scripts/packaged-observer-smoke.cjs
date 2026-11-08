/* Test-only trusted ASAR observer; no production debugging exception. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),asar=require('@electron/asar'),plist=require('plist');
const root=path.resolve(__dirname,'../..'),appPath=path.resolve(process.argv[2]||'');
assert.equal(process.platform,'darwin');assert(appPath.endsWith('.app')&&fs.existsSync(appPath));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-packaged-observer-'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const observer=String.raw`
const fs=require('fs'),path=require('path'),http=require('http');
const {app,webContents}=require('electron');
const directory=process.env.KUDIUMBROWSER_TEST_PROFILE,result=process.env.KUDIUMBROWSER_TEST_RESULT;
app.setPath('userData',directory);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(read,label)=>{const deadline=Date.now()+12000;while(Date.now()<deadline){if(await read())return;await wait(25)}throw new Error('Timed out: '+label)};
let host;
app.on('browser-window-created',(_event,window)=>{if(host)return;host=window;host.webContents.once('did-finish-load',()=>run().catch(error=>{console.error(error);app.exit(1)}));});
async function run(){
 const evaluate=code=>host.webContents.executeJavaScript(code);
 await until(()=>evaluate("!!document.querySelector('.workspace') && typeof window.electron?.browser?.preferences==='function'"),'workspace and preload');
 const preferences=await evaluate("window.electron.browser.preferences('update',{spellcheck:false,permissions:'block'})");
 if(preferences.permissions!=='block'||JSON.parse(fs.readFileSync(path.join(directory,'browser-preferences.json'))).permissions!=='block')throw new Error('Preference persistence failed');
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Packaged local fixture</title><h1>Local page</h1><script>window.fixtureRan=true</script>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/fixture';
  const item={id:'packaged-fixture',name:'Packaged fixture',url,icon:'',sessionId:'packaged-profile',sessionName:'Fixture',sessionSlug:'fixture',spaceId:'default'};
  await evaluate("localStorage.setItem('user_apps',"+JSON.stringify(JSON.stringify([item]))+");localStorage.setItem('user_last_app_id','packaged-fixture');window.electron.ipcRenderer.sendMessage('ipc-event-bus',[{app_list_update:undefined}]);undefined");
  const page=()=>webContents.getAllWebContents().find(contents=>!contents.isDestroyed()&&contents.getURL()===url);
  await until(()=>!!page(),'website view');await until(()=>page().executeJavaScript('window.fixtureRan===true'),'website script');
  if(await page().executeJavaScript('typeof window.electron')!=='undefined')throw new Error('Website received privileged bridge');
  await until(async()=>{const rows=await evaluate("window.electron.browser.history('get')");return rows.some(row=>row.url===url)},'recorded history');
  await evaluate("window.electron.browser.history('clear')");
  if(fs.readFileSync(path.join(directory,'browsing-history.json'),'utf8')!=='[]')throw new Error('History worker did not persist clear');
  await evaluate("(()=>{const script=document.createElement('script');script.textContent='window.__packagedInjection=true';document.head.append(script);return true})()");
  await wait(150);if(await evaluate('window.__packagedInjection===true'))throw new Error('Inline injection executed');
  await evaluate("localStorage.setItem('user_apps','[]');window.electron.ipcRenderer.sendMessage('ipc-event-bus',[{app_list_update:undefined}]);undefined");
  await until(()=>!page(),'website cleanup');
  if(app.commandLine.hasSwitch('remote-debugging-port')||app.commandLine.hasSwitch('remote-debugging-pipe')||fs.existsSync(path.join(directory,'DevToolsActivePort')))throw new Error('Packaged debugging remained enabled');
  fs.writeFileSync(result,JSON.stringify({renderedPackagedWorkspace:true,trustedPreloadPreferences:true,nativeWebsiteView:true,websiteHasNoPrivilegedBridge:true,historyWorkerDurableClear:true,inlineScriptInjectionBlocked:true,tabCloseCleanup:true,noChromiumDebugging:true,runtime:process.versions}));
  host.close();app.quit();
 }finally{server.close()}
}
setTimeout(()=>{console.error('Packaged observer timed out');app.exit(1)},25000).unref();
require('./dist/main/main.js');
`;
async function run(){
 const original=path.join(appPath,'Contents/Resources/app.asar');
 const hashes=Object.fromEntries(['main/main.js','main/preload.js','renderer/renderer.js','renderer/index.html'].map(file=>{const digest=hash(asar.extractFile(original,'dist/'+file));assert.equal(digest,hash(fs.readFileSync(path.join(root,'release/app/dist',file))),file);return[file,digest]}));
 const fixture=path.join(temporary,'Observed.app');fs.cpSync(appPath,fixture,{recursive:true,verbatimSymlinks:true});
 assert(fs.realpathSync(path.join(fixture,'Contents/Frameworks/Electron Framework.framework/Electron Framework')).startsWith(fs.realpathSync(fixture)+path.sep));
 const source=path.join(temporary,'source');asar.extractAll(original,source);
 const manifestPath=path.join(source,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));manifest.main='observer.cjs';fs.writeFileSync(manifestPath,JSON.stringify(manifest));fs.writeFileSync(path.join(source,'observer.cjs'),observer);
 const archive=path.join(fixture,'Contents/Resources/app.asar');await asar.createPackage(source,archive);
 for(const[file,digest]of Object.entries(hashes))assert.equal(hash(asar.extractFile(archive,'dist/'+file)),digest);
 const infoPath=path.join(fixture,'Contents/Info.plist'),info=plist.parse(fs.readFileSync(infoPath,'utf8'));
 info.ElectronAsarIntegrity={'Resources/app.asar':{algorithm:'SHA256',hash:hash(asar.getRawHeader(archive).headerString)}};fs.writeFileSync(infoPath,plist.build(info));
 const sign=spawnSync('codesign',['--sign','-','--force','--preserve-metadata=entitlements,requirements,flags,runtime','--deep',fixture],{encoding:'utf8'});assert.equal(sign.status,0,sign.stderr);
 const directory=path.join(temporary,'profile');fs.mkdirSync(directory);const resultFile=path.join(temporary,'result.json');
 const child=spawnSync(path.join(fixture,'Contents/MacOS',info.CFBundleExecutable),['--user-data-dir='+directory,'--remote-debugging-port=0'],{env:{...process.env,NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:'',KUDIUMBROWSER_TEST_PROFILE:directory,KUDIUMBROWSER_TEST_RESULT:resultFile},encoding:'utf8',timeout:30000});
 assert.equal(child.status,0,(child.error?.message||'')+' '+child.stderr?.slice(-1800));assert(fs.existsSync(resultFile));
 const report={recordedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,probeSha256:hash(fs.readFileSync(__filename)),observerSha256:hash(observer),appAsarSha256:hash(fs.readFileSync(original)),instrumentedAsarSha256:hash(fs.readFileSync(archive)),productionEntries:hashes,checks:{currentProductionEntries:true,...JSON.parse(fs.readFileSync(resultFile))},exitCode:child.status,logSha256:hash((child.stdout||'')+(child.stderr||'')),method:'Test-only trusted bootstrap observer in a disposable rewrapped/ad-hoc ASAR copy. Main/preload/renderer/HTML bytes match actual package and current production build. No production code exception or external debugging transport; fixed renderer checks run from native main observer. Does not prove untouched shipped-package UI, trusted signing, pending quit flushing, native chooser/extension flows or platform parity.'};
 const output=path.join(root,'docs/benchmarks/packaged-security.json');if(fs.existsSync(output)){const{previousRuns=[],...previous}=JSON.parse(fs.readFileSync(output));report.previousRuns=[...previousRuns,previous]}
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('PASS: production payload UI/preload, website isolation, history worker, CSP and cleanup without Chromium debugging');
}
run().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));

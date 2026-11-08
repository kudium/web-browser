/* Actual removal handler, native cookie/storage deletion and process-restart retry. */
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process');
const {app,BrowserWindow,ipcMain,session}=require('electron');
app.on('window-all-closed',()=>{});
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'after',worker=process.argv[3]==='worker';assert(['before','after'].includes(phase));
const temporary=worker?process.argv[4]:fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-removal-boundary-'));
app.setPath('userData',path.join(temporary,'user-data'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceFile='src/main/groupRemoval.ts',source=()=>fs.readFileSync(path.join(root,phase==='before'?'docs/benchmarks/baselines/group-removal/groupRemoval.ts.txt':sourceFile),'utf8');
const handlers=new Map(),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>{handlers.set(name,fn);return handle(name,fn)};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
let owner,dispose,api,build,journalFolder;
const nativeGetPath=app.getPath.bind(app);app.getPath=name=>name==='userData'&&journalFolder?journalFolder:nativeGetPath(name);
globalThis.fixtureDialog=async()=>({response:1});
globalThis.fixtureHistory=async()=>{};
const outcome=p=>Promise.resolve(p).then(value=>({accepted:true,value}),error=>({accepted:false,error:error.message}));
async function load(){
 await app.whenReady();fs.mkdirSync(app.getPath('userData'),{recursive:true});
 const bundle=worker?process.argv[6]:path.join(temporary,'fixture.cjs');
 if(!worker)build=await require('esbuild').build({stdin:{contents:source()+"\nexport {getSiteSettings,updateSiteSettings} from './siteSettings';",resolveDir:path.join(root,'src/main'),sourcefile:path.join(root,sourceFile),loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:bundle,metafile:true,plugins:[{name:'declared-removal-controls',setup(builder){
  builder.onLoad({filter:/\/src\/main\/dialogs\.ts$/},()=>({contents:'export const showBrowserDialog=(...args:any[])=>globalThis.fixtureDialog(...args);',loader:'ts'}));
  builder.onLoad({filter:/\/src\/main\/history\.ts$/},()=>({contents:'export const removeProfileHistory=(profile:string)=>globalThis.fixtureHistory(profile);',loader:'ts'}));
  builder.onLoad({filter:/\/src\/main\/groupLocks\.ts$/},()=>({contents:'export const isGroupLocked=()=>false;',loader:'ts'}));
  builder.onLoad({filter:/\/src\/main\/passwordManager\/index\.ts$/},()=>({contents:'export const passwordVault=()=>({status:()=>({initialized:false})});export const authenticatePersonalData=async()=>{};export const personalDataRevision=()=>0;export const withPersonalData=()=>{throw new Error("No private fixture vault");};',loader:'ts'}));
 }}]});
 api=require(bundle);return bundle;
}
async function fixture(name,second=false){
 const folder=worker?temporary:path.join(temporary,name);fs.mkdirSync(folder,{recursive:true});
 if(!worker)journalFolder=folder;
 const page=path.join(folder,'host.html');fs.writeFileSync(page,'<!doctype html><title>Removal fixture</title>');
 owner=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(page);
 const source={id:name+'-one',name:'Fixture',sessionId:name,spaceId:'default',url:'https://fixture.test',icon:''};
 let current=source;let apps=[source];if(second)apps.push({...source,id:name+'-two'});
 if(!worker||process.argv[5]==='first')await owner.webContents.executeJavaScript('localStorage.setItem("user_apps",'+JSON.stringify(JSON.stringify(apps))+')');
 else assert.equal(JSON.parse(await owner.webContents.executeJavaScript('localStorage.getItem("user_apps")'))[0].id,source.id,'saved layout survived native process restart');
 const save=async value=>owner.webContents.executeJavaScript('localStorage.setItem("user_apps",'+JSON.stringify(JSON.stringify(value))+')');
 const profile=session.fromPartition('persist:kudiumbrowser-'+name);profile.protocol.handle('https',()=>new Response('<!doctype html><title>Website</title>'));
 const website=async(target=profile)=>{const window=new BrowserWindow({show:false,webPreferences:{session:target,sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadURL('https://fixture.test');return window;};
 const seed=async(target=profile)=>{await target.cookies.set({url:'https://fixture.test',name:'removal',value:'synthetic'});const window=await website(target);await window.webContents.executeJavaScript('localStorage.setItem("removal","synthetic")');window.destroy();};
 if(!worker||process.argv[5]==='first')await seed();
 let profileActive=false;
 dispose=api.registerGroupRemoval(owner,()=>current,()=>true,()=>!profileActive);
 const handler=handlers.get('browser-remove-group');
 const run=()=>handler({sender:owner.webContents,senderFrame:owner.webContents.mainFrame},source.id);
 const cookies=()=>profile.cookies.get({name:'removal'});
 const reload=async()=>{const frame=owner.webContents.mainFrame;await owner.loadFile(page);assert.equal(owner.webContents.mainFrame,frame);};
 return{source,apps,save,profile,seed,website,run,runId:id=>handler({sender:owner.webContents,senderFrame:owner.webContents.mainFrame},id),cookies,reload,current:value=>{current=value},active:value=>{profileActive=value}};
}
async function cleanup(){dispose?.();dispose=undefined;owner?.destroy();owner=undefined;}
async function workerRun(){
 await load();const f=await fixture('restart');const stateFile=path.join(temporary,'worker-state.json');
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{storageCalls:0};
 const clear=f.profile.clearStorageData.bind(f.profile);f.profile.clearStorageData=async(...args)=>{state.storageCalls+=1;return clear(...args)};
 if(process.argv[5]==='first')f.profile.clearCache=async()=>{throw new Error('Synthetic cache failure')};
 const result=await outcome(f.run());assert.equal(result.accepted,process.argv[5]==='retry');
 state[process.argv[5]]={accepted:result.accepted,cookies:(await f.cookies()).length,journalExists:fs.existsSync(path.join(app.getPath('userData'),'group-removal-journal.json')),retired:phase==='after'?api.getGroupRemovalJournal().removed(f.source.id):false,error:result.error};
 fs.writeFileSync(stateFile,JSON.stringify(state));session.defaultSession.flushStorageData();await f.profile.cookies.flushStore();
 await cleanup();await new Promise(resolve=>setTimeout(resolve,100));app.exit(0);
}
async function parentRun(){
 const bundle=await load();const cases=[];
 for(const name of ['dialogReload','secondReadReload','sameCountReplacement','liveProfile','secondaryProfile','ownerClosedAfterCommit']){
  const f=await fixture(name,name==='sameCountReplacement'||name==='secondaryProfile');globalThis.fixtureDialog=async()=>({response:1});
  let release,entered,secondProfile,live;
  if(name==='dialogReload'||name==='sameCountReplacement'){
   const held={entered:defer(),release:defer()};globalThis.fixtureDialog=()=>{held.entered.resolve();return held.release.promise};entered=held.entered.promise;release=()=>held.release.resolve({response:1});
  }
  if(name==='secondReadReload'){
   const held={entered:defer(),release:defer()},execute=owner.webContents.executeJavaScript.bind(owner.webContents);let reads=0;
   owner.webContents.executeJavaScript=async(...args)=>{const value=await execute(...args);if(args[0].startsWith('JSON.parse')&&++reads===2){held.entered.resolve();await held.release.promise}return value};entered=held.entered.promise;release=()=>held.release.resolve();
  }
  if(name==='liveProfile'){live=await f.website();f.active(true);}
  if(name==='secondaryProfile'){
   secondProfile=session.fromPartition('persist:kudiumbrowser-secondary-'+name);secondProfile.protocol.handle('https',()=>new Response('<!doctype html>'));
   await f.seed(secondProfile);f.apps[1].sessionProfileId='secondary-'+name;await f.save(f.apps);
  }
  if(name==='ownerClosedAfterCommit'){
   const held={entered:defer(),release:defer()},clear=f.profile.clearCache.bind(f.profile);
   f.profile.clearCache=async()=>{held.entered.resolve();await held.release.promise;return clear()};entered=held.entered.promise;release=()=>held.release.resolve();
  }
  const pending=outcome(f.run());
  if(entered)await entered;
  if(name==='dialogReload'||name==='secondReadReload')await f.reload();
  if(name==='sameCountReplacement')await f.save([f.source,{...f.source,id:name+'-replacement'}]);
  if(name==='ownerClosedAfterCommit')owner.destroy();
  release?.();const result=await pending,cookies=(await f.cookies()).length;
  if(['dialogReload','secondReadReload','sameCountReplacement','liveProfile'].includes(name)){
   assert.equal(result.accepted,phase==='before',name+': '+JSON.stringify(result));assert.equal(cookies,phase==='before'?0:1,name);
  }
  if(name==='secondaryProfile'){
   assert.equal(result.accepted,true);assert.equal(cookies,0);assert.equal((await secondProfile.cookies.get({name:'removal'})).length,phase==='before'?1:0);
  }
  if(name==='ownerClosedAfterCommit'){
   assert.equal(result.accepted,phase==='after',name);assert.equal(cookies,0);
   if(phase==='after')assert.equal(api.getGroupRemovalJournal().removed(f.source.id),true);
  }
  cases.push({name,accepted:result.accepted,cookiesRetained:cookies,secondaryCookies:secondProfile?(await secondProfile.cookies.get({name:'removal'})).length:undefined,retired:phase==='after'?api.getGroupRemovalJournal().removed(f.source.id):false,error:result.error});
  live?.destroy();await cleanup();
 }
 const shared=await fixture('staleLayoutLastOwner');
 shared.source.sessionProfileId='staleLayoutLastOwner';
 const last={...shared.source,id:'last-owner',sessionId:'last-owner-group'};
 await shared.save([shared.source,last]);globalThis.fixtureDialog=async()=>({response:1});
 assert.equal((await shared.run()).removed,true);assert.equal((await shared.cookies()).length,1);
 shared.current(last);assert.equal((await shared.runId(last.id)).removed,true);
 const lastCookies=(await shared.cookies()).length;assert.equal(lastCookies,phase==='before'?1:0);
 cases.push({name:'staleLayoutLastOwner',accepted:true,cookiesRetained:lastCookies,retired:phase==='after'?api.getGroupRemovalJournal().removed(last.id):false});
 await cleanup();
 const recovery=path.join(temporary,'recovery');fs.mkdirSync(recovery,{recursive:true});
 for(const stage of ['first','retry'])await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[__filename,phase,'worker',recovery,stage,bundle],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',bytes=>{output+=bytes});child.stderr.on('data',bytes=>{output+=bytes});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Recovery '+stage+' failed: '+output)));
 });
 const restart=JSON.parse(fs.readFileSync(path.join(recovery,'worker-state.json'),'utf8'));
 assert.equal(restart.storageCalls,phase==='before'?2:1);assert.equal(restart.first.cookies,0);assert.equal(restart.retry.cookies,0);assert.equal(restart.retry.retired,phase==='after');
 const output=path.join(root,'docs/benchmarks/group-removal-boundaries.json'),report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
 const overrides=['src/main/dialogs.ts','src/main/history.ts','src/main/groupLocks.ts','src/main/passwordManager/index.ts'];
 report[phase]={recordedAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,probeSha256:hash(fs.readFileSync(__filename)),runtimeBundleSha256:hash(fs.readFileSync(bundle)),sourceSha256:hash(source()),dependencyHashes:Object.fromEntries(Object.keys(build.metafile.inputs).filter(file=>file.startsWith('src/')&&file!==sourceFile&&!overrides.includes(file)).map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),overrides,cases,restart,scope:'Actual group handler and native same-frame document identities; real cookies/storage/site-settings and two separate Electron processes for failed-cleanup retry. Native dialog completion, unloaded predicates, group locks, history dispatch and uninitialized vault are explicit controls. Actual application views/renderer/vault/history integration is checked separately by tests and group-close-removal-smoke. No physical OS auth, installed-extension writers, signed/cross-platform or whole-app performance claim.'};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,cases,restart}));app.exit(0);
}
const timeout=setTimeout(()=>{console.error('Group removal boundary test timed out');app.exit(1)},45000);
(worker?workerRun():parentRun()).catch(async error=>{console.error(error);await cleanup();app.exit(1)});
app.on('will-quit',()=>{clearTimeout(timeout);if(!worker)fs.rmSync(temporary,{recursive:true,force:true})});

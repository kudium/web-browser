/* Actual AI IPC handlers and native frame identities; no provider or personal profile. */
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'after';assert(['before','after'].includes(phase));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-import-boundary-'));app.setPath('userData',temporary);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const sourceFiles=['src/main/ai.ts','src/main/aiComposer.ts'];
const source=file=>fs.readFileSync(path.join(root,phase==='before'?'docs/benchmarks/baselines/ai-imports/'+path.basename(file)+'.txt':file),'utf8');
const handlers=new Map(),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(channel,fn)=>{handlers.set(channel,fn);return handle(channel,fn)};
let host,dispose,store,paused,addCount=0,syncReads=0,syncStats=0;
const files=[path.join(temporary,'first.txt'),path.join(temporary,'second.txt')];files.forEach((file,index)=>fs.writeFileSync(file,'Synthetic selected fact '+index));
const read=fs.readFileSync,stat=fs.statSync;
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 await app.whenReady();
 const bundle=path.join(temporary,'ai.cjs');
 const build=await require('esbuild').build({stdin:{contents:source('src/main/ai.ts')+"\nexport {conversationStore};export {AIComposerAttachments} from './aiComposer';",resolveDir:path.join(root,'src/main'),sourcefile:path.join(root,'src/main/ai.ts'),loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:bundle,metafile:true,plugins:[{name:'exact-import-baseline',setup(builder){builder.onLoad({filter:/\/src\/main\/aiComposer\.ts$/},()=>({contents:source('src/main/aiComposer.ts'),loader:'ts',resolveDir:path.join(root,'src/main')}))}}]});
 const ai=require(bundle),originalAdd=ai.AIComposerAttachments.prototype.add;
 ai.AIComposerAttachments.prototype.add=async function(...args){store=this;addCount+=1;if(paused&&addCount===paused.at){paused.entered.resolve();await paused.release.promise}return originalAdd.apply(this,args)};
 host=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await host.loadURL('data:text/html,Import fixture');
 await ai.initializeLocalStorage();
 dispose=ai.registerAI(host,{tabs:()=>[],focused:()=>undefined,contents:()=>undefined});
 const event=()=>({sender:host.webContents,senderFrame:host.webContents.mainFrame});
 const call=(channel,...args)=>handlers.get(channel)(event(),...args);
 const chats=()=>ai.conversationStore;
 const entries=()=>store?.entries.size||0;
 const clean=async()=>{paused=undefined;await call('ai-composer-clear');await call('ai-conversations',{action:'create'});};
 const observations=[];
 // Ordinary picker still reads exact selected files and commits to the current chat.
 fs.readFileSync=function(file,...args){if(files.includes(file))syncReads+=1;return read.call(this,file,...args)};
 fs.statSync=function(file,...args){if(files.includes(file))syncStats+=1;return stat.call(this,file,...args)};
 const picker=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});
 let result=await call('ai-composer-pick');assert.equal(result.attachments.length,2);assert.equal(chats().current().attachmentIds.length,2);
 const io={selectedFiles:2,synchronousFileReads:syncReads,synchronousFileStats:syncStats};assert.equal(syncReads,phase==='before'?2:0);assert.equal(syncStats,phase==='before'?2:0);
 fs.readFileSync=read;fs.statSync=stat;
 const scenarios=[
  ['pickerChatSwitch','pick',async()=>call('ai-conversations',{action:'create'})],
  ['pickerChatSwitchBack','pick',async id=>{await call('ai-conversations',{action:'create'});await call('ai-conversations',{action:'select',id})}],
  ['addChatSwitch','add',async()=>call('ai-conversations',{action:'create'})],
  ['accessChangeRestored','add',async()=>{await call('ai-permissions','full');await call('ai-permissions','standard')}],
  ['clearWhileAdding','add',async()=>call('ai-composer-clear')],
  ['nativeNavigationRestored','add',async()=>{await host.loadURL('data:text/html,Changed fixture');await host.loadURL('data:text/html,Import fixture')}],
  ['partialPickerRollback','batch',async()=>call('ai-conversations',{action:'create'})],
 ];
 for(const[name,kind,change]of scenarios){
  await clean();const originalChat=chats().current().id;let pending,release;
  if(kind==='pick'){
   const selection=defer();dialog.showOpenDialog=()=>selection.promise;
   pending=call('ai-composer-pick');release=()=>selection.resolve({canceled:false,filePaths:[files[0]]});
  }else{
   paused={at:addCount+(kind==='batch'?2:1),entered:defer(),release:defer()};
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});
   pending=kind==='batch'?call('ai-composer-pick'):call('ai-composer-add','fixture.txt',Buffer.from('Synthetic selected fact'));
   release=()=>paused.release.resolve();
  }
  const outcome=Promise.resolve(pending).then(value=>({accepted:true,value}),error=>({accepted:false,error:error.message}));
  if(kind!=='pick')await paused.entered.promise;
  await change(originalChat);release();const observed=await outcome;paused=undefined;
  const count=entries();const all=chats().snapshot();
  assert.equal(observed.accepted,phase==='before',name+': '+JSON.stringify(observed));
  if(phase==='after'){assert.equal(count,0,name);assert.equal(chats().current().attachmentIds.length,0,name);}
  observations.push({name,accepted:observed.accepted,retainedAttachments:count,originalChatAttachments:chats().find(originalChat)?.attachmentIds.length||0,currentChatAttachments:chats().current().attachmentIds.length,error:observed.error});
  // A baseline switch leaves originals in the previous chat; explicitly clear the probe store.
  store.clear();for(const chat of chats().chats)chat.attachmentIds=[];
 }
 await clean();paused={at:addCount+1,entered:defer(),release:defer()};
 const pending=Promise.resolve(call('ai-composer-add','fixture.txt',Buffer.from('Synthetic selected fact'))).then(()=>({accepted:true}),error=>({accepted:false,error:error.message}));await paused.entered.promise;
 dispose();dispose=undefined;paused.release.resolve();const outcome=await pending;paused=undefined;
 assert.equal(outcome.accepted,phase==='before');assert.equal(entries(),phase==='before'?1:0);
 observations.push({name:'serviceDisposed',accepted:outcome.accepted,retainedAttachments:entries(),error:outcome.error});
 dialog.showOpenDialog=picker;
 const output=path.join(root,'docs/benchmarks/ai-import-boundary.json');const report=fs.existsSync(output)?JSON.parse(read(output,'utf8')):{};
 if(report[phase])(report.previousRuns??=[]).push({phase,...report[phase]});
 report[phase]={recordedAt:new Date().toISOString(),runtime:process.versions,platform:process.platform,architecture:process.arch,probeSha256:hash(read(__filename)),sources:Object.fromEntries(sourceFiles.map(file=>[file,hash(source(file))])),dependencyHashes:Object.fromEntries(Object.keys(build.metafile.inputs).filter(file=>file.startsWith('src/')&&!sourceFiles.includes(file)).map(file=>[file,hash(read(path.join(root,file)))])),normalPicker:io,cases:observations,scope:'Actual registerAI handlers in Electron, invoked with native main-frame identities. Synthetic selected text files; picker and extraction scheduling deferred locally. Exact pre-change AI/composer source snapshots, other dependencies current and hashed. Tests storage/target behavior and selected-file sync I/O counts, not renderer IPC serialization, provider bytes, latency, image decoding or full application performance.'};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,normalPicker:io,cases:observations.map(({name,accepted,retainedAttachments})=>({name,accepted,retainedAttachments}))}));
 host.destroy();await pause(100);app.exit(0);
}
const timeout=setTimeout(()=>{console.error('Import boundary test timed out');app.exit(1)},30000);
run().catch(error=>{fs.readFileSync=read;fs.statSync=stat;console.error(error);dispose?.();host?.destroy();app.exit(1)});
app.on('will-quit',()=>{clearTimeout(timeout);fs.rmSync(temporary,{recursive:true,force:true})});

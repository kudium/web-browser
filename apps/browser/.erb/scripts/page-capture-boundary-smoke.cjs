/* Native host/target identities, Chromium pixels/PDF and actual export commits. */
const fs=require('fs'),fsp=require('fs/promises'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {app,BrowserWindow,ipcMain,dialog,clipboard,ClipboardItem}=require('electron');
app.on('window-all-closed',()=>{});
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'after';assert(['before','after'].includes(phase));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-capture-boundary-'));app.setPath('userData',path.join(temporary,'user-data'));
const files=['src/main/pageCapture.ts','src/browser/pageCapture.ts'];
const source=file=>fs.readFileSync(path.join(root,phase==='before'?'docs/benchmarks/baselines/page-capture/'+(file.startsWith('src/browser/')?'pageCapture-request.ts':'pageCapture.ts')+'.txt':file),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const handlers=new Map(),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>{handlers.set(name,fn);return handle(name,fn)};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
const outcome=call=>Promise.resolve().then(call).then(value=>({accepted:true,value}),error=>({accepted:false,error:error.message}));
let host,target,dispose,api,available=true,clipboardWrites=0;
const writeFile=fsp.writeFile,clipboardWrite=clipboard.write.bind(clipboard);let fileHold;
fsp.writeFile=async function(...args){const result=await writeFile.apply(this,args);if(fileHold){fileHold.entered.resolve();await fileHold.release.promise}return result;};
clipboard.write=async()=>{clipboardWrites+=1;};
async function run(){
 await app.whenReady();fs.mkdirSync(app.getPath('userData'),{recursive:true});

 const bundle=path.join(temporary,'fixture.cjs');
 const build=await require('esbuild').build({stdin:{contents:source(files[0]),resolveDir:path.join(root,'src/main'),sourcefile:path.join(root,files[0]),loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:bundle,metafile:true,plugins:[{name:'exact-capture-request-baseline',setup(builder){builder.onLoad({filter:/\/src\/browser\/pageCapture\.ts$/},()=>({contents:source(files[1]),loader:'ts'}));}}]});
 api=require(bundle);const hostFile=path.join(temporary,'host.html'),targetFile=path.join(temporary,'target.html');
 fs.writeFileSync(hostFile,'<!doctype html><title>Capture host</title>');fs.writeFileSync(targetFile,'<!doctype html><title>Synthetic page</title><style>body{background:#e5f4ff;margin:0;min-height:1600px}h1{padding:25px;color:#163d51}</style><h1>Synthetic capture fact</h1>');
 target=new BrowserWindow({show:false,width:600,height:500,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await target.loadFile(targetFile);
 const create=async()=>{dispose?.();dispose=undefined;host?.destroy();available=true;host=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await host.loadFile(hostFile);dispose=api.registerPageCapture(host,id=>id==='page'&&available?target.webContents:undefined);};
 const event=()=>({sender:host.webContents,senderFrame:host.webContents.mainFrame});
 const call=value=>handlers.get('browser-capture')(event(),value);
 const preview=async(mode='visible')=>{const value=await call({action:'capture',tabId:'page',mode});assert.equal(value.kind,'preview');assert.ok(value.width>0&&value.height>0);return value;};
 const reload=async()=>{const frame=host.webContents.mainFrame;await host.loadFile(hostFile);assert.equal(host.webContents.mainFrame,frame);};
 const normal=[];await create();
 const visible=await preview();const full=await preview('full');assert.ok(full.height>visible.height);normal.push('visible/full native pixels');
 const png=path.join(temporary,'normal.png');dialog.showSaveDialog=async()=>({canceled:false,filePath:png});await call({action:'save',captureId:full.captureId});assert.equal(fs.readFileSync(png).subarray(0,8).toString('hex'),'89504e470d0a1a0a');normal.push('PNG save');
 const pdf=path.join(temporary,'normal.pdf');dialog.showSaveDialog=async()=>{await target.loadFile(targetFile);return{canceled:false,filePath:pdf}};await call({action:'pdf',tabId:'page'});assert.equal(fs.readFileSync(pdf).subarray(0,5).toString(),'%PDF-');normal.push('immutable PDF survives target navigation');
 await call({action:'copy',captureId:full.captureId,rectangle:{x:0,y:0,width:100,height:100}});normal.push('native crop/clipboard dispatch');
 const cases=[];
 for(const name of ['pendingPixelsHostReload','pendingPDFHostReload','targetOwnershipLost','savedPreviewHostReload','PNGDialogHostReload','PDFDialogHostReload','PNGDialogCancel','PDFDialogCancel','writeBeforeCommitHostReload']){
  await create();fileHold=undefined;const destination=path.join(temporary,name+'.out');fs.writeFileSync(destination,'existing destination');
  const selected=()=>({canceled:false,filePath:destination});dialog.showSaveDialog=async()=>selected();
  let pending,release,entered,restore;
  if(name==='pendingPixelsHostReload'||name==='targetOwnershipLost'){
   const held={entered:defer(),release:defer()},capture=target.webContents.capturePage.bind(target.webContents);
   target.webContents.capturePage=async(...args)=>{const result=await capture(...args);held.entered.resolve();await held.release.promise;return result};restore=()=>{target.webContents.capturePage=capture};
   pending=outcome(()=>call({action:'capture',tabId:'page',mode:'visible'}));entered=held.entered.promise;release=()=>held.release.resolve();
  }else if(name==='pendingPDFHostReload'){
   const held={entered:defer(),release:defer()},print=target.webContents.printToPDF.bind(target.webContents);
   target.webContents.printToPDF=async(...args)=>{const result=await print(...args);held.entered.resolve();await held.release.promise;return result};restore=()=>{target.webContents.printToPDF=print};
   pending=outcome(()=>call({action:'pdf',tabId:'page'}));entered=held.entered.promise;release=()=>held.release.resolve();
  }else{
   const captured=await preview();
   if(name==='savedPreviewHostReload'){await reload();pending=outcome(()=>call({action:'copy',captureId:captured.captureId}));}
   else if(name==='writeBeforeCommitHostReload'){
    fileHold={entered:defer(),release:defer()};const held=fileHold;
    pending=outcome(()=>call({action:'save',captureId:captured.captureId}));entered=held.entered.promise;release=()=>held.release.resolve();
   }else{
    const held={entered:defer(),release:defer()};dialog.showSaveDialog=()=>{held.entered.resolve();return held.release.promise};
    pending=outcome(()=>call(name.startsWith('PDF')?{action:'pdf',tabId:'page'}:{action:'save',captureId:captured.captureId}));entered=held.entered.promise;release=()=>held.release.resolve(selected());
   }
  }
  const clipboardStart=clipboardWrites;
  if(entered)await entered;
  if(name==='targetOwnershipLost')available=false;
  else if(name.endsWith('Cancel'))await call({action:'cancel'});
  else if(name!=='savedPreviewHostReload')await reload();
  release?.();const result=await pending;fileHold=undefined;restore?.();
  assert.equal(result.accepted,phase==='before',name+': '+JSON.stringify(result));
  const changed=fs.readFileSync(destination,'utf8')!=='existing destination';
  if(name.includes('Dialog')||name.includes('BeforeCommit')||name==='pendingPDFHostReload')assert.equal(changed,phase==='before',name);
  const retained=fs.readdirSync(temporary).filter(file=>file.startsWith('.touchbox-capture-')).length;assert.equal(retained,0);
  if(name==='savedPreviewHostReload')assert.equal(clipboardWrites-clipboardStart,phase==='before'?1:0);
  cases.push({name,accepted:result.accepted,destinationChanged:changed,clipboardWrites:clipboardWrites-clipboardStart,retainedTemporaryFiles:retained,error:result.error});
 }
 await create();const captured=await preview();const start=clipboardWrites;
 const malformed=await outcome(()=>call({action:'copy',captureId:captured.captureId,rectangle:null}));assert.equal(malformed.accepted,phase==='before');assert.equal(clipboardWrites-start,phase==='before'?1:0);
 cases.push({name:'malformedCrop',accepted:malformed.accepted,clipboardWrites:clipboardWrites-start,error:malformed.error});
 await create();const originalDispose=dispose;dispose=api.registerPageCapture(host,id=>id==='page'?target.webContents:undefined);originalDispose();
 const replacement=await outcome(()=>call({action:'capture',tabId:'page',mode:'visible'}));assert.equal(replacement.accepted,phase==='after');cases.push({name:'replacementRegistration',accepted:replacement.accepted,error:replacement.error});
 const output=path.join(root,'docs/benchmarks/page-capture-boundaries.json'),report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
 report[phase]={recordedAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,probeSha256:hash(fs.readFileSync(__filename)),runtimeBundleSha256:hash(fs.readFileSync(bundle)),sourceHashes:Object.fromEntries(files.map(file=>[file,hash(source(file))])),dependencyHashes:Object.fromEntries(Object.keys(build.metafile.inputs).filter(file=>file.startsWith('src/')&&!files.includes(file)).map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),normal,cases,scope:'Actual PageCaptureService/registered handler/native host and target documents, Chromium pixels/printing and filesystem writes. Clipboard dispatch is recorded without modifying the OS clipboard; native UI copy is checked separately. Save selection and native pixel/PDF completion/write promises are held after real operations; ownership callback is explicitly toggled. Direct handler calls use native identities; production preload/UI integration is checked separately. No decoder containment, hostile native/file resources, physical OS input, signed/cross-platform or whole-app performance claim. Clipboard and rename dispatch are irreversible commit boundaries; revocation after dispatch is not rollback.'};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,normal,cases}));dispose?.();dispose=undefined;host.destroy();target.destroy();app.exit(0);
}
const timeout=setTimeout(async()=>{console.error('Page capture boundary test timed out');app.exit(1)},45000);
run().catch(async error=>{console.error(error);fileHold?.release.resolve();dispose?.();host?.destroy();target?.destroy();app.exit(1)});
app.on('will-quit',()=>{clearTimeout(timeout);fsp.writeFile=writeFile;clipboard.write=clipboardWrite;fs.rmSync(temporary,{recursive:true,force:true})});

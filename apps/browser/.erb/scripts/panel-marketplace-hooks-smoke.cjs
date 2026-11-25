/* Actual sandboxed hook panels on public, signed-out pages. Disposable profile only. */
const {app,BrowserWindow,WebContentsView,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {showHookPanel,respondHookPanel,removeHookPanels}=require('../../src/main/hookPanels.ts');
const {sidebarPanelsFor,registerSidebarPanelWindow}=require('../../src/main/sidebarPanels.ts');
const {withAIProtocol}=require('../../src/main/aiProtocol.ts');
const {capturePagePNG}=require('../../src/main/aiScreenshot.ts');
const {pageHookBody}=require('../../../../packages/hooks/runtime.ts');
const {parseHookPackage}=require('../../../../packages/hooks/package.ts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-marketplace-panels-'));
const captures=path.resolve('../../docs/marketplace-hooks/captures');fs.mkdirSync(captures,{recursive:true});
app.setPath('userData',path.join(root,'profile'));app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){try{if(await test())return;}catch{}await pause(80);}throw new Error('Timed out: '+label);}
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixturePanel',{publish:output=>ipcRenderer.invoke('fixture-panel',output),onAction:callback=>ipcRenderer.on('site-developer-panel-action',(_event,request)=>callback(request)),respond:response=>ipcRenderer.invoke('fixture-response',response)});`);
let owner,source,binding,currentView;
async function click(view,id){const rect=await view.webContents.executeJavaScript(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);view.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});view.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...rect});}
async function capture(id,suffix){owner.show();owner.focus();currentView.webContents.focus();await currentView.webContents.executeJavaScript('new Promise(resolve=>{setTimeout(resolve,1000);requestAnimationFrame(()=>requestAnimationFrame(resolve));})');await pause(200);console.log('CAPTURE',id,suffix,await currentView.webContents.executeJavaScript('({status:document.getElementById("status")?.textContent,checked:document.getElementById("checked")?.textContent,visible:document.visibilityState})'));const shot=await withAIProtocol(currentView.webContents,new AbortController().signal,send=>send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false}));const bytes=Buffer.from(shot.data,'base64');fs.writeFileSync(path.join(captures,id+'-'+suffix+'.png'),bytes);}
async function runHook(id,url){
  if(source){removeHookPanels(source.webContents);owner.contentView.removeChildView(source);source.webContents.close();}
  source=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(root,'preload.cjs')}});owner.contentView.addChildView(source);source.setBounds({x:0,y:0,width:860,height:800});
  await source.webContents.loadURL(url);await until(()=>source.webContents.executeJavaScript('document.readyState === "complete"'),'source page');
  const pkg=parseHookPackage(JSON.parse(fs.readFileSync(path.resolve('../../docs/marketplace-hooks/'+id+'.json'),'utf8')));
  binding={source:source.webContents,owner,groupId:'qa',sourceId:'public-page',hookId:id,hookName:pkg.name,token:'qa-token',authorized:()=>true};sidebarPanelsFor(owner).setSession(source.webContents.session,'qa');
  await source.webContents.executeJavaScript(`(async()=>{window.hookHandlers=new Map();window.fixturePanel.onAction(async request=>{try{const value=await window.hookHandlers.get(request.action)(request.payload);await window.fixturePanel.respond({requestId:request.requestId,value});}catch(error){await window.fixturePanel.respond({requestId:request.requestId,error:error.message});}});const context={document,url:location.href,onCleanup:callback=>window.addEventListener('beforeunload',callback),panel:{show:input=>window.fixturePanel.publish(input),update:input=>window.fixturePanel.publish(input),onAction:(id,handler)=>window.hookHandlers.set(id,handler)}};await (async()=>{${pageHookBody(pkg.lifecycle.after)}})();})()`);
  await until(()=>currentView?.webContents.executeJavaScript('Boolean(document.getElementById("title")?.textContent && document.querySelector(".list")?.children.length)'),'populated panel');
  for(const width of [280,368,640]){currentView.setBounds({x:860,y:0,width,height:800});await pause(100);const geometry=await currentView.webContents.executeJavaScript('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(geometry.scroll<=geometry.width+1,id+': overflow '+JSON.stringify(geometry));}
  currentView.setBounds({x:860,y:0,width:368,height:800});await pause(100);
  fs.writeFileSync(path.join(captures,id+'-page.png'),Buffer.from(await capturePagePNG(source.webContents,new AbortController().signal),'base64'));
  const identity={id,url:source.webContents.getURL(),title:source.webContents.getTitle()};console.log('PAGE',JSON.stringify(identity));return identity;
}
app.whenReady().then(async()=>{
  owner=new BrowserWindow({show:false,width:1240,height:840,webPreferences:{sandbox:true,contextIsolation:true}});await owner.loadURL('data:text/html,<style>body{margin:0;background:%23202020}</style>');registerSidebarPanelWindow(owner);owner.showInactive();
  ipcMain.handle('fixture-panel',(event,output)=>{assert.equal(event.sender,source.webContents);const result=showHookPanel(binding,{...output,reveal:true});const host=sidebarPanelsFor(owner),state=host.state();host.layout(state.activeId,{x:860,y:0,width:368,height:800});currentView=owner.contentView.children.find(view=>view!==source&&view.webContents);currentView.webContents.setBackgroundThrottling(false);return result;});
  ipcMain.handle('fixture-response',(event,response)=>{respondHookPanel(event.sender,binding.token,binding.hookId,response);return true;});
  const manifest=[];
  manifest.push(await runHook('listen-article','https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API'));
  await until(()=>currentView.webContents.executeJavaScript('document.getElementById("voice").options.length>0'),'local voices');
  for(const width of [280,368,640]){currentView.setBounds({x:860,y:0,width,height:800});await currentView.webContents.executeJavaScript('document.querySelectorAll("details").forEach(node=>node.open=true)');await pause(100);assert(await currentView.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth+1'),'expanded player overflow at '+width);}
  currentView.setBounds({x:860,y:0,width:368,height:800});await currentView.webContents.executeJavaScript('document.querySelectorAll("details").forEach(node=>node.open=false)');
  await currentView.webContents.executeJavaScript('document.querySelector(".voice-settings").open=true');await capture('listen-article','settings');await currentView.webContents.executeJavaScript('document.querySelector(".voice-settings").open=false');
  await capture('listen-article','player');await click(currentView,'play');await until(()=>currentView.webContents.executeJavaScript('speechSynthesis.speaking && document.getElementById("play").textContent === "Pause"'),'speech playback');
  await click(currentView,'play');await until(()=>currentView.webContents.executeJavaScript('speechSynthesis.paused && document.getElementById("play").textContent === "Resume"'),'pause');
  await click(currentView,'play');await until(()=>currentView.webContents.executeJavaScript('!speechSynthesis.paused'),'resume');
  await click(currentView,'next');await until(()=>currentView.webContents.executeJavaScript('document.getElementById("status").textContent.includes("passage 2")'),'paragraph seek');await capture('listen-article','playing');
  await currentView.webContents.executeJavaScript('document.querySelector(".transcript-section").open=true');await capture('listen-article','transcript');
  await click(currentView,'stop');await until(()=>currentView.webContents.executeJavaScript('!speechSynthesis.speaking'),'stop');
  manifest.push(await runHook('page-explorer','https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API'));
  assert(await currentView.webContents.executeJavaScript('Number(document.getElementById("sections").textContent)>5'));
  await capture('page-explorer','outline');await click(currentView,'links-tab');await until(()=>currentView.webContents.executeJavaScript('document.getElementById("links-tab").getAttribute("aria-pressed")==="true"'),'source tab');await capture('page-explorer','sources');
  manifest.push(await runHook('pr-navigator','https://github.com/microsoft/TypeScript/pull/65667/files'));
  assert(await currentView.webContents.executeJavaScript('Number(document.getElementById("loaded").textContent)>0'),'GitHub file extraction');
  await capture('pr-navigator','files');const checklist=await currentView.webContents.executeJavaScript('document.querySelector("#files button[aria-pressed]").getAttribute("aria-label")');
  await currentView.webContents.executeJavaScript('document.querySelector("#files button[aria-pressed]").click()');await until(()=>currentView.webContents.executeJavaScript('Number(document.getElementById("checked").textContent)===1'),'local checklist');await capture('pr-navigator','checked');
  fs.writeFileSync(path.join(captures,'manifest.json'),JSON.stringify({capturedAt:new Date().toISOString(),native:true,pages:manifest},null,2));
  console.log('PASS public panel hooks: package execution, native sandbox, responsive layouts, real local speech play/pause/resume/seek/stop, outline links and PR checklist.');
}).then(()=>{owner?.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();}).catch(error=>{console.error(error);owner?.destroy();app.exit(1)});

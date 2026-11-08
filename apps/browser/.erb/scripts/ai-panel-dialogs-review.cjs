const {app,BrowserWindow,WebContentsView,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-devtools-review-')));
const out=path.join(project,'docs/evidence/ai-panel-dialogs');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts',project+'/src/main/projectScripts.ts',project+'/src/main/developerProject.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {projectScripts,savedProjectScript,validScriptRequest}=require(path.join(root,'runtime/projectScripts.js'));
const {projectBreadcrumbs}=require(path.join(root,'runtime/developerProject.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{siteDeveloper:{scripts:(...args)=>ipcRenderer.invoke('scripts',...args),project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperProjectSection} from ${JSON.stringify(project+'/src/components/UI/DeveloperProjectSection')};import {PanelOverlayProvider} from ${JSON.stringify(project+'/src/components/UI/PanelDialog')};import {IconPicker} from ${JSON.stringify(project+'/src/components/UI/IconPicker')};import {DeveloperTerminal} from ${JSON.stringify(project+'/src/components/UI/DeveloperTerminal')};
const params=new URLSearchParams(location.search);
function Preview(){const[shown,setShown]=useState(false);const[container,setContainer]=useState(null);return <Theme appearance={params.get('theme')}><PanelOverlayProvider container={container}><div className="ai-sidebar" style={{width:Number(params.get('width')),position:'absolute',right:16,top:48,height:'calc(100vh - 64px)'}}><div style={{padding:8}}><IconPicker label="Sample icon" emoji="" image="" preview="🙂" onChange={()=>{}} renderDefaultChoice={select=><Button onClick={select}>Default</Button>}/></div><header style={{padding:16,fontSize:14}}>Developer</header><div className="developer-sidebar" style={{minHeight:0}}><div className="developer-sidebar-toolbar"><Button color="gray" variant="soft" className="group-picker-trigger">TouchBox<span style={{marginLeft:'auto'}}>⌄</span></Button></div><div className="developer-sidebar-pages"><DeveloperProjectSection sourceId="sample" active onOpenTerminal={()=>setShown(true)} onProjectChange={()=>setShown(false)}/><p className="developer-sidebar-count">2 pages · 1 with active hooks</p>{['Local development','Documentation'].map((name,i)=><button className="developer-sidebar-page" key={name}><span className="developer-sidebar-page-copy"><strong>{name}</strong><small>{i?'touchbox.dev/docs':'localhost:3000'}</small><span className={'developer-hook-status '+(i?'':'enabled')}>{i?'No hooks':'Hooks active'}</span></span></button>)}</div>{shown&&<DeveloperTerminal group="sample" active openRequest={1} onHide={()=>setShown(false)}/>}</div><div className="ai-overlay-layer" ref={setContainer}/></div></PanelOverlayProvider></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
app.whenReady().then(async()=>{
const folder=path.join(root,'workspace','hocasa');fs.mkdirSync(folder,{recursive:true});
const other=path.join(root,'Other project');fs.mkdirSync(other);
process.env.SHELL='/bin/sh';
let w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});
let terminals=new ProjectTerminals(w,group=>{if(!['sample','other'].includes(group))throw Error('Unknown group');return group==='sample'?folder:other;},path.join(root,'terminals.json'));

const nativePage=new WebContentsView();w.contentView.addChildView(nativePage);
fs.writeFileSync(path.join(root,'native.html'),'<html><body style="font:28px system-ui;padding:40px;background:#fff;color:#222"><h1>Native webpage</h1><p>This page remains visible beside the AI panel.</p><button onclick="document.body.dataset.clicked=1">Page action</button></body></html>');
await nativePage.webContents.loadFile(path.join(root,'native.html'));
const pendingReplies=[];
const openedFolders=[];
ipcMain.handle('project',async(event,id,action,editorId,folderPath)=>{
 assert.equal(event.sender.id,w.webContents.id);if(action==='folder')openedFolders.push(folderPath||folder);
 const unavailable=new URL(event.sender.getURL()).searchParams.get('state')==='unavailable';
 return {name:'hocasa',path:folder,available:!unavailable,breadcrumbs:projectBreadcrumbs(folder,root)};
});
ipcMain.handle('editors',()=>({editors:[{id:'editor',name:'WebStorm'}]}));
ipcMain.handle('terminal',(_event,group,request)=>{assert(validTerminalRequest(request));return terminals.request(group,request)});
ipcMain.handle('scripts',async(event,id,request)=>{
 assert.equal(id,'sample');assert(validScriptRequest(request));
 const state=new URL(event.sender.getURL()).searchParams.get('state');
 if(state==='loading'&&request.action==='list')return new Promise(resolve=>pendingReplies.push(resolve));
 if(state==='error'&&request.action==='list')throw Error('Could not read saved scripts.');
 if(request.action==='run'){const script=savedProjectScript('sample',folder,request.id);return {scripts:projectScripts('sample',folder,{action:'list'}),terminal:terminals.runCommand('sample',script.name,script.command)};}
 return {scripts:projectScripts('sample',folder,request)};
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>w.webContents.executeJavaScript(code).catch(e=>{throw Error(code+'\n'+e.message)});
const wait=async code=>{for(let i=0;i<80;i++){if(await js(code))return;await pause(50)}throw Error('Timeout: '+code)};
const menu=async name=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menu]')")};
const choose=async name=>{await js(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.trim()===${JSON.stringify(name)}).click()`)};
const fill=async(name,value)=>{await js(`(()=>{const i=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(name))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`)};
const capture=async(label,width,theme,height)=>{
 await pause(400);
 const result=await js(`(()=>{const panel=document.querySelector('.ai-sidebar').getBoundingClientRect(),layer=document.querySelector('.ai-overlay-layer'),dialog=document.querySelector('[role=dialog]'),select=document.querySelector('[role=listbox]'),r=dialog.getBoundingClientRect(),overlay=dialog.closest('.rt-BaseDialogOverlay').getBoundingClientRect(),s=select?.getBoundingClientRect();return {inputOutline:[...dialog.querySelectorAll('.rt-TextFieldInput')].map(e=>getComputedStyle(e).outlineStyle),inside:layer.contains(dialog),dialogFits:r.left>=panel.left&&r.right<=panel.right&&r.top>=panel.top&&r.bottom<=panel.bottom,overlayFits:Math.abs(overlay.left-panel.left)<3&&Math.abs(overlay.width-panel.width)<3&&Math.abs(overlay.top-panel.top)<3&&Math.abs(overlay.height-panel.height)<3,selectFits:!s||layer.contains(select)&&s.left>=panel.left&&s.right<=panel.right&&s.top>=panel.top&&s.bottom<=panel.bottom,noOverflow:dialog.scrollWidth<=dialog.clientWidth,dialog:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}}})()`);
 if(process.argv.includes('--focus'))assert(result.inputOutline.every(style=>style==='none'));
 assert(result.inside&&result.dialogFits&&result.overlayFits&&result.selectFits&&result.noOverflow,JSON.stringify({label,width,height,theme,result}));
 assert(nativePage.getBounds().x+nativePage.getBounds().width<=result.dialog.left);
 assert(!nativePage.webContents.isDestroyed());assert(w.contentView.children.includes(nativePage));
 try{await w.capturePage()}catch{}await pause(250);
 let shot;for(let i=0;i<8;i++){try{shot=await w.capturePage();break}catch(e){if(i===7)throw e;await pause(500)}}
 fs.writeFileSync(path.join(out,`${width}-${height}-${theme}-${label}.png`),shot.toPNG());
 if(process.argv.includes('--native')||process.argv.includes('--focus')||process.argv.includes('--layout')){try{require('child_process').execFileSync('/usr/sbin/screencapture',['-x','-o','-l',w.getMediaSourceId().split(':')[1],path.join(out,`${width}-${height}-${theme}-${label}-native.png`)],{timeout:5000});result.nativeWindowCapture=true}catch(e){result.nativeWindowCapture=false;console.log('Native window capture unavailable: '+e.message)}}
 return {label,width,height,theme,...result};
};
const checks=[];
for(const [width,height] of (process.argv.includes('--tiny')?[[240,480]]:(process.argv.includes('--native')||process.argv.includes('--focus')||process.argv.includes('--layout'))?[[420,640],[240,480]]:process.argv.includes('--short')?[[240,480]]:[[420,640],[240,640],[240,480]]))for(const theme of (process.argv.includes('--tiny')?['light']:['light','dark']))for(const state of (process.argv.includes('--tiny')?['form']:process.argv.includes('--layout')?['form','delete','icon']:process.argv.includes('--focus')?['form','rename']:process.argv.includes('--native')?['manage','scope']:['manage','form','scope','delete','empty','loading','error','rename','icon'])){
 terminals.invalidate('sample');fs.writeFileSync(path.join(app.getPath('userData'),'developer-scripts.json'),JSON.stringify({global:[],projects:{}}));
 if(state!=='empty'){projectScripts('sample',folder,{action:'save',name:'Development',command:'npm run dev',scope:'project'});projectScripts('sample',folder,{action:'save',name:'Install dependencies',command:'npm install',scope:'global'})}
 if(w.webContents.debugger.isAttached())w.webContents.debugger.detach();w.setContentSize(width+636,height);nativePage.setBounds({x:0,y:48,width:612,height:height-64});await w.loadFile(path.join(root,'index.html'),{query:{theme,state,width:String(width)}});w.show();w.focus();await pause(400);await wait("!!document.querySelector('.developer-project-actions')");
 if(state==='icon'){await js(`document.querySelector('[aria-label="Sample icon"]').click()`);await wait("!!document.querySelector('[role=dialog]')");}
 else if(state==='rename'){
  await menu('Terminal');await choose('Open here');await wait(`!!document.querySelector('[aria-label="Terminal actions"]:not(:disabled)')`);
  await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menu]')");await choose('Rename tab…');await wait("!!document.querySelector('[role=dialog]')");
 }else{
  await menu('Scripts');await choose('Manage scripts…');await wait("!!document.querySelector('[role=dialog]')");
  if(!['loading','error'].includes(state))await wait("document.querySelector('.developer-script-list')?.getAttribute('aria-busy')==='false'");
  if(['form','scope'].includes(state)){await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add script').click()`);await wait(`!!document.querySelector('[aria-label="Script command"]')`);}
  if(state==='scope'){await js(`(()=>{const b=document.querySelector('[aria-label="Script scope"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=listbox]')");}
  if(state==='delete'){await js(`document.querySelector('[aria-label="Delete Install dependencies"]').click()`);}
  if(state==='loading')await wait("document.querySelector('[role=dialog]').textContent.includes('Loading scripts')");
  if(state==='error')await wait("!!document.querySelector('[role=dialog] [role=alert]')");
 }
 if(process.argv.includes('--focus')){w.webContents.focus();await js("document.querySelector('[role=dialog] input').focus()");w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('DOM.enable');await w.webContents.debugger.sendCommand('CSS.enable');const doc=await w.webContents.debugger.sendCommand('DOM.getDocument');const node=await w.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[role=dialog] input'});await w.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['focus','focus-visible']});}
 if(process.argv.includes('--layout'))assert(await js("[...document.querySelectorAll('.icon-picker-emojis button')].every(b=>b.getBoundingClientRect().width>=38)"));
 const dialog=await js("document.querySelector('[role=dialog]').getBoundingClientRect().toJSON()");
 if(process.argv.includes('--layout')){await pause(400);const top=await w.capturePage();fs.writeFileSync(path.join(out,`${width}-${height}-${theme}-${state}-top.png`),top.toPNG());await js("(()=>{const d=document.querySelector('[role=dialog]');d.scrollTop=d.scrollHeight})()");await pause(300);}
 if(process.argv.includes('--layout')){const info=await js("(()=>{const el=document.querySelector('[role=dialog]'),d=el.getBoundingClientRect(),b=[...el.querySelectorAll('button')].at(-1).getBoundingClientRect();return {fits:b.top>=d.top&&b.bottom<=d.bottom,dialog:d.toJSON(),button:b.toJSON(),scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflow:getComputedStyle(el).overflow}})()");assert(info.fits,JSON.stringify(info));}
 checks.push(await capture(state,width,theme,height));fs.writeFileSync(path.join(out,process.argv.includes('--layout')?'layout-checks.json':process.argv.includes('--focus')?'focus-checks.json':process.argv.includes('--native')?'native-checks.json':process.argv.includes('--short')?'short-checks.json':'checks.json'),JSON.stringify(checks,null,2));
 if(state==='scope'){if(!await js("!!document.querySelector('[role=listbox]')")){await js(`(()=>{const b=document.querySelector('[aria-label="Script scope"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=listbox]')")};const r=await js(`(()=>{const r=[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.trim()==='All projects').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);w.webContents.focus();w.webContents.sendInputEvent({type:'mouseMove',...r});await pause(50);w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});await pause(50);w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});await wait(`document.querySelector('[aria-label="Script scope"]').textContent.includes('All projects')`);assert(await js(`document.querySelector('[aria-label="Script scope"]').textContent.includes('All projects')`));}
 if(w.webContents.debugger.isAttached())w.webContents.debugger.detach();
 // Escape returns to the panel; native page remains loaded and attached.
 w.webContents.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.querySelector('[role=dialog]')&&document.body.style.pointerEvents!=='none'");checks.at(-1).dismissed=true;fs.writeFileSync(path.join(out,process.argv.includes('--layout')?'layout-checks.json':process.argv.includes('--focus')?'focus-checks.json':process.argv.includes('--native')?'native-checks.json':process.argv.includes('--short')?'short-checks.json':'checks.json'),JSON.stringify(checks,null,2));
}
terminals.dispose();fs.writeFileSync(path.join(out,process.argv.includes('--layout')?'layout-checks.json':process.argv.includes('--focus')?'focus-checks.json':process.argv.includes('--native')?'native-checks.json':process.argv.includes('--short')?'short-checks.json':'checks.json'),JSON.stringify(checks,null,2));console.log('PASS: '+checks.length+' scoped dialog layouts beside a real native WebContentsView.');nativePage.webContents.close();w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

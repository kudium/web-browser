const {app,BrowserWindow,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-devtools-review-')));
const out=path.join(project,'docs/evidence/developer-files');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectFiles.ts',project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts',project+'/src/main/projectScripts.ts',project+'/src/main/developerProject.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {projectFiles}=require(path.join(root,'runtime/projectFiles.js'));
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {projectScripts,savedProjectScript,validScriptRequest}=require(path.join(root,'runtime/projectScripts.js'));
const {projectBreadcrumbs}=require(path.join(root,'runtime/developerProject.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{siteDeveloper:{files:(...args)=>ipcRenderer.invoke('files',...args),scripts:(...args)=>ipcRenderer.invoke('scripts',...args),project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperProjectSection} from ${JSON.stringify(project+'/src/components/UI/DeveloperProjectSection')};import {DeveloperTerminal} from ${JSON.stringify(project+'/src/components/UI/DeveloperTerminal')};
const params=new URLSearchParams(location.search);
function Preview(){const[shown,setShown]=useState(false);return <Theme appearance={params.get('theme')}><div className="ai-sidebar" style={{width:'100%',height:'100vh',border:0}}><header style={{padding:16,fontSize:14}}>Developer</header><div className="developer-sidebar" style={{minHeight:0}}><div className="developer-sidebar-toolbar"><Button color="gray" variant="soft" className="group-picker-trigger">KudiumBrowser<span style={{marginLeft:'auto'}}>⌄</span></Button></div><div className="developer-sidebar-pages"><DeveloperProjectSection sourceId="sample" active onOpenTerminal={()=>setShown(true)} onProjectChange={()=>setShown(false)}/><p className="developer-sidebar-count">2 pages · 1 with active hooks</p>{['Local development','Documentation'].map((name,i)=><button className="developer-sidebar-page" key={name}><span className="developer-sidebar-page-copy"><strong>{name}</strong><small>{i?'kudiumbrowser.dev/docs':'localhost:3000'}</small><span className={'developer-hook-status '+(i?'':'enabled')}>{i?'No hooks':'Hooks active'}</span></span></button>)}</div>{shown&&<DeveloperTerminal group="sample" active openRequest={1} onHide={()=>setShown(false)}/>}</div></div></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
app.whenReady().then(async()=>{
const folder=path.join(root,'workspace','hocasa');fs.mkdirSync(folder,{recursive:true});
const other=path.join(root,'Other project');fs.mkdirSync(other);
process.env.SHELL='/bin/sh';
let w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});
let terminals=new ProjectTerminals(w,group=>{if(!['sample','other'].includes(group))throw Error('Unknown group');return group==='sample'?folder:other;},path.join(root,'terminals.json'));

const editors=require(path.join(root,'runtime/projectEditors.js'));
// OS adapters are simulated; browsing and previews use actual disposable files.
editors.openProjectEditor=async()=>{};
require('electron').shell.showItemInFolder=()=>{};
fs.mkdirSync(path.join(folder,'src'));fs.mkdirSync(path.join(folder,'empty'));
fs.writeFileSync(path.join(folder,'src','app.ts'),"export const greeting = 'Hello KudiumBrowser';\n".repeat(18));
fs.writeFileSync(path.join(folder,'.env.example'),'EXAMPLE=true');
fs.writeFileSync(path.join(folder,'binary.dat'),Buffer.from([0,1,2]));
fs.writeFileSync(path.join(folder,'large.txt'),'a'.repeat(256*1024+1));
fs.writeFileSync(path.join(folder,'empty.txt'),'');
for(let i=0;i<8;i++)fs.writeFileSync(path.join(folder,`readme${i}.md`),'# Sample');
fs.symlinkSync(path.join(folder,'src'),path.join(folder,'src-link'));
ipcMain.handle('files',async(event,id,request)=>{
 assert.equal(id,'sample');const state=new URL(event.sender.getURL()).searchParams.get('state');
 if(state==='busy'&&request.action==='editor')return new Promise(resolve=>pendingReplies.push(resolve));
 if(['editor','reveal'].includes(request.action))return {path:request.path};
 if(state==='selected-error'&&request.action==='preview')throw Error('This file changed. Refresh the folder.');
 if(state==='loading')return new Promise(resolve=>pendingReplies.push(resolve));
 if(state==='error')throw Error('This folder is unavailable. Refresh to try again.');
 const result=await projectFiles(folder,request,()=>{});if(state==='truncated')result.truncated=true;return result;
});
const pendingReplies=[];
const openedFolders=[];
ipcMain.handle('project',async(event,id,action,editorId,folderPath)=>{
 assert.equal(event.sender.id,w.webContents.id);if(action==='folder')openedFolders.push(folderPath||folder);
 const unavailable=new URL(event.sender.getURL()).searchParams.get('state')==='unavailable';
 return {name:'hocasa',path:folder,available:!unavailable,repository:'https://github.com/example/project',breadcrumbs:projectBreadcrumbs(folder,root)};
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
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>w.webContents.executeJavaScript(code);
const wait=async code=>{for(let i=0;i<80;i++){if(await js(code))return;await pause(50)}throw Error('Timeout: '+code)};
const menu=async name=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menu]')")};
const choose=async name=>{await js(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.trim()===${JSON.stringify(name)}).click()`)};
const fill=async(name,value)=>{await js(`(()=>{const i=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(name))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`)};
const capture=async(label,width,theme)=>{
 await pause(250);
 if(['menu','preview-menu','checked-menu'].includes(label)){
  if(!await js("!!document.querySelector('[role=menu]')")){await js(`(()=>{const b=document.querySelector('[aria-label="File options"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`)}
  await wait("!!document.querySelector('[role=menu]')");await pause(100);
 }
 await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 if(['menu','preview-menu','checked-menu'].includes(label)){
  if(!await js("!!document.querySelector('[role=menu][data-state=open]')")){const r=await js(`(()=>{const r=document.querySelector('[aria-label="File options"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});}
  await wait("!!document.querySelector('[role=menu][data-state=open]')");await pause(500);
 }
 try{await w.webContents.capturePage(undefined,{stayAwake:true})}catch{}await pause(300);
 let screenshot;for(let i=0;i<8;i++){try{screenshot=await w.webContents.capturePage(undefined,{stayAwake:true});break}catch(e){if(i===7)throw e;await pause(500)}}
 const result=await js(`(()=>{const p=document.querySelector('.developer-sidebar'),d=document.querySelector('[role=dialog]'),menu=document.querySelector('[role=menu]');const rect=(d||menu)?.getBoundingClientRect();const fields=[...document.querySelectorAll('.developer-script-fields input')];const labels=[...document.querySelectorAll('.developer-script-fields label')];return {focusInset:!document.activeElement?.classList.contains('developer-file-row')||parseFloat(getComputedStyle(document.activeElement).outlineOffset)<=0,focusedControl:document.activeElement?.className,focusVisible:document.activeElement?.matches(':focus-visible'),filesFit:[...document.querySelectorAll('.developer-files,.developer-file-row,.developer-file-preview')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),overflow:p.scrollWidth>p.clientWidth,disclosureFits:!rect||rect.left>=0&&rect.right<=innerWidth,rect:rect&&{left:rect.left,width:rect.width},labelsAssociated:labels.every(label=>!!label.control),inputHeights:fields.map(field=>field.getBoundingClientRect().height),footerFits:!d||document.querySelector('.developer-script-footer')?.getBoundingClientRect().bottom<=innerHeight}})()`);
 fs.writeFileSync(path.join(out,`${width}-${theme}-${label}.png`),screenshot.toPNG());
 assert(result.focusInset&&result.filesFit&&!result.overflow&&result.disclosureFits&&result.labelsAssociated,JSON.stringify({label,width,theme,result}));if(result.inputHeights.length)assert.equal(result.inputHeights[0],result.inputHeights[1]);assert(result.footerFits);
 fs.writeFileSync(path.join(out,`${width}-${theme}-${label}.png`),screenshot.toPNG());return {width,theme,label,...result};
};
const checks=[];const checkFile=process.argv.includes('--busy')?'busy-checks.json':process.argv.includes('--focus')?'focus-checks.json':process.argv.includes('--menus')?'menu-checks.json':process.argv.includes('--extra')?'extra-checks.json':'checks.json';
const click=async label=>{await js(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']').click()`)};
for(const width of [420,240])for(const theme of ['light','dark'])for(const state of (process.argv.includes('--busy')?['busy']:process.argv.includes('--focus')?['focused','preview']:process.argv.includes('--menus')?['menu','preview-menu','checked-menu']:process.argv.includes('--extra')?['preview','menu','preview-menu','checked-menu','busy','selected-error','terminal','empty-file','list','collapsed','closed']:['collapsed','list','focused','filter','no-matches','folder','preview','binary','large','empty-file','empty-folder','menu','hidden','loading','error','truncated','link','preview-menu','checked-menu','busy','selected-error','terminal','closed'])){
 if(w.webContents.debugger.isAttached())w.webContents.debugger.detach();w.setContentSize(width,640);await w.loadFile(path.join(root,'index.html'),{query:{theme,state}});w.show();w.focus();await pause(400);await wait("!!document.querySelector('.developer-project-actions')");
 if(state!=='collapsed'){
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Files').click()`);
  if(state==='loading')await wait("document.querySelector('.developer-files')?.textContent.includes('Loading files')");
  else if(state==='error')await wait("!!document.querySelector('[role=alert]')");
  else await wait("document.querySelectorAll('.developer-file-row').length>0");
 }
 const row=async name=>{await js(`[...document.querySelectorAll('.developer-file-row')].find(b=>b.title===${JSON.stringify(name)}).click()`)};
 if(state==='focused'){const r=await js(`(()=>{const r=document.querySelector('.developer-file-row').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);w.webContents.sendInputEvent({type:'mouseMove',...r});w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await pause(150);await js("document.querySelector('.developer-file-row').focus()");await js("document.querySelector('.developer-file-row').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))")}
 if(['filter','no-matches'].includes(state)){await fill('Filter files',state==='filter'?'readme':'missing-file');await js(`document.querySelector('[aria-label="Filter files"]').focus()`);}
 if(['folder','preview','preview-menu','busy'].includes(state)){await row('src');await wait("!![...document.querySelectorAll('.developer-file-row')].find(b=>b.title==='app.ts')");}
 if(['preview','preview-menu','busy'].includes(state)){await row('app.ts');await wait("!!document.querySelector('.developer-file-preview')");w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await pause(150);await js("document.querySelector('.developer-file-preview').focus()");}
 if(['binary','large','empty-file'].includes(state)){await row({'binary':'binary.dat','large':'large.txt','empty-file':'empty.txt'}[state]);await wait("!!document.querySelector('.developer-file-preview-actions')");}
 if(state==='empty-folder'){await row('empty');await wait("document.querySelector('.developer-files').textContent.includes('No visible files')");}
 if(state==='link'){await row('src-link');await wait("!![...document.querySelectorAll('.developer-file-row')].find(b=>b.title==='app.ts')");}
 if(state==='busy'){await js(`document.querySelector('.developer-file-preview-actions button').click()`);await wait("document.querySelector('.developer-file-preview-actions button').disabled")};
 if(state==='selected-error'){await row('readme0.md');await wait("!!document.querySelector('[role=alert]')")};
 if(state==='terminal'){await menu('Terminal');await choose('Open here');await wait("!!document.querySelector('.developer-terminal')")};
 if(['menu','hidden','preview-menu','checked-menu'].includes(state)){
  await js(`(()=>{const b=document.querySelector('[aria-label="File options"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menu]')");
  if(['hidden','checked-menu'].includes(state)){await js("document.querySelector('[role=menuitemcheckbox]').click()");await wait("!![...document.querySelectorAll('.developer-file-row')].find(b=>b.title==='.env.example')");if(state==='checked-menu'){await js(`(()=>{const b=document.querySelector('[aria-label="File options"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menuitemcheckbox][data-state=checked]')")}}
 }
 if(['focused','preview'].includes(state)){w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('DOM.enable');await w.webContents.debugger.sendCommand('CSS.enable');const doc=await w.webContents.debugger.sendCommand('DOM.getDocument');const match=await w.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:state==='focused'?'.developer-file-row':'.developer-file-preview'});await w.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:match.nodeId,forcedPseudoClasses:['focus','focus-visible']});}
 if(state==='closed'){await click('Close files');assert(await js("document.activeElement.textContent.trim()==='Files'"));}
 checks.push(await capture(state,width,theme));fs.writeFileSync(path.join(out,checkFile),JSON.stringify(checks,null,2));
}
terminals.dispose();fs.writeFileSync(path.join(out,checkFile),JSON.stringify(checks,null,2));console.log('PASS: Files browsing and '+checks.length+' Electron layouts.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

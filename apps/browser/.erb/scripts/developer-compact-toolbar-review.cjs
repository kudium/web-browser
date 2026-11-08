const {app,BrowserWindow,WebContentsView,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-devtools-review-')));
const out=path.join(project,process.argv.includes('--responsive')?(process.argv.includes('--no-repository')?'docs/evidence/developer-responsive-actions/no-repository':'docs/evidence/developer-compact-toolbar'):'docs/evidence/developer-header');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts',project+'/src/main/projectScripts.ts',project+'/src/main/developerProject.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {projectScripts,savedProjectScript,validScriptRequest}=require(path.join(root,'runtime/projectScripts.js'));
const {projectBreadcrumbs}=require(path.join(root,'runtime/developerProject.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{overlay:open=>ipcRenderer.invoke('overlay',open),siteDeveloper:{pages:(id)=>ipcRenderer.invoke('pages',id),onPagesChanged:()=>()=>{},files:(...args)=>ipcRenderer.invoke('files',...args),scripts:(...args)=>ipcRenderer.invoke('scripts',...args),project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
const tabs=[{id:'sample',name:'TouchBox',sessionId:'work',sessionName:'TouchBox',sessionSlug:'touchbox',url:'https://example.com',icon:''},{id:'other',name:'Documentation',sessionId:'other',sessionName:'Documentation',sessionSlug:'docs',url:'https://docs.example.com',icon:''}];
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Dialog,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperSidebar} from ${JSON.stringify(project+'/src/components/UI/DeveloperSidebar')};import {PanelOverlayProvider} from ${JSON.stringify(project+'/src/components/UI/PanelDialog')};import {useNativeOverlay} from ${JSON.stringify(project+'/src/utils/hooks/useNativeOverlay')};
function Preview(){const params=new URLSearchParams(location.search);const[container,setContainer]=useState(null);const[focused,setFocused]=useState('sample');const[manage,setManage]=useState(false);const overlay=useNativeOverlay();useEffect(()=>{window.electron.overlay(overlay)},[overlay]);window.selectGroup=setFocused;return <Theme appearance={params.get('theme')}><PanelOverlayProvider container={container}><aside className="ai-sidebar" style={{width:Number(params.get('width')),position:'absolute',right:16,top:48,height:'calc(100vh - 64px)'}}><header style={{padding:16,fontSize:14}}>Developer</header><DeveloperSidebar active focusedTabId={focused} onFocusTab={setFocused} onManageGroup={()=>setManage(true)}/><div className="ai-overlay-layer" ref={setContainer}/></aside></PanelOverlayProvider><Dialog.Root open={manage} onOpenChange={setManage}><Dialog.Content><Dialog.Title>Manage group</Dialog.Title><Dialog.Description>Group settings</Dialog.Description><Dialog.Close><Button>Done</Button></Dialog.Close></Dialog.Content></Dialog.Root></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
const mockPlugin={name:'fixture-data',setup(build){build.onLoad({filter:/\/(useAppList|AppManager|groupAccess|client)\.tsx?$/},args=>{
if(args.path.endsWith('/useAppList.ts'))return {contents:'const tabs='+JSON.stringify(tabs)+';const empty=[];export const useAppList=()=>({appList:new URLSearchParams(location.search).get("state")==="empty"?empty:tabs});'};
if(args.path.endsWith('/AppManager.ts'))return {contents:'export const AppManager={getAll:()=>'+JSON.stringify(tabs)+'};export const ScreenManager={getLastAppId:()=>"sample"};'};
if(args.path.endsWith('/groupAccess.ts'))return {contents:'export const useGroupAccess=()=>({ready:true,protected:[],unlocked:[],available:true});export const lockedGroup=()=>false;'};
if(args.path.endsWith('/browser/client.ts'))return {contents:'export const browser={onState:()=>()=>{},command:()=>{}};'};
});}};
async function buildPreview(){await esbuild.build({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],outfile:path.join(root,'preview.js'),plugins:[mockPlugin]});}
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
app.whenReady().then(async()=>{
await buildPreview();
const folder=path.join(root,'workspace','hocasa');fs.mkdirSync(folder,{recursive:true});
const other=path.join(root,'Other project');fs.mkdirSync(other);
process.env.SHELL='/bin/sh';
let w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});
w.webContents.on('console-message',(_event,_level,message)=>console.log(message));
let terminals=new ProjectTerminals(w,group=>{return group.includes('work')?folder:other;},path.join(root,'terminals.json'));

const nativePage=new WebContentsView();w.contentView.addChildView(nativePage);
fs.writeFileSync(path.join(root,'native.html'),'<html><body style="font:28px system-ui;padding:40px;background:#fff;color:#222"><h1>Native webpage</h1><p>This page remains visible beside the AI panel.</p><button onclick="document.body.dataset.clicked=1">Page action</button></body></html>');
await nativePage.webContents.loadFile(path.join(root,'native.html'));
const pendingReplies=[];
const openedFolders=[];
ipcMain.handle('project',async(event,id,action,editorId,folderPath)=>{
 assert.equal(event.sender.id,w.webContents.id);if(action==='folder')openedFolders.push(folderPath||folder);
 const state=new URL(event.sender.getURL()).searchParams.get('state');if(state==='unlinked')return null;if(state==='project-loading'&&action==='get')return new Promise(resolve=>pendingReplies.push(resolve));const unavailable=state==='unavailable';
 return {name:'hocasa',path:folder,available:!unavailable,repository:process.argv.includes('--responsive')&&!process.argv.includes('--no-repository')?'https://github.com/example/project':undefined,breadcrumbs:projectBreadcrumbs(folder,root)};
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

ipcMain.handle('pages',(event,id)=>{if(new URL(event.sender.getURL()).searchParams.get('state')==='pages-error')throw Error('Could not load group pages.');return [{id,name:id==='sample'?'Local development':'Documentation',url:'https://example.com',origin:'https://example.com',hasHooks:true,enabled:true,status:'success'}]});
ipcMain.handle('files',()=>({path:'',entries:[{name:'src',path:'src',kind:'folder'},{name:'package.json',path:'package.json',kind:'file'}]}));
let suspended=false;ipcMain.handle('overlay',(_event,open)=>{suspended=open;nativePage.setVisible(!open)});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),js=code=>w.webContents.executeJavaScript(code).catch(e=>{throw Error(code+"\n"+e.message)});
const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await pause(40)}throw Error('Timeout '+code)};
const click=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button,[role=menuitem]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await pause(200)};
const menu=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button,[role=menuitem]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[data-state=open][role=menu],.rt-PopoverContent[data-state=open]')")};
const checks=[];
const shot=async(label,width,theme)=>{await pause(250);const layout=await js(`(()=>{const segments=document.querySelector('.developer-project-views'),buttons=segments?.querySelectorAll('button'),a=buttons?.[0]?.getBoundingClientRect(),b=buttons?.[1]?.getBoundingClientRect();if(a&&b&&(Math.abs(a.height-b.height)>1||Math.abs(a.width-b.width)>1||Math.abs(a.top-b.top)>1))throw Error('Uneven segments');const launchers=[...document.querySelectorAll('.developer-project-launchers > button')].map(b=>b.getBoundingClientRect());if(launchers.some(r=>Math.abs(r.top-launchers[0].top)>0.5))throw Error('Project actions must share one evenly spaced row');const views=document.querySelector('.developer-project-views')?.getBoundingClientRect();if(views&&launchers.length&&Math.abs((views.top+views.height/2)-(launchers[0].top+launchers[0].height/2))>0.5)throw Error('Views and actions must share one row');const p=document.querySelector('.ai-sidebar').getBoundingClientRect(),m=document.querySelector('[role=menu],.rt-PopoverContent[data-state=open]'),r=m?.getBoundingClientRect();return {overflow:document.querySelector('.developer-sidebar').scrollWidth>document.querySelector('.developer-sidebar').clientWidth,menuFits:!r||(r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom),scoped:!m||!!m.closest('.ai-overlay-layer'),pages:!!document.querySelector('.developer-pages-view')&&!document.querySelector('.developer-pages-view').hidden,files:!!document.querySelector('#developer-project-files'),manage:document.querySelector('[aria-label="Manage developer group"]').getBoundingClientRect().right<=p.right}})()`);assert(!layout.overflow&&layout.menuFits&&layout.scoped&&layout.manage,JSON.stringify({label,width,theme,layout}));checks.push({label,width,theme,suspended,...layout});require('child_process').execFileSync('/usr/sbin/screencapture',['-x','-o','-l',w.getMediaSourceId().split(':')[1],path.join(out,`${width}-${theme}-${label}-native.png`)],{timeout:5000});};
if(process.argv.includes('--responsive')){
for(const width of (process.argv.includes('--no-repository')?[240,600]:[240,320,368,420,600,900]))for(const theme of ['light','dark']){
w.setContentSize(width+636,640);nativePage.setBounds({x:0,y:48,width:612,height:576});await w.loadFile(path.join(root,'index.html'),{query:{width:String(width),theme}});w.focus();w.webContents.focus();await wait("!!document.querySelector('.developer-project-launchers')");
const compact=await js("(()=>{return document.querySelector('.developer-project-actions').clientWidth<=480})()");
const actions=await js(`(()=>{const cluster=document.querySelector('.developer-project-launchers'),bounds=cluster.getBoundingClientRect();return [...cluster.querySelectorAll('button')].map(b=>{const label=b.querySelector('.developer-project-action-label'),icons=b.querySelectorAll('svg'),r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label'),title:b.title,labelVisible:getComputedStyle(label).display!=='none',arrowVisible:icons.length>1&&getComputedStyle(icons[1]).display!=='none',iconVisible:getComputedStyle(icons[0]).display!=='none',width:r.width,height:r.height,top:r.top,fits:r.left>=bounds.left-0.5&&r.right<=bounds.right+0.5}})})()`);
assert.equal(actions.length,process.argv.includes('--no-repository')?3:4);for(const action of actions){assert(action.name&&action.title&&action.iconVisible&&action.fits,JSON.stringify({width,theme,action}));assert.equal(action.labelVisible,!compact);assert.equal(action.arrowVisible,!compact&&action.name!=='Repository');assert(Math.abs(action.top-actions[0].top)<0.5&&action.height>=28);if(compact)assert(action.width>=26);}
await shot('actions',width,theme);
const rect=await js("(()=>{const r=document.querySelector('[aria-label=Terminal]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(rect.x),y:Math.round(rect.y)});await shot('hover',width,theme);
await js("document.querySelector('[aria-label=Terminal]').focus()");w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait("document.activeElement.getAttribute('aria-label')==='Editor'");await shot('keyboard-focus',width,theme);
for(const [action,label] of [['Terminal','terminal-menu'],['Editor','editor-menu'],['Scripts','scripts-menu']]){await menu(action);await shot(label,width,theme);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(150);assert(await js(`document.activeElement.getAttribute('aria-label')===${JSON.stringify(action)}`));}
}
if(!process.argv.includes('--no-repository'))for(const width of [240,420,600])for(const theme of ['light','dark'])for(const state of ['unavailable','loading','error']){
w.setContentSize(width+636,640);await w.loadFile(path.join(root,'index.html'),{query:{width:String(width),theme,state}});w.focus();w.webContents.focus();await wait("!!document.querySelector('.developer-project-launchers')");
if(state==='unavailable'){assert(await js("[...document.querySelectorAll('.developer-project-launchers button')].every(b=>b.disabled)"));await shot('disabled',width,theme);}else{await menu('Scripts');await wait(state==='loading'?"document.querySelector('[role=menu]').textContent.includes('Loading scripts')":"document.querySelector('[role=alert]')?.textContent.includes('Could not read saved scripts')");await shot('scripts-'+state,width,theme);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");}
}
fs.writeFileSync(path.join(out,'layout-checks.json'),JSON.stringify(checks,null,2));console.log('Passed '+checks.length+' responsive native layouts');terminals.dispose();w.destroy();app.quit();return;
}
if(!process.argv.includes('--error'))for(const width of (process.argv.includes('--appearance')?[600,420,240]:[420,240]))for(const theme of ['light','dark']){
w.setContentSize(width+636,640);nativePage.setBounds({x:0,y:48,width:612,height:576});await w.loadFile(path.join(root,'index.html'),{query:{width:String(width),theme}});w.focus();w.webContents.focus();await wait("!!document.querySelector('button[aria-controls=developer-project-files]')");await click('Pages');await shot('pages',width,theme);
if(process.argv.includes('--appearance')){await click('Files');await wait("!!document.querySelector('.developer-file-row')");await shot('files',width,theme);continue;}

const hoverRect=await js("(()=>{const r=document.querySelector('.developer-project-views button:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(hoverRect.x),y:Math.round(hoverRect.y)});await shot('view-hover',width,theme);
await js("document.querySelector('.developer-project-views button').focus()");w.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});await wait("document.querySelector('.developer-pages-view').hidden");await shot('view-keyboard',width,theme);assert(await js("document.activeElement===document.querySelector('.developer-project-views button:last-child')"));await click('Pages');

for(const [action,label] of [['Project options','project-options'],['Editor','editor-menu'],['Terminal','terminal-menu'],['Scripts','scripts-menu']]){await menu(action);await shot(label,width,theme);assert(!suspended);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(200);}
await menu('Developer group');await shot('group-picker',width,theme);assert(!suspended);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(200);
await click('Files');await wait("!!document.querySelector('.developer-file-row')");await shot('files',width,theme);assert(await js("document.querySelector('.developer-pages-view').hidden"));
await menu('File options');await shot('file-options',width,theme);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(200);
await js("window.selectGroup('other')");await wait("!!document.querySelector('button[aria-controls=developer-project-files]')");assert(await js("!document.querySelector('.developer-pages-view').hidden"));await js("window.selectGroup('sample')");await wait("!!document.querySelector('#developer-project-files')");await shot('restored-group',width,theme);
await w.reload();await wait("!!document.querySelector('#developer-project-files')");await shot('restored-window',width,theme);
await menu('Terminal');await click('Open here');await wait("!!document.querySelector('.developer-terminal')");await shot('files-terminal',width,theme);
await menu('Scripts');await click('Manage scripts…');await wait("!!document.querySelector('[role=dialog]')");assert(!suspended);await shot('scripts-dialog',width,theme);await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(200);
await click('Manage developer group');await wait("!!document.querySelector('[role=dialog]')");await pause(100);assert(suspended);require('child_process').execFileSync('/usr/sbin/screencapture',['-x','-o','-l',w.getMediaSourceId().split(':')[1],path.join(out,`${width}-${theme}-global-dialog-native.png`)],{timeout:5000});await click('Done');await wait("!document.querySelector('[role=dialog]')");await pause(100);assert(!suspended);
await click('Pages');
}
if(!process.argv.includes('--appearance'))for(const width of [420,240])for(const theme of ['light','dark'])for(const state of (process.argv.includes('--error')?['pages-error']:['empty','unlinked','unavailable','project-loading','pages-error'])){
w.setContentSize(width+636,640);nativePage.setBounds({x:0,y:48,width:612,height:576});await w.loadFile(path.join(root,'index.html'),{query:{width:String(width),theme,state}});w.focus();w.webContents.focus();await wait("!!document.querySelector('.developer-sidebar-toolbar')");await pause(300);await shot(state,width,theme);
if(state==='unavailable')assert(await js("document.querySelector('.developer-project-views button:last-child').disabled"));if(state==='empty')assert(await js("document.querySelector('[aria-label=\"Manage developer group\"]').disabled"));
}
fs.writeFileSync(path.join(out,process.argv.includes('--appearance')?'appearance-checks.json':process.argv.includes('--error')?'error-checks.json':'layout-checks.json'),JSON.stringify(checks,null,2));console.log('Passed '+checks.length+' native layouts'+(process.argv.includes('--appearance')||process.argv.includes('--error')?'':', group/reload restoration and global overlay suspension'));terminals.dispose();w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

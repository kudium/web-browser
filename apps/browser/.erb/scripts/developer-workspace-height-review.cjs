const {app,BrowserWindow,WebContentsView,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-devtools-review-')));
const out=path.join(project,'docs/evidence/developer-workspace-height');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
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

ipcMain.handle('pages',(event,id)=>{if(new URL(event.sender.getURL()).searchParams.get('state')==='pages-error')throw Error('Could not load group pages.');return [{id,name:id==='sample'?'Local development':'Documentation',url:'https://example.com',origin:'https://example.com',hasHooks:true,enabled:true,status:'success'}]});
ipcMain.handle('files',(_event,_id,request)=>request.action==='preview'?{path:request.path,file:{path:request.path,name:'package.json',size:10000,text:Array.from({length:500},(_,i)=>'Line '+i).join('\n')}}:{path:'',entries:[{name:'package.json',path:'package.json',kind:'file'},...Array.from({length:100},(_,i)=>({name:'file-'+i+'.ts',path:'file-'+i+'.ts',kind:'file'}))]});
let suspended=false;ipcMain.handle('overlay',(_event,open)=>{suspended=open;nativePage.setVisible(!open)});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),js=code=>w.webContents.executeJavaScript(code).catch(e=>{throw Error(code+"\n"+e.message)});
const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await pause(40)}throw Error('Timeout '+code)};
const click=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button,[role=menuitem]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await pause(200)};
const menu=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button,[role=menuitem]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[data-state=open][role=menu],.rt-PopoverContent[data-state=open]')")};
const checks=[];
const shot=async(label,width,theme)=>{await pause(250);const layout=await js(`(()=>{const segments=document.querySelector('.developer-project-views'),buttons=segments?.querySelectorAll('button'),a=buttons?.[0]?.getBoundingClientRect(),b=buttons?.[1]?.getBoundingClientRect();if(a&&b&&(Math.abs(a.height-b.height)>1||Math.abs(a.width-b.width)>1||Math.abs(a.top-b.top)>1))throw Error('Uneven segments');const p=document.querySelector('.ai-sidebar').getBoundingClientRect(),m=document.querySelector('[role=menu],.rt-PopoverContent[data-state=open]'),r=m?.getBoundingClientRect();return {overflow:document.querySelector('.developer-sidebar').scrollWidth>document.querySelector('.developer-sidebar').clientWidth,menuFits:!r||(r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom),scoped:!m||!!m.closest('.ai-overlay-layer'),pages:!!document.querySelector('.developer-pages-view')&&!document.querySelector('.developer-pages-view').hidden,files:!!document.querySelector('#developer-project-files'),manage:document.querySelector('[aria-label="Manage developer group"]').getBoundingClientRect().right<=p.right}})()`);assert(!layout.overflow&&layout.menuFits&&layout.scoped&&layout.manage,JSON.stringify({label,width,theme,layout}));checks.push({label,width,theme,suspended,...layout});require('child_process').execFileSync('/usr/sbin/screencapture',['-x','-o','-l',w.getMediaSourceId().split(':')[1],path.join(out,`${width}-${theme}-${label}-native.png`)],{timeout:5000});};

const measure=async()=>js(`(()=>{const workspace=document.querySelector('.developer-sidebar-pages').getBoundingClientRect(),list=document.querySelector('.developer-files-list'),preview=document.querySelector('.developer-file-preview'),pages=document.querySelector('.developer-pages-view'),terminal=document.querySelector('.developer-terminal'),content=list||preview||(pages&&!pages.hidden?pages:null),r=content?.getBoundingClientRect(),t=terminal?.getBoundingClientRect();return {height:r?.height,bottomGap:r?workspace.bottom-r.bottom:null,scrolls:content&&content.scrollHeight>content.clientHeight,terminalHeight:t?.height||0,terminalGap:t?Math.abs(workspace.bottom-t.top):0,outerOverflow:document.querySelector('.developer-sidebar-pages').scrollHeight-document.querySelector('.developer-sidebar-pages').clientHeight}})()`);
const review=async(label,width,theme,height)=>{if(height<640)await js("(()=>{const w=document.querySelector('.developer-sidebar-pages');w.scrollTop=w.scrollHeight})()");await shot(label+'-'+height,width,theme);const size=await measure();assert(size.height>0,JSON.stringify({label,width,height,size}));assert(size.terminalGap<2,JSON.stringify(size));if(height>=640){assert(Math.abs(size.bottomGap-16)<3,JSON.stringify({label,width,height,size}));assert(size.outerOverflow<3,JSON.stringify(size));}checks[checks.length-1].workspace=size;return size;};
for(const width of [420,240])for(const theme of ['light','dark']){
terminals.request(JSON.stringify(['work','default']),{action:'preferences',height:220,open:false});w.setContentSize(width+636,900);nativePage.setBounds({x:0,y:48,width:612,height:836});await w.loadFile(path.join(root,'index.html'),{query:{width:String(width),theme}});w.focus();w.webContents.focus();await wait("!!document.querySelector('button[aria-controls=developer-project-files]')");if(await js("!!document.querySelector('[aria-label=\"Hide terminal\"]')"))await click('Hide terminal');await click('Files');await wait("document.querySelectorAll('.developer-file-row').length>50");if(process.argv.includes('--short')){w.setContentSize(width+636,400);nativePage.setBounds({x:0,y:48,width:612,height:336});await review('files-full',width,theme,400);await menu('Terminal');await click('Open here');await wait("!!document.querySelector('.developer-terminal')");await review('files-terminal',width,theme,400);await click('Pages');await review('pages-terminal',width,theme,400);await click('Hide terminal');continue;}
const full=await review('files-full',width,theme,900);assert(full.height>220&&full.scrolls);
await click('package.json');await wait("!!document.querySelector('.developer-file-preview')");const preview=await review('preview-full',width,theme,900);assert(preview.height>240&&preview.scrolls);await click('Back to folder');
await menu('Terminal');await click('Open here');await wait("!!document.querySelector('.developer-terminal')");const split=await review('files-terminal',width,theme,900);assert(full.height-split.height>=200);
await js(`document.querySelector('[aria-label="Resize terminal"]').focus()`);for(let i=0;i<5;i++){w.webContents.sendInputEvent({type:'keyDown',keyCode:'Up'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Up'});await pause(100)}const resized=await review('files-terminal-taller',width,theme,900);assert(resized.height<split.height-80,JSON.stringify({split,resized}));
await click('Pages');await review('pages-terminal',width,theme,900);await click('Hide terminal');await review('pages-full',width,theme,900);
for(const height of [640,400]){w.setContentSize(width+636,height);nativePage.setBounds({x:0,y:48,width:612,height:height-64});await click('Files');await review('files-full',width,theme,height);await menu('Terminal');await click('Open here');await wait("!!document.querySelector('.developer-terminal')");await review('files-terminal',width,theme,height);await click('Pages');await review('pages-terminal',width,theme,height);await click('Hide terminal');}
}
fs.writeFileSync(path.join(out,process.argv.includes('--short')?'short-checks.json':'layout-checks.json'),JSON.stringify(checks,null,2));console.log('Passed '+checks.length+' workspace layouts and shared-height/scrolling assertions');terminals.dispose();w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

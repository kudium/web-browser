const {app,BrowserWindow,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-devtools-review-'));
const out=path.join(project,'docs/evidence/developer-terminal-resize');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {installedEditors,openProjectEditor}=require(path.join(root,'runtime/projectEditors.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{siteDeveloper:{project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperProjectSection} from ${JSON.stringify(project+'/src/components/UI/DeveloperProjectSection')};import {DeveloperTerminal} from ${JSON.stringify(project+'/src/components/UI/DeveloperTerminal')};
const params=new URLSearchParams(location.search);
function Preview(){const[shown,setShown]=useState(true);return <Theme appearance={params.get('theme')}><div className="ai-sidebar" style={{width:'100%',height:'100vh',border:0}}><header style={{padding:16,fontSize:14}}>Developer</header><div className="developer-sidebar" style={{minHeight:0}}><div className="developer-sidebar-toolbar"><Button color="gray" variant="soft" className="group-picker-trigger">KudiumBrowser<span style={{marginLeft:'auto'}}>⌄</span></Button></div><div className="developer-sidebar-pages"><DeveloperProjectSection sourceId="sample" active onOpenTerminal={()=>setShown(true)} onProjectChange={()=>setShown(false)}/><p className="developer-sidebar-count">2 pages · 1 with active hooks</p>{['Local development','Documentation'].map((name,i)=><button className="developer-sidebar-page" key={name}><span className="developer-sidebar-page-copy"><strong>{name}</strong><small>{i?'kudiumbrowser.dev/docs':'localhost:3000'}</small><span className={'developer-hook-status '+(i?'':'enabled')}>{i?'No hooks':'Hooks active'}</span></span></button>)}</div>{shown&&<DeveloperTerminal group="sample" active openRequest={1} onHide={()=>setShown(false)}/>}</div></div></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
app.whenReady().then(async()=>{
const folder=path.join(root,'Sample project');fs.mkdirSync(folder);
const other=path.join(root,'Other project');fs.mkdirSync(other);
process.env.SHELL='/bin/sh';
let w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
let terminals=new ProjectTerminals(w,group=>{if(!['sample','other'].includes(group))throw Error('Unknown group');return group==='sample'?folder:other;},path.join(root,'terminals.json'));
const editorState=await installedEditors();assert(editorState.editors.length,'installed editors found');
await assert.rejects(openProjectEditor(folder,'/bin/sh'),/Choose an installed/);const selected=editorState.editors.find(e=>e.name==='Sublime Text')||editorState.editors[0];if(process.argv.includes('--launch-editor')){await openProjectEditor(folder,selected.id);assert((await installedEditors()).preferred===selected.id,'editor launch and preference saved');}else fs.writeFileSync(path.join(app.getPath('userData'),'project-editors.json'),JSON.stringify({preferred:selected.id}));
ipcMain.handle('project',async(event,id,action,editorId)=>{assert.equal(event.sender.id,w.webContents.id);if(action==='editor')await openProjectEditor(folder,editorId);return {name:'KudiumBrowser',path:folder,available:true,repository:'https://github.com/example/kudiumbrowser'};});
let size={cols:80,rows:24};ipcMain.handle('editors',(event)=>{const state=new URL(event.sender.getURL()).searchParams.get('state');if(state==='editor-empty')return {editors:[]};if(state==='editor-loading')return new Promise(()=>{});if(state==='editor-error')throw Error('Could not load editors.');return installedEditors();});ipcMain.handle('terminal',(_event,group,request)=>{assert(validTerminalRequest(request));if(group==='sample'&&['open','resize'].includes(request.action))size={cols:request.cols,rows:request.rows};return terminals.request(group,request);});
const reload=async()=>{const ready=new Promise(resolve=>w.webContents.once('did-finish-load',resolve));w.reload();await ready;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=async code=>{try{return await w.webContents.executeJavaScript(code)}catch(e){console.error("Failed JS:",code);throw e}};const wait=async code=>{for(let i=0;i<80;i++){if(await js(code))return;await pause(50);}throw Error('Timeout: '+code);};
const openMenu=async name=>{await js(`document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()===${JSON.stringify(name)}){b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();}})`);await wait("!!document.querySelector('[role=menu]')");};
const choose=async text=>{
  for(let attempt=0;attempt<4;attempt++){
    const clicked=await js(`[...document.querySelectorAll('[role=menuitem],[role=menuitemcheckbox]')].some(i=>{if(i.textContent.trim()===${JSON.stringify(text)}){i.click();return true}return false})`);
    if(clicked)return;
    await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();})()`);
    await pause(120);
  }
  throw Error('Menu item unavailable: '+text);
};


const checks=[];
const capture=async(name,width,theme)=>{await pause(150);const layout=await js(`(()=>{const t=document.querySelector('.developer-terminal'),p=document.querySelector('.developer-sidebar'),h=document.querySelector('[aria-label="Resize terminal"]');return {height:t.getBoundingClientRect().height,bottom:t.getBoundingClientRect().bottom,overflow:p.scrollWidth>p.clientWidth,handleHeight:h.getBoundingClientRect().height}})()`);assert(!layout.overflow&&layout.bottom<=641&&layout.handleHeight>=12);checks.push({width,theme,name,...layout});let shot;for(let i=0;i<3;i++){try{shot=await w.webContents.capturePage();break}catch(e){if(i===2)throw e;await pause(250)}}fs.writeFileSync(path.join(out,`${width}-${theme}-${name}.png`),shot.toPNG());};
const drag=async(distance)=>{const point=await js(`(()=>{const r=document.querySelector('[aria-label="Resize terminal"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);w.webContents.sendInputEvent({type:'mouseMove',...point});w.webContents.sendInputEvent({type:'mouseDown',button:'left',...point,clickCount:1});await pause(40);w.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y-distance});await pause(50);w.webContents.sendInputEvent({type:'mouseUp',button:'left',x:point.x,y:point.y-distance,clickCount:1});await pause(100);};
for(const width of [420,240])for(const theme of ['light','dark']){
 terminals.invalidate('sample');w.setContentSize(width,640);await w.loadFile(path.join(root,'index.html'),{query:{theme,state:'terminal'}});await wait("!!document.querySelector('.developer-terminal-dot.running')");
 await capture('default',width,theme);
 await drag(240);const tall=terminals.request('sample',{action:'list'}).height;assert(tall>360,'drag grants more height than old cap');await capture('tall',width,theme);
 await drag(-260);const short=terminals.request('sample',{action:'list'}).height;assert(short<tall-150);await capture('short',width,theme);
 await reload();await wait("!!document.querySelector('.developer-terminal-dot.running')");await pause(100);assert.equal(await js("document.querySelector('.developer-terminal').getBoundingClientRect().height"),short,'saved height restores on renderer reload');
 await js(`(()=>{const h=document.querySelector('[aria-label="Resize terminal"]');h.focus();h.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))})()`);await pause(100);await capture('maximum-focus',width,theme);
 await js(`document.querySelector('[aria-label="Resize terminal"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await pause(100);assert.equal(terminals.request('sample',{action:'list'}).height,220);await capture('reset',width,theme);
 assert(!await js("document.body.classList.contains('project-terminal-dragging')"),'drag cursor is cleared');
}
terminals.dispose();fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('PASS: native mouse resizing up/down, saved height restore, keyboard resize/reset, '+checks.length+' Electron layouts.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

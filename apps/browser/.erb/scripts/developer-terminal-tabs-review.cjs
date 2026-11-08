const {app,BrowserWindow,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-devtools-review-'));
const out=path.join(project,'docs/evidence/developer-terminal-tabs');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {installedEditors,openProjectEditor}=require(path.join(root,'runtime/projectEditors.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{siteDeveloper:{project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperProjectSection} from ${JSON.stringify(project+'/src/components/UI/DeveloperProjectSection')};import {DeveloperTerminal} from ${JSON.stringify(project+'/src/components/UI/DeveloperTerminal')};
const params=new URLSearchParams(location.search);
function Preview(){const[shown,setShown]=useState(true);return <Theme appearance={params.get('theme')}><div className="ai-sidebar" style={{width:'100%',height:'100vh',border:0}}><header style={{padding:16,fontSize:14}}>Developer</header><div className="developer-sidebar" style={{minHeight:0}}><div className="developer-sidebar-toolbar"><Button color="gray" variant="soft" className="group-picker-trigger">TouchBox<span style={{marginLeft:'auto'}}>⌄</span></Button></div><div className="developer-sidebar-pages"><DeveloperProjectSection sourceId="sample" active onOpenTerminal={()=>setShown(true)} onProjectChange={()=>setShown(false)}/><p className="developer-sidebar-count">2 pages · 1 with active hooks</p>{['Local development','Documentation'].map((name,i)=><button className="developer-sidebar-page" key={name}><span className="developer-sidebar-page-copy"><strong>{name}</strong><small>{i?'touchbox.dev/docs':'localhost:3000'}</small><span className={'developer-hook-status '+(i?'':'enabled')}>{i?'No hooks':'Hooks active'}</span></span></button>)}</div>{shown&&<DeveloperTerminal group="sample" active openRequest={1} onHide={()=>setShown(false)}/>}</div></div></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
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
ipcMain.handle('project',async(event,id,action,editorId)=>{assert.equal(event.sender.id,w.webContents.id);if(action==='editor')await openProjectEditor(folder,editorId);return {name:'TouchBox',path:folder,available:true,repository:'https://github.com/example/touchbox'};});
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

if(process.argv.includes('--keyboard-only')) {
 for(const width of [420,240]) {
  terminals.invalidate('sample');w.setContentSize(width,640);await w.loadFile(path.join(root,'index.html'),{query:{theme:'dark',state:'terminal'}});
  await wait("!!document.querySelector('.developer-terminal-dot.running')");await js(`document.querySelector('[aria-label="New terminal"]').click()`);await wait("document.querySelectorAll('[role=tab]').length===2");
  await js(`(()=>{const tabs=document.querySelectorAll('[role=tab]');tabs[1].focus();tabs[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));})()`);
  await wait("document.querySelectorAll('[role=tab]')[0].getAttribute('aria-selected')==='true'");await pause(80);assert(await js("document.activeElement===document.querySelectorAll('[role=tab]')[0]"),'arrow navigation keeps tab focus');
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);await wait("document.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected')==='true'");
 }
 terminals.dispose();console.log('PASS: keyboard tab navigation and focus at 420/240px');w.destroy();app.quit();return;
}
const checks=[];
for(const width of [420,240]) for(const theme of ['light','dark']) {
console.log('Review:',width,theme);
  terminals.invalidate('sample'); process.env.SHELL='/bin/sh';
  w.setContentSize(width,640); await w.loadFile(path.join(root,'index.html'),{query:{theme,state:'terminal'}});
  await wait("!!document.querySelector('.developer-terminal-dot.running')");
  const first=terminals.request('sample',{action:'list'}).selected;
  terminals.request('sample',{action:'write',tab:first,data:"printf '\\033[32mServer ready on localhost:3000\\033[0m\\n'\r"});
  await pause(150);
  const capture=async state=>{
    await pause(120);
    const result=await js(`(()=>{const p=document.querySelector('.developer-sidebar'),t=document.querySelector('.developer-terminal'),menu=document.querySelector('[role=menu]'),dialog=document.querySelector('[role=dialog]');const rect=(menu||dialog)?.getBoundingClientRect();return {overflow:p.scrollWidth>p.clientWidth,terminalBottom:t?.getBoundingClientRect().bottom,disclosureFits:!rect||rect.left>=0&&rect.right<=innerWidth,headerHeight:document.querySelector('.developer-terminal-heading')?.getBoundingClientRect().height}})()`);
    assert(!result.overflow&&result.disclosureFits,JSON.stringify({width,theme,state,result}));
    if(result.headerHeight)assert(result.headerHeight<=40);
    checks.push({width,theme,state,...result});
    await pause(250);let screenshot;for(let attempt=0;attempt<3;attempt++){try{screenshot=await w.webContents.capturePage();break;}catch(error){if(attempt===2)throw error;await pause(300);}}fs.writeFileSync(path.join(out,`${width}-${theme}-${state}.png`),screenshot.toPNG());
  };
  const surface=await js("getComputedStyle(document.querySelector('.developer-terminal-surface')).backgroundColor");
  assert.equal(surface,theme==='light'?'rgb(249, 249, 252)':'rgb(23, 24, 27)');
  await capture('single');
  await js(`document.querySelector('[aria-label="New terminal"]').click()`);
  await wait("document.querySelectorAll('[role=tab]').length===2");
  const second=terminals.request('sample',{action:'list'}).selected;assert.notEqual(first,second);
  await wait("document.querySelectorAll('.developer-terminal-dot.running').length===2");
  await capture('multiple');
  await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();})()`);
  await wait("!!document.querySelector('[role=menu]')");await capture('menu');
  await choose('Rename tab…');await wait(`!!document.querySelector('[aria-label="Terminal name"]')`);
  await capture('rename-focus');
  await js(`(()=>{const input=document.querySelector('[aria-label="Terminal name"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Build & test');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(60);await js(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await wait("!document.querySelector('[role=dialog]')");
  assert.equal(terminals.request('sample',{action:'list'}).tabs[1].name,'Build & test');
  await capture('renamed');
  // A long-running process writes while another tab and group are active.
  terminals.request('sample',{action:'write',tab:first,data:"sleep 1; printf 'BACKGROUND_OK\\n'\r"});
  await js(`document.querySelector('[role=tab]').click()`);await pause(80);
  terminals.request('other',{action:'create'});await pause(1300);
  assert(terminals.request('sample',{action:'attach',tab:first,cols:80,rows:24}).data.includes('BACKGROUND_OK'));
  await js(`document.querySelector('[aria-label="Hide terminal"]').click()`);await wait("!document.querySelector('.developer-terminal')");
  assert.equal(terminals.request('sample',{action:'list'}).open,false);
  assert(terminals.request('sample',{action:'list'}).tabs.every(t=>t.running));await capture('hidden');
  // Reloading the renderer reconnects instead of restarting either shell.
  await reload();await wait("document.querySelectorAll('.developer-terminal-dot.running').length===2");await capture('reconnected');
  await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();})()`);await wait("!!document.querySelector('[role=menu]')");await choose('Stop terminal');await wait("document.querySelectorAll('.developer-terminal-dot.running').length===1");await capture('stopped');
  await js("document.querySelector('.xterm-helper-textarea').focus()");
  w.webContents.sendInputEvent({type:'keyDown',keyCode:'c',modifiers:['control']});
  w.webContents.sendInputEvent({type:'keyUp',keyCode:'c',modifiers:['control']});
  await wait("document.querySelectorAll('.developer-terminal-dot.running').length===2 && !document.querySelector('.developer-terminal-notice')");
  const interruptTab=terminals.request('sample',{action:'list'}).selected;
  terminals.request('sample',{action:'write',tab:interruptTab,data:'sleep 30\r'});
  await pause(200);await js("document.querySelector('.xterm-helper-textarea').focus()");
  w.webContents.sendInputEvent({type:'keyDown',keyCode:'c',modifiers:['meta']});
  w.webContents.sendInputEvent({type:'keyUp',keyCode:'c',modifiers:['meta']});
  await pause(150);
  terminals.request('sample',{action:'write',tab:interruptTab,data:"printf 'INTERRUPT_OK\\n'\r"});
  for(let i=0;i<40;i++){if(terminals.request('sample',{action:'read',tab:interruptTab}).data.includes('INTERRUPT_OK\r\n'))break;await pause(50);}
  assert(terminals.request('sample',{action:'read',tab:interruptTab}).data.includes('INTERRUPT_OK\r\n'),'Command+C interrupts sleep and shell accepts next command');
  for(const modifiers of [['control'],['meta']]) {
    await js("document.querySelector('.xterm-helper-textarea').focus()");
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'k',modifiers});
    w.webContents.sendInputEvent({type:'keyUp',keyCode:'k',modifiers});
    await pause(150);
    assert.equal(terminals.request('sample',{action:'read',tab:interruptTab}).data,'','Ctrl/Cmd+K clears saved output');
  }
  terminals.request('sample',{action:'close',tab:interruptTab});
  await wait("document.querySelectorAll('.developer-terminal-dot.running').length===1");
  const selected=terminals.request('sample',{action:'list'}).selected;
  await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();})()`);await wait("!!document.querySelector('[role=menu]')");await choose('Close tab');await wait("document.querySelectorAll('[role=tab]').length===1");
  await js(`(()=>{const b=document.querySelector('[aria-label="Terminal actions"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click();})()`);await wait("!!document.querySelector('[role=menu]')");await choose('Close tab and stop process');await wait("!!document.querySelector('.developer-terminal-empty')");await capture('empty');
  await js(`document.querySelector('.developer-terminal-empty button').click()`);await wait("!!document.querySelector('.developer-terminal-dot.running')");
  terminals.dispose();
  terminals=new ProjectTerminals(w,group=>group==='sample'?folder:other,path.join(root,'terminals.json'));
  await reload();await wait("!!document.querySelector('.developer-terminal-dot.running')");assert(!await js("!!document.querySelector('.developer-terminal-notice')"));await capture('restored');
  terminals.invalidate('sample');process.env.SHELL='/missing/shell';await reload();await wait("!!document.querySelector('.developer-terminal-error')");await capture('error');
  process.env.SHELL='/bin/sh';terminals.dispose();
}
// Disk restore uses a fresh manager and never starts restored commands.
terminals.request('sample',{action:'preferences',open:true,height:280});terminals.flush();
const next=new ProjectTerminals(w,()=>folder,path.join(root,'terminals.json'));
const disk=next.request('sample',{action:'list'});assert(disk.open&&disk.height===280&&disk.tabs.every(t=>!t.running&&t.restored));next.dispose();
// A new native browser window reconnects to the original running process.
terminals.invalidate('sample');process.env.SHELL='/bin/sh';
const liveTab=terminals.request('sample',{action:'create'}).selected;
terminals.request('sample',{action:'write',tab:liveTab,data:"sleep 1; printf 'WINDOW_RECONNECT_OK\\n'\r"});
terminals.detachHost(w);w.destroy();
w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
terminals.attachHost(w);await w.loadFile(path.join(root,'index.html'),{query:{theme:'dark',state:'terminal'}});
await wait("!!document.querySelector('.developer-terminal-dot.running')");await pause(1400);
assert(terminals.request('sample',{action:'attach',tab:liveTab,cols:80,rows:24}).data.includes('WINDOW_RECONNECT_OK'));
terminals.dispose();
fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('Evidence: '+out);console.log('PASS: theme, automatic reconnect, Ctrl/Cmd+C interrupt and Ctrl/Cmd+K clear; multitab, rename, background process, renderer reconnection, visibility and disk restoration; '+checks.length+' native Electron layouts.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

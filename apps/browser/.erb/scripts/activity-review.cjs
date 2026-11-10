const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-review-'));
const out=path.join(project,'docs/evidence/activity');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(root,'profile'));app.on('window-all-closed',()=>{});
let mode='normal'; let entries;
const samples=()=>[
{id:'one',title:'Research verdict is ready',message:'Compared three browser automation tools. The note includes a recommendation, tradeoffs, and supporting sources.',source:'ai',noteId:'sample',asRead:false,createdAt:Date.now()-120000},
{id:'two',title:'Price dropped on your watched page',message:'The listed price changed from $129 to $99.',url:'https://example.com',source:'hook',asRead:false,createdAt:Date.now()-3600000},
{id:'three',title:'Page hook completed',message:'No change was detected.',source:'hook',asRead:true,createdAt:Date.now()-86400000}];
ipcMain.handle('activity',(_e,r)=>{if(mode==='error')throw Error('Unavailable');if(r.action==='list')return mode==='empty'?[]:entries;if(r.action==='delete')entries=entries.filter(e=>e.id!==r.id);if(r.action==='readAll')entries=entries.map(e=>({...e,asRead:true}));if(r.action==='read')entries=entries.map(e=>e.id===r.id?{...e,asRead:true}:e);});
fs.writeFileSync(path.join(root,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{activity:r=>ipcRenderer.invoke('activity',r),onActivityChanged:()=>()=>{},browser:{tooltip:async()=>{}}});`);
fs.writeFileSync(path.join(root,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{Theme}from'@radix-ui/themes';import'@radix-ui/themes/styles.css';import '${project}/src/renderer/index.css';import{ActivityPage}from'${project}/src/components/UI/ActivityPage';createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme') as any}><aside className="ai-sidebar" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}><ActivityPage active/></aside></Theme>);`);
require(project+'/node_modules/esbuild').buildSync({entryPoints:[path.join(root,'entry.tsx')],bundle:true,outfile:path.join(root,'preview.js'),platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],define:{'process.env.NODE_ENV':'"development"'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
for(const theme of ['light','dark'])for(const width of [240,368,640]){
 const win=new BrowserWindow({width,height:620,show:false,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,sandbox:true}});
 const run=s=>win.webContents.executeJavaScript(s); const shot=async state=>{await pause(60);fs.writeFileSync(path.join(out,`${theme}-${width}-${state}.png`),(await win.webContents.capturePage()).toPNG());assert(await run('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow');};
 const load=async()=>{await win.loadFile(path.join(root,'index.html'),{query:{theme}});await pause(160);};
 mode='normal';entries=samples();await load();await shot('collapsed');
 assert(await run("getComputedStyle(document.querySelector('.activity-copy')).opacity==='0'"),'actions hidden at rest');
 win.webContents.debugger.attach('1.3');
 const doc=await win.webContents.debugger.sendCommand('DOM.getDocument');
 const {nodeId}=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.activity-item'});
 await win.webContents.debugger.sendCommand('CSS.enable');
 await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});await pause(300);await shot('hover');
 assert(await run("getComputedStyle(document.querySelector('.activity-delete')).opacity==='1'"),'delete visible on hover');
 await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});win.webContents.debugger.detach();
 await run("document.querySelector('.activity-summary').click()");await shot('expanded');
 await run("document.querySelector('.activity-copy').focus()");await shot('focused');
 await run("document.querySelector('.activity-summary').click()");await shot('collapsed-again');
 await run("document.querySelector('.activity-read-all').click()");await shot('all-read');assert(await run("document.querySelector('.activity-read-all').disabled"),'read-all disabled');
 mode='empty';await load();await shot('empty');mode='error';await load();await shot('error');win.destroy();
}console.log('48 Activity Electron captures passed at 240, 368 and 640px in light/dark.');app.quit();}catch(e){console.error(e);app.exit(1);}});

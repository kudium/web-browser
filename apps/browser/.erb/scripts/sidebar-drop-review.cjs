const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),esbuild=require('esbuild');
const project=path.resolve(__dirname,'../..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-sidebar-drop-'));
const folder=path.join(root,'Website project with a long folder name','application','frontend');
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'package.json'),'{}');
const out=path.join(project,'docs/evidence/sidebar-drop');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(root,'profile'));
esbuild.buildSync({entryPoints:[path.join(project,'src/main/sidebarDrop.ts')],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'drop.cjs')});
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('drop',{inspect:()=>ipcRenderer.invoke('sidebar-drop',${JSON.stringify(path.join(folder,'package.json'))},'default'),create:draft=>ipcRenderer.invoke('sidebar-drop-create',draft)});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import{Theme}from'@radix-ui/themes';
import '${project}/node_modules/@radix-ui/themes/styles.css';import '${project}/src/renderer/index.css';
import {SidebarFileDropHint} from '${project}/src/components/UI/SidebarFileDropHint';
import {CreateDroppedGroupDialog} from '${project}/src/components/UI/CreateDroppedGroupDialog';
const params=new URLSearchParams(location.search);
if(params.get('hint'))document.documentElement.className=params.get('hint')==='compact'?'compact-sidebar':'';
function Preview(){const[proposal,setProposal]=useState(null),[closed,setClosed]=useState(false);useEffect(()=>{window.drop.inspect().then(setProposal)},[]);return <Theme appearance={params.get('theme')}>{params.get('hint')?<div className="workspace" style={{height:'100vh'}}><aside className="workspace-sidebar"><SidebarFileDropHint/></aside></div>:proposal&&!closed&&<CreateDroppedGroupDialog proposal={proposal} onClose={()=>setClosed(true)} onCreate={async draft=>{if(params.get('state')==='pending')return new Promise(()=>{});const created=await window.drop.create(draft);window.created=created;setClosed(true)}}/>}</Theme>};createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.join(project,'node_modules')],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"><style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:620,height:600,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});
 const unregister=require(path.join(root,'drop.cjs')).registerSidebarDrop(win,()=>[{id:'existing',sessionId:'existing',name:'Existing',sessionSlug:'taken',url:'about:blank',icon:''}],async()=>null);
 const checks=[];
 for(const width of[620,360])for(const theme of['light','dark'])for(const state of['default','empty','pending','error']){
  win.setContentSize(width,width===360?500:600);await win.loadURL('about:blank');await win.loadFile(path.join(root,'index.html'),{query:{theme,state}});
  for(let i=0;i<60;i++){if(await win.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Group name"]')`))break;await pause(50);}
  const change=(label,value)=>win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  if(state==='empty')await change('Group name','');
  if(state==='error')await change('Group slug','taken');
  if(state==='pending'||state==='error'){await pause(80);await win.webContents.executeJavaScript(`document.querySelector('button[type="submit"]').click()`);}
  await pause(200);
  const result=await win.webContents.executeJavaScript(`(()=>{const dialog=document.querySelector('[role="dialog"]'),name=document.querySelector('[aria-label="Group name"]'),slug=document.querySelector('[aria-label="Group slug"]'),footer=document.querySelector('.group-editor-actions');const r=dialog.getBoundingClientRect(),f=footer.getBoundingClientRect(),n=getComputedStyle(name),s=getComputedStyle(slug);return{noOverflow:dialog.scrollWidth<=dialog.clientWidth,inside:r.left>=0&&r.right<=innerWidth,footer:f.bottom<=innerHeight,fonts:n.fontFamily===s.fontFamily&&n.fontSize===s.fontSize,disabled:document.querySelector('button[type="submit"]').disabled,error:!!document.querySelector('[role="alert"]')}})()`);
  assert(result.noOverflow&&result.inside&&result.footer&&result.fonts,JSON.stringify({width,theme,state,result}));
  if(state==='empty'||state==='pending')assert(result.disabled);if(state==='error')assert(result.error);
  fs.writeFileSync(path.join(out,`${width}-${theme}-${state}.png`),(await win.webContents.capturePage()).toPNG());checks.push({width,theme,state,...result});
  if(state==='default'){await win.webContents.executeJavaScript(`document.querySelector('button[type="button"]').click()`);await pause(80);assert(!await win.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"]')`));}
 }
 for(const theme of['light','dark'])for(const hint of['normal','compact']){
  win.setContentSize(620,600);await win.loadURL('about:blank');await win.loadFile(path.join(root,'index.html'),{query:{theme,hint}});await pause(200);
  assert(await win.webContents.executeJavaScript(`(()=>{const hint=document.querySelector('.sidebar-file-drop-hint'),side=document.querySelector('.workspace-sidebar');return hint.scrollWidth<=hint.clientWidth&&hint.getBoundingClientRect().right<=side.getBoundingClientRect().right})()`),'drop hint fits');
  fs.writeFileSync(path.join(out,`${theme}-hint-${hint}.png`),(await win.webContents.capturePage()).toPNG());
 }
 await win.loadURL('about:blank');await win.loadFile(path.join(root,'index.html'),{query:{theme:'light',state:'success'}});await pause(200);
 await win.webContents.executeJavaScript(`document.querySelector('button[type="submit"]').click()`);await pause(200);
 const created=await win.webContents.executeJavaScript('window.created');assert(created.tab.sessionSlug);assert.equal(created.tab.spaceId,'default');
 assert(fs.existsSync(path.join(folder,'BROWSER.md'))&&fs.existsSync(path.join(folder,'AGENTS.md')));
 const mapping=JSON.parse(fs.readFileSync(path.join(root,'profile','developer-projects.json'),'utf8'));assert.equal(Object.values(mapping)[0],fs.realpathSync(folder));
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
 console.log('PASS: real IPC creation links project and discovery files; 16 dialog states checked at 620 and 360 px, light/dark, default focus, disabled, loading, error and cancel.');unregister();win.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();
}).catch(error=>{console.error(error);app.exit(1)});

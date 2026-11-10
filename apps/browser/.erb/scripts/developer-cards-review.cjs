const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'developer-cards-')),out=path.join(project,'docs/evidence/developer-cards');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));app.on('window-all-closed',()=>{});
const tabs=[{id:'research',name:'Research',sessionId:'research',sessionName:'Research',sessionSlug:'research',url:'https://example.com',icon:''}];
const data=['Research overview','Customer interviews','Design references','A long page name to check truncation and narrow layout','New tab'].map((name,i)=>({id:i?'page'+i:'research',name,url:i===4?'about:blank':'https://example.com/research/collections?page='+i,origin:i===4?'':'https://example.com',hasHooks:i>0&&i<4,enabled:i===1||i===3,status:i===3?'error':'success'}));
fs.writeFileSync(path.join(root,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{Theme}from'@radix-ui/themes';import'@radix-ui/themes/styles.css';import '${project}/src/renderer/index.css';import{DeveloperSidebar}from'${project}/src/components/UI/DeveloperSidebar';window.commands=[];window.electron={siteDeveloper:{pages:async()=>{const state=new URLSearchParams(location.search).get('state');if(state==='error')throw Error('Could not load pages');return state==='empty'?[]:${JSON.stringify(data)}},onPagesChanged:()=>()=>{},terminal:async()=>({})}} as any;createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme') as any}><aside className="ai-sidebar" style={{width:'100%',height:'100vh'}}><DeveloperSidebar active/></aside></Theme>);`);
const plugin={name:'fixture',setup(build){build.onLoad({filter:/\/(useAppList|AppManager|groupAccess|client|DeveloperProjectSection|DeveloperTerminal)\.tsx?$/},({path:p})=>{
if(p.endsWith('/useAppList.ts'))return{contents:'const tabs='+JSON.stringify(tabs)+';export const useAppList=()=>({appList:tabs});'};
if(p.endsWith('/AppManager.ts'))return{contents:'export const AppManager={getAll:()=>'+JSON.stringify(tabs)+'};export const ScreenManager={getLastAppId:()=>"research"};'};
if(p.endsWith('/groupAccess.ts'))return{contents:'export const useGroupAccess=()=>({});export const lockedGroup=()=>false;'};
if(p.endsWith('/client.ts'))return{contents:'export const browser={onState:()=>()=>{},command:value=>window.commands.push(value),nativeMenu:async()=>undefined};'};
if(p.endsWith('/DeveloperProjectSection.tsx'))return{contents:'export const DeveloperProjectSection=()=>null;'};
return{contents:'export const DeveloperTerminal=()=>null;'};
});}};

fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{await require(project+'/node_modules/esbuild').build({entryPoints:[path.join(root,'entry.tsx')],bundle:true,outfile:path.join(root,'preview.js'),platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],plugins:[plugin],loader:{'.woff2':'dataurl'}});for(const theme of ['light','dark'])for(const width of [272,640]){
const w=new BrowserWindow({width,height:640,show:true,webPreferences:{contextIsolation:false}});const run=s=>w.webContents.executeJavaScript(s);
const shot=async state=>{await pause(150);assert(await run('document.documentElement.scrollWidth<=innerWidth'),'overflow');fs.writeFileSync(path.join(out,`${theme}-${width}-${state}.png`),(await w.webContents.capturePage()).toPNG());};
await w.loadFile(path.join(root,'index.html'),{query:{theme}});await pause(500);await shot('list');
assert(await run('document.querySelectorAll(".developer-sidebar-page").length===5'),'page count');assert(await run('[...document.querySelectorAll(".developer-sidebar-page")].every(e=>getComputedStyle(e).borderTopWidth==="0px"&&e.scrollWidth<=e.clientWidth)'),'cards fit without borders');
await run('document.querySelector(".developer-sidebar-page").focus()');await shot('focus');const bounds=await run('(()=>{const r=document.querySelector(".developer-sidebar-page").getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()');w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(bounds.x),y:Math.round(bounds.y)});await shot('hover');
await run('document.querySelector(".developer-sidebar-page").click()');assert(await run('window.commands[0].action==="open-site-developer"'),'whole card action');
for(const state of ['empty','error']){await w.loadFile(path.join(root,'index.html'),{query:{theme,state}});await pause(300);await shot(state);}w.destroy();
}console.log('Developer cards reviewed at 272/640px, light/dark: list, focus, hover, disabled, empty, error; whole-card action passed.');app.quit();}catch(e){console.error(e);app.exit(1);}});

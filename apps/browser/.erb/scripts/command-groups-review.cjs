const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os'); const esbuild = require('esbuild'); const assert = require('assert');
const project = path.resolve(__dirname, '../..'); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-groups-')); const out = path.join(project, 'docs/evidence/command-groups'); fs.mkdirSync(out, {recursive:true}); app.setPath('userData', path.join(root,'profile'));
fs.writeFileSync(path.join(root,'preview.tsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client'; import {Theme} from '@radix-ui/themes';
import '${project}/node_modules/@radix-ui/themes/styles.css'; import '${project}/src/renderer/index.css'; import {CommandPalette} from '${project}/src/components/UI/CommandPalette';
const apps = [{id:'a',name:'Overview',sessionName:'Development',sessionSlug:'development',sessionId:'dev',spaceId:'default',folderId:'f',url:'https://example.com',icon:'',tags:['development']},{id:'b',name:'Issues',sessionName:'Development',sessionSlug:'development',sessionId:'dev',spaceId:'default',url:'https://example.com/issues',icon:''}];
apps.push(...Array.from({length:6},(_,index)=>({id:'group'+index,name:index===0?'Create a short feature video for a development workspace with a long name':'Reading '+(index+1),sessionName:index===0?'Create a short feature video for a development workspace with a long name':'Reading '+(index+1),sessionSlug:'reading-workspace-with-a-long-readable-slug-'+index,sessionId:'reading'+index,spaceId:'default',url:'https://reading.example.com/'+index,icon:''})));
localStorage.setItem('user_apps',JSON.stringify(apps)); localStorage.setItem('kudiumbrowser-spaces',JSON.stringify([{id:'default',name:'Personal',color:'blue',folders:[{id:'f',name:'Development projects'}]}]));
window.electron = {platform:'darwin',ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}},groupLocks:{onState:()=>()=>{},request:async()=>({groups:[]})},browser:{onShortcut:()=>()=>{},preferences:async()=>({searchEngines:[{id:'duck',name:'DuckDuckGo',url:'https://duckduckgo.com/?q=%s'}]})}};
createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme')} accentColor="iris"><CommandPalette open onOpenChange={()=>{}} apps={apps} select={(app)=>{window.selectedTab=app.id}} groupSource={apps[0]} newSpace={()=>{}}/></Theme>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.join(project,'node_modules')],outfile:path.join(root,'preview.js')}); fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"><style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:760,height:650,useContentSize:true,webPreferences:{contextIsolation:false,nodeIntegration:false,backgroundThrottling:false}});const checks=[];
 const type=async(text)=>{await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(150)};
 for(const width of [760,360]) for(const theme of ['light','dark']) {
  win.setContentSize(width,650);await win.loadFile(path.join(root,'index.html'),{query:{theme}});await pause(350);
  for(const state of ['empty','matching','slug','group','filtered','created','tag']) {
   if(state==='matching')await type('develop');
   if(state==='slug')await type('@dev');
   if(state==='group'){await win.webContents.executeJavaScript("document.querySelector('input').focus()");await win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});await win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await pause(150);}
   if(state==='filtered')await type('Issues');
   if(state==='created'){await type('https://new.example.com/path');await win.webContents.executeJavaScript("document.querySelector('form').requestSubmit()");await pause(150);const created=await win.webContents.executeJavaScript("JSON.parse(localStorage.getItem('user_apps')).find(tab=>tab.url==='https://new.example.com/path')");assert(created?.sessionId==='dev'&&created?.spaceId==='default','new tab stays in scoped group');}
   if(state==='tag'){await win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await pause(80);await type('#dev');}
   const check=await win.webContents.executeJavaScript(`(()=>{const d=document.querySelector('.command-dialog');return {noOverflow:d.scrollWidth<=d.clientWidth, text:document.querySelector('.command-results').innerText,scope:document.querySelector('.command-search-scope')?.innerText}})()`);
   const metrics=await win.webContents.executeJavaScript(`(()=>{const d=document.querySelector('.command-dialog').getBoundingClientRect(),form=document.querySelector('form').getBoundingClientRect(),input=document.querySelector('input').closest('.rt-TextFieldRoot'),row=document.querySelector('.command-result').getBoundingClientRect();return {inside:d.left>=0&&d.right<=innerWidth&&d.bottom<=innerHeight,headerHeight:form.height,rowHeight:row.height,inputClear:getComputedStyle(input).backgroundColor==='rgba(0, 0, 0, 0)',padding:getComputedStyle(document.querySelector('.command-dialog')).paddingTop}})()`);assert(metrics.inside&&metrics.headerHeight<=61&&metrics.rowHeight<=49&&metrics.inputClear&&metrics.padding==='0px',JSON.stringify(metrics));
   assert(check.noOverflow,JSON.stringify({width,theme,state,check}));
   if(state==='matching')assert(check.text.includes('Folder')&&check.text.includes('Tag')&&check.text.includes('Group'));
   if(state==='slug')assert(check.text.includes('@development')&&!check.text.includes('New group'));
   if(state==='group')assert(check.scope?.includes('Development')&&check.text.includes('Issues'));
   if(state==='filtered')assert(check.text.includes('Issues')&&!check.text.includes('Overview'));
   if(state==='tag')assert(check.text.includes('#development'));
   fs.writeFileSync(path.join(out,`${width}-${theme}-${state}.png`),(await win.webContents.capturePage()).toPNG());checks.push({width,theme,state,...check});
  }
 }
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log(`${checks.length} states passed`);win.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();
}).catch(error=>{console.error(error);app.exit(1)});

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const esbuild = require('esbuild');
const assert = require('assert');
const routingOnly = process.argv.includes('--routing-only');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-preferences-'));
const out = path.join(project, 'docs/evidence/workspace-preferences');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
app.on('window-all-closed', () => {});
fs.writeFileSync(path.join(root, 'preview.tsx'), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@radix-ui/themes';
import '${project}/node_modules/@radix-ui/themes/styles.css';
import '${project}/src/renderer/index.css';
import {Workspace} from '${project}/src/components/View/Settings/tabs/Workspace';
import {Settings} from '${project}/src/components/View/Settings/Settings';
import {defaultPreferences} from '${project}/src/browser/preferences';
const params=new URLSearchParams(location.search);
localStorage.setItem('user_apps',JSON.stringify(params.get('empty') ? [] : [
{id:'one',name:'TouchBox',sessionId:'one',url:'https://example.com',spaceId:'default'},
{id:'two',name:'Documentation',sessionId:'two',url:'https://example.com/docs',spaceId:'work'},
{id:'old',name:'Archived research',sessionId:'old',url:'https://example.com/research',spaceId:'default',archived:true}]));
localStorage.setItem('touchbox-spaces',JSON.stringify([{id:'default',name:'Personal',color:'blue',folders:[]},{id:'work',name:'Work',color:'gray',folders:[]}]));
const listeners=new Set();
window.electron={platform:'darwin',ipcRenderer:{on:(channel,cb)=>{listeners.add(cb);return ()=>listeners.delete(cb);},sendMessage:(channel,data)=>{if(channel==='ipc-event-bus')listeners.forEach(cb=>cb(data));}},browser:{preferences:async()=>defaultPreferences,preferenceAction:async()=>({profiles:[],languages:['en-US'],versions:{touchbox:'1',engine:'1',chromium:'1'}}),onPreferences:()=>()=>{},onPreferenceSection:cb=>{if(!params.has('initial'))setTimeout(()=>cb(params.get('tab')||'apps'),30);return ()=>{};}}};
createRoot(document.getElementById('root')).render(<Theme appearance={params.get('theme')} accentColor="blue"><Settings/></Theme>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.join(project,'node_modules')],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:1000,height:760,useContentSize:true,webPreferences:{contextIsolation:false,backgroundThrottling:false}});
 if(routingOnly) {
  for(const tab of ['apps','spaces','archive']) {
   await win.loadURL('about:blank');
   await win.loadFile(path.join(root,'index.html'),{query:{theme:'light',initial:'true'},hash:tab});await pause(350);
   assert(await win.webContents.executeJavaScript(`document.querySelector('.preferences-main h1')?.textContent === 'Workspace'`),'Workspace destination');
   assert(await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=radio]')].some(el => el.textContent.includes('${{apps:'Groups',spaces:'Spaces',archive:'Archive'}[tab]}') && el.getAttribute('aria-checked') === 'true')`),'Workspace subtab');
  }
  console.log('First-launch Workspace routing passed for Groups, Spaces and Archive.');
 } else for(const width of [1000,760]) for(const theme of ['light','dark']) for(const tab of ['apps','spaces','archive']) {
  win.setContentSize(width,760);
  await win.loadFile(path.join(root,'index.html'),{query:{theme,tab}});await pause(350);
  const capture=async state=>{await pause(150);fs.writeFileSync(path.join(out,`${width}-${theme}-${tab}-${state}.png`),(await win.webContents.capturePage()).toPNG());};
  const bounds=await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('.preferences-main');return e.scrollWidth<=e.clientWidth;})()`);
  assert(bounds,'Main overflow');
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.workspace-settings button')].find(b=>b.textContent.includes('${tab==='apps'?'Archive':'Groups'}')).click()`);await pause(80);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.workspace-settings button')].find(b=>b.textContent.includes('${{apps:'Groups',spaces:'Spaces',archive:'Archive'}[tab]}')).click()`);await capture('list');
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Select all"]').click()`);await capture('selected');
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('selected…')).click()`);await capture('confirm');
  assert(await win.webContents.executeJavaScript(`!!document.querySelector('[role="alertdialog"]')`));
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role="alertdialog"] button')].find(b=>/^(Remove|Delete) [0-9]/.test(b.textContent)).click()`);await capture('removed');
  assert(await win.webContents.executeJavaScript(`!document.querySelector('[role="alertdialog"]')`));
  if(tab!=='spaces')assert(await win.webContents.executeJavaScript(`document.querySelectorAll('.workspace-settings .app-row').length===0`));
 }
 win.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-hook-selection-'));
app.setPath('userData',path.join(root,'profile'));
fs.writeFileSync(path.join(root,'entry.tsx'),`
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {SiteDeveloperPanel} from ${JSON.stringify(path.resolve('src/components/UI/SiteDeveloperPanel'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
window.electron={getSetting:async()=> 'dark',setting:{get:async()=> 'dark',on:()=>()=>{}},hookLanguage:{request:async()=>({diagnostics:[]})}};
function Test(){const config={enabled:true,before:'',after:'log("default")',css:'',hooks:[{id:'one',name:'One',enabled:false,path:'/*',before:'',after:'log("one")',css:''},{id:'two',name:'Two',enabled:false,path:'/*',before:'',after:'log("two")',css:''}]};return <Theme><SiteDeveloperPanel developer={{config,status:'waiting',logs:[]}} disabled={false} send={()=>{}} /></Theme>}
createRoot(document.getElementById('root')).render(<Test/>);`);
require('esbuild').buildSync({entryPoints:[path.join(root,'entry.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'app.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script>');
app.whenReady().then(async()=>{
 const window=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 try{
 await window.loadFile(path.join(root,'index.html'));
 for(let i=0;i<40;i++){if(await window.webContents.executeJavaScript('!!document.querySelector(".cm-content")'))break;await new Promise(r=>setTimeout(r,50));}
 await window.webContents.executeJavaScript('document.querySelector(".cm-content").focus()');window.webContents.insertText('//typing\n');
 assert((await window.webContents.executeJavaScript('document.querySelector(".cm-content").textContent')).includes('//typing')); 
 for(const [label,region] of [['Two','status'],['One','bottom'],['Two','title'],['One','status'],['Two','bottom']]){
 const point=await window.webContents.executeJavaScript(`(()=>{const row=[...document.querySelectorAll('.site-hook-list-row')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(label)});const r=row.getBoundingClientRect();return {x:Math.round(r.left+12),y:Math.round(${JSON.stringify(region)}==='bottom'?r.bottom-3:${JSON.stringify(region)}==='title'?r.top+12:r.bottom-18)}})()`);
 window.webContents.sendInputEvent({type:'mouseMove',...point});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
 await new Promise(r=>setTimeout(r,30));
 const source=await window.webContents.executeJavaScript('document.querySelector(".cm-content").textContent');
 assert.equal(source,label==='One'?'log("one")':'log("two")',label+' '+region+' selects immediately');
 }
 const toggle=await window.webContents.executeJavaScript(`(()=>{const e=document.querySelector('[aria-label="Enable One"]'),r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
 window.webContents.sendInputEvent({type:'mouseMove',...toggle});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...toggle});
 window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...toggle});
 await new Promise(r=>setTimeout(r,30));
 assert.equal(await window.webContents.executeJavaScript('document.querySelector(".cm-content").textContent'),'log("two")','toggle does not select another hook');
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Enable One"]').getAttribute("aria-checked")`),'true');
 console.log('PASS production hook cards: native title/status/padding clicks, rapid selection during typing, independent toggle');
 }catch(error){console.error(error);process.exitCode=1;}finally{window.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();}
});

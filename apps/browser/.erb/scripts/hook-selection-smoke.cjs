const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-hook-selection-'));
app.setPath('userData',path.join(root,'profile'));
fs.writeFileSync(path.join(root,'entry.tsx'),`
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {HookEditor} from ${JSON.stringify(path.resolve('src/components/UI/HookEditor'))};
window.electron={getSetting:async()=> 'dark',setting:{get:async()=> 'dark',on:()=>()=>{}},hookLanguage:{request:async()=>({diagnostics:[]})}};
function Test(){const [key,select]=React.useState('one');const [sources,set]=React.useState({one:'log("one")',two:'log("two")'});return <Theme><button onClick={()=>select('one')}>One</button><button onClick={()=>select('two')}>Two</button><HookEditor selectionKey={key} code={{before:'',after:sources[key],css:''}} disabled={false} onChange={patch=>set(previous=>({...previous,[key]:patch.after??previous[key]}))}/></Theme>}
createRoot(document.getElementById('root')).render(<Test/>);`);
require('esbuild').buildSync({entryPoints:[path.join(root,'entry.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'app.js'),loader:{'.svg':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<div id="root"></div><script src="app.js"></script>');
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 try{
 await window.loadFile(path.join(root,'index.html'));
 for(let i=0;i<40;i++){if(await window.webContents.executeJavaScript('!!document.querySelector(".cm-content")'))break;await new Promise(r=>setTimeout(r,50));}
 await window.webContents.executeJavaScript('document.querySelector(".cm-content").focus()');window.webContents.insertText('//typing\n');
 assert((await window.webContents.executeJavaScript('document.querySelector(".cm-content").textContent')).includes('//typing')); 
 for(const label of ['Two','One','Two','One','Two']){
 await window.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(e=>e.textContent===${JSON.stringify(label)}).click()`);
 await new Promise(r=>setTimeout(r,30));
 const source=await window.webContents.executeJavaScript('document.querySelector(".cm-content").textContent');
 assert(source.includes(label==='One'?'log("one")':'log("two")'));
 if(label==='Two')assert.equal(source,'log("two")');
 }
 console.log('PASS actual CodeMirror rapid hook switching during typing and immediate source isolation');
 }catch(error){console.error(error);process.exitCode=1;}finally{window.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();}
});

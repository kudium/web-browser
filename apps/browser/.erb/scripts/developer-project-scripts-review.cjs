const {app,BrowserWindow,ipcMain}=require('electron');
app.on('window-all-closed',()=>{});
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const project=path.resolve(__dirname,'../..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-devtools-review-')));
const out=path.join(project,'docs/evidence/developer-project-scripts');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
process.env.NODE_PATH=path.join(project,'release/app/node_modules')+path.delimiter+path.join(project,'node_modules');require('module').Module._initPaths();
const esbuild=require(project+'/node_modules/esbuild');
esbuild.buildSync({entryPoints:[project+'/src/main/projectTerminal.ts',project+'/src/main/projectEditors.ts',project+'/src/main/projectScripts.ts',project+'/src/main/developerProject.ts'],bundle:true,platform:'node',outdir:path.join(root,'runtime'),external:['electron','node-pty']});
const {ProjectTerminals,validTerminalRequest}=require(path.join(root,'runtime/projectTerminal.js'));
const {projectScripts,savedProjectScript,validScriptRequest}=require(path.join(root,'runtime/projectScripts.js'));
const {projectBreadcrumbs}=require(path.join(root,'runtime/developerProject.js'));
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{siteDeveloper:{scripts:(...args)=>ipcRenderer.invoke('scripts',...args),project:(...args)=>ipcRenderer.invoke('project',...args),editors:()=>ipcRenderer.invoke('editors'),terminal:(...args)=>ipcRenderer.invoke('terminal',...args),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener);}}});`);
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme,Button} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project+'/src/renderer/index.css')};import {DeveloperProjectSection} from ${JSON.stringify(project+'/src/components/UI/DeveloperProjectSection')};import {DeveloperTerminal} from ${JSON.stringify(project+'/src/components/UI/DeveloperTerminal')};
const params=new URLSearchParams(location.search);
function Preview(){const[shown,setShown]=useState(false);return <Theme appearance={params.get('theme')}><div className="ai-sidebar" style={{width:'100%',height:'100vh',border:0}}><header style={{padding:16,fontSize:14}}>Developer</header><div className="developer-sidebar" style={{minHeight:0}}><div className="developer-sidebar-toolbar"><Button color="gray" variant="soft" className="group-picker-trigger">TouchBox<span style={{marginLeft:'auto'}}>⌄</span></Button></div><div className="developer-sidebar-pages"><DeveloperProjectSection sourceId="sample" active onOpenTerminal={()=>setShown(true)} onProjectChange={()=>setShown(false)}/><p className="developer-sidebar-count">2 pages · 1 with active hooks</p>{['Local development','Documentation'].map((name,i)=><button className="developer-sidebar-page" key={name}><span className="developer-sidebar-page-copy"><strong>{name}</strong><small>{i?'touchbox.dev/docs':'localhost:3000'}</small><span className={'developer-hook-status '+(i?'':'enabled')}>{i?'No hooks':'Hooks active'}</span></span></button>)}</div>{shown&&<DeveloperTerminal group="sample" active openRequest={1} onHide={()=>setShown(false)}/>}</div></div></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[project+'/node_modules'],outfile:path.join(root,'preview.js')});
fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
app.whenReady().then(async()=>{
const folder=path.join(root,'workspace','hocasa');fs.mkdirSync(folder,{recursive:true});
const other=path.join(root,'Other project');fs.mkdirSync(other);
process.env.SHELL='/bin/sh';
let w=new BrowserWindow({show:true,width:420,height:640,useContentSize:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
let terminals=new ProjectTerminals(w,group=>{if(!['sample','other'].includes(group))throw Error('Unknown group');return group==='sample'?folder:other;},path.join(root,'terminals.json'));

const openedFolders=[];
ipcMain.handle('project',async(event,id,action,editorId,folderPath)=>{
 assert.equal(event.sender.id,w.webContents.id);if(action==='folder')openedFolders.push(folderPath||folder);
 const unavailable=new URL(event.sender.getURL()).searchParams.get('state')==='unavailable';
 return {name:'hocasa',path:folder,available:!unavailable,breadcrumbs:projectBreadcrumbs(folder,root)};
});
ipcMain.handle('editors',()=>({editors:[{id:'editor',name:'WebStorm'}]}));
ipcMain.handle('terminal',(_event,group,request)=>{assert(validTerminalRequest(request));return terminals.request(group,request)});
ipcMain.handle('scripts',async(event,id,request)=>{
 assert.equal(id,'sample');assert(validScriptRequest(request));
 const state=new URL(event.sender.getURL()).searchParams.get('state');
 if(state==='loading'&&request.action==='list')return new Promise(()=>{});
 if(state==='error'&&request.action==='list')throw Error('Could not read saved scripts.');
 if(request.action==='run'){const script=savedProjectScript('sample',folder,request.id);return {scripts:projectScripts('sample',folder,{action:'list'}),terminal:terminals.runCommand('sample',script.name,script.command)};}
 return {scripts:projectScripts('sample',folder,request)};
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>w.webContents.executeJavaScript(code);
const wait=async code=>{for(let i=0;i<80;i++){if(await js(code))return;await pause(50)}throw Error('Timeout: '+code)};
const menu=async name=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=menu]')")};
const choose=async name=>{await js(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.trim()===${JSON.stringify(name)}).click()`)};
const fill=async(name,value)=>{await js(`(()=>{const i=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(name))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`)};
const capture=async(label,width,theme)=>{
 await pause(250);
 if(['menu','empty','loading','error'].includes(label)) {
  if(!await js("!!document.querySelector('[role=menu]')"))await menu('Scripts');
  await wait("!!document.querySelector('[role=menu]')");await pause(80);
 }
 let screenshot;for(let i=0;i<3;i++){try{screenshot=await w.webContents.capturePage();break}catch(e){if(i===2)throw e;await pause(300)}}
 const result=await js(`(()=>{const p=document.querySelector('.developer-sidebar'),d=document.querySelector('[role=dialog]'),menu=document.querySelector('[role=menu]');const rect=(d||menu)?.getBoundingClientRect();const fields=[...document.querySelectorAll('.developer-script-fields input')];const labels=[...document.querySelectorAll('.developer-script-fields label')];return {overflow:p.scrollWidth>p.clientWidth,disclosureFits:!rect||rect.left>=0&&rect.right<=innerWidth,rect:rect&&{left:rect.left,width:rect.width},labelsAssociated:labels.every(label=>!!label.control),inputHeights:fields.map(field=>field.getBoundingClientRect().height),footerFits:!d||document.querySelector('.developer-script-footer')?.getBoundingClientRect().bottom<=innerHeight}})()`);
 fs.writeFileSync(path.join(out,`${width}-${theme}-${label}.png`),screenshot.toPNG());
 assert(!result.overflow&&result.disclosureFits&&result.labelsAssociated,JSON.stringify({label,width,theme,result}));if(result.inputHeights.length)assert.equal(result.inputHeights[0],result.inputHeights[1]);assert(result.footerFits);
 fs.writeFileSync(path.join(out,`${width}-${theme}-${label}.png`),screenshot.toPNG());return {width,theme,label,...result};
};
const checks=[];
for(const width of (process.argv.includes('--narrow')?[240]:[420,240]))for(const theme of ['light','dark'])for(const state of ['default','menu','empty','loading','error','manage','form','scope','delete','run','save-run','edit','unavailable']){
 terminals.invalidate('sample');fs.writeFileSync(path.join(app.getPath('userData'),'developer-scripts.json'),JSON.stringify({global:[],projects:{}}));
 if(state!=='empty'){projectScripts('sample',folder,{action:'save',name:'Development',command:"printf 'SCRIPT_OK\\n'; pwd",scope:'project'});projectScripts('sample',folder,{action:'save',name:'Install dependencies',command:'npm install',scope:'global'})}
 w.setContentSize(width,640);await w.loadFile(path.join(root,'index.html'),{query:{theme,state}});await wait("!!document.querySelector('.developer-project-actions')");
 if(state==='default'){await js(`document.querySelector('.developer-project-crumb button').focus()`);await js(`document.querySelectorAll('.developer-project-crumb button')[1].click()`);assert.equal(openedFolders.at(-1),path.dirname(folder));}
 if(['menu','empty','loading','error','manage','form','scope','delete','run','save-run','edit'].includes(state)){
  await menu('Scripts');if(state==='loading')await wait("document.querySelector('[role=menu]').textContent.includes('Loading scripts')");else if(state==='error')await wait("!!document.querySelector('[role=alert]')");else await wait("!document.querySelector('[role=menu]').textContent.includes('Loading scripts')");
 }
 if(['manage','form','scope','delete','save-run','edit'].includes(state)){await choose('Manage scripts…');await wait("!!document.querySelector('[role=dialog]')");await wait("document.querySelector('.developer-script-list')?.getAttribute('aria-busy')==='false'");}
 if(['form','scope','save-run'].includes(state)){
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add script').click()`);await wait(`!!document.querySelector('[aria-label="Script command"]')`);
  await js(`document.querySelector('[aria-label="Script name"]').focus()`);
 }
 if(state==='scope'){await js(`(()=>{const b=document.querySelector('[aria-label="Script scope"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=listbox]')");}
 if(state==='edit'){await js(`document.querySelector('[aria-label="Edit Development"]').click()`);await wait(`!!document.querySelector('[aria-label="Script command"]')`);}
 if(state==='delete'){await js(`document.querySelector('[aria-label="Delete Install dependencies"]').click()`);}
 if(state==='run'){await choose('Development');await wait("!!document.querySelector('.developer-terminal-dot.running')");await pause(250);const info=terminals.request('sample',{action:'list'});assert.equal(info.tabs.at(-1).name,'Development');assert(terminals.request('sample',{action:'attach',cols:80,rows:24}).data.includes('SCRIPT_OK'));}
 if(state==='save-run'){
  await fill('Script name','Preview server');await fill('Script command',"printf 'SAVED_RUN_OK\\n'");
  await js(`(()=>{const b=document.querySelector('[aria-label="Script scope"]');b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));b.click()})()`);await wait("!!document.querySelector('[role=listbox]')");
  await js(`[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.trim()==='All projects').click()`);
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save & run').click()`);await wait("!!document.querySelector('.developer-terminal-dot.running')");await pause(250);
  assert(savedProjectScript('sample',folder,projectScripts('sample',folder,{action:'list'}).find(s=>s.name==='Preview server').id));
  const globalId=projectScripts('sample',folder,{action:'list'}).find(s=>s.name==='Preview server').id;assert.equal(savedProjectScript('other',other,globalId).scope,'global');
  assert(terminals.request('sample',{action:'attach',cols:80,rows:24}).data.includes('SAVED_RUN_OK'));
 }
 checks.push(await capture(state,width,theme));
}
terminals.dispose();fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('PASS: breadcrumbs, project/global scripts, Save & run with real PTY and '+checks.length+' Electron layouts.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});

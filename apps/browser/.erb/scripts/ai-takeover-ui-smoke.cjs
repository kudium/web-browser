const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-ai-takeover-'));
const out=path.resolve('docs/evidence/ai-takeover');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {AISidebar} from ${JSON.stringify(path.resolve('src/components/UI/AISidebar'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
const params=new URLSearchParams(location.search);let onEvent=()=>{};let onMCP=()=>{};
const external={enabled:true,running:true,paused:false,port:43187,url:'http://127.0.0.1:43187/mcp'};
window.electron={ai:{settings:async()=>({endpoint:'https://api.openai.com/v1',model:'fixture',hasKey:true,remembered:false}),mcpStatus:async()=>external,onMCP:cb=>{onMCP=cb;return ()=>{}},onSettings:()=>()=>{},onEvent:cb=>{onEvent=cb;return ()=>{}},taskStatus:async()=>({busy:false,resumable:false}),groups:async()=>({groupId:null,groups:[]}),run:async()=>{},takeOver:async()=>{},resumeExternal:async()=>{},resume:async()=>true}};
window.fixtureState=state=>{if(state==='working')onEvent({type:'status',source:'external',text:'Reading page'});if(state==='done'){onEvent({type:'status',source:'external',text:'Reading page'});onEvent({type:'done',source:'external',text:''});}if(state==='paused')onMCP({...external,paused:true});};
createRoot(document.getElementById('root')).render(<Theme appearance={params.get('theme')}><main style={{height:'100vh',padding:20}}><AISidebar/></main></Theme>);
`);
require('esbuild').buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><link rel="stylesheet" href="preview.css"><div id="root"></div><script src="preview.js"></script>');
const wait=()=>new Promise(r=>setTimeout(r,180));const checks=[];
app.whenReady().then(async()=>{const w=new BrowserWindow({width:440,height:600,useContentSize:true,show:true});for(const width of [240,400])for(const theme of ['light','dark'])for(const state of ['idle','working','done','paused']){w.setContentSize(width+40,600);await w.loadFile(path.join(root,'index.html'),{query:{theme}});await wait();await w.webContents.executeJavaScript(`document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');window.fixtureState('${state}');undefined`);await wait();
const layout=await w.webContents.executeJavaScript(`(()=>{const h=document.querySelector('.ai-sidebar-header'),r=h.getBoundingClientRect();return {takeover:!!document.querySelector('[aria-label="Take control"]'),resume:!!document.querySelector('[aria-label="Resume external AI"]'),overflow:h.scrollWidth>h.clientWidth,buttons:[...h.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),right:b.getBoundingClientRect().right})),right:r.right}})()`);
assert.equal(layout.takeover,state==='working');assert.equal(layout.resume,state==='paused');assert(!layout.overflow,'header does not overflow');assert(layout.buttons.every(b=>b.right<=layout.right),'header controls stay in bounds');
if(state==='working'||state==='paused'){await w.webContents.executeJavaScript(`document.querySelector('[aria-label="${state==='working'?'Take control':'Resume external AI'}"]').focus()`);await wait();}
checks.push({width,theme,state,...layout});fs.writeFileSync(path.join(out,`${width}-${theme}-${state}.png`),(await w.webContents.capturePage()).toPNG());}
fs.writeFileSync(path.join(out,'layout-checks.json'),JSON.stringify(checks,null,2));console.log('16 takeover visibility and header layout states passed');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});

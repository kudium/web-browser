const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-tab-edge-'));
const out=path.resolve('docs/evidence/horizontal-tab-add');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));
fs.writeFileSync(path.join(root,'preview.tsx'),`
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {Plus,X} from 'lucide-react';
import {ChromeIconButton} from ${JSON.stringify(path.resolve('src/components/UI/ChromeIconButton'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
function Strip({count,split=false}){return <div className={'session-tab-strip '+(split?'pane-tab-strip':'')}><div className="horizontal-tabs">{Array.from({length:count},(_,i)=><div key={i} className={'horizontal-tab '+(i===0?'active':'')}><button className="horizontal-tab-select"><span className="horizontal-tab-title">Page {i+1}</span></button><button className="horizontal-tab-close" aria-label="Close tab"><X size={12}/></button></div>)}</div>{split&&<ChromeIconButton icon={X} label="Close pane" onClick={()=>{}}/>}<ChromeIconButton icon={Plus} className="horizontal-tab-add" label="New tab in current group" onClick={()=>{document.body.dataset.opened='true'}}/></div>}
createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme')}><main style={{padding:'24px 8px'}}><p>One tab</p><Strip count={1}/><p>Overflowing tabs</p><Strip count={20}/><p>Split panes</p><div className="pane-tab-strips"><Strip count={1} split/><Strip count={20} split/></div></main></Theme>);
`);
require('esbuild').buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><link rel="stylesheet" href="preview.css"><div id="root"></div><script src="preview.js"></script>');
const wait=()=>new Promise(r=>setTimeout(r,150));const checks=[];
app.whenReady().then(async()=>{const w=new BrowserWindow({width:800,height:500,useContentSize:true,show:true});for(const width of [800,400])for(const theme of ['light','dark']){w.setContentSize(width,500);await w.loadFile(path.join(root,'index.html'),{query:{theme}});await wait();
const verify=()=>w.webContents.executeJavaScript(`[...document.querySelectorAll('.session-tab-strip')].map(s=>{const r=s.getBoundingClientRect(),b=s.querySelector('.horizontal-tab-add').getBoundingClientRect(),t=s.querySelector('.horizontal-tabs').getBoundingClientRect(),close=s.querySelector('[aria-label="Close pane"]')?.getBoundingClientRect();return {edge:r.right-b.right,padding:parseFloat(getComputedStyle(s).paddingRight),left:b.left,right:b.right,tabsRight:t.right,closeRight:close?.right}})`);
const before=await verify();for(const r of before){assert(Math.abs(r.edge-r.padding)<1,'plus pinned to padded right edge');assert(r.tabsRight<=r.left,'tabs do not overlap plus');if(r.closeRight)assert(r.closeRight<=r.left,'close pane stays before plus');}
await w.webContents.executeJavaScript("document.querySelectorAll('.horizontal-tabs').forEach(e=>e.scrollLeft=10000);document.querySelector('.horizontal-tab-add').focus()");await wait();const after=await verify();assert.deepEqual(before,after,'scrolling keeps plus fixed');
await w.webContents.executeJavaScript("document.querySelector('.horizontal-tab-add').click()");assert.equal(await w.webContents.executeJavaScript('document.body.dataset.opened'),'true');checks.push({width,theme,rows:after});fs.writeFileSync(path.join(out,width+'-'+theme+'.png'),(await w.webContents.capturePage()).toPNG());}
fs.writeFileSync(path.join(out,'layout-checks.json'),JSON.stringify(checks,null,2));console.log('16 strip layouts passed: few/overflow/split, scrolling, focus, and add action');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});

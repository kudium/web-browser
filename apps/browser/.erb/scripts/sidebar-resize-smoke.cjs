// Native WebContentsView regression fixture; uses a disposable profile and local content.
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-resize-'));
app.setPath('userData', temporary);
const code = require('esbuild').buildSync({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useRef,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {SidebarResizeHandle} from './src/components/UI/SidebarResizeHandle';
    import {frameResizeObserver} from './src/utils/frameResizeObserver';
    const ipc=require('electron').ipcRenderer;
    window.metrics={renders:0,commits:0,updates:0};
    function Fixture(){const target=useRef(null);const [width,setWidth]=useState(300);const [dragging,setDragging]=useState(false);
      window.metrics.renders++;
      return <div ref={target} className="workspace" data-dragging={dragging} style={{'--ai-sidebar-width':width+'px'}}>
        <div className="viewport"/><aside><SidebarResizeHandle side="right" width={width} minWidth={240} maxWidth={700}
          liveResize={{target,property:'--ai-sidebar-width'}} onResizingChange={setDragging}
          onChange={next=>{window.metrics.commits++;setWidth(next)}}/>Project files</aside>
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
    const observer=frameResizeObserver(()=>{const b=document.querySelector('.viewport').getBoundingClientRect();window.metrics.updates++;ipc.send('resize-fixture-bounds',{x:b.x,y:b.y,width:b.width,height:b.height})});
    window.startObserve=()=>observer.observe(document.querySelector('.viewport'));
  ` }, bundle: true, platform: 'browser', external: ['electron'], write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
}).outputFiles[0].text;
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width:1000,height:600,show:true, webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false} });
  const page = new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  window.contentView.addChildView(page);
  let boundsUpdates=0;
  ipcMain.on('resize-fixture-bounds', (event,bounds) => {
    if(event.sender!==window.webContents)return;
    const next=Object.fromEntries(Object.entries(bounds).map(([key,value])=>[key,Math.round(value)]));
    if(JSON.stringify(page.getBounds())!==JSON.stringify(next)){page.setBounds(next);boundsUpdates++;}
  });
  ipcMain.handle('resize-fixture-frame',()=>({boundsUpdates,width:page.getBounds().width}));
  try {
    await page.webContents.loadURL('data:text/html,'+encodeURIComponent('<style>body{margin:0;background:#edf2f7;font:20px system-ui}main{padding:24px}h1{font-size:clamp(20px,5vw,48px)}</style><main><h1>Live responsive page</h1><p>The native page stays live while the project panel moves.</p></main>'));
    await window.loadURL('data:text/html,'+encodeURIComponent(`<style>body{margin:0}.workspace{display:flex;height:100vh}.viewport{flex:1;min-width:0}aside{position:relative;width:var(--ai-sidebar-width);flex-shrink:0;background:#202225;color:white}.sidebar-resize-handle{position:absolute;left:0;top:0;bottom:0;width:8px;touch-action:none;cursor:col-resize}</style><div id="root"></div><script>${code}</script>`));
    await window.webContents.executeJavaScript(`new Promise(resolve=>{const check=()=>document.querySelector('[role="separator"]')?resolve():requestAnimationFrame(check);check()})`);
    await window.webContents.executeJavaScript('window.startObserve();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const handle=document.querySelector('[role="separator"]');const start=handle.getBoundingClientRect().left+4;
      const input=(type,x)=>new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:100});
      // Synthetic events exercise drag logic; this fixture does not simulate physical OS pointer routing.
      handle.setPointerCapture=()=>{};
      const before=window.metrics.renders;handle.dispatchEvent(input('pointerdown',start));
      await new Promise(requestAnimationFrame);const afterStart=window.metrics.renders;
      const begun=performance.now();
      for(let i=1;i<=24;i++){window.dispatchEvent(input('pointermove',start-i*10));await new Promise(requestAnimationFrame)}
      const nativeDuring=await require('electron').ipcRenderer.invoke('resize-fixture-frame');
      const dragCommits=window.metrics.commits,dragRenders=window.metrics.renders-afterStart;
      window.dispatchEvent(input('pointerup',start-240));
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return {...window.metrics,nativeDuring,dragCommits,dragRenders,before,elapsedMs:Math.round(performance.now()-begun),viewportWidth:document.querySelector('.viewport').clientWidth};
    })()`);
    const nativeWidth=await page.webContents.executeJavaScript('innerWidth');
    console.log('Native resize measurement:',JSON.stringify({...result,boundsUpdates,nativeWidth}));
    assert.equal(result.dragCommits,0,'No saved state commits during drag');
    assert.equal(result.dragRenders,0,'No workspace rerenders during movement');
    assert.equal(result.commits,1,'Exactly one final width commit');
    assert(boundsUpdates>=12,'Native bounds follow intermediate drag frames');
    assert.equal(nativeWidth,result.viewportWidth,'Native webpage ends at the renderer viewport width');
    assert(page.getVisible(),'Native page stays visible');
    console.log('PASS native sidebar resize:',JSON.stringify({...result,boundsUpdates,nativeWidth}));
  } finally { window.destroy(); }
}).then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(temporary,{recursive:true,force:true}));

const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
// Run from apps/browser with Electron; uses a disposable profile and local fixture.
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-sidebar-hover-'));
app.setPath('userData', temp);
const esbuild = require(root + '/node_modules/esbuild');
esbuild.buildSync({
  entryPoints: [root + '/src/main/snapshotPresentation.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(temp, 'snapshots.cjs'),
});
const { presentSnapshots, withinSnapshotDeadline } = require(
  path.join(temp, 'snapshots.cjs'),
);
esbuild.buildSync({
  stdin: {
    contents: `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';import {useSidebarHoverOverlay} from './src/utils/hooks/useSidebarHoverOverlay';let mounts=0;function App(){const [sidebar,setSidebar]=useState(null),[frames,setFrames]=useState([]),[clicks,setClicks]=useState(0);const hover=useSidebarHoverOverlay(true,sidebar,false,window.fixture.onReady,window.fixture.onEdge);useEffect(()=>{mounts++;window.fixture.onSnapshots(setFrames)},[]);useEffect(()=>{window.fixture.overlay(hover.open,hover.token)},[hover.open,hover.token]);useEffect(()=>{let frame;const sample=()=>{window.transitionFrames??=[];window.transitionFrames.push({at:Date.now(),hidden:document.querySelector('aside').hidden,animations:document.querySelector('aside').getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&(animation.animationName?.startsWith('sidebar-')||['width','height','padding-top','padding-bottom','transform'].includes(animation.transitionProperty))).length});frame=requestAnimationFrame(sample)};if(hover.open){if(hover.visible)window.visibleAt=Date.now();frame=requestAnimationFrame(sample)}return()=>cancelAnimationFrame(frame)},[hover.open,hover.visible]);window.metrics=()=>({open:hover.open,visible:hover.visible,visibleAt:window.visibleAt,frames:window.transitionFrames??[],clicks,mounts,draft:document.querySelector('input').value});return <Theme appearance="dark"><div className={'workspace hidden-sidebar '+(hover.open?'sidebar-hover-overlay':'')} data-sidebar-overlay-ready={hover.visible||undefined} style={{'--sidebar-width':'300px'}}><div className="sidebar-hover-edge" onPointerEnter={hover.enterEdge} onPointerLeave={hover.leave} onPointerDown={hover.reveal}/><aside className="workspace-sidebar" ref={setSidebar} hidden={!hover.visible} onPointerEnter={hover.enter} onPointerLeave={hover.leave} onBlur={hover.leave}><div className="sidebar-navigation"/><div className="space-heading"><span className="space-title-search">Search Personal</span></div><input aria-label="Space draft" defaultValue="Retained draft" style={{margin:'12px 8px',padding:8}}/><button className="sidebar-app" onClick={()=>setClicks(n=>n+1)}>Switch group · {clicks}</button></aside><main className="browser-shell"><div className="browser-chrome" style={{height:44}}>Hidden sidebar fixture</div><div className="browser-viewport" style={{position:'absolute',left:8,top:44,right:8,bottom:8}}>{frames.map(frame=><img key={frame.id} className="browser-snapshot" data-presentation-id={frame.presentationId} src={frame.image} style={{position:'absolute',left:0,top:0,width:frame.width,height:frame.height}}/>)}</div></main></div></Theme>};createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  outfile: path.join(temp, 'fixture.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
});
const css = fs
    .readFileSync(root + '/src/renderer/index.css', 'utf8')
    .replace(/^@import[^;]+;/, ''),
  theme = fs.readFileSync(
    root + '/node_modules/@radix-ui/themes/styles.css',
    'utf8',
  );
fs.writeFileSync(
  path.join(temp, 'index.html'),
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src data:; style-src 'unsafe-inline'; script-src 'self'"><style>${theme}\n${css}\nhtml,body{margin:0}</style><div id="root"></div><script src="fixture.js"></script>`,
);
fs.writeFileSync(
  path.join(temp, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{overlay:(open,token)=>ipcRenderer.invoke('hover-fixture-overlay',open,token),onReady:callback=>{const listener=(_event,token)=>callback(token);ipcRenderer.on('browser-sidebar-overlay-ready',listener);return()=>ipcRenderer.removeListener('browser-sidebar-overlay-ready',listener)},onEdge:callback=>{const listener=(_event,inside)=>callback(inside);ipcRenderer.on('browser-sidebar-hover-edge',listener);return()=>ipcRenderer.removeListener('browser-sidebar-hover-edge',listener)},onSnapshots:callback=>ipcRenderer.on('browser-snapshots',(_event,frames)=>callback(frames))});`,
);
esbuild.buildSync({
  entryPoints: [root + '/src/main/sidebarHoverEdge.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(temp, 'edge.cjs'),
});
const { observeSidebarHoverEdge } = require(path.join(temp, 'edge.cjs'));
fs.writeFileSync(
  path.join(temp, 'mouse.swift'),
  `import CoreGraphics
import Foundation
if !CGPreflightPostEventAccess() { exit(2) }
let point = CGPoint(x: Double(CommandLine.arguments[1])!, y: Double(CommandLine.arguments[2])!)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
`,
);
require('child_process').execFileSync('/usr/bin/swiftc', [
  path.join(temp, 'mouse.swift'),
  '-o',
  path.join(temp, 'mouse'),
]);
const osMove = (win, x, y) =>
  new Promise((resolve, reject) => {
    const b = win.getContentBounds();
    require('child_process').execFile(
      path.join(temp, 'mouse'),
      [String(b.x + x), String(b.y + y)],
      (error) => (error ? reject(error) : resolve()),
    );
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: true,
      width: 1000,
      height: 700,
      webPreferences: {
        preload: path.join(temp, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const page = new WebContentsView({
      webPreferences: { sandbox: true, backgroundThrottling: false },
    });
    const size = win.getContentSize(),
      bounds = { x: 8, y: 44, width: size[0] - 16, height: size[1] - 52 };
    page.setBounds(bounds);
    win.contentView.addChildView(page);
    let generation = 0,
      open = false,
      yielded = false,
      shownAt = 0,
      captureDelay = 60;
    const stopEdge = observeSidebarHoverEdge(
      page,
      () => win,
      () => !yielded,
    );
    ipcMain.handle('hover-fixture-overlay', async (event, next, token) => {
      if (event.sender !== win.webContents) return;
      const current = ++generation;
      open = next;
      if (!next) {
        yielded = false;
        page.setVisible(true);
        return;
      }
      if (captureDelay) await wait(captureDelay);
      if (current !== generation) return;
      const capture = await withinSnapshotDeadline(
        page.webContents.capturePage(),
        80,
      );
      if (current !== generation) return;
      await presentSnapshots(
        win,
        capture ? [{ id: 'page', ...bounds, image: capture.toDataURL() }] : [],
        undefined,
        80,
      );
      if (current !== generation) return;
      yielded = true;
      page.setVisible(false);
      shownAt = Date.now();
      win.webContents.send('browser-sidebar-overlay-ready', token);
    });
    try {
      await page.webContents.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\'"><style>body{margin:0;background:#edf2f7;font:24px system-ui}main{padding:28px}</style><main><h1>The native page keeps its size</h1><p>This page remains alive behind the temporary sidebar.</p></main>',
          ),
      );
      await win.loadFile(path.join(temp, 'index.html'));
      win.focus();
      app.focus({ steal: true });
      await wait(180);
      const before = page.getBounds();
      await win.webContents.executeJavaScript(
        `document.documentElement.dataset.platform='darwin';document.querySelector('.workspace').dataset.glass='true';document.querySelector('.workspace').dataset.spaceBackground='false'`,
      );
      const revealStarted = Date.now();
      await osMove(win, 12, 240);
      await wait(280);
      const revealMilliseconds = shownAt - revealStarted;
      let metrics = await win.webContents.executeJavaScript('metrics()');
      assert(metrics.open && metrics.visible, 'Left edge reveals overlay');
      assert(!page.getVisible(), 'Native page yields to renderer overlay');
      assert(
        metrics.frames.some((frame) => frame.hidden && frame.at < shownAt),
        'Capture delay exercises waiting frames',
      );
      assert(
        metrics.frames
          .filter((frame) => !frame.hidden)
          .every((frame) => frame.at >= shownAt),
        'Sidebar appears only after the native page yields',
      );
      assert(
        metrics.frames.every((frame) => frame.animations === 0),
        'No stacked reveal animations: ' +
          JSON.stringify(
            await win.webContents.executeJavaScript(
              "document.querySelector('aside').getAnimations({subtree:true}).map(a=>({name:a.animationName,property:a.transitionProperty,target:a.effect.target.className,state:a.playState}))",
            ),
          ),
      );
      assert.deepStrictEqual(
        page.getBounds(),
        before,
        'Page bounds stay unchanged',
      );
      const edgeBounds = await win.webContents.executeJavaScript(
        `(()=>{const r=document.querySelector('.sidebar-hover-edge').getBoundingClientRect();return {width:r.width,top:r.top,bottom:r.bottom,height:innerHeight}})()`,
      );
      assert.equal(edgeBounds.width, 8);
      assert.equal(edgeBounds.top, 0);
      assert.equal(edgeBounds.bottom, edgeBounds.height);
      const color = await win.webContents.executeJavaScript(
        `getComputedStyle(document.querySelector('aside')).backgroundColor`,
      );
      assert(
        !['transparent', 'rgba(0, 0, 0, 0)'].includes(color),
        'Overlay has a readable surface in glass spaces',
      );
      const button = await win.webContents.executeJavaScript(
        `(()=>{const r=document.querySelector('aside button').getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+r.height/2)}})()`,
      );
      await osMove(win, button.x, button.y);
      win.webContents.sendInputEvent({
        type: 'mouseDown',
        ...button,
        button: 'left',
        clickCount: 1,
      });
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        ...button,
        button: 'left',
        clickCount: 1,
      });
      await wait(40);
      metrics = await win.webContents.executeJavaScript('metrics()');
      assert.equal(metrics.clicks, 1, 'Overlay is interactive');
      await win.webContents.executeJavaScript(
        "document.querySelector('input').value='Retained edit'",
      );
      const evidence = process.env.KUDIUM_SIDEBAR_HOVER_EVIDENCE || temp;
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(
        path.join(evidence, 'sidebar-hover.png'),
        (await win.capturePage()).toPNG(),
      );
      await osMove(win, 650, 240);
      await wait(240);
      metrics = await win.webContents.executeJavaScript('metrics()');
      assert(!metrics.open, 'Leaving closes overlay');
      assert(page.getVisible(), 'Live native page returns');
      assert.deepStrictEqual(page.getBounds(), before);
      await page.webContents.executeJavaScript(
        "window.edgeClicks=0;document.addEventListener('click',()=>window.edgeClicks++)",
      );
      for (const type of ['mouseDown', 'mouseUp'])
        page.webContents.sendInputEvent({
          type,
          x: 4,
          y: 196,
          button: 'left',
          clickCount: 1,
        });
      await wait(40);
      assert.equal(
        await page.webContents.executeJavaScript('window.edgeClicks'),
        1,
        'Page edge clicks remain interactive',
      );
      page.webContents.sendInputEvent({ type: 'mouseMove', x: 8, y: 196 });
      await wait(40);
      assert(
        !(await win.webContents.executeJavaScript('metrics()')).open,
        'Beyond 16px does not trigger',
      );
      assert.equal(before.x, 8, 'Page reclaims the wider frame');
      captureDelay = 0;
      const secondStarted = Date.now();
      await osMove(win, 4, 20);
      await wait(280);
      metrics = await win.webContents.executeJavaScript('metrics()');
      assert(
        metrics.open && metrics.visible,
        'Repeated hover: ' + JSON.stringify(metrics),
      );
      assert.equal(metrics.mounts, 1, 'Sidebar is retained');
      assert.equal(metrics.draft, 'Retained edit', 'Sidebar draft retained');
      console.log(
        'PASS: atomic native handoff including delayed capture, no partial sidebar frames or stacked animations, interactive overlay and retained state. Normal fixture reveal: ' +
          (metrics.visibleAt - secondStarted) +
          'ms; delayed capture handoff: ' +
          revealMilliseconds +
          'ms.',
      );
    } finally {
      stopEdge();
      if (!page.webContents.isDestroyed()) page.webContents.close();
      win.destroy();
      ipcMain.removeHandler('hover-fixture-overlay');
    }
  })
  .then(() => app.quit())
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(temp, { recursive: true, force: true }));

// Runs the real SidebarPager through AppKit scroll phases in a disposable Electron window.
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const runtime = fs.mkdtempSync(path.join(root, '.erb/space-gesture-smoke-'));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-gesture-user-')));
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function buildFixture() {
  const version = require(path.join(root, 'node_modules/electron/package.json')).version;
  const result = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-shared', '-undefined', 'dynamic_lookup', '-framework', 'AppKit', '-framework', 'ApplicationServices', '-I', path.join(os.homedir(), '.electron-gyp', version, 'include/node'), path.join(root, 'native/space-gestures/test-events.mm'), '-o', path.join(runtime, 'events.node')], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'AppKit fixture failed to build');
}
app.whenReady().then(async () => {
  buildFixture();
  esbuild.buildSync({ entryPoints: [path.join(root, 'src/main/spaceGestures.ts')], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(runtime, 'main.cjs') });
  fs.writeFileSync(path.join(runtime, 'client.ts'), `export const browser={command:window.api.command,onSpaceWheel:(callback)=>window.api.onWheel(event=>{if('available' in event)window.nativeReady=event.available;callback(event)})};`);
  fs.writeFileSync(path.join(runtime, 'renderer.tsx'), `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{SidebarPager}from${JSON.stringify(path.join(root,'src/components/UI/SidebarPager'))};function Test(){const[index,setIndex]=useState(0);const pages=['home','work','personal'];return <SidebarPager page={pages[index]} direction={1} onSwipe={direction=>{window.swipes.push(direction);setIndex(value=>(value+direction+pages.length)%pages.length)}}><h1>{pages[index]}</h1></SidebarPager>}window.swipes=[];createRoot(document.getElementById('root')).render(<Test/>);`);
  await esbuild.build({ entryPoints: [path.join(runtime, 'renderer.tsx')], bundle: true, platform: 'browser', plugins: [{ name: 'test-transport', setup(build) { build.onResolve({filter: /browser\/client$/}, () => ({path: path.join(runtime, 'client.ts')})); } }], define: { 'process.env.NODE_ENV': '"test"' }, outfile: path.join(runtime, 'renderer.js') });
  fs.writeFileSync(path.join(runtime, 'preload.cjs'), `const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('api',{command:value=>ipcRenderer.send('test-command',value),onWheel:callback=>{const listener=(_,event)=>callback(event);ipcRenderer.on('browser-space-wheel',listener);ipcRenderer.send('browser-observe-space-wheel');return()=>ipcRenderer.removeListener('browser-space-wheel',listener)}});`);
  fs.writeFileSync(path.join(runtime, 'index.html'), '<html><head><style>html,body{margin:0;height:100%;}.sidebar-pager{width:300px;height:460px;position:relative;overflow:hidden;touch-action:pan-y}.sidebar-page{height:100%;}.sidebar-outgoing{position:absolute;inset:0;pointer-events:none}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>');
  const win = new BrowserWindow({ width: 700, height: 520, show: true, webPreferences: { preload: path.join(runtime, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const stop = require(path.join(runtime, 'main.cjs')).registerSpaceGestures(win);
  ipcMain.on('test-command', (event, command) => { if (event.sender === win.webContents && command.action === 'focus-chrome') win.webContents.focus(); });
  await win.loadFile(path.join(runtime, 'index.html'));
  await wait(150);
  const evaluate = source => win.webContents.executeJavaScript(source);
  assert.equal(await evaluate('window.nativeReady'), true, 'Native phase source unavailable');
  const site = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.contentView.addChildView(site); site.setBounds({ x: 340, y: 0, width: 340, height: 460 });
  await site.webContents.loadURL('data:text/html,<textarea>Website focus</textarea>');
  const events = require(path.join(runtime, 'events.node'));
  const send = (phase, momentum, deltaX, deltaY=0, x=40) => events.post(win.getNativeWindowHandle(),phase,momentum,deltaX,deltaY,x,80);
  const count = () => evaluate('window.swipes.length');
  const current = () => evaluate('document.querySelector("[data-sidebar-page]").dataset.sidebarPage');
  app.focus({steal:true});win.focus();await wait(100);
  site.webContents.focus();await wait(40);assert(site.webContents.isFocused(), 'Webpage must start focused');
  send(1,0,15); send(4,0,60); await wait(40);
  assert.equal(await count(),1); assert.equal(await current(),'work');
  for(let i=0;i<12;i++){send(4,0,80);await wait(30);}
  send(8,0,0); send(0,1,80);
  for(let i=0;i<12;i++){send(0,4,80);await wait(30);}
  send(0,8,0); await wait(10);
  assert.equal(await count(),1,'One physical swipe plus long strong momentum must snap exactly once');
  site.webContents.focus();
  // A new physical swipe immediately after momentum, without clicks, hover or an idle timeout.
  send(1,0,60); send(4,0,100); send(8,0,0); await wait(40);
  assert.equal(await count(),2); assert.equal(await current(),'personal');
  assert(win.webContents.isFocused(),'Sidebar should reclaim native focus without a click');
  send(0,1,100);send(0,4,100);send(0,8,0);
  send(1,0,-60);send(4,0,-100);send(8,0,0);await wait(40);
  assert.equal(await count(),3);assert.equal(await current(),'work');
  send(1,0,0,90);send(4,0,100,90);send(8,0,0);await wait(30);
  assert.equal(await count(),3,'Vertical scrolling must not switch spaces');
  send(1,0,15);send(16,0,0);await wait(300);
  assert.equal(await count(),3,'Canceled short swipe must return to its current space');
  send(1,0,100,0,500);send(8,0,0,0,500);await wait(30);
  assert.equal(await count(),3,'Scrolling the website must not switch sidebar spaces');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  send(1,0,60);send(4,0,80);send(8,0,0);send(0,4,80);await wait(60);
  assert.equal(await count(),4);assert.equal(await evaluate('document.querySelector(".sidebar-page").getAnimations().length'),0);
  console.log('PASS AppKit + Electron: one snap per physical swipe, long momentum ignored, immediate next and reverse swipes without clicks, webpage focus handoff, vertical/outside scrolling, cancellation, reduced motion.');
  stop();site.webContents.close();win.close();app.quit();
}).catch(error => {console.error(error);app.exit(1);}).finally(()=>fs.rmSync(runtime,{recursive:true,force:true}));

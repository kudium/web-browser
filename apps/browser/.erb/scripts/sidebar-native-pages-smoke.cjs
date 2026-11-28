// Real concurrent native views and the shared renderer, in a disposable profile.
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const root = process.cwd(),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-native-columns-'));
app.setPath('userData', temp);
const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: [root + '/src/main/sidebarPanels.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: temp + '/registry.cjs',
});
const { registerSidebarPanelWindow, sidebarPanelsFor } = require(
  temp + '/registry.cjs',
);
esbuild.buildSync({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
import React,{useEffect,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';
import {SidebarPanels} from './src/components/UI/SidebarPanels';import {SidebarPageColumns} from './src/components/UI/SidebarPageColumns';
import {useSidebarPages,nativeSidebarPage} from './src/utils/hooks/useSidebarPages';import {useSidebarPanels} from './src/utils/useSidebarPanels';import {useSidebarPageDocks} from './src/utils/hooks/useSidebarPageDocks';
function App(){const state=useSidebarPanels(),pages=useSidebarPages(false,'assistant'),docks=useSidebarPageDocks('right'),[bottom,setBottom]=useState(null);const request=useRef(0);
useEffect(()=>{if(state.openRequest>request.current){request.current=state.openRequest;const info=state.panels.find(p=>p.id===state.activeId);if(info)pages.openPage(nativeSidebarPage(info));}},[state]);
window.metrics=()=>({pages:pages.pages,columns:[...document.querySelectorAll('[data-sidebar-page]:not([hidden])')].map(n=>({id:n.dataset.sidebarPage,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width}))});
return <Theme appearance="dark"><div style={{display:'flex',height:innerHeight-16}}><aside className="ai-sidebar ai-sidebar-multi" style={{width:740,flexShrink:0}}><SidebarPageColumns pages={pages.pages} selectedPage={pages.activePage} activation={pages.activation} pageDocks={docks.docks} onPageDockChange={docks.changeDock} bottomTarget={bottom} onReorder={pages.reorder}>
{state.panels.filter(info=>pages.pages.includes(nativeSidebarPage(info))).map(info=>{const opened=state.openedPanels?.find(p=>p.id===info.id);return <SidebarPanels key={info.id} panel={nativeSidebarPage(info)} active state={{...state,...opened,activeId:info.id,openRequest:0,floating:opened?.floating,snapshot:opened?.snapshot,error:opened?.error}} layoutVersion={JSON.stringify([pages.pages,docks.docks])} onClose={()=>{pages.closePage(nativeSidebarPage(info));window.electron.browser.sidebarPanels({action:'close',id:info.id})}}/>})}</SidebarPageColumns></aside><aside className="ai-sidebar ai-sidebar-multi" style={{width:400}}><div className="sidebar-page-columns" ref={setBottom}/></aside></div></Theme>};createRoot(document.getElementById('root')).render(<App/>);`,
  },
  bundle: true,
  outfile: temp + '/fixture.js',
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
  temp + '/index.html',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src data:; style-src 'unsafe-inline'; script-src 'self'"><style>${theme}\n${css}\nhtml,body{margin:0}</style><div id="root"></div><script src="fixture.js"></script>`,
);
fs.writeFileSync(
  temp + '/preload.cjs',
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}},browser:{sidebarPanels:request=>ipcRenderer.invoke('browser-sidebar-panels',request),onSidebarPanels:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('browser-sidebar-panels-changed',listener);return()=>ipcRenderer.removeListener('browser-sidebar-panels-changed',listener)},nativeMenu:async()=>null}});`,
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1200,
      height: 750,
      show: true,
      webPreferences: {
        preload: temp + '/preload.cjs',
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    win.webContents.on('console-message', (event) => {
      if (event.level >= 2) console.error(event.message);
    });
    registerSidebarPanelWindow(win);
    const host = sidebarPanelsFor(win),
      views = [];
    for (const id of ['extension-a', 'hook-b'])
      host.register({
        info: { id, title: id, kind: id === 'hook-b' ? 'hook' : 'extension' },
        contentKey: 'v1',
        createView: () => {
          const view = new WebContentsView({
            webPreferences: {
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              backgroundThrottling: false,
            },
          });
          views.push(view);
          void view.webContents.loadURL(
            'data:text/html,' +
              encodeURIComponent(
                '<style>body{background:#e9f2fa;font:18px system-ui}</style><input value="' +
                  id +
                  ' draft">',
              ),
          );
          return view;
        },
      });
    const js = (code) => win.webContents.executeJavaScript(code);
    try {
      await win.loadFile(temp + '/index.html');
      await wait(200);
      host.activate('extension-a');
      await wait(250);
      host.activate('hook-b');
      await wait(350);
      assert.equal(views.length, 2);
      assert(
        views.every((view) => view.getVisible()),
        'Both native documents are visible together',
      );
      assert(
        views[1].getBounds().x >=
          views[0].getBounds().x + views[0].getBounds().width,
        'Native columns have separate non-overlapping bounds',
      );
      await views[0].webContents.executeJavaScript(
        "document.querySelector('input').value='Unsaved native draft'",
      );
      const retained = views[0].webContents.id;
      await js(
        'document.querySelector(\'[aria-label="Close sidebar panel"]\').click()',
      );
      await wait(200);
      assert(!views[0].getVisible());
      assert(views[1].getVisible());
      host.activate('extension-a');
      await wait(250);
      assert.equal(views.length, 2);
      assert.equal(views[0].webContents.id, retained);
      assert.equal(
        await views[0].webContents.executeJavaScript(
          "document.querySelector('input').value",
        ),
        'Unsaved native draft',
      );
      assert(
        (await js('metrics()')).columns[0].x <
          (await js('metrics()')).columns[1].x,
      );
      // Pop out one provider while the other stays docked; docking preserves both identities.
      host.undock('extension-a');
      await wait(200);
      assert(
        host.state().openedPanels.find((p) => p.id === 'extension-a').floating,
      );
      assert(views[1].getVisible());
      host.dock('extension-a');
      await wait(250);
      assert(
        !host.state().openedPanels.find((p) => p.id === 'extension-a').floating,
      );
      assert.equal(views[0].webContents.id, retained);
      const work = host.setSuspended(true, true);
      await work;
      assert(views.every((view) => !view.getVisible()));
      await host.setSuspended(false, true);
      assert(views.every((view) => view.getVisible()));
      const removedContents = views[0].webContents;
      host.remove('extension-a');
      await wait(100);
      assert(removedContents.isDestroyed());
      assert(views[1].getVisible());
      console.log(
        'PASS: concurrent native extension/hook columns; independent close/reopen and retained drafts; independent pop-out/dock; overlay suspension and provider cleanup.',
      );
    } finally {
      host.dispose();
      win.destroy();
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(temp, { recursive: true, force: true }));

/* Real shared header, layout IPC and persistent native content in a disposable profile. */
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const {
  registerSidebarPanelWindow,
  sidebarPanelsFor,
} = require('../../src/main/sidebarPanels.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-panel-ui-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timer = setTimeout(() => app.exit(1), 30000);
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{platform:'darwin',fixtureOverlay:value=>ipcRenderer.send('fixture-overlay',value),passwordManager:async r=>r.action==='notes'?[]:{},onPasswordManagerChanged:()=>()=>{},onPasswordManagerLock:()=>()=>{},activity:async r=>r.action==='list'?Array.from({length:30},(_,i)=>({id:String(i),title:'Activity '+i,message:'Output',source:'ai',asRead:false,createdAt:1})):undefined,onActivityChanged:()=>()=>{},browser:{preferences:async()=>({activitySound:false}),tooltip:async()=>{},nativeMenu:async()=>{},sidebarPanels:r=>ipcRenderer.invoke('browser-sidebar-panels',r),onSidebarPanels:cb=>{const f=(_e,s)=>cb(s);ipcRenderer.on('browser-sidebar-panels-changed',f);return()=>ipcRenderer.removeListener('browser-sidebar-panels-changed',f)}}});`,
);
fs.writeFileSync(
  path.join(root, 'fixture.tsx'),
  `
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {SidebarPanels} from ${JSON.stringify(path.resolve('src/components/UI/SidebarPanels'))};
import {useSidebarPanels} from ${JSON.stringify(path.resolve('src/utils/useSidebarPanels'))};
import {AssistantPageHeader} from ${JSON.stringify(path.resolve('src/components/UI/AssistantPageHeader'))};
import {ChromeIconButton} from ${JSON.stringify(path.resolve('src/components/UI/ChromeIconButton'))};
import {X} from 'lucide-react';
import {NotesPage} from ${JSON.stringify(path.resolve('src/components/UI/NotesPage'))};
import {ActivityPage} from ${JSON.stringify(path.resolve('src/components/UI/ActivityPage'))};
import {SidebarPanelHost} from ${JSON.stringify(path.resolve('src/components/UI/SidebarPanelHost'))};
import ${JSON.stringify(require.resolve('@radix-ui/themes/styles.css'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
import {useNativeOverlay} from ${JSON.stringify(path.resolve('src/utils/hooks/useNativeOverlay'))};
import {BrowserOptionsMenu} from ${JSON.stringify(path.resolve('src/components/UI/BrowserOptionsMenu'))};
function Fixture(){const overlay=useNativeOverlay();React.useEffect(()=>window.electron.fixtureOverlay(overlay),[overlay]);const state=useSidebarPanels();const [active,setActive]=React.useState(true);return <Theme appearance="dark"><button id="toggle" onClick={()=>setActive(!active)}>Toggle</button><div className="browser-viewport" style={{position:"fixed",left:650,top:100,width:40,height:500}}/><BrowserOptionsMenu pageAvailable={true} onSelect={()=>{}}/><aside className="ai-sidebar" style={{height:600,width:368}}><AssistantPageHeader className="fixture-reference-header"><h2>Reference page</h2><ChromeIconButton icon={X} label="Reference action" onClick={()=>{}}/></AssistantPageHeader><SidebarPanels state={state} active={active} onClose={()=>setActive(false)}/></aside></Theme>}
function PageSwitches(){const [page,setPage]=React.useState('chat');return <Theme appearance="dark"><nav>{['chat','notes','activity'].map(id=><button id={'switch-'+id} onClick={()=>setPage(id)}>{id}</button>)}</nav><aside className="ai-sidebar" style={{height:600,width:Number(new URLSearchParams(location.search).get('width'))||368}}><SidebarPanelHost id="chat" title="Chat" active={page==='chat'}><div className="ai-sidebar-pane ai-assistant-layout ai-history-open ai-history-pinned"><AssistantPageHeader><h2>Chat</h2></AssistantPageHeader><div className="ai-messages">Content</div></div></SidebarPanelHost><SidebarPanelHost id="notes" title="Notes" active={page==='notes'}><NotesPage/></SidebarPanelHost><SidebarPanelHost id="activity" title="Activity" active={page==='activity'}><ActivityPage active={page==='activity'}/></SidebarPanelHost></aside></Theme>}
createRoot(document.getElementById('root')).render(location.search.includes('switches')?<PageSwitches/>:<Fixture/>);`,
);
require('esbuild').buildSync({
  entryPoints: [path.join(root, 'fixture.tsx')],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  nodePaths: [path.resolve('node_modules')],
  outfile: path.join(root, 'fixture.js'),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
});
fs.writeFileSync(
  path.join(root, 'index.html'),
  '<html><head><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>',
);
app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      show: false,
      width: 700,
      height: 700,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(root, 'preload.cjs'),
      },
    });
    registerSidebarPanelWindow(window);
    const host = sidebarPanelsFor(window);
    ipcMain.on('fixture-overlay', (event, value) => {
      if (event.sender === window.webContents) host.setSuspended(value);
    });
    const views = new Map();
    for (const id of ['one', 'two'])
      host.register({
        info: {
          id,
          title: `Extension ${id}`,
          kind: 'feature',
          key: `saved:${id}`,
        },
        contentKey: id,
        createView: () => {
          const view = new WebContentsView({
            webPreferences: { sandbox: true },
          });
          views.set(id, view);
          void view.webContents.loadURL(
            'data:text/html,<input id="draft"><h1>Panel content</h1>',
          );
          return view;
        },
      });
    let target;
    host.setTargets(
      [{ id: 'work', title: 'Work', profileId: 'work-profile' }],
      (id) => {
        target = id;
      },
    );
    await window.loadFile(path.join(root, 'index.html'));
    const choose = async (label, name) => {
      await window.webContents.executeJavaScript(
        `document.querySelector('[aria-label="${label}"]').click()`,
      );
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (
          await window.webContents.executeJavaScript(
            `Boolean([...document.querySelectorAll('[role="option"]')].find(node=>node.textContent.includes(${JSON.stringify(name)})))`,
          )
        )
          break;
        await pause(50);
      }
      await window.webContents.executeJavaScript(
        `[...document.querySelectorAll('[role="option"]')].find(node=>node.textContent.includes(${JSON.stringify(name)})).click()`,
      );
    };
    await pause(100);
    assert.equal(
      await window.webContents.executeJavaScript(
        `document.querySelector('.feature-empty-state h3').textContent`,
      ),
      'Your side panels',
    );
    await choose('Sidebar panel', 'Extension one');
    await pause(200);
    assert(
      views.get('one'),
      'Selecting a panel must create its content immediately',
    );
    const geometry = await window.webContents.executeJavaScript(
      `(()=>{const frame=document.querySelector('.ai-sidebar');const pane=frame.getBoundingClientRect();const slot=document.querySelector('.sidebar-feature-content').getBoundingClientRect();return {pane:pane.width,slot:slot.width,top:slot.top,height:slot.height,innerBottom:pane.bottom-parseFloat(getComputedStyle(frame).borderBottomWidth)}})()`,
    );
    assert(
      geometry.slot >= geometry.pane - 3,
      'Content must use the full shell width',
    );
    assert.equal(views.get('one').getBounds().width, Math.floor(geometry.slot));
    const panelBounds = views.get('one').getBounds();
    assert(panelBounds.y + panelBounds.height <= geometry.innerBottom,
      'Native panel content must end inside the shared frame bottom border');
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Browser options"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse',ctrlKey:false}))`);
    for (let i = 0; i < 50 && views.get('one').getVisible(); i++) await pause(50);
    assert.equal(views.get('one').getVisible(), false,
      'Shared overlay handling must hide the native panel beneath Browser options');
    await window.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    for (let i = 0; i < 50 && !views.get('one').getVisible(); i++) await pause(50);
    assert.equal(views.get('one').getVisible(), true,
      'Dismissing Browser options must restore the retained native panel');
    const alignment = await window.webContents.executeJavaScript(`(()=>{
      const normal=document.querySelector('.fixture-reference-header'),panel=document.querySelector('.sidebar-feature-pane .assistant-page-header');
      return {normalHeight:normal.getBoundingClientRect().height,panelHeight:panel.getBoundingClientRect().height,
        normalStart:normal.querySelector('.assistant-page-header-actions').getBoundingClientRect().x,panelStart:panel.querySelector('.assistant-page-header-actions').getBoundingClientRect().x,
        normalAction:normal.querySelector('button').getBoundingClientRect().height,panelAction:panel.querySelector('button').getBoundingClientRect().height};
    })()`);
    assert.equal(alignment.normalHeight, alignment.panelHeight, 'Shared header heights must match');
    assert.equal(alignment.normalStart, alignment.panelStart, 'Full-width content must retain the shared header inset');
    assert.equal(alignment.normalAction, alignment.panelAction, 'Shared controls must have the same height');
    await views
      .get('one')
      .webContents.executeJavaScript(
        `document.querySelector('#draft').value='retained draft'`,
      );
    await window.webContents.executeJavaScript(
      `document.querySelector('#toggle').click()`,
    );
    await pause(80);
    await window.webContents.executeJavaScript(
      `document.querySelector('#toggle').click()`,
    );
    await pause(80);
    assert.equal(
      await views
        .get('one')
        .webContents.executeJavaScript(
          `document.querySelector('#draft').value`,
        ),
      'retained draft',
    );
    await choose('Sidebar panel', 'Extension two');
    await pause(150);
    assert(
      views.get('two'),
      'Switching panels must not require a close/reopen',
    );
    await choose('Panel tab group', 'Work');
    await pause(80);
    assert.equal(target, 'work');
    const row = await window.webContents.executeJavaScript(
      `(()=>{const a=document.querySelector('[aria-label="Sidebar panel"]').getBoundingClientRect(),b=document.querySelector('[aria-label="Panel tab group"]').getBoundingClientRect();return Math.abs(a.top-b.top)})()`,
    );
    assert(row < 2, 'Both shared pickers must be on the same header row');
    host.close();
    await window.loadFile(path.join(root, 'index.html'));
    await pause(200);
    assert.equal(
      host.state().activeId,
      'two',
      'Remember selection after a renderer restart',
    );
    assert.equal(host.state().targetGroup, 'work');
    const viewport = window.getContentBounds();
    host.layout('two', { x:100, y:73, width:360, height:viewport.height-73+3 });
    assert.equal(views.get('two').getBounds().height, viewport.height-73, 'A three-pixel overflow must clip the native view, not blank it');
    host.close();
    const developerWidth = await window.webContents.executeJavaScript(`(()=>{
      const sidebar=document.querySelector('.ai-sidebar'),body=document.createElement('div');
      body.className='developer-sidebar-pages assistant-page-body-wide';
      body.innerHTML='<div class="developer-project">Project controls</div><div class="developer-pages-view"><div class="developer-sidebar-page">Page</div></div>';
      sidebar.appendChild(body);
      const width=body.querySelector('.developer-sidebar-page').getBoundingClientRect().width,available=sidebar.clientWidth;
      const contentLeft=body.querySelector('.developer-project').getBoundingClientRect().left;
      const headerLeft=sidebar.querySelector('.assistant-page-header-actions').getBoundingClientRect().left;
      body.remove();return {width,available,contentLeft,headerLeft};
    })()`);
    assert(developerWidth.width >= developerWidth.available-18,'Developer content must use one compact gutter, not stacked padding');
    assert.equal(developerWidth.headerLeft,developerWidth.contentLeft,'Shared header actions must align with the compact Developer content inset');
    for (const width of [368,640]) {
    await window.loadFile(path.join(root,'index.html'),{query:{switches:'1',width:String(width)}});
    const bounds=[];
    for (const page of ['chat','notes','activity','chat','notes','activity']) {
      await window.webContents.executeJavaScript(`document.querySelector('#switch-${page}').click()`);
      await pause(180);
      if (page==='chat' && width===640) assert((await window.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.querySelector('.ai-messages')).marginLeft)`))>0,'Wide pinned history must be exercised');
      const rect=await window.webContents.executeJavaScript(`(()=>{const header=[...document.querySelectorAll('.assistant-page-header')].find(el=>el.getBoundingClientRect().height>0);const box=header.getBoundingClientRect(),actions=header.querySelector('.assistant-page-header-actions').getBoundingClientRect();return {top:box.top,height:box.height,left:actions.left,right:actions.right}})()`);
      if(page==='activity') {
        await window.webContents.executeJavaScript(`document.querySelector('.activity-page-body').scrollTop=200`);
        assert((await window.webContents.executeJavaScript(`document.querySelector('.activity-page-body').scrollTop`))>0,'Activity must actually scroll');
        const top=await window.webContents.executeJavaScript(`document.querySelector('.activity-heading').getBoundingClientRect().top`);
        assert.equal(top,rect.top,'Scrolling Activity must not move its header');
      }
      bounds.push({page,...rect});
    }
    for(const result of bounds) {
      assert.equal(result.top,bounds[0].top,JSON.stringify(bounds));
      assert.equal(result.height,bounds[0].height,JSON.stringify(bounds));
      assert.equal(result.left,bounds[0].left,JSON.stringify(bounds));
      assert.equal(result.right,bounds[0].right,JSON.stringify(bounds));
    }
    }
    window.destroy();
    clearTimeout(timer);
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    console.log(
      'PASS panel UI: full width, immediate switching, retained native draft, saved selection and group target',
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(timer);
    app.exit(1);
  });

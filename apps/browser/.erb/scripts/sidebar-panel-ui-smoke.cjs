/* Real shared header, layout IPC and persistent native content in a disposable profile. */
const { app, BrowserWindow, WebContentsView } = require('electron');
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
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{platform:'darwin',browser:{sidebarPanels:r=>ipcRenderer.invoke('browser-sidebar-panels',r),onSidebarPanels:cb=>{const f=(_e,s)=>cb(s);ipcRenderer.on('browser-sidebar-panels-changed',f);return()=>ipcRenderer.removeListener('browser-sidebar-panels-changed',f)}}});`,
);
fs.writeFileSync(
  path.join(root, 'fixture.tsx'),
  `
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {SidebarPanels} from ${JSON.stringify(path.resolve('src/components/UI/SidebarPanels'))};
import {useSidebarPanels} from ${JSON.stringify(path.resolve('src/utils/useSidebarPanels'))};
import ${JSON.stringify(require.resolve('@radix-ui/themes/styles.css'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
function Fixture(){const state=useSidebarPanels();const [active,setActive]=React.useState(true);return <Theme appearance="dark"><button id="toggle" onClick={()=>setActive(!active)}>Toggle</button><aside className="ai-sidebar" style={{height:600,width:368}}><SidebarPanels state={state} active={active} onClose={()=>setActive(false)}/></aside></Theme>}
createRoot(document.getElementById('root')).render(<Fixture/>);`,
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
      `(()=>{const pane=document.querySelector('.ai-sidebar').getBoundingClientRect();const slot=document.querySelector('.sidebar-feature-content').getBoundingClientRect();return {pane:pane.width,slot:slot.width,top:slot.top,height:slot.height}})()`,
    );
    assert(
      geometry.slot >= geometry.pane - 3,
      'Content must use the full shell width',
    );
    assert.equal(views.get('one').getBounds().width, Math.floor(geometry.slot));
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

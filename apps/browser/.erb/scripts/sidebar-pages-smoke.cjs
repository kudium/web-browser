// Electron fixture: actual built-in pages, disposable profile, no remote pages.
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-sidebar-pages-'));
app.setPath('userData', temp);
const esbuild = require(root + '/node_modules/esbuild');
esbuild.buildSync({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
import React,{useState,useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@radix-ui/themes';
import {AISidebar} from './src/components/UI/AISidebar';
import {useSidebarPages} from './src/utils/hooks/useSidebarPages';
import {useSidebarPageWidths,fittedSidebarPageWidth} from './src/utils/hooks/useSidebarPageWidths';
import {SidebarPageAreaResizeHandle} from './src/components/UI/SidebarPageAreaResizeHandle';
import {useSidebarPageDocks} from './src/utils/hooks/useSidebarPageDocks';
function App(){
 const widths=useSidebarPageWidths(), docks=useSidebarPageDocks('right');
 const [bottomTarget,setBottomTarget]=useState(null);
 const sidebar=useSidebarPages(false,'assistant'),[selected,setSelected]=useState('assistant'),[size,setSize]=useState(innerWidth);
 const viewport=useRef(null), workspaceTarget=useRef(null);
 useLayoutEffect(()=>{const observer=new ResizeObserver(()=>{const r=viewport.current.getBoundingClientRect();window.fixture.geometry({x:r.x,y:r.y,width:r.width,height:r.height})});observer.observe(viewport.current);const resize=()=>setSize(innerWidth);addEventListener('resize',resize);return()=>{observer.disconnect();removeEventListener('resize',resize)}},[]);
 const right=sidebar.pages.filter(page=>docks.position(page)==='right'),bottom=sidebar.pages.filter(page=>docks.position(page)==='bottom');
 const maxArea=Math.max(240,Math.min(1200,size-264));
 const total=right.reduce((sum,page)=>sum+fittedSidebarPageWidth(page,widths.widths,368,maxArea),0)+Math.max(0,right.length-1)*8;
 const width=Math.min(maxArea,total),first=right[0]||'assistant',firstWidth=fittedSidebarPageWidth(first,widths.widths,368,maxArea);
 window.openPage=page=>{setSelected(page);sidebar.openPage(page)};
 window.setPageWidths=widths.changeWidths;
 window.dockBottom=()=>sidebar.pages.forEach(page=>docks.changeDock(page,'bottom'));
 window.metrics=()=>({docks:docks.docks,widths:widths.widths,pages:sidebar.pages,scroll:document.querySelector('.ai-sidebar').scrollLeft,viewport:(()=>{const r=viewport.current.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})(),columns:[...document.querySelectorAll('.sidebar-page-column:not([hidden])')].map(c=>{const r=c.getBoundingClientRect();return{id:c.dataset.sidebarPage,x:r.x,y:r.y,width:r.width,height:r.height}})});
 return <Theme appearance="dark"><div ref={workspaceTarget} className="workspace hidden-sidebar" data-panel-dock="independent" style={{'--ai-sidebar-width':'368px','--right-panels-width':width+'px','--panel-bottom-height':'320px'}}><main className="browser-shell"><div className="browser-chrome" style={{height:44}}>Independent sidebar pages</div><div className="browser-body"><div className="browser-viewport" ref={viewport}/><div className={'ai-panel-slot '+(right.length?'ai-panel-open':'')}><SidebarPageAreaResizeHandle page={first} width={firstWidth} totalWidth={total} maxAreaWidth={maxArea} target={workspaceTarget} onChange={next=>widths.changeWidths({[first]:next})} onResizingChange={()=>{}}/><AISidebar openedPages={sidebar.pages} activation={sidebar.activation} selectedPage={sidebar.activePage} onReorder={sidebar.reorder} dockPosition="right" pageDocks={docks.docks} onPageDockChange={docks.changeDock} bottomTarget={bottomTarget} pageWidths={widths.widths} onPageWidthsChange={widths.changeWidths} sidebarPane={selected} onSidebarPaneChange={page=>{setSelected(page);sidebar.openPage(page)}} onSidebarClose={sidebar.closePage}/></div><div className={'ai-bottom-panel-slot '+(bottom.length?'ai-panel-open':'')}><aside className="ai-sidebar ai-sidebar-multi"><div className="sidebar-page-columns" ref={setBottomTarget}/></aside></div></div></main></div></Theme>
};createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  outfile: temp + '/fixture.js',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const css = fs
  .readFileSync(root + '/src/renderer/index.css', 'utf8')
  .replace(/^@import[^;]+;/, '');
const theme = fs.readFileSync(
  root + '/node_modules/@radix-ui/themes/styles.css',
  'utf8',
);
fs.writeFileSync(
  temp + '/index.html',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; img-src data:; script-src 'self'"><style>${theme}\n${css}\nhtml,body{margin:0}</style><div id="root"></div><script src="fixture.js"></script>`,
);
fs.writeFileSync(
  temp + '/preload.cjs',
  `
const {contextBridge,ipcRenderer}=require('electron');
const stop=()=>()=>{};
const ai={taskStatus:async()=>({busy:false,resumable:false}),queue:async()=>({messages:[],paused:false}),onQueue:stop,settings:async()=>({endpoint:'http://127.0.0.1:9/v1',model:'Fixture',hasKey:true,remembered:false}),mcpStatus:async()=>({running:false}),onMCP:stop,onSettings:stop,onEvent:stop,groups:async()=>({groupId:null,groups:[]}),skills:async()=>[],takeOver:async()=>true,resumeExternal:async()=>true};
contextBridge.exposeInMainWorld('electron',{ai,activity:async()=>[],onActivityChanged:stop,ipcRenderer:{on:stop,sendMessage:()=>{}},browser:{onState:stop,onTabRequest:stop,nativeMenu:items=>ipcRenderer.invoke('sidebar-pages-menu',items)}});
contextBridge.exposeInMainWorld('fixture',{geometry:bounds=>ipcRenderer.invoke('sidebar-pages-geometry',bounds)});
`,
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1500,
      height: 800,
      show: true,
      webPreferences: {
        preload: temp + '/preload.cjs',
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    const page = new WebContentsView({
      webPreferences: { sandbox: true, backgroundThrottling: false },
    });
    page.setBounds({ x: 8, y: 44, width: 1400, height: 600 });
    win.contentView.addChildView(page);
    ipcMain.handle('sidebar-pages-geometry', (event, bounds) => {
      if (event.sender === win.webContents)
        page.setBounds(
          Object.fromEntries(
            Object.entries(bounds).map(([key, value]) => [
              key,
              Math.round(value),
            ]),
          ),
        );
    });
    let menuItems = [],
      menuChoice;
    ipcMain.handle('sidebar-pages-menu', (_event, items) => {
      menuItems = items;
      return (
        items
          .flatMap((item) => item.submenu || [item])
          .find((item) => item.label === menuChoice)?.id || null
      );
    });
    const js = (source) => win.webContents.executeJavaScript(source);
    try {
      await page.webContents.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<style>body{background:#eff4f8;font:20px system-ui}</style><input value="Retained page draft"><p>The web page stays live.</p>',
          ),
      );
      await win.loadFile(temp + '/index.html');
      await wait(150);
      for (const id of ['developer', 'email', 'assistant']) {
        await js(`openPage('${id}')`);
        await wait(300);
      }
      const evidence = process.env.KUDIUM_SIDEBAR_PAGES_EVIDENCE;
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        fs.writeFileSync(
          path.join(evidence, 'sidebar-pages-wide.png'),
          (await win.capturePage()).toPNG(),
        );
      }
      let metrics = await js('metrics()');
      assert.deepEqual(metrics.pages, ['developer', 'email', 'assistant']);
      assert.deepEqual(
        metrics.columns.map((c) => c.id),
        metrics.pages,
      );
      assert(metrics.columns.every((c) => c.width === 368 && c.height > 300));
      assert(
        metrics.columns.every(
          (c, i) => i === 0 || c.x >= metrics.columns[i - 1].x + 368,
        ),
        'Columns do not overlap',
      );
      assert(
        page.getVisible(),
        'Opening React pages keeps the native website live',
      );
      assert.equal(
        await page.webContents.executeJavaScript(
          'document.querySelector("input").value',
        ),
        'Retained page draft',
      );
      const resizePair = async (label, delta) => {
        await js(
          "document.querySelectorAll('.ai-sidebar').forEach(sidebar=>sidebar.scrollLeft=0)",
        );
        const handle = await js(
          `(()=>{const r=document.querySelector('[aria-label="${label}"]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+120)}})()`,
        );
        win.webContents.sendInputEvent({ type: 'mouseMove', ...handle });
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          ...handle,
          button: 'left',
          clickCount: 1,
        });
        win.webContents.sendInputEvent({
          type: 'mouseMove',
          x: handle.x + delta,
          y: handle.y,
        });
        await wait(40);
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          x: handle.x + delta,
          y: handle.y,
          button: 'left',
          clickCount: 1,
        });
        await wait(80);
      };
      await resizePair('Resize Developer and Email', 60);
      metrics = await js('metrics()');
      assert.deepEqual(metrics.widths, { developer: 428, email: 308 });
      assert.equal(
        metrics.columns[2].width,
        368,
        'Other page width remains unchanged',
      );
      assert(page.getVisible(), 'Divider drag keeps the native website live');
      await resizePair('Resize panel', -120);
      await resizePair('Resize Developer and Email', 20);
      metrics = await js('metrics()');
      assert.equal(
        metrics.columns.find((c) => c.id === 'developer').width,
        568,
        'Divider commit replaces the previous outer-edge width',
      );
      assert.equal(
        await js(
          "document.querySelector('.workspace').style.getPropertyValue('--sidebar-page-developer-width')",
        ),
        '',
        'Outer drag leaves no inherited width override',
      );
      assert(
        page.getBounds().x + page.getBounds().width <=
          Math.round(metrics.columns[0].x),
        'Native page stays outside panel content',
      );
      await resizePair('Resize Developer and Email', -20);
      await resizePair('Resize panel', 120);
      assert.equal((await js('metrics()')).widths.developer, 428);
      await js(
        `window.chatInput=document.querySelector('[aria-label="Task for AI"]');chatInput.value='Keep my chat draft';chatInput.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Close Email"]').click()`,
      );
      await wait(300);
      metrics = await js('metrics()');
      assert.deepEqual(metrics.pages, ['developer', 'assistant']);
      assert(
        await js(
          `chatInput===document.querySelector('[aria-label="Task for AI"]')`,
        ),
        'Chat input retains its identity',
      );
      await js("openPage('email')");
      await wait(300);
      assert.deepEqual((await js('metrics()')).pages, [
        'developer',
        'assistant',
        'email',
      ]);
      win.setContentSize(900, 700);
      await wait(300);
      metrics = await js('metrics()');
      assert(
        metrics.scroll > 0,
        'Newly opened page stays reachable in a narrow window',
      );
      assert(
        metrics.columns.every((c) => c.width === (metrics.widths[c.id] ?? 368)),
        'Narrow windows retain usable column widths',
      );
      assert(
        page.getBounds().width >= 240,
        'The native website retains usable space: ' +
          JSON.stringify({ bounds: page.getBounds(), metrics }),
      );
      const controls = await js(
        `(()=>{const page=document.querySelector('[data-sidebar-page="email"]');const r=page.getBoundingClientRect();return [...page.querySelectorAll('.assistant-page-header button')].filter(b=>b.getClientRects().length).map(b=>{const x=b.getBoundingClientRect();return {label:b.getAttribute('aria-label'),left:x.left,right:x.right,boundLeft:r.left,boundRight:r.right}})})()`,
      );
      assert(
        controls.every((c) => c.left >= c.boundLeft && c.right <= c.boundRight),
        'Header controls fit their page: ' + JSON.stringify(controls),
      );
      const dockPage = async (id, position) => {
        await js(
          `(()=>{const select=document.querySelector('[data-sidebar-page="${id}"] select[aria-label="Panel dock position"]');select.value='${position}';select.dispatchEvent(new Event('change',{bubbles:true}))})()`,
        );
        await wait(100);
      };
      await js("openPage('developer')");
      await wait(80);
      await js(
        "document.querySelector('.ai-panel-slot > .ai-sidebar').scrollLeft=2000",
      );
      await wait(80);
      await js("openPage('developer')");
      await wait(80);
      metrics = await js('metrics()');
      assert(
        metrics.columns.find((c) => c.id === 'developer').x >= 0,
        'Repeated active-page requests reveal a scrolled-out column',
      );
      await js("setPageWidths({developer:1200});openPage('developer')");
      await wait(160);
      metrics = await js('metrics()');
      assert(
        metrics.columns.find((c) => c.id === 'developer').width <= 636,
        'Saved wide panels fit the narrowed dock area',
      );
      const fittedScroll = metrics.scroll;
      await wait(160);
      assert.equal(
        (await js('metrics()')).scroll,
        fittedScroll,
        'Fitting an oversized panel does not oscillate its scroll position',
      );
      await js('setPageWidths({developer:428})');
      await wait(80);
      await dockPage('email', 'bottom');
      metrics = await js('metrics()');
      assert.deepEqual(
        metrics.docks,
        { email: 'bottom' },
        'Only Email changes placement',
      );
      let email = metrics.columns.find((c) => c.id === 'email');
      assert(
        Math.abs(email.width - metrics.viewport.width) < 1,
        'A lone bottom page fills the webpage width',
      );
      assert(
        email.y >= metrics.viewport.y + metrics.viewport.height,
        'Email is below the webpage',
      );
      await dockPage('developer', 'bottom');
      metrics = await js('metrics()');
      assert.deepEqual(metrics.docks, { email: 'bottom', developer: 'bottom' });
      assert.equal(
        metrics.columns.find((c) => c.id === 'assistant').width,
        368,
        'Chat remains on the right',
      );
      assert(
        await js(
          `chatInput===document.querySelector('[aria-label="Task for AI"]')`,
        ),
        'Independent placement retains the chat',
      );
      await dockPage('developer', 'right');
      await dockPage('email', 'right');
      win.setContentSize(1500, 700);
      await wait(300);
      await js('dockBottom()');
      await wait(300);
      metrics = await js('metrics()');
      assert.deepEqual(metrics.pages, ['developer', 'assistant', 'email']);
      assert(
        metrics.columns.every((c) => Math.abs(c.height - 320) <= 1),
        'Bottom dock retains every page',
      );
      assert(
        await js(
          `chatInput===document.querySelector('[aria-label="Task for AI"]')`,
        ),
      );
      await resizePair('Resize Developer and Chat', 20);
      metrics = await js('metrics()');
      assert.equal(metrics.widths.developer, 448);
      assert(metrics.columns.every((c) => c.width >= 240));
      assert(
        Math.abs(
          metrics.columns.reduce((sum, c) => sum + c.width, 0) + 16 - 1484,
        ) < 1,
        'Bottom pages fill the complete row',
      );
      assert(
        metrics.columns.every((c) => Math.abs(c.height - 320) <= 1),
        'Bottom height stays unchanged during width resizing',
      );
      await resizePair('Resize Developer and Chat', 0);
      win.setContentSize(900, 700);
      await wait(300);
      metrics = await js('metrics()');
      assert(
        Math.abs(
          metrics.columns.reduce((sum, c) => sum + c.width, 0) + 16 - 884,
        ) < 1,
        'Bottom pages fit a smaller row',
      );
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        fs.writeFileSync(
          path.join(evidence, 'sidebar-pages.png'),
          (await win.capturePage()).toPNG(),
        );
      }
      await js(
        "openPage('activity');setPageWidths({developer:240,assistant:240,email:240,activity:240})",
      );
      await wait(150);
      await js('dockBottom()');
      await wait(150);
      const headerGeometry = await js(
        `Array.from(document.querySelectorAll('.sidebar-page-column:not([hidden]) .assistant-page-header')).map(header => ({width:header.clientWidth,scroll:header.scrollWidth,more:!header.querySelector('[data-header-more]').hidden,buttons:Array.from(header.querySelectorAll('button')).filter(button=>!button.hidden).map(button=>({left:button.getBoundingClientRect().left,right:button.getBoundingClientRect().right})),bounds:{left:header.getBoundingClientRect().left,right:header.getBoundingClientRect().right}}))`,
      );
      assert(
        headerGeometry.every((header) => header.scroll <= header.width + 1),
        'Narrow panel headers do not overflow',
      );
      assert(
        headerGeometry.every((header) =>
          header.buttons.every(
            (button) =>
              button.left >= header.bounds.left &&
              button.right <= header.bounds.right,
          ),
        ),
        'Header buttons remain within their own column',
      );
      assert(
        headerGeometry.filter((header) => header.more).length >= 2,
        'Chat and Activity use the shared More menu: ' +
          JSON.stringify(headerGeometry),
      );
      menuChoice = 'Dock panel right';
      await js(
        "document.querySelector('[data-sidebar-page=activity] [data-header-more]').click()",
      );
      await wait(150);
      assert(
        menuItems.some((item) => item.label === 'Clear all'),
        'Activity text actions are available in More',
      );
      assert.equal(
        (await js('metrics()')).docks.activity,
        'right',
        'More uses the existing independent dock action',
      );
      await js(
        'document.querySelector(\'[aria-label="Close Activity"]\').click();setPageWidths({developer:448,assistant:348,email:308})',
      );
      await wait(150);
      metrics = await js('metrics()');
      const restored = new BrowserWindow({
        show: false,
        width: 900,
        height: 700,
        webPreferences: {
          preload: temp + '/preload.cjs',
          sandbox: true,
          contextIsolation: true,
        },
      });
      try {
        await restored.loadFile(temp + '/index.html');
        await wait(300);
        const layout =
          await restored.webContents.executeJavaScript('metrics()');
        assert.deepEqual(
          layout.pages,
          metrics.pages,
          'A new window session restores the complete saved layout',
        );
        assert.deepEqual(layout.docks, metrics.docks);
        assert.deepEqual(layout.widths, metrics.widths);
      } finally {
        restored.destroy();
      }
      console.log(
        'PASS: actual Developer, Email and Chat columns in opening order; independent close/reopen; retained input and live native page; narrow scrolling, independent divider drags in both right and bottom docking.',
      );
    } finally {
      if (!page.webContents.isDestroyed()) page.webContents.close();
      win.destroy();
      ipcMain.removeHandler('sidebar-pages-geometry');
      ipcMain.removeHandler('sidebar-pages-menu');
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(temp, { recursive: true, force: true }));

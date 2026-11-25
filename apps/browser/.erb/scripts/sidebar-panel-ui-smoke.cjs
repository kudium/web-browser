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
const {capturePagePNG}=require('../../src/main/aiScreenshot.ts');
const {showHookPanel,removeHookPanels,respondHookPanel}=require('../../src/main/hookPanels.ts');
const {protectWindowNavigation} = require('../../src/main/windowNavigation.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-panel-ui-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timer = setTimeout(() => { console.error('Panel UI fixture timed out.'); app.exit(1); }, 60000);
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{platform:'darwin',ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}},siteDeveloper:{pages:async()=>[],onPagesChanged:()=>()=>{},project:async()=>null,onProjectChanged:()=>()=>{},terminal:async()=>({tabs:[],selected:'',open:false,height:220}),onTerminal:()=>()=>{}},fixtureHookAction:callback=>{ipcRenderer.on('site-developer-panel-action',(_event,request)=>callback(request))},fixtureHookResponse:request=>ipcRenderer.send('fixture-hook-response',request),fixtureOverlay:value=>ipcRenderer.send('fixture-overlay',value),fixtureTheme:theme=>ipcRenderer.invoke('app-theme',{action:'publish',theme}),passwordManager:async r=>r.action==='notes'?[]:{},onPasswordManagerChanged:()=>()=>{},onPasswordManagerLock:()=>()=>{},activity:async r=>r.action==='list'?Array.from({length:30},(_,i)=>({id:String(i),title:'Activity '+i,url:'https://example.com/activity',message:'Output',source:'ai',asRead:false,createdAt:1})):undefined,onActivityChanged:()=>()=>{},browser:{onState:()=>()=>{},preferences:async()=>({activitySound:false}),tooltip:async()=>{},nativeMenu:async()=>{},sidebarPanels:r=>ipcRenderer.invoke('browser-sidebar-panels',r),onSidebarPanels:cb=>{const f=(_e,s)=>cb(s);ipcRenderer.on('browser-sidebar-panels-changed',f);return()=>ipcRenderer.removeListener('browser-sidebar-panels-changed',f)}}});`,
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
function Fixture(){const overlay=useNativeOverlay('.sidebar-feature-content');React.useEffect(()=>window.electron.fixtureOverlay(overlay),[overlay]);const [active,setActive]=React.useState(true);const state=useSidebarPanels(active);return <Theme appearance="dark"><button id="toggle" onClick={()=>setActive(!active)}>Toggle</button><div className="browser-viewport" style={{position:"fixed",left:650,top:100,width:40,height:500}}/><BrowserOptionsMenu pageAvailable={true} onSelect={()=>{}}/><aside className="ai-sidebar" style={{height:600,width:368}}><AssistantPageHeader className="fixture-reference-header"><h2>Reference page</h2><ChromeIconButton icon={X} label="Reference action" onClick={()=>{}}/></AssistantPageHeader><SidebarPanels state={state} active={active} onClose={()=>setActive(false)}/></aside></Theme>}
import {DeveloperSidebar} from ${JSON.stringify(path.resolve('src/components/UI/DeveloperSidebar'))};
import {STORAGE_KEY} from ${JSON.stringify(path.resolve('src/utils/constant'))};
localStorage.setItem(STORAGE_KEY.USER_APPS,JSON.stringify([{id:'home',name:'about:blank',url:'about:blank',sessionId:'work',sessionName:'Work',sessionSlug:'work',groupDisplay:'folder',icon:''}]));
function PageSwitches(){const [page,setPage]=React.useState('chat');return <Theme appearance="dark"><nav>{['chat','developer','notes','activity'].map(id=><button key={id} id={'switch-'+id} onClick={()=>setPage(id)}>{id}</button>)}</nav><aside className="ai-sidebar" style={{height:600,width:Number(new URLSearchParams(location.search).get('width'))||368}}><SidebarPanelHost id="chat" title="Chat" active={page==='chat'}><div className="ai-sidebar-pane ai-assistant-layout ai-history-open ai-history-pinned"><AssistantPageHeader><h2>Chat</h2></AssistantPageHeader><div className="ai-messages">Content</div></div></SidebarPanelHost><SidebarPanelHost id="developer" title="Developer" active={page==='developer'}><DeveloperSidebar active={page==='developer'} focusedTabId="home"/></SidebarPanelHost><SidebarPanelHost id="notes" title="Notes" active={page==='notes'}><NotesPage/></SidebarPanelHost><SidebarPanelHost id="activity" title="Activity" active={page==='activity'}><ActivityPage active={page==='activity'}/></SidebarPanelHost></aside></Theme>}
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
    const routedLinks=[];
    let routedGroup;
    protectWindowNavigation(window.webContents, require('node:url').pathToFileURL(path.join(root,'index.html')).href, async (url,groupId)=>{routedLinks.push(url);routedGroup=groupId},true);
    registerSidebarPanelWindow(window);
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error(event.message);
    });
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
    // Chromium's compositor cannot reliably capture a never-shown native view.
    // Exercise the visible browser surface users actually interact with.
    window.showInactive();
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
    await window.webContents.executeJavaScript(`(()=>{const wrapper=document.createElement('div');wrapper.id='unrelated-popup';wrapper.setAttribute('data-radix-popper-content-wrapper','');wrapper.innerHTML='<div data-state="open" style="position:fixed;left:650px;top:120px;width:40px;height:100px">Page menu</div>';document.body.append(wrapper)})()`);
    await pause(100);
    assert(views.get('one').getVisible(), 'A popup over only the webpage must not hide the panel');
    await window.webContents.executeJavaScript(`document.getElementById('unrelated-popup').remove()`);
    host.undock();
    await pause(100);
    host.setSuspended(true);
    assert(views.get('one').getVisible(), 'Parent popup suspension must not hide an undocked panel');
    host.setSuspended(false);
    host.dock();
    await pause(150);
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
    assert(await window.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.sidebar-panel-snapshot');return !!image && image.complete && image.naturalWidth>0;})()`),
      'An overlapping popup must leave a decoded panel image visible beneath it: ' + JSON.stringify({snapshot: host.state().snapshot ? {length: host.state().snapshot.image.length, prefix: host.state().snapshot.image.slice(0,30)} : null, dom: await window.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.sidebar-panel-snapshot');return image?{complete:image.complete,width:image.naturalWidth}:null})()`)}));
    await window.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    for (let i = 0; i < 50 && !views.get('one').getVisible(); i++) await pause(50);
    assert.equal(views.get('one').getVisible(), true,
      'Dismissing Browser options must restore the retained native panel');
    assert(!host.state().snapshot, 'Restoring the native panel must release captured pixels');
    await window.webContents.executeJavaScript(`(()=>{const dialog=document.createElement('div');dialog.className='rt-BaseDialogOverlay';dialog.id='fixture-group-dialog';dialog.dataset.state='open';dialog.style.cssText='position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.2)';dialog.innerHTML='<div role="dialog">Group dialog</div>';document.body.append(dialog);})()`);
    for (let i = 0; i < 50 && views.get('one').getVisible(); i++) await pause(50);
    assert.equal(views.get('one').getVisible(), false, 'A full-window group dialog must receive input above native content');
    assert(await window.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.sidebar-panel-snapshot');return !!image && image.complete && image.naturalWidth>0;})()`), 'A full-window dialog must not blank the panel background');
    await window.webContents.executeJavaScript(`document.getElementById('fixture-group-dialog').remove()`);
    for (let i = 0; i < 50 && !views.get('one').getVisible(); i++) await pause(50);
    assert.equal(views.get('one').getVisible(), true, 'Closing the group dialog must restore live content');
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
    const retainedView = views.get('one');
    await window.webContents.executeJavaScript(`document.querySelector('#toggle').click()`);
    await pause(80);
    host.close();
    await pause(80);
    await window.webContents.executeJavaScript(`document.querySelector('#toggle').click()`);
    await pause(200);
    assert.equal(host.state().activeId, 'one', 'Reopening must restore the remembered panel selection');
    assert.equal(views.get('one'), retainedView, 'Reopening must reuse the existing native view');
    assert.equal(await retainedView.webContents.executeJavaScript(`document.querySelector('#draft').value`), 'retained draft', 'Reopening must preserve unsaved panel content');
    console.log('PASS panel close/reopen: remembered selection and retained native draft');
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
    let hookAllowed=true;
    const hookBinding={source:window.webContents,owner:window,groupId:'work',token:'native-test',hookId:'sample',hookName:'Sample hook',authorized:()=>hookAllowed};
    const output={id:'output',title:'Hook output',content:{type:'markdown',text:'# Output\n**Ready**'},reveal:true};
    showHookPanel(hookBinding,output);
    await pause(200);
    const hookView=window.contentView.children.find(v=>v.webContents && v.webContents!==window.webContents && ![...views.values()].includes(v));
    assert(hookView,'Hook output must use the existing native panel host');
    assert((await hookView.webContents.executeJavaScript(`document.querySelector('#panel-output').textContent`)).includes('Ready'),'Structured output must render Markdown');
    const custom={...output,content:{type:'html',html:'<input id="retained"><button id="invoke">Refresh</button><span id="value"></span>',script:"kudiumHookPanel.onUpdate(output=>document.getElementById('value').textContent=output.content.data.count);document.getElementById('invoke').onclick=()=>kudiumHookPanel.invoke('refresh',{count:3})",data:{count:1}},actions:[{id:'refresh',label:'Refresh'}]};
    const previous=new Set(window.contentView.children);
    showHookPanel(hookBinding,custom);
    await pause(200);
    const customView=window.contentView.children.find(v=>!previous.has(v)&&v.webContents);
    assert(customView,'Custom HTML must create an isolated native view');
    await customView.webContents.executeJavaScript(`document.getElementById('retained').value='keep me'`);
    showHookPanel(hookBinding,{...custom,content:{...custom.content,data:{count:2}}});
    await pause(80);
    assert.equal(await customView.webContents.executeJavaScript(`document.getElementById('retained').value`),'keep me','Data updates must retain custom UI state');
    assert.equal(await customView.webContents.executeJavaScript(`document.getElementById('value').textContent`),'2');
    window.webContents.on('ipc-message',(_event,channel,request)=>{
      if(channel==='fixture-hook-response')respondHookPanel(window.webContents,'native-test','sample',request);
    });
    await window.webContents.executeJavaScript(`window.electron.fixtureHookAction(request=>window.electron.fixtureHookResponse({requestId:request.requestId,value:request.payload}))`);
    assert.deepEqual(await customView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh',{count:3})`),{count:3},'Declared custom UI actions must reach their originating hook');
    assert.equal(await customView.webContents.executeJavaScript(`kudiumHookPanel.invoke('undeclared').then(()=>false,()=>true)`),true,'Undeclared actions must be denied');
    assert.equal(await customView.webContents.executeJavaScript(`fetch('https://example.com/private').then(()=>false,()=>true)`),true,'Custom panels must not gain network access');
    assert.equal(await customView.webContents.executeJavaScript(`typeof require + ':' + typeof window.electron`),'undefined:undefined','Custom panels must not gain Node or app preload APIs');
    await customView.webContents.executeJavaScript(`kudiumHookPanel.openLink('https://example.com/hook-panel')`);
    assert.equal(routedGroup,'work','Hook links must keep the explicitly authorized group');
    host.setTarget(undefined);host.setSession(undefined,'other');
    assert.equal(await customView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh').then(()=>false,()=>true)`),true,'Auto must distinguish groups sharing one session');
    host.setSession(undefined,'work');host.setTarget('work');
    hookAllowed=false;
    assert.equal(await customView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh').then(()=>false,()=>true)`),true,'Revoked hook access must reject panel actions');
    removeHookPanels(window.webContents);
    assert(!host.state().panels.some(p=>p.kind==='hook'),'Stopping a hook must remove its providers');
    hookAllowed=true;
    const sample=require(path.resolve('../../packages/hooks/panel-examples.ts')).hookPanelExamples.find(e=>e.id==='panel-html');
    const sampleOutput=await window.webContents.executeJavaScript(`(async()=>{let output;const context={document,url:location.href,panel:{onAction:()=>{},update:async input=>{output=input;return {id:input.id}}}};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction('context',${JSON.stringify(require(path.resolve('../../packages/hooks/runtime.ts')).pageHookBody(sample.source))})(context);return output})()`);
    const beforeSample=new Set(window.contentView.children);
    showHookPanel(hookBinding,sampleOutput);
    await pause(150);
    const sampleView=window.contentView.children.find(v=>!beforeSample.has(v)&&v.webContents);
    assert(sampleView,'The shared custom HTML example must render');
    window.showInactive();
    await pause(200);
    fs.writeFileSync(path.join(os.tmpdir(),'kudium-hook-panel-qa.png'),Buffer.from(await capturePagePNG(sampleView.webContents,new AbortController().signal),'base64'));
    window.hide();
    removeHookPanels(window.webContents);
    for(const channel of ['personal-data-autofill-position','personal-data-autofill-enabled','personal-data-autofill-focus'])ipcMain.handle(channel,()=>false);
    const http=require('node:http');
    const imageRequests = [];
    const imageServer = http.createServer((request,response)=>{
      imageRequests.push({ url: request.url, cookie: request.headers.cookie, referer: request.headers.referer, authorization: request.headers.authorization });
      response.setHeader('Content-Type','image/svg+xml');
      response.setHeader('Set-Cookie','panel-secret=never-send; Path=/');
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#5aaca8"/></svg>');
    });
    await new Promise(resolve=>imageServer.listen(0,'127.0.0.1',resolve));
    const imageOrigin='http://127.0.0.1:'+imageServer.address().port;
    let mediaFixture = false;
    const server=http.createServer((request,response)=>{
      if (request.url === '/preview.svg') { response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#5aaca8"/></svg>');return; }
      response.end(mediaFixture ? '<!doctype html><title>Media fixture</title><img src="/preview.svg" alt="Fixture image"><video preload="none"><source src="/clip.mp4"></video><audio preload="none" src="/song.mp3"></audio>'+Array.from({length:27},(_,i)=>'<a href="'+imageOrigin+'/image-'+i+'.jpg">Image '+i+'</a>').join('') : '<!doctype html><title>Hook fixture page</title><h1>Hook fixture</h1><a href="https://example.com/one">One</a><a href="https://example.com/two">Two</a>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const pageURL='http://127.0.0.1:'+server.address().port+'/';
    const {registerDeveloperPage,siteDeveloperPreload,resetDeveloperState}=require('../../src/main/siteDeveloper.ts');
    const {emptyDeveloperConfig}=require('../../src/browser/siteDeveloper.ts');
    require('../../src/main/appTheme.ts').registerAppThemeWindow(window,{producer:true});
    const setFixtureTheme=async primary=>{const contrast=require('../../src/utils/appTheme.ts').primaryContrast(primary);await window.webContents.executeJavaScript(`electron.fixtureTheme(${JSON.stringify({spaceId:'fixture',primary,frame:primary,contrast})})`);};
    await setFixtureTheme('#df6363');
    const liveScript="context.panel.onAction('refresh',async payload=>{await context.panel.update({id:'live',title:'Live hook',content:{type:'text',text:'Updated '+document.title},actions:[{id:'refresh',label:'Refresh'}]});return {title:document.title,payload,primary:context.theme.primary}});await context.panel.show({id:'live',title:'Live hook',content:{type:'text',text:'Published from page hook'},actions:[{id:'refresh',label:'Refresh'}],reveal:true});";
    const approved={...emptyDeveloperConfig,enabled:true,before:"log('before')",after:liveScript};
    const sourceWindow=new BrowserWindow({show:false,webPreferences:{partition:'hook-panel-source-fixture',sandbox:true,contextIsolation:true,nodeIntegration:false,preload:siteDeveloperPreload()}});
    const beforeLive=new Set(window.contentView.children);
    registerDeveloperPage(sourceWindow.webContents,'fixture-profile',()=>{},()=>({groupId:'work',sourceId:'fixture-page'}),()=>approved,window);
    await sourceWindow.loadURL(pageURL);
    for(let i=0;i<50&&!host.state().panels.some(p=>p.title==='Live hook');i++)await pause(50);
    const liveView=window.contentView.children.find(v=>!beforeLive.has(v)&&v.webContents);
    assert(liveView,'The real authenticated page-hook output bridge must create the shared panel');
    await pause(150);
    assert.equal((await liveView.webContents.executeJavaScript(`document.getElementById('panel-output').textContent`)),'Published from page hook');
    const liveAnswer=await liveView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh',{from:'panel'})`);
    assert.deepEqual(liveAnswer,{title:'Hook fixture page',payload:{from:'panel'},primary:'#df6363'},'The native panel must round-trip through the actual page hook dispatcher');
    await pause(60);
    assert.equal(await liveView.webContents.executeJavaScript(`document.getElementById('panel-output').textContent`),'Updated Hook fixture page');
    await setFixtureTheme('#568fe0'); await pause(60);
    assert.equal((await liveView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh',{})`)).primary,'#568fe0','Running hook context follows the shared theme without rerunning source');
    resetDeveloperState(sourceWindow.webContents,new URL(pageURL).origin);
    assert(!host.state().panels.some(p=>p.title==='Live hook'),'Revoking the real hook must remove its output');
    const panelExamples=require(path.resolve('../../packages/hooks/panel-examples.ts')).hookPanelExamples;
    for(const sample of panelExamples) {
      mediaFixture = sample.id === 'panel-media';
      approved.after=sample.source;
      const previousViews=new Set(window.contentView.children);
      await sourceWindow.loadURL(pageURL);
      for(let i=0;i<50&&!host.state().panels.some(p=>p.kind==='hook');i++)await pause(50);
      const exampleView=window.contentView.children.find(v=>!previousViews.has(v)&&v.webContents);
      assert(exampleView,sample.id+': actual page hook must publish its panel');
      await pause(120);
      if(sample.id==='panel-markdown') {
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelector('#panel-output h1').textContent`),'Hook fixture page');
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelector('#panel-output a').href`),pageURL);
      }
      if(sample.id==='panel-table')assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelectorAll('tbody tr').length`),2);
      if(sample.id==='panel-json')assert.equal(await exampleView.webContents.executeJavaScript(`JSON.parse(document.querySelector('pre').textContent).headings`),1);
      if(sample.id==='panel-status') {
        await exampleView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh')`);
        assert((await exampleView.webContents.executeJavaScript(`document.querySelector('[role="status"]').textContent`)).includes('2 links'));
      }
      if(sample.id==='panel-html') {
        await exampleView.webContents.executeJavaScript(`document.querySelector('input').value='Retained scratch note'`);
        await exampleView.webContents.executeJavaScript(`kudiumHookPanel.invoke('refresh')`);
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelector('input').value`),'Retained scratch note');
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelector('#count').textContent`),'2 links on this page');
      }
      if(sample.id==='panel-media') {
        window.showInactive(); await pause(200);
        fs.writeFileSync(path.join(os.tmpdir(),'kudium-media-gallery-qa.png'),Buffer.from(await capturePagePNG(exampleView.webContents,new AbortController().signal),'base64'));
        window.hide();
        for(let i=0;i<30;i++) {
          if(await exampleView.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#gallery img')).some(img=>img.src.startsWith('http:')&&img.naturalWidth>0)`))break;
          await pause(50);
        }
        assert(await exampleView.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#gallery img')).some(img=>img.src.startsWith('http:')&&img.naturalWidth>0)`),'Cross-origin source pictures render despite unavailable canvas previews');
        assert.equal(await exampleView.webContents.executeJavaScript(`new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(false);image.onerror=()=>resolve(true);image.src=${JSON.stringify(imageOrigin+'/unlisted.jpg')}})`),true,'Unlisted image URL must be blocked');
        assert.equal(await exampleView.webContents.executeJavaScript(`fetch(${JSON.stringify(imageOrigin+'/image-0.jpg')}).then(()=>false,()=>true)`),true,'Even a listed image cannot grant fetch access');
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelectorAll('#gallery a').length`),12);
        const neutralColor=await exampleView.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#gallery a')).color`);
        assert.equal(await exampleView.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--kudium-primary').trim()`),'#568fe0','Primary remains available for opt-in custom designs');
        assert.equal(neutralColor,await exampleView.webContents.executeJavaScript(`getComputedStyle(document.body).color`),'Gallery inherits neutral text instead of tinting every card');
        await setFixtureTheme('#4ca87a'); await pause(60);
        assert.equal(await exampleView.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--kudium-primary').trim()`),'#4ca87a','Live theme variables update without recreating the panel');
        assert.equal(await exampleView.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#gallery a')).color`),neutralColor,'Primary changes keep default content neutral');
        const lightInk=await exampleView.webContents.executeJavaScript(`document.documentElement.style.colorScheme='light';getComputedStyle(document.body).color`);
        const darkInk=await exampleView.webContents.executeJavaScript(`document.documentElement.style.colorScheme='dark';getComputedStyle(document.body).color`);
        assert.notEqual(darkInk,lightInk,'Neutral content follows light/dark appearance');
        await exampleView.webContents.executeJavaScript(`document.documentElement.style.colorScheme=''`);
        assert(await exampleView.webContents.executeJavaScript(`document.querySelector('#gallery img').src.startsWith('data:image/jpeg')`),'Loaded page image gets an actual native canvas thumbnail');
        assert((await exampleView.webContents.executeJavaScript(`document.getElementById('summary').textContent`)).includes('30 media links'));
        assert((await exampleView.webContents.executeJavaScript(`document.querySelector('#gallery').textContent`)).includes('audio'));
        await exampleView.webContents.executeJavaScript(`kudiumHookPanel.invoke('media-next')`);
        assert((await exampleView.webContents.executeJavaScript(`document.getElementById('summary').textContent`)).includes('page 2 of 3'));
        await exampleView.webContents.executeJavaScript(`kudiumHookPanel.invoke('media-next')`);
        assert.equal(await exampleView.webContents.executeJavaScript(`document.querySelectorAll('#gallery a').length`),6);
        await exampleView.webContents.executeJavaScript(`kudiumHookPanel.invoke('media-previous')`);
        assert((await exampleView.webContents.executeJavaScript(`document.getElementById('summary').textContent`)).includes('page 2 of 3'));
      }
      resetDeveloperState(sourceWindow.webContents,new URL(pageURL).origin);
    }
    assert(imageRequests.length>0,'The panel must load explicit source images');
    assert(imageRequests.every(request=>!request.cookie&&!request.referer&&!request.authorization),'Source images load without cookies, referrer or authorization');
    assert(!imageRequests.some(request=>request.url==='/unlisted.jpg'),'An undeclared URL never reaches the image server');
    await new Promise(resolve=>{imageServer.close(resolve);imageServer.closeAllConnections();});
    sourceWindow.destroy();
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    for (const width of [368,640]) {
    await window.loadFile(path.join(root,'index.html'),{query:{switches:'1',width:String(width)}});
    const bounds=[];
    for (const page of ['chat','developer','notes','activity','chat','developer','notes','activity']) {
      await window.webContents.executeJavaScript(`document.querySelector('#switch-${page}').click()`);
      await pause(180);
      if (page==='chat' && width===640) assert((await window.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.querySelector('.ai-messages')).marginLeft)`))>0,'Wide pinned history must be exercised');
      const rect=await window.webContents.executeJavaScript(`(()=>{const header=[...document.querySelectorAll('.assistant-page-header')].find(el=>el.getBoundingClientRect().height>0);const box=header.getBoundingClientRect(),actions=header.querySelector('.assistant-page-header-actions').getBoundingClientRect();return {top:box.top,height:box.height,left:actions.left,right:actions.right}})()`);
      const controls=await window.webContents.executeJavaScript(`(()=>{const h=[...document.querySelectorAll('.assistant-page-header')].find(el=>el.getBoundingClientRect().height>0);return [...h.querySelectorAll('.chrome-icon-button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.getAttribute('aria-label'),width:r.width,height:r.height,top:r.top,bottom:r.bottom}})})()`);
      for(const control of controls) {
        assert.equal(control.width,26,`${page}: ${control.label} must use shared control width`);
        assert.equal(control.height,26,`${page}: ${control.label} must use shared control height`);
        assert(control.top>=rect.top && control.bottom<=rect.top+rect.height,`${page}: controls must fit within the header`);
      }
      const clippedBy=await window.webContents.executeJavaScript(`(()=>{const h=[...document.querySelectorAll('.assistant-page-header')].find(el=>el.getBoundingClientRect().height>0),r=h.getBoundingClientRect();for(let p=h.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(['hidden','auto','scroll','clip'].includes(s.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return p.className}return null})()`);
      assert.equal(clippedBy,null,`${page}: shared header must not be clipped by its page container`);
      if(page==='activity') {
        await window.webContents.executeJavaScript(`document.querySelector('.activity-summary').click()`);
        await pause(80);
        assert.equal(routedLinks.at(-1),'https://example.com/activity','Actual Activity clicks must use the owner window link handler');
        for(const target of ['_blank','']) {
          await window.webContents.executeJavaScript(`(()=>{const a=document.createElement('a');a.href='https://example.com/sidebar-guide';a.target=${JSON.stringify(target)};document.body.append(a);a.click();a.remove()})()`);
          await pause(80);
          assert.equal(routedLinks.at(-1),'https://example.com/sidebar-guide','Sidebar anchors must use shared navigation without leaving the trusted app document');
        }

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

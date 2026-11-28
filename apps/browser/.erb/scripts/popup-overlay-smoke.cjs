// Run with Electron from apps/browser. Uses local pages and a disposable profile.
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-popup-overlay-'));
app.setPath('userData', temp);
const esbuild = require(path.join(root, 'node_modules/esbuild'));
esbuild.buildSync({
  entryPoints: [root + '/src/main/snapshotPresentation.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: temp + '/snapshots.cjs',
});
const { presentSnapshots, captureNativeViewSnapshots } = require(
  temp + '/snapshots.cjs',
);
esbuild.buildSync({
  entryPoints: [root + '/src/main/pageDevTools.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: temp + '/devtools.cjs',
});
const { PageDevTools } = require(temp + '/devtools.cjs');
esbuild.buildSync({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme,Dialog,Button,Select} from '@radix-ui/themes';
import {ChromeIconButton} from './src/components/UI/ChromeIconButton';
import {Plus} from 'lucide-react';
import {AIComposerSuggestions} from './src/components/UI/AIComposerSuggestions';
import {BrowserOptionsMenu} from './src/components/UI/BrowserOptionsMenu';
import {GroupPicker} from './src/components/UI/GroupPicker';
import {GroupIcon} from './src/components/UI/GroupIcon';
import {AnchoredTabPreview} from './src/components/UI/AnchoredTabPreview';
import {CollectionIcon} from './src/components/UI/CollectionIcon';
import {useNativeOverlayPresentation} from './src/utils/hooks/useNativeOverlay';
function App(){
 const [frames,setFrames]=useState([]),[option,setOption]=useState(''),[group,setGroup]=useState('personal');
 const input=useRef(null);const [suggestions,setSuggestions]=useState(false);const [collectionPreview,setCollectionPreview]=useState(null);
 const overlay=useNativeOverlayPresentation('.browser-viewport','page',window.fixture.onReady);
 useEffect(()=>window.fixture.onSnapshots(setFrames),[]);
 useEffect(()=>{window.fixture.layout(overlay.open,overlay.token)},[overlay.open,overlay.token]);
 window.metrics=()=>({option,group,open:overlay.open,token:overlay.token,frames:window.samples??[]});
 useEffect(()=>{let frame;const sample=()=>{const popup=document.querySelector('[data-native-overlay-page]');if(popup){window.samples??=[];window.samples.push({at:Date.now(),state:popup.dataset.nativeOverlayPage,opacity:getComputedStyle(popup).opacity,animations:popup.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>({name:a.animationName,property:a.transitionProperty,target:a.effect.target.className}))})}frame=requestAnimationFrame(sample)};frame=requestAnimationFrame(sample);return()=>cancelAnimationFrame(frame)},[]);
 const stackItem={id:'stack',sessionId:'stack',sessionName:'Work stack',groupDisplay:'folder',name:'Docs',url:'https://example.com',customIconEmoji:'📚'};
 return <Theme appearance="dark"><aside className="compact-sidebar" style={{position:'absolute',left:0,top:70,width:64}}><nav className="favorites-grid"><button className="sidebar-app" aria-label="Compact favorite stack"><GroupIcon item={{...stackItem,favorite:true}} tabs={[{...stackItem,favorite:true},{...stackItem,id:'inbox',favorite:true,customIconEmoji:'✉️'}]} compact /></button></nav><div className="sidebar-app-row"><button className="sidebar-app" aria-label="Compact folder stack"><GroupIcon item={stackItem} tabs={[stackItem,{...stackItem,id:'inbox',customIconEmoji:'✉️'},{...stackItem,id:'calendar',customIconEmoji:'📆'}]} compact /></button></div><div className="sidebar-app-row"><button className="sidebar-app" aria-label="Compact two stack"><GroupIcon item={stackItem} tabs={[stackItem,{...stackItem,id:'inbox',customIconEmoji:'✉️'}]} compact /></button></div><div className="sidebar-app-row"><button className="sidebar-app" aria-label="Compact single icon"><GroupIcon item={{...stackItem,groupDisplay:'tabs'}} tabs={[stackItem]} compact /></button></div><div className="tab-folder"><div className="folder-header"><button className="folder-heading" aria-label="Compact Documents" onClick={event=>setCollectionPreview({kind:'folder',id:'documents',anchor:event.currentTarget.parentElement,interaction:'click'})}><span className="sidebar-collection-icon"><CollectionIcon size={22}/></span><strong>Documents</strong></button></div></div><div className="tab-folder"><div className="folder-header"><button className="folder-heading" aria-label="Compact empty collection" onClick={event=>setCollectionPreview({kind:'folder',id:'empty',anchor:event.currentTarget.parentElement,interaction:'click'})}><span className="sidebar-collection-icon"><CollectionIcon size={22}/></span><strong>Empty</strong></button></div></div><div className="sidebar-create-actions"><ChromeIconButton icon={Plus} className="compact-create-button" label="Compact add" /></div></aside>
 {collectionPreview&&<AnchoredTabPreview target={collectionPreview} title={collectionPreview.id==='empty'?'Empty collection':'Documents'} entries={collectionPreview.id==='empty'?[]:[{id:'work',title:'Work group',detail:'2 tabs',icon:''}]} selectedId="" onSelect={()=>{setOption('collection-group');setCollectionPreview(null)}} onRemove={()=>{}} onNewTab={()=>{}} onBack={()=>{}} onClose={()=>setCollectionPreview(null)} onEnter={()=>{}} onLeave={()=>{}} onNewGroup={()=>{setOption('collection-new');setCollectionPreview(null)}} onManageCollection={()=>{setOption('collection-manage');setCollectionPreview(null)}}/>}
 <header style={{display:'flex',gap:30,alignItems:'center',height:60,paddingLeft:280}}>
 <GroupPicker label="Folder tab groups" disabled={false} value={group} onChange={setGroup} options={[{id:'personal',name:'Personal'},{id:'work',name:'Work'}]}/>
 <BrowserOptionsMenu pageAvailable onSelect={setOption}/><Dialog.Root><Dialog.Trigger><Button aria-label="Folder settings">Folder settings</Button></Dialog.Trigger><Dialog.Content><Dialog.Title>Folder settings</Dialog.Title><Dialog.Description>Edit the folder name</Dialog.Description><input aria-label="Folder name" defaultValue="Personal" /></Dialog.Content></Dialog.Root>
 <Select.Root defaultValue="one" onValueChange={setOption}><Select.Trigger aria-label="Select popup"/><Select.Content>{['one','two','three','four','five','six'].map(id=><Select.Item key={id} value={id}>{id}</Select.Item>)}</Select.Content></Select.Root>
 <textarea ref={input} aria-label="Assistant draft" defaultValue="@w" style={{width:70,height:24}}/><Button aria-label="Assistant suggestions" onClick={()=>setSuggestions(true)}>Suggest</Button>
 {suggestions&&<AIComposerSuggestions input={input} cursor={2} value="@w" selectedIndex={0}><button onClick={()=>{setOption('suggestion');setSuggestions(false)}}>Work suggestion</button></AIComposerSuggestions>}
 </header><div className="browser-viewport" style={{position:'absolute',left:200,top:70,right:0,bottom:0}}>{frames.map(frame=><img key={frame.id+':'+(frame.surface||'page')} className="browser-snapshot" data-presentation-id={frame.presentationId} src={frame.image} style={{position:'absolute',left:frame.x-200,top:frame.y-70,width:frame.width,height:frame.height}}/>)}</div></Theme>
};createRoot(document.getElementById('root')).render(<App/>);`,
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
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src data:; style-src 'unsafe-inline'; script-src 'self'"><style>${theme}\n${css}\nhtml,body{margin:0}</style><div id="root"></div><script src="fixture.js"></script>`,
);
fs.writeFileSync(
  temp + '/preload.cjs',
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{layout:(open,token)=>ipcRenderer.invoke('popup-fixture-layout',open,token),onReady:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('browser-native-overlay-ready',listener);return()=>ipcRenderer.removeListener('browser-native-overlay-ready',listener)},onSnapshots:callback=>{const listener=(_event,frames)=>callback(frames);ipcRenderer.on('browser-snapshots',listener);return()=>ipcRenderer.removeListener('browser-snapshots',listener)}});`,
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(10);
  }
  throw new Error(message);
}
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: true,
      width: 1000,
      height: 700,
      webPreferences: {
        preload: temp + '/preload.cjs',
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const page = new WebContentsView({
      webPreferences: { sandbox: true, backgroundThrottling: false },
    });
    const size = win.getContentSize();
    const bounds = {
      x: 200,
      y: 70,
      width: size[0] - 200,
      height: size[1] - 70,
    };
    page.setBounds(bounds);
    win.contentView.addChildView(page);
    const manager = new PageDevTools(() => {});
    let liveBounds = bounds;
    let revision = 0,
      delay = 60,
      yieldedAt = 0;
    ipcMain.handle('popup-fixture-layout', async (event, open, token) => {
      if (event.sender !== win.webContents) return;
      const current = ++revision;
      if (!open) {
        page.setVisible(true);
        manager.layout(page.webContents, win, bounds, true);
        return;
      }
      if (delay) await wait(delay);
      if (current !== revision) return;
      const inspector = manager.snapshotView(page.webContents, win);
      const frames = await captureNativeViewSnapshots('page', [
        { view: page },
        ...(inspector ? [{ view: inspector, surface: 'devtools' }] : []),
      ]);
      if (current !== revision) return;
      await presentSnapshots(win, frames, undefined, 80);
      if (current !== revision) return;
      page.setVisible(false);
      manager.hide(page.webContents);
      yieldedAt = Date.now();
      win.webContents.send('browser-native-overlay-ready', {
        surface: 'page',
        token,
      });
    });
    const evaluate = (source) => win.webContents.executeJavaScript(source);
    async function click(selector) {
      win.focus();
      const point = await evaluate(
        `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`,
      );
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      win.webContents.sendInputEvent({
        type: 'mouseDown',
        ...point,
        button: 'left',
        clickCount: 1,
      });
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        ...point,
        button: 'left',
        clickCount: 1,
      });
    }
    async function escape() {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await until(
        async () => !(await evaluate('metrics().open')),
        'Popup did not dismiss',
      );
      await until(() => page.getVisible(), 'Native page did not resume');
    }
    async function verifyReveal(selector) {
      await evaluate('window.samples=[]');
      const started = Date.now();
      await click(selector);
      await until(
        async () =>
          await evaluate(
            `document.querySelector('[data-native-overlay-page="ready"]')!==null`,
          ),
        'Popup never became ready',
      );
      await until(
        async () =>
          (await evaluate('metrics().frames')).some(
            (frame) => frame.state === 'ready',
          ),
        'Visible popup frames were not sampled',
      );
      const samples = (await evaluate('metrics()')).frames;
      assert(
        samples.some((sample) => sample.state === 'ready'),
        'Visible frames were sampled',
      );
      if (delay)
        assert(
          samples.some((sample) => sample.state === 'pending'),
          'Delayed handoff exercised intermediate frames',
        );
      assert(
        samples.every(
          (sample) => sample.state !== 'pending' || sample.opacity === '0',
        ),
        'No partial popup while the page is live',
      );
      assert(
        samples.every(
          (sample) => sample.state !== 'ready' || sample.at >= yieldedAt,
        ),
        'Popup appears after native handoff',
      );
      assert(
        samples.every((sample) => sample.animations.length === 0),
        'No opening animation restarts during handoff: ' +
          JSON.stringify(samples.filter((s) => s.animations.length)),
      );
      assert(!page.getVisible());
      assert.deepStrictEqual(page.getBounds(), liveBounds);
      const inspector = win.contentView.children.find((view) => view !== page);
      if (inspector)
        assert(!inspector.getVisible(), 'Inspector yields with the page');
      return yieldedAt - started;
    }
    try {
      await page.webContents.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<style>body{background:#eef2f6;font:24px system-ui}</style><h1>Native popup fixture</h1><input value="Retained page draft">',
          ),
      );
      await win.loadFile(temp + '/index.html');
      win.focus();
      await wait(180);
      const stack = await evaluate(
        `(()=>{const row=document.querySelector('[aria-label="Compact folder stack"]');const icons=row.querySelector('.compact-group-stack');const box=row.getBoundingClientRect();return {count:icons.children.length,width:box.width,height:box.height}})()`,
      );
      assert.equal(stack.count, 3);
      assert(
        stack.width <= 64 && stack.height <= 48,
        'Compact stack stays in one sidebar slot',
      );
      const alignment = await evaluate(
        `(()=>{const labels=['Compact favorite stack','Compact folder stack','Compact two stack','Compact single icon','Compact Documents','Compact empty collection','Compact add'];return labels.map(label=>{const row=document.querySelector('[aria-label="'+label+'"]');const icons=[...row.querySelectorAll('.group-icon-slot > .app-icon, .sidebar-collection-icon > svg, :scope > svg')];const bounds=icons.map(icon=>icon.getBoundingClientRect());const left=Math.min(...bounds.map(r=>r.left)),right=Math.max(...bounds.map(r=>r.right));const box=row.getBoundingClientRect();return {label,rowCenter:box.left+box.width/2,iconCenter:(left+right)/2,height:box.height,iconWidths:bounds.map(r=>r.width)}})})()`,
      );
      for (const item of alignment) {
        assert(
          Math.abs(item.rowCenter - alignment[0].rowCenter) < 0.5,
          'Controls share the center line: ' + JSON.stringify(alignment),
        );
        assert(
          Math.abs(item.iconCenter - item.rowCenter) < 0.5,
          'Visible icon footprint is centered: ' + JSON.stringify(alignment),
        );
        assert.equal(item.height, 40);
        assert(
          item.iconWidths.every((width) => width >= 22 && width <= 24),
          'Readable icon sizes: ' + JSON.stringify(alignment),
        );
      }
      await click('[aria-label="Browser options"]');
      await until(
        async () => await evaluate('metrics().open'),
        'Browser options did not request suspension',
      );
      await escape();
      await wait(150);
      assert(page.getVisible(), 'Cancelled preparation cannot hide the page');
      assert.equal(
        await evaluate('document.querySelector("[data-native-overlay-page]")'),
        null,
      );
      await manager.open(page.webContents, 'right');
      page.setBounds(manager.layout(page.webContents, win, bounds, true));
      liveBounds = page.getBounds();
      await wait(300);
      await verifyReveal('[aria-label="Browser options"]');
      // Select the actual Settings menu item through its shared Radix action.
      const settings = await evaluate(
        `(()=>{const node=[...document.querySelectorAll('[role="menuitem"]')].find(n=>n.textContent==='Settings…');node.dataset.fixtureSettings='true';return !!node})()`,
      );
      assert(settings);
      await click('[data-fixture-settings]');
      await until(
        async () => (await evaluate('metrics().option')) === 'settings',
        'Settings action did not run',
      );
      await until(
        () => page.getVisible(),
        'Page did not return after menu selection',
      );
      await verifyReveal('[aria-label="Folder tab groups"]');
      assert.equal(
        await evaluate('document.activeElement.getAttribute("role")'),
        'combobox',
        'Group search keeps autofocus',
      );
      await evaluate(
        `const item=[...document.querySelectorAll('.group-picker-results button')].find(n=>n.textContent.includes('Work'));item.dataset.fixtureWork='true'`,
      );
      await click('[data-fixture-work]');
      await until(
        async () => (await evaluate('metrics().group')) === 'work',
        'Group selection did not run',
      );
      await until(
        () => page.getVisible(),
        'Page did not return after group selection',
      );
      assert.equal(
        await page.webContents.executeJavaScript(
          'document.querySelector("input").value',
        ),
        'Retained page draft',
      );
      await verifyReveal('[aria-label="Folder settings"]');
      await escape();
      await verifyReveal('[aria-label="Select popup"]');
      await escape();
      await verifyReveal('[aria-label="Assistant suggestions"]');
      await click('.ai-composer-suggestions button');
      await until(
        async () => (await evaluate('metrics().option')) === 'suggestion',
        'Suggestion action did not run',
      );
      await until(
        () => page.getVisible(),
        'Page did not return after suggestions',
      );
      await verifyReveal('[aria-label="Compact Documents"]');
      assert.equal(
        await evaluate(
          'document.querySelectorAll("aside .folder-content .sidebar-app").length',
        ),
        0,
        'Compact collections do not render nested groups',
      );
      await click('.tab-preview-row > button');
      await until(
        async () => (await evaluate('metrics().option')) === 'collection-group',
        'Collection group selection did not run',
      );
      await until(
        () => page.getVisible(),
        'Page did not return after collection selection',
      );
      await verifyReveal('[aria-label="Compact empty collection"]');
      assert(
        await evaluate(
          'document.querySelector(".collection-preview-empty")!==null',
        ),
        'Empty collection has a useful empty state',
      );
      await click('.collection-preview-empty button');
      await until(
        async () => (await evaluate('metrics().option')) === 'collection-new',
        'Empty collection creation did not run',
      );
      await until(
        () => page.getVisible(),
        'Page did not return after collection creation',
      );
      delay = 0;
      const normal = await verifyReveal('[aria-label="Browser options"]');
      await escape();
      console.log(
        `PASS: compact collections and empty-state actions, stack sizing, Browser options, group picker, dialog, default Select and assistant suggestions over page and docked inspector, atomic delayed handoff, cancellation, focus, actions and retained page state. Normal local reveal: ${normal}ms.`,
      );
    } finally {
      manager.dispose();
      page.webContents.close();
      win.destroy();
      ipcMain.removeHandler('popup-fixture-layout');
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(temp, { recursive: true, force: true }));

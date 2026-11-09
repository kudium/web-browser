const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-notes-review-'));
const out = path.join(project, 'docs/evidence/notes'); fs.mkdirSync(out, { recursive: true });
app.commandLine.appendSwitch('disable-gpu');
app.setPath('userData', path.join(root, 'profile')); app.on('window-all-closed', () => {});
const esbuild = require(path.join(project, 'node_modules/esbuild'));
const tabs = [{ id: 'tab', sessionId: 'design', sessionName: 'Design System', name: 'Design System', url: 'https://example.com', icon: '' }];
const items = [{ id: 'public', title: 'Design review', notes: '# Design review\n\nKeep the writing surface quiet and the navigation on demand.\n\n```ts\nconst compact = true;\n```', kind: 'note', sensitive: false, allowAI: false, fields: [], origin: '', username: '', password: '' }, { id: 'locked', title: 'Private journal', notes: 'Disposable sensitive fixture.', kind: 'note', sensitive: true, allowAI: false, fields: [], origin: '', username: '', password: '' }];
let mode = 'normal', authentication = 0;
ipcMain.handle('note', (_event, request) => {
 if (mode === 'error') throw new Error('Fixture save is unavailable.');
 if (request.action === 'notes') return mode === 'empty' ? [] : items.map(({ notes, ...metadata }) => ({ ...metadata, fieldCount: 0 }));
 if (request.action === 'edit') { const item = items.find(i => i.id === request.id); if (item.sensitive) authentication++; return item; }
 if (request.action === 'save') { if (request.item.sensitive) authentication++; const index = items.findIndex(i => i.id === request.item.id); if (index >= 0) items[index] = request.item; else items.push(request.item); return {}; }
 if (request.action === 'delete') { const index = items.findIndex(i => i.id === request.id); if (index >= 0) items.splice(index, 1); return {}; }
 if (request.action === 'moveNote') items.find(i => i.id === request.id).scope = request.destination;
 return {};
});
fs.writeFileSync(path.join(root, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{passwordManager:r=>ipcRenderer.invoke('note',r),onPasswordManagerLock:()=>()=>{}});`);
fs.writeFileSync(path.join(root, 'preview.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import{Theme}from'@radix-ui/themes';import'@radix-ui/themes/styles.css';import ${JSON.stringify(project + '/src/renderer/index.css')};import{NotesPage}from ${JSON.stringify(project + '/src/components/UI/NotesPage')};window.renderFixture=(theme)=>createRoot(document.getElementById('root')).render(<Theme appearance={theme}><aside className="ai-sidebar" style={{width:'calc(100% - 32px)',position:'absolute',left:16,top:16,height:'calc(100vh - 32px)'}}><NotesPage tabs={${JSON.stringify(tabs)}}/></aside></Theme>);window.renderFixture(new URLSearchParams(location.search).get('theme'));`);
fs.writeFileSync(path.join(root, 'index.html'), '<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const plugin = { name: 'fixture', setup(build) { build.onLoad({ filter: /\/(AppManager|groupAccess|client)\.tsx?$/ }, args => {
 if (args.path.endsWith('/AppManager.ts')) return { contents: 'export const AppManager={getAll:()=>'+JSON.stringify(tabs)+'};export const ScreenManager={getLastAppId:()=>"tab"};' };
 if (args.path.endsWith('/groupAccess.ts')) return { contents: 'export const useGroupAccess=()=>({ready:true,protected:[],unlocked:[],available:true});export const lockedGroup=()=>false;' };
 if (args.path.endsWith('/client.ts')) return { contents: 'export const browser={onState:()=>()=>{},command:()=>{},nativeMenu:async()=>undefined};' };
 }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
 try {
  await esbuild.build({ entryPoints: [path.join(root, 'preview.tsx')], bundle: true, platform: 'browser', jsx: 'automatic', nodePaths: [path.join(project, 'node_modules')], outfile: path.join(root, 'preview.js'), plugins: [plugin] });
  let win;
  const run = async js => { try { return await win.webContents.executeJavaScript(js); } catch(error) { console.error('Failed renderer action:',js); throw error; } };
  const click = label => run(`document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`);
  let checks = 0;
  const shot = async name => { win.show();win.focus();await pause(250); const layout = await run(`(()=>{const page=document.querySelector('.notes-page'),r=page.getBoundingClientRect(),all=[...document.querySelectorAll('.notes-toolbar button,.notes-title,.notes-rich-surface')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}});return {r:{left:r.left,right:r.right,bottom:r.bottom},all,scroll:document.documentElement.scrollWidth,width:innerWidth}})()`);assert(layout.scroll<=layout.width, 'Horizontal document overflow'); const rows=await run(`([...document.querySelectorAll('.notes-history-panel .ai-chat-history-row button')].filter(e=>e.getClientRects().length).map(e=>({height:e.getBoundingClientRect().height,scroll:e.scrollHeight,client:e.clientHeight})))`);for(const row of rows)assert(row.height>=32&&row.scroll<=row.client,'Clipped note history row'); for(const r of layout.all) assert(r.left >= layout.r.left-1 && r.right <= layout.r.right+1 && r.bottom <= layout.r.bottom+1,'Editor control outside page '+JSON.stringify({r,page:layout.r}));fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());checks++; };
  for (const theme of ['light', 'dark']) for (const width of [272, 400, 672]) {
   if(process.env.NOTES_REVIEW_THEME && process.env.NOTES_REVIEW_THEME!==theme)continue;
   if(process.env.NOTES_REVIEW_WIDTH && Number(process.env.NOTES_REVIEW_WIDTH)!==width)continue;
   mode = 'normal';win = new BrowserWindow({ show: true, width, height: 640, useContentSize: true, webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true } }); await win.loadFile(path.join(root, 'index.html'), { query: { theme } }); await pause(250);
   await shot(`${theme}-${width}-empty`);
   await click('Note history'); await shot(`${theme}-${width}-history`);
   await run(`document.querySelector('#notes-history-panel .ai-chat-history-row button').click()`);await shot(`${theme}-${width}-editor`);assert(authentication===0,'Ordinary note requested authentication');
   if(process.argv.includes('--dialog')) { await click('Note options');await shot(`${theme}-${width}-options`);await run(`([...document.querySelectorAll('.notes-options-popup button')].find(b=>b.textContent.includes('Delete note'))).click()`);await shot(`${theme}-${width}-delete-dialog`);await run(`([...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel')).click()`);win.destroy();continue; }

   await click('Note options'); await shot(`${theme}-${width}-options`);
   await click('Assign note to group'); await shot(`${theme}-${width}-group-picker`);
   await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);await pause(80);
   await run(`document.body.click()`);await click('Format note');await shot(`${theme}-${width}-format`);
   await click('Increase note text size');assert(await run(`getComputedStyle(document.querySelector('.notes-rich-editor')).fontSize==='17px'`),'Custom note size applies');await shot(`${theme}-${width}-font-size`);
   assert(await run(`JSON.parse(localStorage.getItem('kudiumbrowser-ai-page-noteFontSize'))===17`),'Font size is remembered');await click('Reset note text size');assert(await run(`getComputedStyle(document.querySelector('.notes-rich-editor')).fontSize==='16px'`),'Default size restores');if(process.argv.includes('--font')){win.destroy();continue;}
   await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
   await run(`(()=>{const e=document.querySelector('[aria-label="Note content"]');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'a',metaKey:true,bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'b',metaKey:true,bubbles:true}));})()`);await pause(80);
   assert(await run("!!document.querySelector('.notes-rich-editor strong')"),'Bold shortcut should render visually');await shot(`${theme}-${width}-selection`);
   await run(`document.querySelector('[aria-label="Note content"]').dispatchEvent(new KeyboardEvent('keydown',{key:'i',metaKey:true,bubbles:true}))`);
   assert(await run("!!document.querySelector('.notes-rich-editor em')"),'Italic shortcut should render visually');
   await click('Note history');await click('Pin note history');await shot(`${theme}-${width}-pinned`);await click('Close note history');
   await click('Note options');await run(`([...document.querySelectorAll('.notes-options-popup button')].find(b=>b.textContent.includes('Delete note'))).click()`);await shot(`${theme}-${width}-delete-dialog`);await run(`([...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel')).click()`);
   mode='empty';await win.loadFile(path.join(root,'index.html'),{query:{theme}});await pause(180);await click('Note history');await shot(`${theme}-${width}-no-notes`);
   mode='error';await win.loadFile(path.join(root,'index.html'),{query:{theme}});await pause(180);await shot(`${theme}-${width}-error`);win.destroy();

  }
  console.log(JSON.stringify({checks,authentication,out}));app.quit();
 } catch(error) {console.error(error.stack);app.exit(1);}
});

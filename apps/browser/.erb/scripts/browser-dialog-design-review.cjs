const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), esbuild = require('esbuild');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-native-dialog-design-'));
const out = path.join(project, 'docs/evidence/browser-dialog-design');
fs.mkdirSync(out, { recursive: true }); app.setPath('userData', root);
app.on('window-all-closed', () => {});
esbuild.buildSync({ entryPoints: [path.join(project, 'src/main/dialogs.ts')], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'dialogs.cjs') });
const { showBrowserDialog, websitePermissionDialog } = require(path.join(root, 'dialogs.cjs'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(read) { for (let i = 0; i < 100; i++) { if (await read()) return; await pause(40); } throw Error('Timed out waiting for dialog state'); }
const checks = [];
async function capture(win, name, width, theme, native = true) {
  await pause(160);
  const result = await win.webContents.executeJavaScript(`(()=>{const content=document.querySelector('.content')||document.querySelector('[role=dialog],[role=alertdialog]');const footer=document.querySelector('footer')||document.querySelector('.fixture-footer');const f=footer.getBoundingClientRect();const buttons=[...footer.querySelectorAll('button')];const focused=document.activeElement,s=getComputedStyle(focused);return {height:innerHeight,contentClient:content.clientHeight,contentScroll:content.scrollHeight,header:document.querySelector('header')?.getBoundingClientRect().height,footer:f.height,bodyPadding:getComputedStyle(document.body).padding,heightStyles:getComputedStyle(document.body).height,scrolls:content.scrollHeight>content.clientHeight+1,overflow:document.body.scrollWidth>innerWidth||content.scrollWidth>content.clientWidth,footerFits:f.bottom<=innerHeight&&f.top>=0,buttonsFit:buttons.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),outline:s.outlineStyle,focusVisible:focused.matches(':focus-visible'),shadow:s.boxShadow,focused:focused.id||focused.textContent,focusSurface:s.backgroundColor,bodySurface:getComputedStyle(document.body).backgroundColor}})()`);
  assert(!result.overflow && result.footerFits && result.buttonsFit, JSON.stringify({ name, width, theme, result }));
  if (await win.webContents.executeJavaScript("document.activeElement.tagName==='BUTTON'")) assert(result.outline === 'none' && (!result.focusVisible || result.shadow === 'none' || result.shadow.includes('inset')), JSON.stringify(result));
  if (native) require('child_process').execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', win.getMediaSourceId().split(':')[1], path.join(out, `${width}-${theme}-${name}.png`)], { timeout: 5000 });
  else fs.writeFileSync(path.join(out, `${width}-${theme}-${name}.png`), (await win.webContents.capturePage()).toPNG());
  if(name==='remove'&&width===440)assert(!result.scrolls,JSON.stringify({message:'A standard confirmation must fit its explanation',result,bounds:win.getContentBounds()}));checks.push({ name, width, theme, ...result });
}
const cases = [
  ['remove', { message: 'Remove “1 new message”?', detail: 'This removes the group and its 2 saved tabs. Unshared login profiles, cookies, website storage, cache, browsing history, and site settings will be deleted. Shared login profiles will be kept.\nPersonal Data saved locally for this group will be deleted; browser-wide originals are kept. This cannot be undone.', buttons: ['Cancel', 'Remove Group & Data'], cancelId: 0, destructive: true }],
  ['restart', { message: 'Restart KudiumBrowser?', detail: 'KudiumBrowser will reopen your saved groups and pages.', buttons: ['Cancel', 'Restart'], cancelId: 0 }],
  ['error', { message: 'Could not import this group', detail: 'The file could not be read. Choose a valid group export and try again.', buttons: ['OK'] }],
  ['website', websitePermissionDialog('https://example.com', 'geolocation')],
  ['extension', { message: 'Install “Developer tools”?', detail: 'Review the requested access before installing.', buttons: ['Cancel', 'Install', 'Install'], cancelId: 0, defaultId: 2, scope: [{ label: 'This group', response: 1 }, { label: 'All groups', response: 2 }], permissions: ['tabs', 'storage', 'cookies', 'clipboardRead', 'downloads', '*://*/*'], technicalDetail: 'tabs\nstorage\ncookies\n*://*/*' }],
  ['import', { message: 'Import “Workspace”?', detail: '3 pages will be added as a new group. Logins and private data are not included.', buttons: ['Import & Review', 'Cancel'], cancelId: 1, importReview: { pages: [{ name: 'Project documentation', url: 'example.com/docs', hooks: true }, { name: 'Preview', url: 'localhost:3000', hooks: true }, { name: 'Repository', url: 'github.com/example/project', hooks: false }], hooks: [{ origin: 'https://example.com', source: 'console.log("Local preview");\n'.repeat(30) }] } }],
];
app.whenReady().then(async () => {
  const owner = new BrowserWindow({ show: true, width: 720, height: 700 }); await owner.loadURL('data:text/html,<body style="background:%23262628;color:white;font:14px sans-serif;padding:24px">KudiumBrowser dialog review</body>');
  if(!process.argv.includes('--in-app-only'))for (const width of [440, 320]) for (const theme of ['light', 'dark']) for (const [name, options] of cases) {
    nativeTheme.themeSource = theme;
    const answer = showBrowserDialog(owner, options);
    let win;
    await wait(() => { win = owner.getChildWindows().find(w => w.isVisible() && w.getOpacity() === 1); return !!win; });
    if(width===320)win.setContentSize(width,Math.min(520,win.getBounds().height)); win.focus(); win.webContents.focus();
    await capture(win, name, width, theme);
    if (name === 'remove') {
      const r = await win.webContents.executeJavaScript("(()=>{const r=document.getElementById('cancel').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x), y: Math.round(r.y) }); await capture(win, 'remove-hover', width, theme);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await wait(() => win.webContents.executeJavaScript("document.activeElement.id==='confirm'")); await capture(win, 'remove-keyboard', width, theme);
    }
    if (['website', 'extension', 'import'].includes(name)) {
      await win.webContents.executeJavaScript("document.querySelectorAll('details').forEach(d=>d.open=true)"); await capture(win, name + '-expanded', width, theme);
      await win.webContents.executeJavaScript("const c=document.querySelector('.content');c.scrollTop=c.scrollHeight");await capture(win,name+'-details-end',width,theme);
      if (name === 'extension') { await win.webContents.executeJavaScript("document.getElementById('scope').value='1';document.getElementById('scope').focus()"); await capture(win, 'extension-scope', width, theme); }
    }
    if (options.buttons.length > 1) await win.webContents.executeJavaScript("setTimeout(()=>document.getElementById('cancel').click(),40)");
    else await win.webContents.executeJavaScript("setTimeout(()=>document.getElementById('confirm').click(),40)");
    assert.equal((await answer).response, options.cancelId || 0);
  }
  const entry = path.join(root, 'preview.tsx');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {Theme,Dialog,AlertDialog,Button,Flex} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${JSON.stringify(project + '/src/renderer/index.css')};import {PanelDialogContent,PanelDialogHeader} from ${JSON.stringify(project + '/src/components/UI/PanelDialog')};const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<Theme appearance={q.get('theme')}>{q.get('type')==='alert'?<AlertDialog.Root defaultOpen><AlertDialog.Content maxWidth="400px"><AlertDialog.Title>Remove saved script?</AlertDialog.Title><AlertDialog.Description>The saved command will be removed from this group.</AlertDialog.Description><Flex className="fixture-footer" justify="end" gap="2" mt="4"><AlertDialog.Cancel><Button id="cancel" color="gray" variant="soft">Cancel</Button></AlertDialog.Cancel><Button id="confirm" color="red">Remove</Button></Flex></AlertDialog.Content></AlertDialog.Root>:<Dialog.Root defaultOpen><PanelDialogContent maxWidth="400px"><PanelDialogHeader title="Manage scripts"/><Dialog.Description>Save commands for this project.</Dialog.Description><Flex className="fixture-footer" justify="end" gap="2" mt="4"><Dialog.Close><Button id="cancel" color="gray" variant="soft">Cancel</Button></Dialog.Close><Button id="confirm">Save</Button></Flex></PanelDialogContent></Dialog.Root>}</Theme>);`);
  esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'browser', jsx: 'automatic', nodePaths: [project + '/node_modules'], outfile: path.join(root, 'preview.js') });
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
  for(const type of ['dialog','alert'])for (const width of [440, 320]) for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme; owner.setContentSize(width, 440); await owner.loadFile(path.join(root, 'index.html'), { query: { theme, type } }); owner.focus(); owner.webContents.focus();
    await wait(() => owner.webContents.executeJavaScript("document.activeElement.id==='cancel'")); await capture(owner, type+'-cancel', width, theme, false);
    owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await wait(() => owner.webContents.executeJavaScript("document.activeElement.id==='confirm'")); await capture(owner, type+'-primary', width, theme, false);
    owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait(() => owner.webContents.executeJavaScript("!document.querySelector('[role=dialog],[role=alertdialog]')"));
  }
  fs.writeFileSync(path.join(out, process.argv.includes('--in-app-only')?'in-app-checks.json':'checks.json'), JSON.stringify(checks, null, 2)); console.log(`Passed ${checks.length} native and in-app dialog layouts, cancellation, keyboard focus and disclosures`);
  owner.destroy(); fs.rmSync(root, { recursive: true, force: true }); app.quit();
}).catch(error => { console.error(error); app.exit(1); });

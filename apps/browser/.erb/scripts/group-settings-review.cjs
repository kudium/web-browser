const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const esbuild = require('esbuild');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-settings-review-'));
const out = path.join(project, 'docs/evidence/group-settings');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
app.on('window-all-closed', () => {});
fs.writeFileSync(path.join(root, 'preview.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Theme, Dialog, IconButton } from '@radix-ui/themes';
import { X } from 'lucide-react';
import '${project}/node_modules/@radix-ui/themes/styles.css';
import '${project}/src/renderer/index.css';
import { GroupEditor } from '${project}/src/components/UI/GroupEditor';
import { PanelDialogHeader } from '${project}/src/components/UI/PanelDialog';
const item = { id:'work', sessionId:'work',sessionName:'KudiumBrowser',name:'KudiumBrowser',url:'https://example.com',icon:'',sessionIconEmoji:'💻',spaceId:'default' };
if (new URLSearchParams(location.search).get('expanded') === 'true') item.sessionProfileId = 'shared';
const shared = { ...item, id:'shared', sessionId:'shared',sessionProfileId:'shared', sessionName:'Development workspace with a very long group name '+ 'project'.repeat(25) };
localStorage.setItem('user_apps', JSON.stringify([item,shared]));
localStorage.setItem('kudiumbrowser-spaces', JSON.stringify([{id:'default',name:'Work',color:'blue',folders:[]}]));
window.electron = {platform:'darwin', ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}}, browser:{}, siteDeveloper:{transfer:async()=>{if(window.exportMode==='loading')return new Promise(()=>{});throw new Error('Could not save the group. Try another location.');},project:async()=>({ name:'kudiumbrowser', path:'/path/to/user/Projects/kudiumbrowser', available:true, breadcrumbs:[{name:'~',path:'/Users/developer'},{name:'Projects',path:'/path/to/user/Projects'},{name:'kudiumbrowser',path:'/path/to/user/Projects/kudiumbrowser'}]})}};
createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme')} accentColor="blue"><Dialog.Root open><Dialog.Content className="session-settings-dialog" maxWidth="540px"><PanelDialogHeader title="Group settings" actions={<IconButton variant="ghost" color="gray" aria-label="Close group settings"><X size={17}/></IconButton>}/><Dialog.Description className="group-settings-description">Your workspace, pages and project.</Dialog.Description><GroupEditor item={item} close={()=>{}}/></Dialog.Content></Dialog.Root></Theme>);
`);
esbuild.buildSync({ entryPoints: [path.join(root, 'preview.tsx')], bundle: true, platform: 'browser', jsx: 'automatic', nodePaths: [path.join(project, 'node_modules')], outfile: path.join(root, 'preview.js') });
fs.writeFileSync(path.join(root, 'index.html'), '<html><head><link rel="stylesheet" href="preview.css"><style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 620, height: 700, useContentSize: true, webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', ({ message }) => { if (/error/i.test(message)) console.error(message); });
  const checks = [];
  for (const width of [620, 360]) for (const theme of ['light', 'dark']) for (const expanded of [false, true]) {
    win.setContentSize(width, 700);
    await win.loadFile(path.join(root, 'index.html'), { query: { theme, expanded: String(expanded) } });
    for (let i=0; i<60; i++) { if (await win.webContents.executeJavaScript("!!document.querySelector('.developer-project-breadcrumbs')")) break; await pause(50); }
    if (expanded) await win.webContents.executeJavaScript("document.querySelector('.group-editor-advanced').open=true");
    await pause(150);
    const check = await win.webContents.executeJavaScript(`(() => {
      const dialog=document.querySelector('.session-settings-dialog'), name=document.querySelector('[aria-label="Group name"]'), slug=document.querySelector('[aria-label="Group slug"]');
      const title=document.querySelector('.panel-dialog-title').getBoundingClientRect(), close=document.querySelector('[aria-label="Close group settings"]').getBoundingClientRect();
      const footer=document.querySelector('.group-editor-actions').getBoundingClientRect();
      const body = document.querySelector('.group-editor-content');
      return { withinViewport: dialog.getBoundingClientRect().left>=0 && dialog.getBoundingClientRect().right<=innerWidth, noOverflow: dialog.scrollWidth<=dialog.clientWidth && body.scrollWidth <= body.clientWidth, identityTogether: name.closest('.group-editor-identity-fields')===slug.closest('.group-editor-identity-fields'), slugOutsideDisclosure: !slug.closest('details'), headerAligned: Math.abs(title.top+title.height/2-close.top-close.height/2)<2, footerVisible: footer.bottom<=innerHeight, fieldsVisible: name.getBoundingClientRect().width>100 && slug.getBoundingClientRect().width>100 };
    })()`);
    if (!check.noOverflow) console.log(await win.webContents.executeJavaScript(`(() => {const b=document.querySelector('.group-editor-content'), r=b.getBoundingClientRect(); return {width:b.clientWidth, scroll:b.scrollWidth, offenders:[...b.querySelectorAll('*')].map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left-r.left,right:e.getBoundingClientRect().right-r.left,scroll:e.scrollWidth,width:e.clientWidth})).filter(e=>e.right>b.clientWidth||e.left<0)};})()`));
    assert(Object.values(check).every(Boolean), JSON.stringify({width,theme,expanded,check}));
    fs.writeFileSync(path.join(out, `${width}-${theme}${expanded ? '-expanded' : ''}.png`), (await win.webContents.capturePage()).toPNG());
    checks.push({width,theme,expanded,...check});
    if (!expanded) {
      for (const exportState of ['visible','error','loading']) {
        await win.webContents.executeJavaScript(`(() => {const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Export Group'));button.scrollIntoView({block:'nearest'});window.exportMode=${JSON.stringify(exportState)};${exportState==='visible'?'':'button.click();'}})()`);
        await pause(120);
        const exportCheck=await win.webContents.executeJavaScript(`(() => {const button=[...document.querySelectorAll('button')].find(b=>/Export Group|Exporting/.test(b.textContent));const target=window.exportMode==='error' ? document.querySelector('[role=\"alert\"]') : button;const rect=target.getBoundingClientRect(),body=document.querySelector('.group-editor-content').getBoundingClientRect();return {visible:rect.top>=body.top-1 && rect.bottom<=body.bottom+1,disabled:button.disabled,error:!!document.querySelector('[role="alert"]')}})()`);
        if(!exportCheck.visible)console.log(await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.group-editor-content'),e=[...document.querySelectorAll('button')].find(b=>/Export Group|Exporting/.test(b.textContent));return {width:innerWidth,body:b.getBoundingClientRect().toJSON(),button:e.getBoundingClientRect().toJSON(),scroll:b.scrollTop,height:b.scrollHeight,client:b.clientHeight}})()`));assert(exportCheck.visible,JSON.stringify(exportCheck));
        if(exportState==='loading')assert(exportCheck.disabled);
        if(exportState==='error')assert(exportCheck.error);
        fs.writeFileSync(path.join(out,`${width}-${theme}-export-${exportState}.png`),(await win.webContents.capturePage()).toPNG());
        checks.push({width,theme,exportState,...exportCheck});
      }
    }

  }
  fs.writeFileSync(path.join(out,'checks.json'), JSON.stringify(checks,null,2));
  console.log(JSON.stringify(checks));
  win.destroy(); fs.rmSync(root, {recursive:true,force:true}); app.quit();
}).catch(error => { console.error(error); app.exit(1); });

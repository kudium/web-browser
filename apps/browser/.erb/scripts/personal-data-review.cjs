const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const esbuild = require('esbuild');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-data-review-'));
const out = path.join(project, 'docs/evidence/personal-data');
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
const item = { id:'work', sessionId:'work',sessionName:'TouchBox',name:'TouchBox',url:'https://example.com',icon:'',sessionIconEmoji:'💻',spaceId:'default' };
if (new URLSearchParams(location.search).get('expanded') === 'true') item.sessionProfileId = 'shared';
const shared = { ...item, id:'shared', sessionId:'shared',sessionProfileId:'shared', sessionName:'Development workspace with a very long group name '+ 'project'.repeat(25) };
localStorage.setItem('user_apps', JSON.stringify([item,shared]));
localStorage.setItem('touchbox-spaces', JSON.stringify([{id:'default',name:'Work',color:'blue',folders:[]}]));
const state=new URLSearchParams(location.search).get('state');
const saved={id:'record',title:'Work profile',origin:'https://example.com',kind:'profile',username:'',password:'',fields:[{name:'Email',value:'developer@example.com',secret:false}],fieldCount:1,preview:'developer@example.com',allowAI:false,inherited:true};
const status={initialized:state!=='setup',metadataReady:true,locked:true,authentication:state==='setup'?'master':'os',canUseOS:state!=='setup',enabled:true,autofill:true,ai:false,items:state==='populated'?[saved]:[]};
window.electron = {passwordManager:async(request)=>request.action==='status'?status:request.action==='pages'?[]:null,onPasswordManagerLock:()=>()=>{},platform:'darwin', ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}}, browser:{}, siteDeveloper:{project:async()=>({ name:'touchbox', path:'/path/to/user/Projects/touchbox', available:true, breadcrumbs:[{name:'~',path:'/Users/developer'},{name:'Projects',path:'/path/to/user/Projects'},{name:'touchbox',path:'/path/to/user/Projects/touchbox'}]})}};
function Preview(){const [personal,setPersonal]=React.useState(false);return <Theme appearance={new URLSearchParams(location.search).get('theme')} accentColor="iris"><Dialog.Root open><Dialog.Content className="session-settings-dialog" maxWidth="540px"><PanelDialogHeader title={personal?'Personal Data':'Group settings'} actions={<IconButton variant="ghost" color="gray" aria-label="Close group settings"><X size={17}/></IconButton>}/><Dialog.Description className="group-settings-description">{personal?'Saved details for this group.':'Your workspace, pages and project.'}</Dialog.Description><GroupEditor item={item} close={()=>{}} onPersonalDataChange={setPersonal}/></Dialog.Content></Dialog.Root></Theme>};createRoot(document.getElementById('root')).render(<Preview/>);
`);
esbuild.buildSync({ entryPoints: [path.join(root, 'preview.tsx')], bundle: true, platform: 'browser', jsx: 'automatic', nodePaths: [path.join(project, 'node_modules')], outfile: path.join(root, 'preview.js') });
fs.writeFileSync(path.join(root, 'index.html'), '<html><head><link rel="stylesheet" href="preview.css"><style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 620, height: 700, useContentSize: true, webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', ({ message }) => { if (/error/i.test(message)) console.error(message); });
  const checks = [];
  for (const width of [620, 360]) for (const theme of ['light', 'dark']) for (const state of ['empty','populated','editor','setup']) {
    win.setContentSize(width, 700);
    await win.loadFile(path.join(root, 'index.html'), { query: { theme, state } });
    for (let i=0; i<60; i++) { if (await win.webContents.executeJavaScript("!!document.querySelector('.developer-project-breadcrumbs')")) break; await pause(50); }
    await win.webContents.executeJavaScript("document.querySelector('.group-editor-personal-data').click()");
    for(let i=0;i<60;i++){if(await win.webContents.executeJavaScript("!!document.querySelector('.password-manager')"))break;await pause(50);}
    if(state==='editor') { await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add item').click()"); await pause(100); }
    await pause(150);
    const check = await win.webContents.executeJavaScript(`(() => {
      const personal=document.querySelector('.group-personal-data'), body=document.querySelector('.password-manager'), editor=document.querySelector('.vault-editor-dialog');
      const dialog=editor||document.querySelector('.session-settings-dialog');
      const fieldset=document.querySelector('.vault-editor-scroll');
      const header=dialog.querySelector('.panel-dialog-title').getBoundingClientRect(), close=dialog.querySelector('button[aria-label^="Close"]').getBoundingClientRect();
      const footer=document.querySelector('.vault-editor-actions');
      return { noOverflow: personal.scrollWidth<=personal.clientWidth && body.scrollWidth<=body.clientWidth && (!fieldset||fieldset.scrollWidth<=fieldset.clientWidth), headerAligned:Math.abs(header.top+header.height/2-close.top-close.height/2)<2, footerVisible: !footer||footer.getBoundingClientRect().bottom<=innerHeight, emptyTableHidden: !document.querySelector('.vault-empty')||!document.querySelector('.vault-table'), singleAddAction:[...document.querySelectorAll('button')].filter(b=>/^Add (item|your first item)$/.test(b.textContent.trim())).length<=1 };
    })()`);
    assert(Object.values(check).every(Boolean),JSON.stringify({width,theme,state,check}));
    fs.writeFileSync(path.join(out, `${width}-${theme}-${state}.png`), (await win.webContents.capturePage()).toPNG());
    checks.push({width,theme,state,...check});
  }
  fs.writeFileSync(path.join(out,'checks.json'), JSON.stringify(checks,null,2));
  console.log(JSON.stringify(checks));
  win.destroy(); fs.rmSync(root, {recursive:true,force:true}); app.quit();
}).catch(error => { console.error(error); app.exit(1); });

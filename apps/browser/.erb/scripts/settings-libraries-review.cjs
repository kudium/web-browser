const { app, BrowserWindow } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  esbuild = require('esbuild'),
  assert = require('assert');
const project = path.resolve(__dirname, '../..'),
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-review-')),
  out = path.join(project, 'docs/evidence/settings-libraries');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', root);
app.on('window-all-closed', () => {});
fs.writeFileSync(
  path.join(root, 'preview.tsx'),
  `
import React from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';import '${project}/node_modules/@radix-ui/themes/styles.css';import '${project}/src/renderer/index.css';
import {Spaces} from '${project}/src/components/View/Settings/tabs/Spaces';import {ManageApp} from '${project}/src/components/View/Settings/tabs/ManageApp';import {SearchEngineManager} from '${project}/src/components/View/Settings/SearchEngineManager';import {PersonalAgentSettings} from '${project}/src/components/View/Settings/PersonalAgentSettings';import {AITasksPanel} from '${project}/src/components/UI/AITasksPanel';import {PasswordManager} from '${project}/src/components/View/Settings/PasswordManager';import {DeveloperScripts} from '${project}/src/components/UI/DeveloperScripts';import {defaultPreferences} from '${project}/src/browser/preferences';
const p=new URLSearchParams(location.search);localStorage.setItem('user_apps',JSON.stringify([{id:'one',name:'Research',sessionId:'one',url:'https://example.com',spaceId:'default'},{id:'two',name:'Documentation',sessionId:'two',url:'https://example.com/docs',spaceId:'work'}]));localStorage.setItem('kudiumbrowser-spaces',JSON.stringify([{id:'default',name:'Personal',color:'blue',folders:[]},{id:'work',name:'Work',color:'gray',folders:[]}]));
window.electron={passwordManager:async request=>request.action==='status'?{initialized:true,locked:false,authentication:'os',enabled:true,autofill:true,ai:false,items:[{id:'one',title:'Work profile',origin:'https://example.com',kind:'profile',username:'',fields:[],fieldCount:1,preview:'developer@example.com',allowAI:false},{id:'two',title:'Research account',origin:'https://example.org',kind:'login',username:'sample',fields:[],fieldCount:0,privateCount:1,allowAI:false}]}:request.action==='pages'?[]:null,onPasswordManagerLock:()=>()=>{},siteDeveloper:{scripts:async()=>({scripts:[{id:'one',name:'Start server',command:'npm run dev',scope:'project'},{id:'two',name:'Check types',command:'npm run typecheck',scope:'global'}]})},platform:'darwin',ipcRenderer:{on:()=>()=>{},sendMessage:()=>{}},browser:{nativeMenu:async()=>null},ai:{personalAgents:async()=>({agents:[]}),tasks:async()=>[{id:'one',name:'Morning research',instructions:'Review saved sources.',schedule:{kind:'manual'},runs:[],enabled:true},{id:'two',name:'Weekly review',instructions:'Summarize the week.',schedule:{kind:'daily',time:'09:00'},runs:[],enabled:true}],onTasks:()=>()=>{}}};
const mode=p.get('mode');
if(mode==='empty'){localStorage.setItem('user_apps','[]');window.electron.ai.tasks=async()=>[];window.electron.siteDeveloper.scripts=async()=>({scripts:[]});const request=window.electron.passwordManager;window.electron.passwordManager=async value=>{const result=await request(value);return value.action==='status'?{...result,items:[]}:result;};}
if(mode==='loading'||mode==='error'){for(const [target,key] of [[window.electron.ai,'tasks'],[window.electron.ai,'personalAgents'],[window.electron.siteDeveloper,'scripts'],[window.electron,'passwordManager']]){target[key]=()=>mode==='loading'?new Promise(()=>{}):Promise.reject(new Error('Fixture unavailable. Try again.'));}}
const views={data:<PasswordManager/>,scripts:<DeveloperScripts sourceId="sample" disabled={mode==='busy'}/>,spaces:<Spaces/>,groups:<ManageApp/>,search:<SearchEngineManager preferences={defaultPreferences} busy={mode==='busy'} save={async()=>true}/>,connections:<PersonalAgentSettings revision={0} busy={mode==='busy'} onBusy={()=>{}} onUpdated={()=>{}}/>,tasks:<AITasksPanel busy={mode==='busy'} resumable={false}/>};createRoot(document.getElementById('root')).render(<Theme appearance={p.get('theme')} accentColor="blue"><main style={{padding:24}}>{views[p.get('view')]}</main></Theme>);
`
);
esbuild.buildSync({
  entryPoints: [path.join(root, 'preview.tsx')],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  nodePaths: [path.join(project, 'node_modules')],
  outfile: path.join(root, 'preview.js'),
});
fs.writeFileSync(
  path.join(root, 'index.html'),
  '<html><head><link rel="stylesheet" href="preview.css"></head><body><style>*,*::before,*::after{animation:none!important;transition:none!important}</style><div id="root"></div><script src="preview.js"></script></body></html>'
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app
  .whenReady()
  .then(async () => {
    const w = new BrowserWindow({
      show: true,
      width: 900,
      height: 760,
      useContentSize: true,
      webPreferences: { contextIsolation: false, backgroundThrottling: false },
    });
    for (const width of [900, 480])
      for (const theme of ['light', 'dark'])
        for (const mode of process.argv.includes('--tasks') ||
        process.argv.includes('--menus')
          ? ['normal']
          : process.argv.includes('--recovery')
          ? ['empty', 'loading', 'error']
          : ['normal', 'empty', 'loading', 'error', 'busy'])
          for (const view of process.argv.includes('--tasks')
            ? ['tasks']
            : process.argv.includes('--recovery')
            ? ['tasks', 'data', 'scripts']
            : [
                'spaces',
                'groups',
                'search',
                'connections',
                'tasks',
                'data',
                'scripts',
              ]) {
            console.log(width, theme, mode, view);
            w.setContentSize(width, 760);
            await w.loadFile(path.join(root, 'index.html'), {
              query: { theme, view, mode },
            });
            await pause(350);
            if (view === 'scripts' && mode !== 'busy') {
              await w.webContents.executeJavaScript(
                "document.querySelector('[aria-label=Scripts]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))"
              );
              await pause(100);
              await w.webContents.executeJavaScript(
                "[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.includes('Manage scripts')).click()"
              );
              await pause(100);
            }
            const capture = async (state) => {
              await pause(150);
              fs.writeFileSync(
                path.join(
                  out,
                  view +
                    '-' +
                    width +
                    '-' +
                    theme +
                    '-' +
                    mode +
                    '-' +
                    state +
                    '.png'
                ),
                (await w.webContents.capturePage()).toPNG()
              );
            };
            assert(
              await w.webContents.executeJavaScript(
                'document.documentElement.scrollWidth<=innerWidth'
              ),
              view + ' overflow'
            );
            await capture('selected');
            await w.webContents.executeJavaScript(
              "document.querySelectorAll('.settings-library-item')[1]?.click()"
            );
            await capture('second');
            await w.webContents.executeJavaScript(
              "document.querySelector('.settings-library-item')?.focus()"
            );
            await capture('focus');
            const escape = async () => {
              w.webContents.sendInputEvent({
                type: 'keyDown',
                keyCode: 'Escape',
              });
              w.webContents.sendInputEvent({
                type: 'keyUp',
                keyCode: 'Escape',
              });
              await pause(120);
            };
            const openControl = async (label, state) => {
              await w.webContents.executeJavaScript(
                `(()=>{const el=document.querySelector('[aria-label="${label}"]');if(!el)throw Error('Missing '+${JSON.stringify(
                  label
                )});el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));el.click();})()`
              );
              await capture(state);
              assert(
                await w.webContents.executeJavaScript(
                  `(()=>{const elements=[...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"]')];return elements.length>0&&elements.every(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;});})()`
                ),
                state + ' popup bounds'
              );
              await escape();
            };
            if (
              process.argv.includes('--menus') ||
              process.argv.includes('--tasks')
            ) {
              if (view === 'spaces') {
                await openControl('About spaces', 'help');
                await openControl('Icon for Work', 'icon');
                await openControl('Color for Work', 'color');
                await w.webContents.executeJavaScript(
                  `document.querySelector('[aria-label="Delete Work"]').click()`
                );
                await capture('remove-confirm');
                await escape();
              }
              if (view === 'groups') {
                await w.webContents.executeJavaScript(
                  `document.querySelector('[aria-label="Remove Documentation"]').click()`
                );
                await capture('remove-confirm');
                await escape();
              }
              if (view === 'search')
                await openControl('About Search engines', 'help');
              if (view === 'connections') {
                await openControl('About OpenClaw connection', 'help');
                await openControl('OpenClaw options', 'options');
              }
              if (view === 'tasks') {
                await w.webContents.executeJavaScript(
                  "document.querySelector('.ai-task-row details').open=true"
                );
                await capture('history');
              }
              if (view === 'scripts') {
                await w.webContents.executeJavaScript(
                  `document.querySelector('[aria-label="Delete Check types"]').click()`
                );
                await capture('delete');
                await w.webContents.executeJavaScript(
                  "[...document.querySelectorAll('button')].find(el=>el.textContent==='Cancel').click()"
                );
              }
              if (view === 'data') {
                await w.webContents.executeJavaScript(
                  "document.querySelector('.vault-options').open=true"
                );
                await capture('access-options');
              }
            }
            if (
              mode === 'normal' &&
              ['spaces', 'search', 'tasks', 'data', 'scripts'].includes(view)
            ) {
              const label = {
                spaces: 'New space',
                search: 'Add search engine',
                tasks: 'New AI task',
                data: 'Add item',
                scripts: 'Add script',
              }[view];
              await w.webContents.executeJavaScript(
                '[...document.querySelectorAll("button")].find(el=>el.getAttribute("aria-label")===' +
                  JSON.stringify(label) +
                  '||el.textContent.trim()===' +
                  JSON.stringify(label) +
                  ').click()'
              );
              await capture('add');
              if (
                process.argv.includes('--menus') ||
                process.argv.includes('--tasks')
              ) {
                if (view === 'spaces') {
                  await openControl('New space icon', 'add-icon');
                  await openControl('New space color', 'add-color');
                }
                if (view === 'scripts')
                  await openControl(
                    'Suggest a script command',
                    'command-presets'
                  );
                if (view === 'tasks') {
                  await w.webContents.executeJavaScript(
                    "document.querySelector('.ai-task-more').open=true"
                  );
                  await capture('more-options');
                }
                if (view === 'data') {
                  await w.webContents.executeJavaScript(
                    "document.querySelector('.personal-entry-notes')?.setAttribute('open','')"
                  );
                  await capture('notes-options');
                }
              }
              assert(
                await w.webContents.executeJavaScript(
                  "!!document.querySelector('[role=dialog]')"
                )
              );
            }
          }
    w.destroy();
    fs.rmSync(root, { recursive: true, force: true });
    console.log('Library capture checks passed.');
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });

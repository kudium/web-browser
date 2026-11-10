const { app, BrowserWindow } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-ai-composer-queue-')
);
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
fs.writeFileSync(
  path.join(root, 'entry.tsx'),
  `
import React from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';
import '${project}/src/renderer/index.css';import {AISidebar} from '${project}/src/components/UI/AISidebar';
let queueListener=()=>{};let pending={messages:[{id:'first',prompt:'Then review the links and summarize the findings'}],paused:false};window.sent=[];
window.electron={ai:{settings:async()=>({endpoint:'https://api.openai.com/v1',model:'gpt-4.1',hasKey:true}),taskStatus:async()=>({busy:true,resumable:false}),mcpStatus:async()=>({running:false}),onMCP:()=>()=>{},onSettings:()=>()=>{},onEvent:()=>()=>{},groups:async()=>({groups:[],groupId:null}),queue:async(r)=>{if(r?.action==='remove')pending={...pending,messages:pending.messages.filter(m=>m.id!==r.id)};return pending;},onQueue:f=>{queueListener=f;return()=>{};},run:async prompt=>{window.sent.push(prompt);pending={...pending,messages:[...pending.messages,{id:'second',prompt}]};queueListener(pending);return false;},stop:async()=>{},savedAttachments:async()=>[],skills:async()=>[]}} as any;
createRoot(document.getElementById('root')).render(<Theme appearance={new URLSearchParams(location.search).get('theme') as any}><AISidebar/></Theme>);
`
);
const plugin = {
  name: 'fixture',
  setup(build) {
    build.onLoad(
      { filter: /\/(AppManager|groupAccess|client|DeveloperTerminal)\.tsx?$/ },
      ({ path: p }) => {
        if (p.endsWith('/AppManager.ts'))
          return {
            contents:
              'export const AppManager={getAll:()=>[]};export const ScreenManager={getLastAppId:()=>undefined};',
          };
        if (p.endsWith('/groupAccess.ts'))
          return {
            contents:
              'export const useGroupAccess=()=>({ready:true,protected:[],unlocked:[],available:true});export const lockedGroup=()=>false;',
          };
        if (p.endsWith('/client.ts'))
          return {
            contents:
              'export const browser={onState:()=>()=>{},onTabRequest:()=>()=>{},command:()=>{},tooltip:async()=>{},nativeMenu:async()=>undefined};',
          };
        return { contents: 'export const DeveloperTerminal=()=>null;' };
      }
    );
  },
};
app.whenReady().then(async () => {
  try {
    await require(project + '/node_modules/esbuild').build({
      entryPoints: [path.join(root, 'entry.tsx')],
      bundle: true,
      platform: 'browser',
      jsx: 'automatic',
      nodePaths: [project + '/node_modules'],
      outfile: path.join(root, 'preview.js'),
      plugins: [plugin],
      loader: {
        '.woff2': 'dataurl',
        '.woff': 'dataurl',
        '.ttf': 'dataurl',
        '.svg': 'dataurl',
        '.png': 'dataurl',
      },
    });
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>'
    );
    for (const theme of ['light', 'dark'])
      for (const width of [368, 640]) {
        const win = new BrowserWindow({
          width,
          height: 740,
          useContentSize: true,
          show: false,
          webPreferences: { contextIsolation: false },
        });
        const run = (code) => win.webContents.executeJavaScript(code);
        await win.loadFile(path.join(root, 'index.html'), { query: { theme } });
        await new Promise((r) => setTimeout(r, 300));
        await run(`document.querySelector('.ai-sidebar').style.width='100%'`);
        assert(
          await run(`!!document.querySelector('[aria-label="Queue message"]')`),
          'Queue button missing'
        );
        assert(
          await run(
            `!document.querySelector('[aria-label="Task for AI"]').disabled`
          ),
          'Composer disabled'
        );
        await run(
          `(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Also check mobile layout');input.dispatchEvent(new Event('input',{bubbles:true}));})()`
        );
        await new Promise((r) => setTimeout(r, 100));
        await run(
          `document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`
        );
        await new Promise((r) => setTimeout(r, 100));
        assert(
          await run(`window.sent[0]==='Also check mobile layout'`),
          'Enter did not queue'
        );
        assert(
          await run(`document.querySelector('textarea').value===''`),
          'Sent draft not cleared'
        );
        assert(
          await run(
            `Array.from(document.querySelectorAll('.ai-message-queue-row,.ai-composer-controls button')).every(e=>{const r=e.getBoundingClientRect();return !r.width||(r.left>=0&&r.right<=innerWidth);})`
          ),
          'Composer controls overflow'
        );
        fs.writeFileSync(
          path.join(root, theme + '-' + width + '.png'),
          (await win.webContents.capturePage()).toPNG()
        );
        win.destroy();
      }
    console.log(JSON.stringify({ checks: 4, screenshots: root }));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

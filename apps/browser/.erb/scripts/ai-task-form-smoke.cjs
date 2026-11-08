const { app, BrowserWindow } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-task-form-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AITasksPanel} from './src/components/UI/AITasksPanel';window.electron={ai:{tasks:async()=>[],onTasks:()=>()=>{},draftTask:async()=>({name:'Check staging',instructions:'Read staging status',schedule:{kind:'once',at:Date.now()+1800000}}),createTask:async()=> 'task'}};createRoot(document.getElementById('root')).render(<AITasksPanel busy={false} resumable={false}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  platform: 'browser',
  outfile: path.join(root, 'ui.js'),
});
const css = fs.readFileSync('src/renderer/index.css', 'utf8');
fs.writeFileSync(
  path.join(root, 'ui.html'),
  `<style>${css}</style><style>:root{--gray-10:#aaa;--gray-a2:#ffffff08;--gray-a3:#ffffff10;--gray-a4:#ffffff20;--gray-a5:#ffffff30;--accent-8:#a090ff}body{margin:0;background:#1c1d21;color:#eee;font:13px system-ui}.ai-sidebar{box-sizing:border-box;width:100%;height:100vh;background:#1c1d21;color:#eee}#root{display:flex;flex-direction:column;min-height:0;height:100%}</style><aside class="ai-sidebar"><div id="root"></div></aside><script src="ui.js"></script>`
);
(async () => {
  await app.whenReady();
  const host = new BrowserWindow({
    show: true,
    width: 380,
    height: 640,
    title: 'TouchBox task form fixture',
  });
  await host.loadFile(path.join(root, 'ui.html'));
  await new Promise((r) => setTimeout(r, 150));
  const run = (code) => host.webContents.executeJavaScript(code);
  await run(`document.querySelector('[aria-label="New AI task"]').click()`);
  await new Promise((r) => setTimeout(r, 50));
  assert(
    await run(
      `!document.querySelector('.ai-task-more').open && !document.querySelector('#ai-task-name').checkVisibility()`
    ),
    'Name must start collapsed'
  );
  await run(
    `document.querySelector('.ai-task-more summary').click();document.querySelector('#ai-task-name').focus()`
  );
  await new Promise((r) => setTimeout(r, 50));
  for (const width of [300, 380, 580]) {
    host.setSize(width, 640);
    await new Promise((r) => setTimeout(r, 50));
    const safe = await run(
      `(()=>{const input=document.querySelector('#ai-task-name');const a=input.getBoundingClientRect(),b=document.querySelector('.ai-tasks-panel').getBoundingClientRect(),s=getComputedStyle(input),ring=parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);return {safe:a.left-ring>=b.left&&a.right+ring<=b.right,left:a.left,right:a.right,ring};})()`
    );
    assert(safe.safe, JSON.stringify(safe));
  }
  host.setSize(380, 640);
  await new Promise((r) => setTimeout(r, 80));
  fs.writeFileSync(
    '/tmp/touchbox-task-form.png',
    (await host.webContents.capturePage()).toPNG()
  );
  host.destroy();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(
    'PASS: collapsed optional fields and unclipped focused input at 300/380/580px.'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});

/* eslint-disable promise/catch-or-return */
// Disposable rendering of the shared Personal Data manager; no personal profile.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-personal-ui-'));
app.setPath('userData', path.join(root, 'profile'));
const source = path.join(root, 'preview.tsx');
const react = require.resolve('react');
const reactDOM = require.resolve('react-dom/client');
const radix = require.resolve('@radix-ui/themes');
fs.writeFileSync(
  source,
  `import React from ${JSON.stringify(
    react
  )};import {createRoot} from ${JSON.stringify(
    reactDOM
  )};import {Theme} from ${JSON.stringify(
    radix
  )};import {PersonalData} from ${JSON.stringify(
    path.resolve('src/components/View/Settings/PasswordManager')
  )};import ${JSON.stringify(
    require.resolve('@radix-ui/themes/styles.css')
  )};import ${JSON.stringify(
    path.resolve('src/renderer/index.css')
  )};const group={id:'tab',sessionId:'work',sessionName:'Work',name:'Work',url:'https://example.com',icon:''};createRoot(document.getElementById('root')).render(<Theme><div style={{padding:24,maxWidth:900,margin:'auto'}}><PersonalData group={location.search.includes('group')?group:undefined} tabs={[group]}/></div></Theme>);`
);
require('esbuild').buildSync({
  entryPoints: [source],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  nodePaths: [path.resolve('node_modules')],
  outfile: path.join(root, 'preview.js'),
  loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl' },
});

fs.writeFileSync(
  path.join(root, 'index.html'),
  '<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>'
);
const records = [
  {
    id: 'profile',
    title: 'Personal profile',
    preview: 'sam@example.com · Toronto',
    kind: 'profile',
    origin: '',
    username: '',
    fieldCount: 5,
    allowAI: true,
  },
  {
    id: 'login',
    title: 'Example login',
    preview: 'sam@example.com',
    privateCount: 1,
    kind: 'login',
    origin: 'https://example.com',
    username: 'sam@example.com',
    fieldCount: 0,
    allowAI: false,
  },
  {
    id: 'resume',
    title: 'Resume.pdf',
    kind: 'knowledge',
    origin: '',
    username: '',
    fieldCount: 0,
    allowAI: true,
  },
];
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('electron',{passwordManager:async r=>r.action==='pages'?[]:r.action==='edit'?{...${JSON.stringify(
    records
  )}.find(i=>i.id===r.id),password:'',fields:[{name:'email',value:'sam@example.com',secret:false}],notes:'Frontend engineer'}:{initialized:true,locked:true,authentication:'os',enabled:true,autofill:true,ai:true,items:${JSON.stringify(
    records
  )}.map(i=>({...i,inherited:!!r.scope})),hidden:[]},onPasswordManagerLock:()=>()=>{},browser:{confirm:async()=>true}});`
);
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
(async () => {
  await app.whenReady();
  const window = new BrowserWindow({
    show: true,
    width: 1000,
    height: 850,
    webPreferences: { sandbox: true, backgroundThrottling: false, preload: path.join(root, 'preload.cjs') },
  });
  const run = (code) => window.webContents.executeJavaScript(code);
  const output = path.resolve('docs/evidence/personal-data');
  fs.mkdirSync(output, { recursive: true });
  await window.loadFile(path.join(root, 'index.html'));
  await wait(350);
  assert(
    await run(
      `document.body.textContent.includes('Personal Data') && document.body.textContent.includes('Personal profile')`
    )
  );
  fs.writeFileSync(
    path.join(output, 'browser.png'),
    (await window.webContents.capturePage()).toPNG()
  );
  await window.loadFile(path.join(root, 'index.html'), {
    query: { group: '1' },
  });
  await wait(300);
  assert(
    await run(`document.body.textContent.includes('Inherited from browser')`)
  );
  await run(
    `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('Add item')).click();undefined`
  );
  await wait(100);
  assert(
    await run(
      `!!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label')==='Key 1'`
    )
  );
  const input = async (label, value) => {
    await run(
      `(()=>{const el=Array.from(document.querySelectorAll('input,textarea')).find(node=>node.getAttribute('aria-label')===${JSON.stringify(
        label
      )});const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(
        value
      )});el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`
    );
    await wait(50);
  };
  await input('Key 1', 'Card number');
  await input('Value 1', '4111111111111111');
  await run(
    `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('Add another value')).click();undefined`
  );
  await wait(50);
  await input('Key 2', 'Expiry date');
  await input('Value 2', '12/30');
  assert(
    await run(
      `!Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Save').disabled`
    )
  );
  await wait(250);
  fs.writeFileSync(
    path.join(output, 'group-add.png'),
    (await window.webContents.capturePage()).toPNG()
  );
  window.setSize(520, 850);
  await wait(120);
  assert(await run(`document.documentElement.scrollWidth<=innerWidth+1`));
  assert(
    await run(
      `document.querySelector('.vault-editor-actions').getBoundingClientRect().bottom <= innerHeight`
    )
  );

  fs.writeFileSync(
    path.join(output, 'group-add-narrow.png'),
    (await window.webContents.capturePage()).toPNG()
  );
  await input('Key 1', 'Email');
  await input('Value 1', 'sam@example.com');
  await run(`(()=>{
    document.querySelectorAll('.radix-themes').forEach(theme=>{
      theme.classList.remove('light');theme.classList.add('dark');
    });
    document.querySelector('.personal-entry-field-options').open=true;
  })();undefined`);
  await wait(100);
  assert(
    await run(`(()=>{
    const options=document.querySelector('.personal-entry-options-content');
    const toggle=options.querySelector('label').getBoundingClientRect();
    const aliases=options.querySelector('.rt-TextFieldRoot').getBoundingClientRect();
    const key=document.querySelector('[aria-label="Key 1"]');
    const value=document.querySelector('[aria-label="Value 1"]');
    return aliases.top-toggle.bottom>=11 &&
      getComputedStyle(key).fontSize===getComputedStyle(value).fontSize;
  })()`)
  );
  fs.writeFileSync(
    path.join(output, 'group-value-options-dark.png'),
    (await window.webContents.capturePage()).toPNG()
  );
  window.destroy();
  app.quit();
  console.log(
    'Personal Data UI passed: shared manager, scoped labels, unified fields, direct Add, focus and narrow layout.'
  );
})()
  .catch((error) => {
    console.error(error);
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));

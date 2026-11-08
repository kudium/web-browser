/* eslint-disable no-await-in-loop, no-restricted-syntax, promise/catch-or-return */
// Isolated Electron rendering of the production group editor and shared picker.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-group-icon-'));
const out = path.resolve('docs/evidence/group-settings');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
const source = path.join(root, 'preview.tsx');
fs.writeFileSync(
  source,
  `import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme,Dialog,Button} from '@radix-ui/themes';
import {GroupEditor} from ${JSON.stringify(
    path.resolve('src/components/UI/GroupEditor')
  )};
import {CommandPalette} from ${JSON.stringify(
    path.resolve('src/components/UI/CommandPalette')
  )};
import {AppManager} from ${JSON.stringify(
    path.resolve('src/utils/AppManager')
  )};
import {SpaceIconPicker} from ${JSON.stringify(
    path.resolve('src/components/UI/SpaceIcon')
  )};
import ${JSON.stringify(require.resolve('@radix-ui/themes/styles.css'))};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
const group={id:'work',sessionId:'work',sessionName:'Work',sessionSlug:'work',name:'Work',url:'https://example.com',icon:''};localStorage.setItem('user_apps',JSON.stringify([group]));
function Preview(){const [open,setOpen]=React.useState(true);const [palette,setPalette]=React.useState(false);const [icon,setIcon]=React.useState({icon:'home',iconEmoji:'',iconImage:''});return <Theme appearance={location.search.includes('dark')?'dark':'light'}><div style={{padding:32}}><SpaceIconPicker icon={icon.icon} image={icon.iconImage||''} emoji={icon.iconEmoji||''} label="Space icon" onChange={patch=>setIcon({...icon,...patch})}/><Button onClick={()=>setPalette(true)}>New tab picker</Button><CommandPalette open={palette} onOpenChange={setPalette} apps={AppManager.getAll()} groupSource={AppManager.getAll()[0]} select={()=>{}} newSpace={()=>{}}/><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger><Button>Group settings</Button></Dialog.Trigger><Dialog.Content className="session-settings-dialog" maxWidth="560px"><Dialog.Title>Group settings</Dialog.Title><Dialog.Description>Choose a name, icon and location for your tab group.</Dialog.Description><GroupEditor item={group} close={()=>setOpen(false)}/></Dialog.Content></Dialog.Root></div></Theme>}createRoot(document.getElementById('root')).render(<Preview/>);`
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
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('electron',{platform:'darwin',ipcRenderer:{sendMessage:()=>{},on:()=>()=>{}},browser:{onShortcut:()=>()=>{},preferences:async()=>({}),showEmojiPicker:async()=>{},chooseSpaceIcon:async()=>{await new Promise(r=>setTimeout(r,200));if(global.mode==='error')throw Error('Image could not be read. Choose another image.');if(global.mode==='image')return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#635bda"/><text x="16" y="23" text-anchor="middle" fill="white" font-size="22">W</text></svg>');return null;}}});contextBridge.exposeInMainWorld('fixture',{mode:v=>{global.mode=v}});`
);
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
(async () => {
  await app.whenReady();
  const w = new BrowserWindow({
    show: false,
    width: 800,
    height: 780,
    webPreferences: { sandbox: true, preload: path.join(root, 'preload.cjs') },
  });
  w.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('defaultProps')) console.log(message);
  });
  const run = async (code) => {
    try {
      return await w.webContents.executeJavaScript(code);
    } catch (error) {
      console.error('Failed step', code);
      throw error;
    }
  };
  const click = async (label) => {
    await run(
      `document.querySelector('button[aria-label=${JSON.stringify(
        label
      )}]').click();undefined`
    );
    await wait(120);
  };
  const textClick = async (text) => {
    await run(
      `Array.from((document.querySelector('.icon-picker-dialog')||document).querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(
        text
      )}).click();undefined`
    );
    await wait(120);
  };
  const shot = async (name) => {
    await wait(180);
    fs.writeFileSync(
      path.join(out, `${name}.png`),
      (await w.webContents.capturePage()).toPNG()
    );
  };
  for (const theme of ['light', 'dark'])
    for (const width of [800, 400]) {
      w.setSize(width, width === 400 ? 620 : 780);
      await w.loadFile(path.join(root, 'index.html'), { query: { theme } });
      await wait(550);
      assert(
        await run(
          `(()=>{const b=document.querySelector('[aria-label="Choose group icon"]').getBoundingClientRect(),i=document.querySelector('[aria-label="Group name"]').getBoundingClientRect();return b.right+10<=i.left&&Math.abs(b.top+b.height/2-i.top-i.height/2)<2;})()`
        ),
        'Icon must precede and align with name input'
      );
      await shot(`${theme}-${width}-editor`);
      await click('Choose group icon');
      assert(
        await run(
          `(()=>{const d=document.querySelector('.icon-picker-dialog').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&d.bottom<=innerHeight&&d.top>=0;})()`
        ),
        'Picker fits window'
      );
      assert(
        await run(
          `(()=>{const a=document.querySelector('.icon-picker-emoji-entry').getBoundingClientRect(),b=document.querySelector('.icon-picker-default').getBoundingClientRect();return b.top-a.bottom>=40;})()`
        ),
        'Picker choices have clearance'
      );
      await shot(`${theme}-${width}-picker`);
      await click('Use 💼 for Choose group icon');
      assert(
        await run(
          `document.querySelector('[aria-label="Choose group icon"]').textContent.includes('💼')`
        )
      );
      await click('Choose group icon');
      await shot(`${theme}-${width}-selected`);
      await textClick('Use tab icons');
      await run(
        `document.querySelector('details').open=true;document.querySelector('[aria-label="Group name"]').focus();undefined`
      );
      await wait(100);
      if (width === 400)
        await run(
          `document.querySelector('.group-editor-advanced').scrollIntoView({block:'end'});undefined`
        );
      await shot(`${theme}-${width}-advanced`);
      await run(
        `(()=>{const input=document.querySelector('[aria-label="Group home page"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://example.com/home');input.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`
      );
      assert(
        await run(
          `(()=>{const data=Array.from(document.querySelectorAll('.group-editor-content > button')).find(el=>el.textContent.includes('Personal Data'));const advanced=document.querySelector('.group-editor-advanced');return data.nextElementSibling===advanced;})()`
        ),
        'Personal Data immediately precedes Advanced'
      );
      await click('Choose group icon');
      await run(`fixture.mode('error');undefined`);
      await run(
        `document.querySelector('button[aria-label="Choose image for Choose group icon"]').click();undefined`
      );
      await wait(50);
      await shot(`${theme}-${width}-loading`);
      await wait(250);
      assert(
        await run(
          `document.querySelector('.icon-picker-dialog [role="alert"]').textContent.includes('Image could not')`
        )
      );
      await shot(`${theme}-${width}-error`);
      await run(`fixture.mode('cancel');undefined`);
      await click('Choose image for Choose group icon');
      await wait(200);
      assert(await run(`!!document.querySelector('.icon-picker-dialog')`));
      await run(`fixture.mode('image');undefined`);
      await click('Choose image for Choose group icon');
      await wait(300);
      assert(
        await run(
          `!document.querySelector('.icon-picker-dialog')&&!!document.querySelector('[aria-label="Choose group icon"] img')`
        )
      );
      await shot(`${theme}-${width}-image`);
      await click('Choose group icon');
      await textClick('Cancel');
      await run(
        `document.querySelector('.group-editor-actions').scrollIntoView({block:'end'});undefined`
      );
      await wait(50);
      await shot(`${theme}-${width}-footer`);
      assert(
        await run(
          `document.querySelector('.group-editor-actions').getBoundingClientRect().bottom<=innerHeight`
        ),
        'Footer reachable'
      );
      await textClick('Save changes');
      assert(
        await run(
          `JSON.parse(localStorage.getItem('user_apps'))[0].sessionIconImage.startsWith('data:image/svg')`
        )
      );
      await textClick('New tab picker');
      assert(
        await run(
          `Array.from(document.querySelectorAll('[role="option"]')).some(el=>el.textContent.includes('Group home'))`
        )
      );
      await shot(`${theme}-${width}-home-picker`);
      await run(
        `Array.from(document.querySelectorAll('[role="option"]')).find(el=>el.textContent.includes('Group home')).click();undefined`
      );
      await wait(120);
      assert(
        await run(
          `JSON.parse(localStorage.getItem('user_apps')).some(tab=>tab.url==='https://example.com/home'&&tab.sessionId==='work')`
        )
      );
      await click('Space icon');
      await shot(`${theme}-${width}-space`);
      await click('Use 🚀 for Space icon');
      await click('Space icon');
      await run(
        `document.querySelector('[aria-label="Default space icon"]').focus();undefined`
      );
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
      w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
      await wait(150);
      await shot(`${theme}-${width}-symbols`);
      assert(await run(`!!document.querySelector('[role="listbox"]')`));
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait(150);
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait(150);
      assert(
        await run(
          `!document.querySelector('.icon-picker-dialog')&&document.activeElement.getAttribute('aria-label')==='Space icon'`
        )
      );
    }
  console.log(
    'PASS: name/icon alignment, shared picker, emoji/image/reset, loading/error/cancel, persistence, footer, light/dark and 800/400px'
  );
  w.destroy();
  app.quit();
})().catch((error) => {
  console.error(error);
  app.exit(1);
});

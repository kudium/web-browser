/* eslint-disable no-await-in-loop, no-restricted-syntax */
// Render the production Settings UI with disposable preferences and test session metadata.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-settings-'));
const output = path.resolve('docs/evidence/preferences');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(root, 'data'));
require('esbuild').buildSync({
  entryPoints: ['src/main/preferences.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './extensions', './dialogs'],
  outfile: path.join(root, 'preferences.cjs'),
});

fs.writeFileSync(
  path.join(root, 'extensions.js'),
  `const {session}=require('electron');exports.configureExtensionToolbar=()=>{};exports.extensionCatalog=()=>[];exports.installedExtensionOrigins=()=>[];exports.getExtensionProfiles=()=>[{id:'work',name:'Work',session:session.fromPartition('persist:kudiumbrowser-work')}];exports.getExtensionProfile=id=>exports.getExtensionProfiles().find(p=>p.id===id);`
);
fs.writeFileSync(
  path.join(root, 'dialogs.js'),
  'exports.showBrowserDialog=async()=>({response:0});'
);
const prefs = require(path.join(root, 'preferences.cjs'));
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
app
  .whenReady()
  .then(async () => {
    const w = new BrowserWindow({
      show: true,
      width: 1080,
      height: 860,
      webPreferences: {
        preload: path.resolve('release/app/dist/main/preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    w.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) console.log('renderer', message);
    });
    prefs.registerPreferences(
      () => {},
      (contents) => contents === w.webContents,
      (contents) => contents === w.webContents
    );
    await w.loadFile(path.resolve('release/app/dist/renderer/index.html'), {
      query: { view: 'settings' },
    });
    await wait(400);
    const run = async (code) => {
      try {
        return await w.webContents.executeJavaScript(code);
      } catch (error) {
        console.error('Failed fixture step:', code);
        throw error;
      }
    };
    const select = async (name) => {
      await run(
        `(()=>{const tab=[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.includes(${JSON.stringify(
          name
        )}));if(!tab)throw new Error('Missing Settings tab');tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));})();undefined`
      );
      await wait(100);
    };
    const input = async (label, value) => {
      await run(
        `(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(
          JSON.stringify(label)
        )}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(
          value
        )});el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`
      );
    };
    await run(
      `localStorage.setItem('user_apps',JSON.stringify([{id:'fixture-work',sessionId:'work',sessionName:'Work',sessionIconEmoji:'💼',name:'Work',url:'https://example.com',icon:''}]));undefined`
    );
    await select('Network');
    assert(await run(`!!document.querySelector('[aria-label="Proxy mode"]')`));
    await input('Proxy bypass list', 'localhost;*.internal.example');
    await run(
      `Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Save changes').click();undefined`
    );
    await wait(150);
    assert.equal(
      prefs.getBrowserPreferences().advanced.proxy.bypass,
      'localhost;*.internal.example'
    );
    fs.writeFileSync(
      path.join(output, 'network-1080.png'),
      (await w.webContents.capturePage()).toPNG()
    );
    await select('Compatibility');
    await input('Custom user agent', 'Fixture Browser/1.0');
    await run(
      `Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Save changes').click();undefined`
    );
    await wait(150);
    assert.equal(
      prefs.getBrowserPreferences().advanced.userAgent,
      'Fixture Browser/1.0'
    );
    await select('Website behavior');
    await input('New site origin', 'https://example.com/path');
    await run(
      `Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Add site').click();undefined`
    );
    await wait(100);
    assert(
      await run(`document.body.innerText.includes('https://example.com')`)
    );
    await run(
      `Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Save changes').click();undefined`
    );
    await wait(150);
    assert.equal(
      prefs.getBrowserPreferences().advanced.siteRules[0].origin,
      'https://example.com'
    );
    fs.writeFileSync(
      path.join(output, 'website-behavior-1080.png'),
      (await w.webContents.capturePage()).toPNG()
    );
    await select('Startup');
    assert(await run(`!!document.querySelector('[aria-label="On startup"]')`));
    await select('Privacy & security');
    assert(
      await run(`!!document.querySelector('[aria-label="HTTP cookie policy"]')`)
    );
    await select('Network');
    w.setSize(480, 860);
    await wait(200);
    fs.writeFileSync(
      path.join(output, 'network-480.png'),
      (await w.webContents.capturePage()).toPNG()
    );
    assert(
      await run(`document.documentElement.scrollWidth <= window.innerWidth`),
      'Settings must not overflow horizontally'
    );
    const choose = async (label, option) => {
      await run(`(()=>{
        const el=document.querySelector('[aria-label='+${JSON.stringify(
          JSON.stringify(label)
        )}+']');
        el.scrollIntoView({block:'center'});el.focus();
        if(el.classList.contains('group-picker-trigger'))el.click();
        else el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      })();undefined`);
      await wait(100);
      await run(`(()=>{
        const el=[...document.querySelectorAll('[role=option]')].find(node=>(node.querySelector('strong')?.textContent || node.textContent)===${JSON.stringify(
          option
        )});
        if(!el)throw new Error('Missing select option');
        el.click();
      })();undefined`);
      await wait(100);
    };
    const capture = async (name) => {
      await wait(80);
      fs.writeFileSync(
        path.join(output, `${name}.png`),
        (await w.webContents.capturePage()).toPNG()
      );
    };
    const layout = async () => {
      const problems = await run(`(()=>{
        const issues=[];
        const root=document.querySelector('.advanced-preferences');
        const card=root.closest('.preference-card').getBoundingClientRect();
        const controls=[...root.querySelectorAll('.advanced-setting-footer > button,.advanced-setting-actions > button')];
        controls.forEach(button=>{
          const r=button.getBoundingClientRect();
          if(r.left-card.left<15 || card.right-r.right<15)issues.push('Button lacks card inset: '+button.textContent);
        });
        for(const group of root.querySelectorAll('.advanced-setting-footer,.advanced-setting-actions,.advanced-site-create')){
          const children=[...group.children].map(el=>el.getBoundingClientRect());
          children.forEach((a,i)=>children.slice(i+1).forEach(b=>{
            if(Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top) && Math.min(Math.abs(b.left-a.right),Math.abs(a.left-b.right))<11)issues.push('Missing horizontal control gap');
          }));
        }
        if(document.documentElement.scrollWidth>innerWidth)issues.push('Document overflow');
        if(root.scrollWidth>root.clientWidth+1)issues.push('Advanced settings overflow');
        return issues;
      })()`);
      assert.deepEqual(problems, []);
    };
    for (const theme of ['light', 'dark']) {
      for (const width of [1080, 480]) {
        w.setSize(width, 860);
        for (const [name, id] of [
          ['Network', 'network'],
          ['Compatibility', 'compatibility'],
          ['Website behavior', 'website-behavior'],
          ['Startup', 'startup'],
        ]) {
          await select(name);
          await run(
            `document.querySelectorAll('.radix-themes').forEach(el=>{el.classList.remove('light','dark');el.classList.add('${theme}');});undefined`
          );
          if (name === 'Network') {
            await choose('DNS provider', 'Custom endpoint');
            await input(
              'Custom DNS endpoint',
              'https://resolver.example/dns-query'
            );
            await choose('Settings group', 'Work');
            await choose('Proxy mode', 'Custom proxy');
            await input('Proxy server', 'socks5://127.0.0.1:1080');
          }
          if (name === 'Compatibility') await choose('Settings group', 'Work');
          if (name === 'Startup')
            await choose('On startup', 'Open selected pages');
          if (name === 'Website behavior') {
            await input('New site origin', 'invalid');
            await run(
              `Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Add site').click();undefined`
            );
            assert(
              await run(
                `!!document.querySelector('.advanced-setting-feedback')`
              )
            );
          }
          await run(
            `document.querySelector('.preferences-main').scrollTop=0;undefined`
          );
          await layout();
          await capture(`${id}-${theme}-${width}-expanded`);
          await run(
            `document.querySelector('.advanced-setting-footer > button').focus();document.querySelector('.advanced-setting-footer').scrollIntoView({block:'end'});undefined`
          );
          await layout();
          assert(
            await run(
              `document.querySelector('.advanced-setting-footer').getBoundingClientRect().bottom<=innerHeight+1`
            ),
            'Footer must remain reachable'
          );
          await capture(`${id}-${theme}-${width}-footer`);
          const dropdown = {
            Network: 'Proxy mode',
            Compatibility: 'Settings group',
            'Website behavior': 'https://example.com Zoom',
            Startup: 'On startup',
          }[name];
          await run(`(()=>{
            const el=document.querySelector('[aria-label='+${JSON.stringify(
              JSON.stringify(dropdown)
            )}+']');
            el.scrollIntoView({block:'center'});el.focus();
            if(el.classList.contains('group-picker-trigger'))el.click();
        else el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
          })();undefined`);
          await wait(80);
          await run(
            `document.querySelectorAll('.radix-themes').forEach(el=>{el.classList.remove('light','dark');el.classList.add('${theme}');});undefined`
          );
          assert(await run(`!!document.querySelector('[role=listbox]')`));
          if (name === 'Compatibility') {
            assert(
              await run(
                `Array.from(document.querySelectorAll('.group-picker .group-icon-slot')).every(el=>el.getBoundingClientRect().width<=28)`
              ),
              'Picker icons must keep their compact size'
            );
            assert(
              await run(
                `document.querySelector('.group-picker-trigger .session-symbol').textContent==='💼'`
              ),
              'Settings must reuse the sidebar group icon'
            );
          }
          await capture(`${id}-${theme}-${width}-picker`);
          w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
          await wait(80);
        }
      }
    }
    console.log(
      'PASS: real IPC persistence; all four advanced pages, expanded fields, scoped overrides, error feedback, light/dark at 1080px/480px; footer insets, control gaps and reachable actions.'
    );
    w.destroy();
    app.exit(0);
    return undefined;
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(root, { recursive: true, force: true }));

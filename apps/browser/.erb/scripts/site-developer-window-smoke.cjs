/* eslint-disable no-await-in-loop, no-restricted-syntax, promise/param-names, no-promise-executor-return, no-shadow, no-nested-ternary, promise/always-return */
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'touchbox-developer-window-')
);
app.setPath('userData', path.join(root, 'profile'));
process.env.NODE_ENV = 'production';
const mainDir = path.join(root, 'dist/main');
const rendererDir = path.join(root, 'dist/renderer');
fs.mkdirSync(mainDir, { recursive: true });
fs.mkdirSync(rendererDir, { recursive: true });
fs.mkdirSync(path.join(root, '.erb/dll'), { recursive: true });
const build = require('esbuild').buildSync;

build({
  entryPoints: [path.resolve('src/main/siteDeveloperWindow.ts')],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(mainDir, 'service.cjs'),
});
build({
  entryPoints: [path.resolve('src/main/preload.ts')],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, '.erb/dll/preload.js'),
});
fs.writeFileSync(
  path.join(root, 'preview.tsx'),
  `
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {SiteDeveloperPage} from ${JSON.stringify(
    path.resolve('src/components/View/SiteDeveloperPage')
  )};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
function Preview(){const [theme,setTheme]=React.useState('light');window.setTheme=setTheme;return <Theme appearance={theme}><SiteDeveloperPage/></Theme>}createRoot(document.getElementById('root')).render(<Preview/>);
`
);
build({
  entryPoints: [path.join(root, 'preview.tsx')],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  nodePaths: [path.resolve('node_modules')],
  outfile: path.join(rendererDir, 'preview.js'),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
});
fs.writeFileSync(
  path.join(rendererDir, 'index.html'),
  '<!doctype html><link rel="stylesheet" href="preview.css"><div id="root"></div><script src="preview.js"></script>'
);
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const hookPermissions = process.argv.includes('--hook-permissions');
const out = path.resolve(
  hookPermissions
    ? 'docs/evidence/hook-notifications'
    : 'docs/evidence/site-developer-editor'
);
fs.mkdirSync(out, { recursive: true });
app.on('web-contents-created', (_, c) => {
  c.on('console-message', (event) => {
    if (event.level === 'error') console.error(event.message);
  });
  c.on('preload-error', (_, file, error) => console.error('preload', error));
});
app
  .whenReady()
  .then(async () => {
    const host = new BrowserWindow({ show: true, width: 900, height: 700 });
    await host.loadURL(
      'data:text/html,<button onclick="this.textContent=\'Browser is usable\'">Browser button</button>'
    );
    const view = new WebContentsView();
    host.contentView.addChildView(view);
    await view.webContents.loadURL('data:text/html,Site fixture');
    const origin = 'https://example.com';
    const config = {
      enabled: true,
      before: '',
      after: "log('Loaded', url);\nlog('Title', document.title);",
      css: 'body { color: royalblue; }',
    };
    let permissionActive = false;
    let permissionVisible = true;
    let profile = 'work';
    let currentOrigin = origin;
    let contents = view.webContents;
    let saved = { ...config };
    let status = 'success';
    let logs = [
      { time: Date.now(), level: 'info', message: 'After load completed' },
    ];
    const owner = {
      sender: host.webContents,
      senderFrame: host.webContents.mainFrame,
    };
    const commands = [];
    const focuses = [];
    const service = require(path.join(
      mainDir,
      'service.cjs'
    )).registerSiteDeveloperWindows(
      (id) =>
        id === 'page' && contents
          ? {
              contents,
              profile,
              groupId: 'work',
              state: {
                origin: currentOrigin,
                groupName: 'Work',
                pageURL: 'https://example.com/page',
                available: true,
                developer: {
                  config: saved,
                  status,
                  logs,
                  notifications:
                    hookPermissions && permissionVisible
                      ? [
                          {
                            id: 'fixture-grant',
                            key: 'market-updates',
                            label: 'Telegram notifications',
                            destinationHost: 'api.telegram.org',
                            active: permissionActive,
                          },
                        ]
                      : [],
                },
              },
            }
          : undefined,
      (event, request) => {
        assert.strictEqual(event, owner);
        commands.push(request);
        if (request.action === 'set-site-developer') {
          saved = request.developer;
          status = 'waiting';
        }
        if (request.action === 'clear-site-developer-logs') logs = [];
        if (request.action === 'activate-hook-notification')
          permissionActive = true;
        if (request.action === 'revoke-hook-notification')
          permissionVisible = false;
      },
      (id, groupId, destination) => {
        focuses.push({ id, groupId, destination });
        app.focus({ steal: true });
        host.focus();
      }
    );
    service.open(owner, 'page', origin);
    await wait(1000);
    const editor = BrowserWindow.getAllWindows().find((w) => w !== host);
    assert(editor);
    assert.equal(editor.getParentWindow(), null);
    assert(!editor.isModal());
    assert(editor.isResizable());
    service.open(owner, 'page', origin);
    assert.equal(BrowserWindow.getAllWindows().length, 2, 'reuse same editor');
    const wc = editor.webContents;
    assert(
      await wc.executeJavaScript('!!window.electron.siteDeveloper'),
      'production preload bridge'
    );
    if (hookPermissions) {
      for (const [width, height, theme] of [
        [1040, 680, 'light'],
        [1040, 680, 'dark'],
        [400, 640, 'light'],
        [400, 480, 'dark'],
      ]) {
        editor.setContentSize(width, height);
        await wc.executeJavaScript(`window.setTheme('${theme}')`);
        await wait(300);
        const layout = await wc.executeJavaScript(
          `(()=>{const row=document.querySelector('.site-hook-notification-permissions > div'),buttons=[...row.querySelectorAll('button')],boxes=buttons.map(e=>e.getBoundingClientRect()),footer=document.querySelector('footer').getBoundingClientRect();return {gap:boxes[1].left-boxes[0].right,footer:footer.bottom,overflow:document.documentElement.scrollWidth>innerWidth}})()`
        );
        assert(layout.gap >= 11, 'notification action clearance');
        assert(layout.footer <= height + 1, 'notification footer reachable');
        assert(!layout.overflow, 'notification layout does not overflow');
        fs.writeFileSync(
          path.join(out, `permissions-${width}-${height}-${theme}.png`),
          (await wc.capturePage()).toPNG()
        );
      }
      await wc.executeJavaScript(
        "[...document.querySelectorAll('button')].find(e=>e.textContent==='Allow').click()"
      );
      await wait();
      assert.equal(commands.pop().grantId, 'fixture-grant');
      assert(permissionActive);
      service.update();
      await wait();
      assert(
        await wc.executeJavaScript(
          "!document.querySelector('.site-hook-notification-permissions').textContent.includes('Approval required')"
        )
      );
      fs.writeFileSync(
        path.join(out, 'permissions-active.png'),
        (await wc.capturePage()).toPNG()
      );
      await wc.executeJavaScript(
        "[...document.querySelectorAll('button')].find(e=>e.textContent==='Revoke').click()"
      );
      await wait();
      assert.equal(commands.pop().grantId, 'fixture-grant');
      service.update();
      await wait();
      assert(
        await wc.executeJavaScript(
          "!document.querySelector('.site-hook-notification-permissions')"
        )
      );
      permissionVisible = true;
      permissionActive = false;
      service.update();
      await wait();
    }

    await wc.executeJavaScript(
      "[...document.querySelectorAll('nav a')].find(e=>e.textContent==='Work').click()"
    );
    await wait();
    assert.deepEqual(focuses.pop(), {
      id: 'page',
      groupId: 'work',
      destination: 'group',
    });
    await wc.executeJavaScript(
      "[...document.querySelectorAll('nav a')].find(e=>e.textContent.includes('example.com')).click()"
    );
    await wait();
    assert.deepEqual(focuses.pop(), {
      id: 'page',
      groupId: 'work',
      destination: 'page',
    });
    const event = { sender: wc, senderFrame: wc.mainFrame };
    const emit = (request, source = event) =>
      ipcMain.emit('site-developer-command', source, request);
    emit(
      {
        id: 'wrong',
        url: 'https://wrong.test',
        action: 'set-site-developer',
        developer: saved,
      },
      { sender: host.webContents, senderFrame: host.webContents.mainFrame }
    );
    emit({ id: 'wrong', action: 'reload' }, { sender: wc, senderFrame: {} });
    emit({ id: 'page', action: 'navigate', url: 'https://wrong.test' });
    assert.equal(commands.length, 0, 'restricted sender/frame/actions');
    emit({ id: 'wrong', url: 'https://wrong.test', action: 'reload' });
    assert.deepEqual(
      commands.pop(),
      { id: 'page', url: origin, action: 'reload' },
      'main-owned binding'
    );
    const checks = [];
    for (const width of [820, 400])
      for (const theme of ['light', 'dark']) {
        editor.setContentSize(width, 640);
        await wc.executeJavaScript(
          `localStorage.setItem('touchbox-appearance',${JSON.stringify(
            theme
          )});window.dispatchEvent(new Event('storage'));window.setTheme(${JSON.stringify(
            theme
          )})`
        );
        await wait();
        const layout = await wc.executeJavaScript(
          `(()=>{const p=document.querySelector('main').getBoundingClientRect(),f=document.querySelector('footer').getBoundingClientRect(),e=document.querySelector('.cm-editor').getBoundingClientRect(),s=document.querySelector('.site-developer-scroll'),h=document.querySelector('.site-hook-stage-hint').getBoundingClientRect();return {page:p.bottom,footer:f.bottom,editor:e.height,helperGap:h.top-e.bottom,overflow:s.scrollWidth>s.clientWidth,highlighted:document.querySelectorAll('.cm-line span').length,direction:document.querySelector('.site-developer-workspace').dataset.panelGroupDirection}})()`
        );
        assert(layout.footer <= 641, 'footer visible');
        assert(layout.editor >= 98, 'usable editor');
        assert(layout.helperGap >= 10, 'helper spacing');
        assert(!layout.overflow, 'no horizontal overflow');
        assert(layout.highlighted > 0, 'JS syntax highlighting');
        assert.equal(
          layout.direction,
          width >= 720 ? 'horizontal' : 'vertical'
        );
        checks.push({ width, theme, ...layout });
        fs.writeFileSync(
          path.join(out, `${width}-${theme}.png`),
          (await wc.capturePage()).toPNG()
        );
        const axis = width >= 720 ? 'width' : 'height';
        const size = () =>
          wc.executeJavaScript(
            `document.querySelector('.site-developer-code-pane').getBoundingClientRect().${axis}`
          );
        const originalSize = await size();
        await wc.executeJavaScript(
          "document.querySelector('.site-developer-divider').focus()"
        );
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: width >= 720 ? 'Right' : 'Down',
        });
        await wait();
        assert(
          (await size()) > originalSize,
          'keyboard divider grows code pane'
        );
        await wc.executeJavaScript(
          "document.querySelector('.site-developer-divider').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))"
        );
        await wait();
        assert(
          Math.abs((await size()) - originalSize) < 2,
          'double click resets pane ratio'
        );
        const r = await wc.executeJavaScript(
          "(()=>{const e=document.querySelector('.site-developer-divider');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"
        );
        wc.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(r.x),
          y: Math.round(r.y),
        });
        await wait(60);
        wc.sendInputEvent({
          type: 'mouseDown',
          button: 'left',
          clickCount: 1,
          x: Math.round(r.x),
          y: Math.round(r.y),
        });
        await wait(60);
        wc.sendInputEvent({
          type: 'mouseMove',
          modifiers: ['leftButtonDown'],
          x: Math.round(r.x) + (width >= 720 ? 35 : 0),
          y: Math.round(r.y) + (width >= 720 ? 0 : 35),
        });
        await wait(60);
        wc.sendInputEvent({
          type: 'mouseUp',
          button: 'left',
          clickCount: 1,
          x: Math.round(r.x) + (width >= 720 ? 35 : 0),
          y: Math.round(r.y) + (width >= 720 ? 0 : 35),
        });
        await wait();
        assert(
          (await size()) > originalSize + 15,
          'pointer divider grows code pane'
        );
        await wait(250);
        assert(
          await wc.executeJavaScript(
            `localStorage.getItem('react-resizable-panels:touchbox-developer-workspace-${
              width >= 720 ? 'horizontal' : 'vertical'
            }')!==null`
          ),
          'layout saved locally'
        );
        await wc.executeJavaScript(
          "document.querySelector('.site-developer-divider').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('.site-developer-scroll').scrollTop=0"
        );
        await wait();
        await wc.executeJavaScript(
          'document.querySelector(\'[aria-label="About Hook API & examples"]\').click()'
        );
        await wait();
        assert(
          await wc.executeJavaScript(
            "!!document.querySelector('.preference-hint-content')"
          )
        );
        fs.writeFileSync(
          path.join(out, `${width}-${theme}-help.png`),
          (await wc.capturePage()).toPNG()
        );
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        await wait();
      }
    const ratio = () =>
      wc.executeJavaScript(
        "Number(document.querySelector('.site-developer-divider').getAttribute('aria-valuenow'))"
      );
    await wc.executeJavaScript(
      "document.querySelector('.site-developer-divider').focus()"
    );
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Home' });
    await wait();
    assert.equal(await ratio(), 30, 'code minimum');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'End' });
    await wait();
    assert.equal(await ratio(), 80, 'activity minimum retained');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    await wait();
    assert.equal(await ratio(), 65, 'Enter resets layout');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    await wait(350);
    const persistedRatio = await ratio();
    wc.reload();
    await wait(700);
    assert(
      Math.abs((await ratio()) - persistedRatio) < 0.1,
      'pane sizes restored on reopening page'
    );
    await wc.executeJavaScript(
      "window.setTheme('dark');document.querySelector('.site-developer-divider').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))"
    );
    await wait();
    await wc.executeJavaScript(
      'document.querySelector(\'[aria-label="After load code"]\').focus()'
    );
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['meta'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['meta'] });
    wc.insertText("log('Edited', url);");
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').textContent.includes('Edited')"
      ),
      'native CodeMirror editing'
    );
    for (const destination of ['group', 'page']) {
      await wc.executeJavaScript(
        `document.querySelectorAll('nav a')[${
          destination === 'group' ? 0 : 1
        }].click()`
      );
      await wait();
      assert(
        !editor.isDestroyed() && editor.isVisible(),
        'breadcrumb keeps editor open and visible'
      );
      assert(
        await wc.executeJavaScript(
          "document.querySelector('.cm-content').textContent.includes('Edited')"
        ),
        'breadcrumb preserves unsaved draft'
      );
      assert.equal(focuses.pop().destination, destination);
    }
    await wc.executeJavaScript(
      "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.startsWith('CSS')).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"
    );
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').textContent.includes('royalblue')"
      )
    );
    assert(
      await wc.executeJavaScript(
        "document.querySelectorAll('.cm-line span').length>0"
      ),
      'CSS syntax highlighting'
    );
    fs.writeFileSync(
      path.join(out, 'css.png'),
      (await wc.capturePage()).toPNG()
    );
    await wc.executeJavaScript(
      "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.startsWith('After load')).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"
    );
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').textContent.includes('Edited')"
      ),
      'stage draft preserved'
    );
    await wc.executeJavaScript(
      "[...document.querySelectorAll('button')].find(e=>e.textContent==='Save hooks').click()"
    );
    await wait();
    assert(saved.after.includes('Edited'), 'real Save bridge');
    for (const scenario of ['off', 'waiting', 'running', 'error', 'logs']) {
      saved = { ...saved, enabled: scenario !== 'off' };
      status =
        scenario === 'off'
          ? 'waiting'
          : scenario === 'logs'
          ? 'success'
          : scenario;
      logs =
        scenario === 'error'
          ? [
              {
                time: Date.now(),
                level: 'error',
                message: 'Could not save developer hooks: fixture save failure',
              },
            ]
          : scenario === 'logs'
          ? Array.from({ length: 30 }, (_, i) => ({
              time: Date.now(),
              level: 'info',
              message: `Log ${i}: ${'x'.repeat(120)}`,
            }))
          : [];
      service.update();
      await wait();
      if (scenario === 'logs')
        assert(
          await wc.executeJavaScript(
            "(()=>{const e=document.querySelector('.site-hook-logs');e.scrollTop=100;return e.scrollTop>0})()"
          ),
          'Activity scrolls independently'
        );
      fs.writeFileSync(
        path.join(out, `${scenario}.png`),
        (await wc.capturePage()).toPNG()
      );
    }
    saved = { ...saved, enabled: true };
    status = 'success';
    service.update();
    await wait();
    await wc.executeJavaScript(
      'document.querySelector(\'[aria-label="After load code"]\').focus()'
    );
    await wait();
    fs.writeFileSync(
      path.join(out, 'focus.png'),
      (await wc.capturePage()).toPNG()
    );
    await wc.executeJavaScript(
      `(()=>{const dt=new DataTransfer();dt.items.add(new File(["log('Imported', url);"],'fixture.js',{type:'text/javascript'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').textContent.includes('Imported')"
      ),
      'import'
    );
    await wc.executeJavaScript(
      `(()=>{const dt=new DataTransfer();dt.items.add(new File(['x'.repeat(100001)],'large.js',{type:'text/javascript'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('[role=alert]').textContent.includes('100 KB')"
      ),
      'import error'
    );
    fs.writeFileSync(
      path.join(out, 'import-error.png'),
      (await wc.capturePage()).toPNG()
    );
    const before = editor.getBounds();
    editor.setPosition(before.x + 30, before.y + 30);
    assert.equal(editor.getBounds().x, before.x + 30, 'movable');
    await wc.executeJavaScript(
      'document.querySelector(\'[aria-label="Expand or restore editor"]\').click()'
    );
    await wait(400);
    assert(editor.isMaximized(), 'expand');
    emit('expand');
    await wait(400);
    assert(!editor.isMaximized(), 'restore');
    host.focus();
    await host.webContents.executeJavaScript(
      "document.querySelector('button').click()"
    );
    assert.equal(
      await host.webContents.executeJavaScript(
        "document.querySelector('button').textContent"
      ),
      'Browser is usable'
    );
    currentOrigin = 'https://other.test';
    service.update();
    await wait();
    assert(
      await wc.executeJavaScript(
        "!!document.querySelector('.site-developer-unavailable')"
      )
    );
    const n = commands.length;
    emit({ id: 'page', action: 'reload' });
    assert.equal(commands.length, n, 'blocks origin changes');
    currentOrigin = origin;
    service.update();
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').textContent.includes('Imported')"
      ),
      'draft retained on returning to original site'
    );
    profile = 'different';
    service.update();
    emit({ id: 'page', action: 'reload' });
    assert.equal(commands.length, n, 'blocks profile changes');
    profile = 'work';
    contents = host.webContents;
    service.update();
    emit({ id: 'page', action: 'reload' });
    assert.equal(commands.length, n, 'blocks replacement contents');
    contents = undefined;
    service.update();
    await wait();
    assert(
      await wc.executeJavaScript(
        "document.querySelector('.cm-content').getAttribute('contenteditable')==='false'"
      ),
      'closed tab disables editor'
    );
    for (const height of [640, 480]) {
      editor.setContentSize(400, height);
      await wait(300);
      const layout = await wc.executeJavaScript(
        `(()=>{const e=document.querySelector('.cm-editor').getBoundingClientRect(),h=document.querySelector('.site-hook-stage-hint').getBoundingClientRect(),a=document.querySelector('#site-developer-activity').getBoundingClientRect(),f=document.querySelector('footer').getBoundingClientRect();return {editor:e.bottom,hint:h.top,activity:a.top,hintBottom:h.bottom,footer:f.bottom}})()`
      );
      assert(layout.hint >= layout.editor + 10, 'hint never overlaps editor');
      assert(
        await wc.executeJavaScript(
          "(()=>{const a=document.querySelector('.site-developer-activity-pane').getBoundingClientRect(),c=document.querySelector('.site-developer-code-pane').getBoundingClientRect();return a.top>=c.bottom+10})()"
        ),
        'Activity pane never overlaps code pane'
      );
      assert(layout.footer <= height + 1, 'small-height footer');
      fs.writeFileSync(
        path.join(out, `unavailable-${height}.png`),
        (await wc.capturePage()).toPNG()
      );
    }

    const listeners = ipcMain.listenerCount('site-developer-command');
    service.dispose();
    assert.equal(
      ipcMain.listenerCount('site-developer-command'),
      listeners - 1,
      'listener cleanup'
    );
    host.destroy();
    fs.writeFileSync(
      path.join(out, 'checks.json'),
      JSON.stringify(
        {
          checks,
          native: [
            'side by side and stacked',
            'pointer resize',
            'keyboard resize',
            'double click reset',
            'saved pane sizes',
            'group breadcrumb',
            'page breadcrumb',
            'nonmodal',
            'resizable',
            'move',
            'expand',
            'restore',
            'preload',
            'save',
            'restricted commands',
            'origin/profile/contents isolation',
            'cleanup',
            'browser usable',
          ],
        },
        null,
        2
      )
    );
    console.log('Developer window native, editor and layout checks passed');
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

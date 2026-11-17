// Native acceptance with bounded CPU work, disposable pages and controlled confirmation.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { BrowserWindow, WebContentsView } = require('electron');

module.exports = async ({
  main,
  create,
  evaluate,
  runtimeDir,
  out,
  url,
  windows,
}) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (run) => {
    for (let i = 0; i < 100; i++) {
      const value = await run();
      if (value) return value;
      await wait(100);
    }
    throw new Error('Task manager acceptance timed out');
  };
  const tabs = ['busy', 'other'].map((id) => ({
    id: `resource-${id}`,
    name: id,
    sessionId: 'resource-fixture',
    sessionName: 'Resource fixture',
    url: `${url}/resource-${id}`,
    icon: '',
    pinned: true,
  }));
  await evaluate(
    main,
    `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','resource-busy');undefined`,
  );
  main.reload();
  const page = (destination) =>
    main.contentView.children.find(
      (view) =>
        view instanceof WebContentsView &&
        !view.webContents.isDestroyed() &&
        view.webContents.getURL() === destination,
    )?.webContents;
  const busy = await until(() => page(tabs[0].url));
  await until(() => busy.executeJavaScript("document.readyState==='complete'"));
  await busy.executeJavaScript(
    `document.title='Busy resource fixture';window.guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',window.guard);window.work=setInterval(()=>{const start=performance.now();while(performance.now()-start<15){}},100);undefined`,
  );
  main.webContents.send('browser-tab-request', {
    action: 'select',
    id: tabs[1].id,
  });
  const other = await until(() => page(tabs[1].url));
  await until(() =>
    other.executeJavaScript("document.readyState==='complete'"),
  );
  await other.executeJavaScript(
    "document.title='Other resource fixture';undefined",
  );
  await other.executeJavaScript(
    `const embedded=document.createElement('iframe');embedded.src=${JSON.stringify(url.replace('127.0.0.1', 'localhost') + '/resource-frame')};document.body.appendChild(embedded);undefined`,
  );
  await until(() =>
    other.mainFrame.framesInSubtree.some((frame) =>
      frame.url.includes('/resource-frame'),
    ),
  );
  const manager = await create('task-manager', 900, 640);
  const get = () =>
    evaluate(manager, "window.electron.browser.taskManager({action:'get'})");
  const denied = await evaluate(
    main,
    "window.electron.browser.taskManager({action:'get'}).then(()=>false,error=>error.message.includes('access denied'))",
  );
  assert(denied, 'Browser chrome is not a task manager IPC caller');
  const state = await until(async () => {
    const value = await get();
    const task = value.tasks.find((item) => item.id === tabs[0].id);
    return task && task.cpu > 0 && task.memory > 0 && value;
  });
  const target = state.tasks.find((item) => item.id === tabs[0].id);
  assert.equal(target.contentsId, busy.id);
  assert.equal(target.pid, busy.getOSProcessId());
  assert(
    state.tasks.some(
      (item) =>
        item.title.startsWith('Embedded content') &&
        item.site === 'localhost' &&
        !item.canEnd,
    ),
    'Cross-site frame resources are attributed to their parent tab',
  );
  assert(state.tasks.some((item) => item.title === 'Browser' && !item.canEnd));
  const stale = {
    action: 'end',
    id: target.id,
    contentsId: target.contentsId + 1,
    pid: target.pid,
  };
  assert(
    await evaluate(
      manager,
      `window.electron.browser.taskManager(${JSON.stringify(stale)}).then(()=>false,()=>true)`,
    ),
    'Stale tab identity is rejected',
  );
  const dialogs = require(path.join(runtimeDir, 'dialogs.js'));
  const original = dialogs.showBrowserDialog;
  const end = {
    action: 'end',
    id: target.id,
    contentsId: target.contentsId,
    pid: target.pid,
  };
  try {
    dialogs.showBrowserDialog = async () => ({ response: 0 });
    await evaluate(
      manager,
      `window.electron.browser.taskManager(${JSON.stringify(end)})`,
    );
    assert(!busy.isDestroyed(), 'Cancel keeps the page alive');
    await busy.executeJavaScript(
      'setTimeout(()=>{const end=performance.now()+10000;while(performance.now()<end){}},50);undefined',
    );
    await wait(200);
    dialogs.showBrowserDialog = async () => ({ response: 1 });
    const endStarted = Date.now();
    await evaluate(
      manager,
      `window.electron.browser.taskManager(${JSON.stringify(end)})`,
    );
    await until(() => busy.isDestroyed());
    assert(
      Date.now() - endStarted < 3000,
      'Ending a hung renderer must not wait for its JavaScript',
    );
    assert(!other.isDestroyed(), 'Ending a tab must not kill another tab');
    await wait(300);
    assert(
      await evaluate(
        main,
        `JSON.parse(localStorage.getItem('user_apps')).some(item=>item.id==='resource-busy')`,
      ),
      'Ended tab remains saved',
    );
    assert(!page(tabs[0].url), 'Ended tab must not automatically restart');
    main.webContents.send('browser-tab-request', {
      action: 'select',
      id: tabs[0].id,
    });
    const resumed = await until(() => page(tabs[0].url));
    assert.notEqual(
      resumed.id,
      target.contentsId,
      'Selecting an ended tab creates a new page',
    );
    await until(() =>
      resumed.executeJavaScript("document.readyState==='complete'"),
    );
    const forceTarget = (await get()).tasks.find(
      (task) => task.id === target.id,
    );
    assert(forceTarget.canForceEnd, 'Reopened fixture permits force ending');
    await evaluate(
      manager,
      `window.electron.browser.taskManager(${JSON.stringify({ action: 'force-end', id: forceTarget.id, pid: forceTarget.pid, processStarted: forceTarget.processStarted })})`,
    );
    await until(() => resumed.isCrashed());
    assert(
      !other.isDestroyed() && !other.isCrashed(),
      'Force ending preserves the other tab',
    );
    const stopped = (await get()).tasks.find((task) => task.id === target.id);
    await evaluate(
      manager,
      `window.electron.browser.taskManager(${JSON.stringify({ action: 'close', id: stopped.id, contentsId: stopped.contentsId, pid: stopped.pid })})`,
    );
    await until(() =>
      evaluate(
        main,
        `JSON.parse(localStorage.getItem('user_apps')).some(item=>item.id==='resource-busy' && item.archived)`,
      ),
    );
  } finally {
    dialogs.showBrowserDialog = original;
  }
  const api = require(path.join(runtimeDir, 'electronBrowser.js'));
  const privateOwner = new BrowserWindow({
    show: true,
    webPreferences: {
      session: api.createPrivateSession(),
      preload: path.join(runtimeDir, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  windows[`private-task-${privateOwner.id}`] = privateOwner;
  api.attachPrivateWindow(privateOwner, privateOwner.webContents.session);
  api.registerPrivateBrowserWindow(privateOwner, async () => {
    throw new Error('No secondary private fixture');
  });
  require(path.join(runtimeDir, 'browser.js')).registerBrowser(privateOwner);
  try {
    await privateOwner.loadFile(
      path.resolve('release/app/dist/renderer/index.html'),
      { query: { view: 'main', private: '1' } },
    );
    await until(() =>
      evaluate(
        privateOwner,
        "!!document.querySelector('.workspace-sidebar') && !!document.querySelector('[data-private]')",
      ),
    );
    await wait(500);
    privateOwner.webContents.send('browser-tab-request', {
      action: 'create',
      app: {
        ...tabs[0],
        id: 'private-resource',
        sessionId: 'private-resource',
        spaceId: 'default',
        pinned: false,
        url: url + '/private-resource',
      },
    });
    await until(() =>
      privateOwner.contentView.children.some(
        (view) =>
          view instanceof WebContentsView &&
          !view.webContents.isDestroyed() &&
          view.webContents.getURL() === url + '/private-resource',
      ),
    );
    manager.setParentWindow(privateOwner);
    const privateState = await get();
    assert(privateState.tasks.some((task) => task.id === 'private-resource'));
    assert(
      !privateState.tasks.some((task) => task.id === 'resource-other'),
      'Private task manager excludes regular tab details',
    );
    manager.setParentWindow(main);
    assert(
      !(await get()).tasks.some((task) => task.id === 'private-resource'),
      'Regular task manager excludes private tab details',
    );
  } finally {
    manager.setParentWindow(main);
    privateOwner.destroy();
    delete windows[`private-task-${privateOwner.id}`];
  }
  await until(() =>
    evaluate(manager, "!!document.querySelector('table tbody tr')"),
  );
  const chooseFilter = (label) =>
    evaluate(
      manager,
      `Array.from(document.querySelectorAll('.task-manager-filters button')).find(button=>button.getAttribute('aria-label')===${JSON.stringify(label)}).click();undefined`,
    );
  await chooseFilter('Can’t end');
  assert(
    await evaluate(
      manager,
      "!document.querySelector('tbody button[aria-label^=\"End \" ]') && !!document.querySelector('.task-manager-protected')",
    ),
    'Protected filter shows no end buttons',
  );
  await chooseFilter('All tasks');
  await evaluate(
    manager,
    `(()=>{const select=document.querySelector('select[aria-label="Sort tasks"]');select.value='canEnd:desc';select.dispatchEvent(new Event('change',{bubbles:true}));})();undefined`,
  );
  assert(
    await evaluate(
      manager,
      '!!document.querySelector(\'tbody tr:first-child button[aria-label^="End " ], tbody tr:first-child button[aria-label^="Force end " ]\')',
    ),
    'Can end sort places actionable tasks first',
  );
  if (process.platform === 'darwin') {
    assert(
      await evaluate(
        manager,
        `(()=>{const ref=document.createElement('div');ref.className='preferences-shell';ref.style.display='none';document.querySelector('.radix-themes').appendChild(ref);const matches=getComputedStyle(ref).backgroundColor===getComputedStyle(document.querySelector('.task-manager')).backgroundColor;ref.remove();return matches;})()`,
      ),
      'Task manager uses the same glass material as Preferences',
    );
    manager.webContents.debugger.attach('1.3');
    try {
      await manager.webContents.debugger.sendCommand(
        'Emulation.setEmulatedMedia',
        {
          features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
        },
      );
      assert(
        await evaluate(
          manager,
          `(()=>{const root=document.querySelector('.task-manager');const ref=document.createElement('div');ref.style.background='var(--color-panel-solid)';root.appendChild(ref);const matches=matchMedia('(prefers-reduced-transparency: reduce)').matches&&getComputedStyle(root).backgroundColor===getComputedStyle(ref).backgroundColor;ref.remove();return matches;})()`,
        ),
        'Reduced transparency uses the shared opaque fallback',
      );
    } finally {
      await manager.webContents.debugger.sendCommand(
        'Emulation.setEmulatedMedia',
        { features: [] },
      );
      manager.webContents.debugger.detach();
    }
  }
  fs.writeFileSync(
    path.join(out, 'task-manager-all.png'),
    (await manager.capturePage()).toPNG(),
  );
  await chooseFilter('Can end');
  for (const [name, width] of [
    ['desktop', 900],
    ['narrow', 560],
  ]) {
    manager.setSize(width, 640);
    await wait(150);
    assert(
      await evaluate(
        manager,
        'document.documentElement.scrollWidth<=innerWidth+1',
      ),
      'Task manager must fit its window',
    );
    fs.writeFileSync(
      path.join(out, `task-manager-${name}.png`),
      (await manager.capturePage()).toPNG(),
    );
  }
  fs.writeFileSync(
    path.join(out, 'task-manager-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        sampled: { cpu: target.cpu, memory: target.memory, pid: target.pid },
        verified: [
          'Native CPU and memory metrics',
          'Cross-site subframe attribution',
          'Regular/private tab isolation',
          'Dedicated-window IPC authorization',
          'Stale target rejection',
          'Cancel preserves tab',
          'End bypasses unload guard after confirmation',
          'Other tab survives',
          'Tab remains saved and reopens',
          'Force end stops a live renderer process',
          'Close archives a stopped tab',
          'Desktop and narrow layouts',
          'Can end and protected task filters',
          'Actionability sorting',
          'Shared Preferences glass material and reduced-transparency fallback',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS: native task metrics, safe end/cancel, stale targets, tab recovery and responsive task manager',
  );
};

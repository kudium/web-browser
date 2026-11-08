// End-to-end visible action, follow-up context and honest completion checks.
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
} = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  assert = require('assert');
const savedHandoffTest = process.argv.includes('--saved-task-handoff');
const scheduledTaskTest = process.argv.includes('--saved-schedule');
const savedTaskTest = process.argv.includes('--saved-task') || savedHandoffTest || scheduledTaskTest;
let handedOff = false;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-visible-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/ai.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'ai.cjs'),
});
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{resume:()=>ipcRenderer.invoke('ai-resume'),tasks:()=>ipcRenderer.invoke('ai-tasks','list'),create:p=>ipcRenderer.invoke('ai-tasks','create',p),action:id=>ipcRenderer.invoke('ai-tasks','run',id),settings:p=>ipcRenderer.invoke('ai-settings',p),run:p=>ipcRenderer.invoke('ai-run',p),status:()=>ipcRenderer.invoke('ai-task-status')});ipcRenderer.on('ai-event',(_,e)=>ipcRenderer.send('fixture-event',e));ipcRenderer.on('browser-tab-request',(_,r)=>ipcRenderer.send('fixture-tab',r));`
);
let step = 0,
  contextVerified = false,
  resolveDone;
const events = [];
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);
  const last = data.messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .at(-1).content;
  let message;
  if (savedHandoffTest && !handedOff && last === 'Set the background white') {
    handedOff = true;
    message = {role:'assistant',tool_calls:[{id:'handoff',type:'function',function:{name:'hand_off',arguments:'{"reason":"Confirm you are ready, then continue."}'}}]};
  } else if (last === 'Set the background white' || (savedHandoffTest && last.startsWith('Continue the original task'))) {
    const plan = [
      ...(savedTaskTest
        ? [
            ['list_tabs', {}],
            ['read_page', {}],
          ]
        : []),
      ['set_page_appearance', { background: '#ffffff', color: '#000000' }],
      ['screenshot', {}],
    ][step++];
    message = plan
      ? {
          role: 'assistant',
          tool_calls: [
            {
              id: String(step),
              type: 'function',
              function: { name: plan[0], arguments: JSON.stringify(plan[1]) },
            },
          ],
        }
      : { role: 'assistant', content: 'The background is white.' };
  } else if (last === 'Show me that tab') {
    contextVerified =
      data.messages.some(
        (m) => m.role === 'user' && m.content === 'Set the background white'
      ) &&
      data.messages.some(
        (m) =>
          m.role === 'assistant' && m.content === 'The background is white.'
      );
    message =
      step++ === (savedTaskTest ? 5 : 3)
        ? {
            role: 'assistant',
            tool_calls: [
              {
                id: 'focus',
                type: 'function',
                function: { name: 'select_tab', arguments: '{"tabId":"page"}' },
              },
            ],
          }
        : { role: 'assistant', content: 'Here is the tab.' };
  } else
    message = { role: 'assistant', content: 'Done! I deleted everything.' };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message }] }));
});
(async () => {
  await app.whenReady();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const host = new BrowserWindow({
    show: true,
    title: 'KudiumBrowser visible action fixture',
    webPreferences: { preload: path.join(root, 'preload.cjs') },
  });
  const page = new WebContentsView();
  host.contentView.addChildView(page);
  page.setBounds({ x: 0, y: 0, width: 500, height: 300 });
  await page.webContents.loadURL(
    'data:text/html,<body style="background:black">Test</body>'
  );
  let focused = 'page';
  dialog.showMessageBox = async () => ({ response: 1 });
  await require(path.join(root, 'ai.cjs')).initializeLocalStorage();
  const dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => [{ id: 'page', name: 'Test', url: page.webContents.getURL() }],
    focused: () => focused,
    contents: (id) => (id === 'page' ? page.webContents : undefined),
    activityBounds: (id) => (id === 'page' ? page.getBounds() : undefined),
  });
  ipcMain.on('fixture-tab', (_, r) => {
    if (r.action === 'select') focused = r.id;
  });
  ipcMain.on('fixture-event', (_, e) => {
    events.push(e);
    if (e.type === 'done') resolveDone?.();
  });
  await host.loadURL('data:text/html,fixture');
  const run = async (prompt) => {
    const complete = new Promise((r) => (resolveDone = r));
    await host.webContents.executeJavaScript(
      `fixture.run(${JSON.stringify(prompt)})`
    );
    await Promise.race([
      complete,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('Timeout')), 10000)
      ),
    ]);
  };
  await host.webContents.executeJavaScript(
    `fixture.settings({endpoint:'http://127.0.0.1:${
      server.address().port
    }/v1',model:'test',key:'fixture',remember:false})`
  );
  let savedId;
  if (savedTaskTest) {
    const schedule = scheduledTaskTest ? {kind:'once',at:Date.now()+300} : {kind:'manual'};
    savedId = await host.webContents.executeJavaScript(
      `fixture.create({name:'White page',instructions:'Set the background white',schedule:${JSON.stringify(schedule)}})`
    );
    if (scheduledTaskTest) {
      for (let attempt=0;attempt<100;attempt++) {
        const tasks = await host.webContents.executeJavaScript('fixture.tasks()');
        if(tasks[0]?.runs[0]?.state === 'completed') break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    } else await host.webContents.executeJavaScript(
      `fixture.action(${JSON.stringify(savedId)})`
    );
    if (savedHandoffTest) {
      const paused = await host.webContents.executeJavaScript('fixture.tasks()');
      assert.equal(paused[0].runs[0].state, 'paused');
      assert((await host.webContents.executeJavaScript('fixture.status()')).resumable);
      const runId = paused[0].runs[0].id;
      await host.webContents.executeJavaScript('fixture.resume()');
      const resumed = await host.webContents.executeJavaScript('fixture.tasks()');
      assert.equal(resumed[0].runs.length, 1);
      assert.equal(resumed[0].runs[0].id, runId);
    }
    const records = await host.webContents.executeJavaScript('fixture.tasks()');
    assert.equal(records[0].runs[0].state, 'completed');
    if (scheduledTaskTest) { assert.equal(records[0].enabled,false); assert.equal(records[0].runs.length,1); }
    assert(
      !fs
        .readFileSync(path.join(root, 'ai-tasks.bin'))
        .includes(Buffer.from('Set the background white'))
    );
    const outsider = new BrowserWindow({
      show: false,
      webPreferences: { preload: path.join(root, 'preload.cjs') },
    });
    await outsider.loadURL('data:text/html,foreign');
    assert(
      await outsider.webContents.executeJavaScript(
        'fixture.tasks().then(()=>false,()=>true)'
      )
    );
    outsider.destroy();
  } else await run('Set the background white');
  assert.equal(
    await page.webContents.executeJavaScript(
      'getComputedStyle(document.body).backgroundColor'
    ),
    'rgb(255, 255, 255)'
  );
  assert(
    events.some((e) => e.type === 'activity' && e.active && e.tabId === 'page')
  );
  assert.equal(events.at(-1).resumable, false);
  focused = 'other';
  await run('Show me that tab');
  assert(contextVerified);
  assert.equal(focused, 'page');
  assert.equal(events.at(-1).resumable, false);
  await run('Delete everything');
  assert(
    events.some(
      (e) =>
        e.text ===
        'No browser action was performed. I could not complete the requested change.'
    )
  );
  assert(!events.some((e) => e.text === 'Done! I deleted everything.'));
  assert.equal(
    (await host.webContents.executeJavaScript('fixture.status()')).resumable,
    false
  );
  dispose();
  host.destroy();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(
    'PASS: isolated appearance mutation, screenshot, activity, follow-up context, focus and honest no-action completion.'
  );
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

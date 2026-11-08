// Task generation and chat tool use a disposable profile and deterministic provider.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-task-create-'));
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
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{settings:p=>ipcRenderer.invoke('ai-settings',p),draft:p=>ipcRenderer.invoke('ai-tasks','draft',p),tasks:()=>ipcRenderer.invoke('ai-tasks','list'),run:p=>ipcRenderer.invoke('ai-run',p)});ipcRenderer.on('ai-event',(_,event)=>ipcRenderer.send('test-event',event));`
);
let clockVerified = false,
  resolveDone;
const events = [];
let approvals = 0;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  const draft = request.messages[0].content.startsWith(
    'Prepare a saved browser task'
  );
  const prompt = request.messages
    .filter((m) => m.role === 'user')
    .at(-1).content;
  clockVerified =
    clockVerified || request.messages[0].content.includes('timezone:');
  let message;
  if (draft && prompt === 'Later')
    message = { role: 'assistant', content: 'What time should this run?' };
  else if (!draft && request.messages.some((m) => m.role === 'tool'))
    message = { role: 'assistant', content: 'Task created.' };
  else {
    const args = draft
      ? {
          name: 'Check staging',
          instructions: 'Read the staging page',
          scheduleKind: 'daily',
          localTime: '09:00',
        }
      : {
          name: 'Read page later',
          instructions: 'Read the current page',
          scheduleKind: 'once',
          runAt: new Date(Date.now() + 1800000).toISOString(),
        };
    message = {
      role: 'assistant',
      tool_calls: [
        {
          id: 'create',
          type: 'function',
          function: { name: 'create_task', arguments: JSON.stringify(args) },
        },
      ],
    };
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message }] }));
});
(async () => {
  await app.whenReady();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const host = new BrowserWindow({
    show: true,
    title: 'TouchBox task creation fixture',
    webPreferences: { preload: path.join(root, 'preload.cjs') },
  });
  const dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => [],
    focused: () => undefined,
    contents: () => undefined,
  });
  dialog.showMessageBox = async () => {
    approvals++;
    return { response: 1 };
  };
  ipcMain.on('test-event', (_, event) => {
    events.push(event);
    if (event.type === 'done') resolveDone?.();
  });
  await host.loadURL('data:text/html,fixture');
  const evaluate = (code) => host.webContents.executeJavaScript(code);
  await evaluate(
    `test.settings({endpoint:'http://127.0.0.1:${
      server.address().port
    }/v1',model:'fixture',key:'local-fixture',remember:false})`
  );
  const draft = await evaluate(
    "test.draft('Check staging every morning at 9')"
  );
  assert.equal(draft.name, 'Check staging');
  assert.deepEqual(draft.schedule, { kind: 'daily', time: '09:00' });
  assert.equal(
    (await evaluate('test.tasks()')).length,
    0,
    'Draft must not save or run'
  );
  assert.equal(approvals, 0);
  assert(clockVerified);
  assert(
    await evaluate(
      "test.draft('Later').then(()=>false,e=>e.message.includes('What time'))"
    ),
    'Ambiguous schedule must ask, not guess'
  );
  const done = new Promise((r) => (resolveDone = r));
  await evaluate("test.run('Create a task to read the page in 30 minutes')");
  await Promise.race([
    done,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('Chat timed out')), 10000)
    ),
  ]);
  const tasks = await evaluate('test.tasks()');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].schedule.kind, 'once');
  assert(tasks[0].nextRunAt > Date.now());
  assert.equal(
    tasks[0].runs.length,
    0,
    'Chat creation must not execute future work'
  );
  assert.equal(approvals, 1);
  assert(events.some((e) => e.text === 'Task created.'));
  assert(!events.some((e) => e.type === 'error'), JSON.stringify(events));
  dispose();
  host.destroy();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(
    'PASS: AI draft, daily time, grounded clock, ambiguity, chat create_task confirmation, persisted schedule and no immediate execution.'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});

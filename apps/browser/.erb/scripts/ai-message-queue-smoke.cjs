// Actual AI loop and trusted IPC; disposable profile and synthetic provider.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-ai-message-queue-'));
app.setPath('userData', root);
let host, server, dispose;
const watchdog = setTimeout(() => {
  console.error('AI queue smoke timed out');
  app.exit(1);
}, 45000);
const waitFor = async (check) => {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error('Timed out waiting for queue');
};
(async () => {
  await app.whenReady();
  require('esbuild').buildSync({
    entryPoints: ['src/main/ai.ts'],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(root, 'ai.cjs'),
  });
  fs.writeFileSync(
    path.join(root, 'preload.cjs'),
    `const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{settings:s=>ipcRenderer.invoke('ai-settings',s),run:p=>ipcRenderer.invoke('ai-run',p),queue:r=>ipcRenderer.invoke('ai-queue',r||{action:'list'}),status:()=>ipcRenderer.invoke('ai-task-status'),stop:()=>ipcRenderer.invoke('ai-stop'),chats:r=>ipcRenderer.invoke('ai-conversations',r)});ipcRenderer.on('ai-queue-changed',(_,state)=>ipcRenderer.send('fixture-queue',state));`
  );
  const requests = [],
    started = [];
  let release;
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body),
      main = !!payload.tools?.length;
    const reply = () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: main ? 'Fixture complete.' : 'Queue test',
              },
            },
          ],
        })
      );
    };
    if (main) {
      requests.push(payload);
      const task = payload.messages
        .filter((m) => m.role === 'user')
        .at(-1)?.content;
      if (typeof task === 'string' && task.includes('Hold this')) {
        release = reply;
        return;
      }
    }
    reply();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const ai = require(path.join(root, 'ai.cjs'));
  await ai.initializeLocalStorage();
  host = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(root, 'preload.cjs'),
    },
  });
  await host.loadURL('data:text/html,Queue fixture');
  dispose = ai.registerAI(host, {
    tabs: () => [],
    focused: () => undefined,
    contents: () => undefined,
  });
  const run = (code) => host.webContents.executeJavaScript(code);
  ipcMain.on('fixture-queue', (_, state) => {
    if (state.started) started.push(state.started.text);
  });
  await run(
    `fixture.settings(${JSON.stringify({
      endpoint: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'fixture',
      key: 'synthetic',
      remember: false,
    })})`
  );
  assert.equal(await run("fixture.run('Hold this first task')"), true);
  await waitFor(() => requests.length === 1);
  assert.equal(await run("fixture.run('Then inspect links')"), false);
  assert.equal(await run("fixture.run('Skip this request')"), false);
  assert.equal(await run("fixture.run('Then summarize')"), false);
  const pending = await run('fixture.queue()');
  assert.equal(pending.messages.length, 3);
  await run(
    `fixture.queue(${JSON.stringify({
      action: 'remove',
      id: pending.messages[1].id,
    })})`
  );
  release();
  await waitFor(
    async () => requests.length === 3 && !(await run('fixture.status()')).busy
  );
  assert.deepEqual(started, ['Then inspect links', 'Then summarize']);
  assert((await run('fixture.queue()')).messages.length === 0);
  assert(
    requests[2].messages.some(
      (m) => m.role === 'user' && m.content === 'Then inspect links'
    ),
    'Follow-ups lost their chat history'
  );
  assert(
    !requests.some((p) =>
      p.messages.some(
        (m) => m.role === 'user' && m.content === 'Skip this request'
      )
    ),
    'Removed message ran'
  );
  assert.equal(await run("fixture.run('Hold this next task')"), true);
  await waitFor(() => requests.length === 4);
  await run("fixture.run('After the stop')");
  await run('fixture.stop()');
  await waitFor(async () => !(await run('fixture.status()')).busy);
  const paused = await run('fixture.queue()');
  assert(
    paused.paused && paused.messages.length === 1,
    'Stop discarded or restarted follow-up'
  );
  await run("fixture.queue({action:'resume'})");
  await waitFor(
    async () => requests.length === 5 && !(await run('fixture.status()')).busy
  );
  assert.equal(started.at(-1), 'After the stop');
  console.log(
    'PASS: real AI queue runs follow-ups in order with shared chat history, skips removed messages, retains messages on stop and resumes explicitly.'
  );
  dispose();
  dispose = undefined;
  host.destroy();
  host = undefined;
  server.close();
  clearTimeout(watchdog);
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(0);
})().catch((error) => {
  console.error(error);
  clearTimeout(watchdog);
  if (dispose) dispose();
  if (host && !host.isDestroyed()) host.destroy();
  if (server) server.close();
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(1);
});

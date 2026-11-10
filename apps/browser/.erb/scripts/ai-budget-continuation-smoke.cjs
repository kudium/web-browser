// Actual agent loop and trusted IPC, disposable profile and synthetic provider only.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-budget-continuation-'));
app.setPath('userData', root);
let host, server, dispose;
const watchdog = setTimeout(() => { console.error('Continuation smoke timed out'); app.exit(1); }, 60000);
(async () => {
  await app.whenReady();
  require('esbuild').buildSync({ entryPoints: ['src/main/ai.ts'], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'ai.cjs') });
  fs.writeFileSync(path.join(root, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{settings:s=>ipcRenderer.invoke('ai-settings',s),run:p=>ipcRenderer.invoke('ai-run',p),resume:()=>ipcRenderer.invoke('ai-resume'),status:()=>ipcRenderer.invoke('ai-task-status'),stop:()=>ipcRenderer.invoke('ai-stop')});ipcRenderer.on('ai-event',(_,event)=>ipcRenderer.send('fixture-event',event));`);
  const requests = [];
  const events = [];
  server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const main = !!payload.tools?.length;
    if (main) requests.push(payload);
    const message = !main || requests.length > 180
      ? { role: 'assistant', content: 'Verified fixture complete.' }
      : { role: 'assistant', content: '', tool_calls: [{ id: `fixture-${requests.length}`, type: 'function', function: { name: 'list_tabs', arguments: '{}' } }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const ai = require(path.join(root, 'ai.cjs'));
  await ai.initializeLocalStorage();
  host = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(root, 'preload.cjs') } });
  await host.loadURL('data:text/html,Continuation fixture');
  dispose = ai.registerAI(host, { tabs: () => [], focused: () => undefined, contents: () => undefined });
  const evaluate = code => host.webContents.executeJavaScript(code);
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  await evaluate(`fixture.settings(${JSON.stringify({ endpoint, model: 'fixture', key: 'synthetic', remember: false })})`);
  ipcMain.on('fixture-event', (_event, event) => events.push(event));
  const execute = async code => {
    const done = new Promise(resolve => {
      const handler = (_event, event) => {
        if (event.type === 'done' && event.source !== 'external') { ipcMain.removeListener('fixture-event', handler); resolve(); }
      };
      ipcMain.on('fixture-event', handler);
    });
    await evaluate(code);
    await done;
  };
  await execute("fixture.run('Complete the synthetic task')");
  assert.equal(requests.length, 60);
  assert.equal((await evaluate('fixture.status()')).resumable, true);
  assert(events.some(event => event.type === 'handoff' && event.resumable && event.text.includes('Progress saved')));
  await execute('fixture.resume()');
  assert.equal(requests.length, 180, 'Continuation gets a doubled 120-round segment');
  assert.equal((await evaluate('fixture.status()')).resumable, true);
  assert(requests[60].messages.some(message => message.role === 'tool' && message.tool_call_id === 'fixture-60'), 'Last completed result retained');
  assert(requests[60].messages.some(message => message.role === 'user' && message.content === 'Complete the synthetic task'), 'Original task retained');
  await execute("fixture.run('Did you finish the task?')");
  assert.equal(requests.length, 181);
  assert(requests[180].messages.some(message => message.role === 'user' && message.content === 'Did you finish the task?'), 'Follow-up preserved with original tool context');
  assert.equal((await evaluate('fixture.status()')).resumable, false);
  assert(events.some(event => event.type === 'message' && event.text === 'Verified fixture complete.'));
  assert(requests[180].messages.some(message => message.role === 'tool' && message.tool_call_id === 'fixture-180'));
  console.log('PASS: two budget pauses, full continuation segments, retained tool history and follow-up, verified final reply');
  dispose(); dispose = undefined;
  host.destroy(); host = undefined;
  server.close();
  clearTimeout(watchdog);
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(0);
})().catch(error => {
  console.error(error);
  clearTimeout(watchdog);
  if (dispose) dispose();
  if (host && !host.isDestroyed()) host.destroy();
  if (server) server.close();
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(1);
});

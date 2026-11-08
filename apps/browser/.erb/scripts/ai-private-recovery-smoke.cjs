// Real encrypted checkpoint restoration; disposable profiles and synthetic data only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const testCase = process.env.TOUCHBOX_RECOVERY_CASE;
const control = process.env.TOUCHBOX_RECOVERY_CONTROL === '1' || process.argv.includes('--control');
const cases = control ? ['pause-resume', 'pause-chat', 'pause-task'] : ['private-denied', 'private-approved', 'legacy-denied', 'public', 'oversized', 'private-stopped'];
if (!testCase) {
  const selectedCases = process.env.TOUCHBOX_DISCLOSURE_PHASE === 'before'
    ? cases.filter((name) => name !== 'private-stopped') : cases;
  const results = selectedCases.map((name) => {
    const output = execFileSync(require('electron'), [__filename], {
      env: { ...process.env, TOUCHBOX_RECOVERY_CASE: name, TOUCHBOX_RECOVERY_CONTROL: control ? '1' : '0' },
      encoding: 'utf8', timeout: 20000,
    });
    return JSON.parse(output.split('\n').find((line) => line.startsWith('RESULT ')).slice(7));
  });
  const file = control ? 'docs/benchmarks/ai-control-isolation.json' : 'docs/benchmarks/ai-private-recovery.json';
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const phase = process.env.TOUCHBOX_DISCLOSURE_PHASE || 'after';
  const report = { measuredAt: new Date().toISOString(), results,
    method: control
      ? 'Actual Electron registerAI, persisted external pause, built-in chat/resume/manual task, due scheduler, explicit external resume and local HTTP provider. Each case runs in a separate disposable profile.'
      : 'Actual Electron registerAI, encrypted AICheckpointStore restored before registration, native review fixture and local HTTP provider. Each case runs in a separate disposable profile.' };
  if (saved[phase]) saved.confirmations = [...(saved.confirmations || []), { phase, ...report }];
  else saved[phase] = report;
  fs.writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');
  console.log(control ? 'PASS AI control isolation' : 'PASS private checkpoint recovery', JSON.stringify(report));
} else {
  const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
  const http = require('http');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-private-recovery-'));
  app.setPath('userData', root);
  const mainSource = fs.readFileSync(process.env.TOUCHBOX_DISCLOSURE_SOURCE || 'src/main/ai.ts', 'utf8');
  require('esbuild').buildSync({ stdin: {
    contents: mainSource + "\nexport {AICheckpointStore} from './aiCheckpoint';",
    resolveDir: path.resolve('src/main'), sourcefile: 'ai.ts', loader: 'ts',
  }, bundle: true, minify: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'ai.cjs') });
  fs.writeFileSync(path.join(root, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{settings:s=>ipcRenderer.invoke('ai-settings',s),resume:()=>ipcRenderer.invoke('ai-resume'),status:()=>ipcRenderer.invoke('ai-task-status'),stop:()=>ipcRenderer.invoke('ai-stop'),run:p=>ipcRenderer.invoke('ai-run',p),mcp:()=>ipcRenderer.invoke('ai-mcp','status'),tasks:(action,value)=>ipcRenderer.invoke('ai-tasks',action,value),resumeExternal:()=>ipcRenderer.invoke('ai-resume-external')});ipcRenderer.on('ai-event',(_,event)=>ipcRenderer.send('fixture-event',event));`);
  let host, server, dispose;
  (async () => {
    await app.whenReady();
    const bodies = [];
    const auxiliaryBodies = [];
    server = http.createServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk;
      if (JSON.parse(body).tools?.length) bodies.push(body);
      else auxiliaryBodies.push(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Recovery fixture complete.' } }] }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    const privateCase = !control && testCase !== 'public';
    const sentinel = privateCase ? 'synthetic-paused-private-4179' : 'public-fixture';
    const checkpoint = { messages: [{ role: 'user', content: 'Original fixture task' }, { role: 'assistant', content: sentinel + (testCase === 'oversized' ? 'x'.repeat(21000) : '') }], step: 1, endpoint, expires: Date.now() + 60000, accessMode: 'full' };
    if (testCase !== 'legacy-denied') checkpoint.privateData = privateCase;
    const ai = require(path.join(root, 'ai.cjs'));
    if (!control || testCase === 'pause-resume') {
      new ai.AICheckpointStore(path.join(root, 'ai-checkpoint.bin'), safeStorage).save(checkpoint);
      assert(!fs.readFileSync(path.join(root, 'ai-checkpoint.bin')).includes(Buffer.from(sentinel)));
    }
    if (control) fs.writeFileSync(path.join(root, 'ai-external-paused'), 'paused', { mode: 0o600 });
    host = new BrowserWindow({ show: testCase === 'pause-task', webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(root, 'preload.cjs') } });
    await host.loadURL('data:text/html,Recovery fixture');
    dispose = ai.registerAI(host, { tabs: () => [], focused: () => undefined, contents: () => undefined });
    const evaluate = (code) => host.webContents.executeJavaScript(code);
    await evaluate(`fixture.settings({endpoint:${JSON.stringify(endpoint)},model:'fixture',key:'synthetic-local-key',remember:false})`);
    assert.equal((await evaluate('fixture.status()')).resumable, !control || testCase === 'pause-resume');
    if (control) assert((await evaluate('fixture.mcp()')).paused);
    let reviews = 0;
    dialog.showMessageBox = async (_owner, options) => {
      reviews += 1; assert(options.detail.includes(sentinel)); assert(options.detail.includes(endpoint));
      if (testCase === 'private-stopped') await evaluate('fixture.stop()');
      return { response: testCase === 'private-approved' ? 1 : 0 };
    };
    let dueTask;
    if (testCase === 'pause-task') {
      dueTask = await evaluate("fixture.tasks('create',{name:'Scheduled fixture',instructions:'Scheduled local fixture',schedule:{kind:'once',at:Date.now()+50}})");
      await new Promise((resolve) => setTimeout(resolve, 1100));
      assert.equal(bodies.length, 0);
    }
    const done = new Promise((resolve) => ipcMain.on('fixture-event', (_event, event) => { if (event.type === 'done') resolve(); }));
    if (testCase === 'pause-chat') await evaluate("fixture.run('Explicit local fixture task')");
    else if (testCase === 'pause-task') {
      const id = await evaluate("fixture.tasks('create',{name:'Manual fixture',instructions:'Explicit local fixture task',schedule:{kind:'manual'}})");
      await evaluate(`fixture.tasks('run',${JSON.stringify(id)})`);
    } else await evaluate('fixture.resume()');
    await done;
    const baseline = process.env.TOUCHBOX_DISCLOSURE_PHASE === 'before';
    const permitted = baseline || control || ['private-approved', 'public'].includes(testCase);
    assert.equal(bodies.length, permitted ? 1 : 0);
    assert.equal(reviews, baseline || control || ['public', 'oversized'].includes(testCase) ? 0 : 1);
    const resumable = (await evaluate('fixture.status()')).resumable;
    if (!baseline && !control) {
      assert.equal(resumable, ['private-denied', 'legacy-denied', 'oversized'].includes(testCase));
      if (resumable) {
        const restored = new ai.AICheckpointStore(path.join(root, 'ai-checkpoint.bin'), safeStorage).load();
        assert(restored.messages.some((message) => message.content.includes(sentinel)));
        assert.equal(restored.expires, checkpoint.expires);
      }
    }
    const report = { case: testCase, requests: bodies.length, auxiliaryRequests: auxiliaryBodies.length, reviews, privateFactDisclosed: bodies.some((body) => body.includes('synthetic-paused-private-4179')), resumable, electron: process.versions.electron, platform: process.platform, arch: process.arch, supportingSourcesSHA256: Object.fromEntries(['aiCheckpoint.ts','aiConversations.ts','aiTasks.ts','aiDataDisclosure.ts'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join('src/main',name))).digest('hex')])), mainSourceSHA256: crypto.createHash('sha256').update(mainSource).digest('hex') };
    if (!baseline && testCase === 'private-denied') {
      dialog.showMessageBox = async () => ({ response: 1 });
      const retryDone = new Promise((resolve) => ipcMain.on('fixture-event', (_event, event) => { if (event.type === 'done') resolve(); }));
      await evaluate('fixture.resume()');
      await retryDone;
      assert.equal(bodies.length, 1);
      assert(bodies[0].includes(sentinel));
      assert.equal((await evaluate('fixture.status()')).resumable, false);
      report.explicitRetry = { requests: 1, privateFactDisclosed: true, resumable: false };
    }
    if (control) {
      report.externalPaused = (await evaluate('fixture.mcp()')).paused;
      assert.equal(report.externalPaused, !baseline);
      assert.equal(fs.existsSync(path.join(root, 'ai-external-paused')), !baseline);
      if (testCase === 'pause-task') {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const scheduled = (await evaluate("fixture.tasks('list')")).find((task) => task.id === dueTask);
        report.scheduledRunsAfterManualTask = scheduled.runs.length;
        assert.equal(scheduled.runs.length, baseline ? 1 : 0);
        assert.equal(bodies.length, baseline ? 2 : 1);
      }
      await evaluate('fixture.resumeExternal()');
      assert.equal((await evaluate('fixture.mcp()')).paused, false);
      assert.equal(fs.existsSync(path.join(root, 'ai-external-paused')), false);
      report.explicitExternalResume = true;
    }
    console.log('RESULT ' + JSON.stringify(report));
    await dispose(); host.destroy(); server.close(); fs.rmSync(root, { recursive: true, force: true }); app.exit(0);
  })().catch(async (error) => { console.error(error); try { await dispose?.(); } catch {} host?.destroy(); server?.close(); app.exit(1); });
}

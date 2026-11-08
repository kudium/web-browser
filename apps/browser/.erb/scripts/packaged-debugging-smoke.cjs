/* Actual packaged CLI transports; local startup page proves normal execution. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const plist = require('plist');
const asar = require('@electron/asar');
const phase = process.argv[2];
const appPath = path.resolve(process.argv[3] || '');
assert(['before', 'after'].includes(phase));
assert(appPath.endsWith('.app') && fs.existsSync(appPath));
assert.equal(process.platform, 'darwin');
const root = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-debugging-'));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getJSON = async (url) => { try { return await (await fetch(url, { signal: AbortSignal.timeout(200) })).json(); } catch { return undefined; } };
const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const evaluate = async (url, expression) => {
  const socket = new WebSocket(url);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP response timed out')); }, 3000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })));
    socket.addEventListener('error', (error) => { clearTimeout(timer); reject(error); });
    socket.addEventListener('message', (event) => { const value = JSON.parse(event.data); if (value.id === 1) { clearTimeout(timer); value.error || value.result.exceptionDetails ? reject(new Error(JSON.stringify(value))) : resolve(value.result.result.value); } });
  });
  socket.close(); return result;
};
let active;
const samples = [];
async function run() {
  const info = plist.parse(fs.readFileSync(path.join(appPath, 'Contents/Info.plist'), 'utf8'));
  const executable = path.join(appPath, 'Contents/MacOS', info.CFBundleExecutable);
  const archive = path.join(appPath, 'Contents/Resources/app.asar');
  if (phase === 'after') assert.equal(hash(asar.extractFile(archive, 'dist/main/main.js')), hash(fs.readFileSync(path.join(root, 'release/app/dist/main/main.js'))));
  for (const mode of ['randomPort', 'fixedPort', 'pipe']) {
    const directory = path.join(temporary, mode); fs.mkdirSync(directory);
    let pageRequested = false; let pageExecuted = false; let bridge;
    const server = http.createServer((request, response) => {
      if (request.url.startsWith('/ready')) { pageExecuted = true; bridge = new URL(request.url, 'http://fixture').searchParams.get('bridge'); response.end('ok'); return; }
      pageRequested = true; response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Debugging boundary fixture</title><h1>Local fixture</h1><script>fetch("/ready?bridge="+typeof window.electron)</script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/fixture`;
    fs.writeFileSync(path.join(directory, 'browser-preferences.json'), JSON.stringify({ spellcheck: false, advanced: { startupMode: 'pages', startupPages: [url] } }));
    const fixedPort = mode === 'fixedPort' ? await reservePort() : undefined;
    const flags = mode === 'pipe' ? ['--remote-debugging-pipe'] : [`--remote-debugging-port=${fixedPort ?? 0}`];
    let output = ''; let pipeOutput = ''; let debugServerEverObserved = false; let debugPort;
    const started = performance.now();
    const child = spawn(executable, [`--user-data-dir=${directory}`, ...flags, '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*'], { env: { ...process.env, NODE_OPTIONS: '', ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
    active = child;
    const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
    child.stdio[3].on('error', () => {});
    child.stdio[4].on('data', (chunk) => { pipeOutput = (pipeOutput + chunk).slice(-12000); });
    let injectedPreference = false;
    try {
      const deadline = performance.now() + 10000;
      let pageReadyAt;
      while (performance.now() < deadline) {
        assert.equal(child.exitCode, null, `Application exited before observations: ${output.slice(-500)}`);
        if (pageExecuted && pageReadyAt === undefined) pageReadyAt = performance.now();
        if (mode === 'pipe') {
          if (!child.stdio[3].destroyed) child.stdio[3].write(JSON.stringify({ id: 1, method: 'Browser.getVersion' }) + '\0');
          debugServerEverObserved ||= /"id"\s*:\s*1/.test(pipeOutput);
        } else {
          if (fixedPort) debugPort = fixedPort;
          else { try { debugPort = Number(fs.readFileSync(path.join(directory, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} }
          if (debugPort) {
            const version = await getJSON(`http://127.0.0.1:${debugPort}/json/version`);
            debugServerEverObserved ||= !!version?.webSocketDebuggerUrl;
            if (version && phase === 'before' && pageExecuted && !injectedPreference) {
              const targets = await getJSON(`http://127.0.0.1:${debugPort}/json/list`);
              const target = targets?.find((item) => item.type === 'page' && item.url.startsWith('file:') && item.url.includes('index.html'));
              if (target) {
                const ready = await evaluate(target.webSocketDebuggerUrl, "typeof window.electron?.browser?.preferences==='function'");
                if (ready) { await evaluate(target.webSocketDebuggerUrl, "window.electron.browser.preferences('update',{permissions:'block'}).then(value=>value.permissions)"); injectedPreference = true; }
              }
            }
          }
        }
        if (pageReadyAt !== undefined && performance.now() - pageReadyAt >= 2000) break;
        await wait(50);
      }
      assert(pageRequested && pageExecuted, `Normal startup page must execute: ${output.slice(-600)}`);
      assert.equal(bridge, 'undefined');
      assert.equal(debugServerEverObserved, phase === 'before', `${mode}: ${output.slice(-1000)} ${pipeOutput.slice(-400)}`);
      if (phase === 'before' && mode !== 'pipe') {
        assert(injectedPreference); assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'browser-preferences.json'))).permissions, 'block');
      }
      if (phase === 'after') { assert(!fs.existsSync(path.join(directory, 'DevToolsActivePort'))); assert(!/DevTools listening on/.test(output)); }
      child.kill('SIGTERM'); const exit = await closed;
      samples.push({ mode, pageRequested, pageExecuted, websiteBridge: bridge, debugServerEverObserved, injectedPreference, devToolsPortFile: fs.existsSync(path.join(directory, 'DevToolsActivePort')), pipeResponseObserved: /"id"\s*:\s*1/.test(pipeOutput), observationMs: performance.now() - started, exit, logSha256: hash(output + pipeOutput) });
      console.log(`${phase}/${mode}: page executed; debug transport=${debugServerEverObserved}`);
    } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await closed; } active = undefined; server.close(); }
  }
  const output = path.join(root, 'docs/benchmarks/packaged-debugging.json');
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
  if (report[phase]) (report.previousRuns ??= []).push({ phase, ...report[phase] });
  report[phase] = { recordedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, probeSha256: hash(fs.readFileSync(__filename)), appAsarSha256: hash(fs.readFileSync(archive)), mainBundleSha256: hash(asar.extractFile(archive, 'dist/main/main.js')), samples, method: 'Actual packaged executable, disposable profiles and local startup page. Poll debugging transports through at least two seconds after page execution; require live process and website bridge isolation. Before port transports change preferences through privileged renderer CDP; after must expose no endpoint or debug-port file. No signing/platform/performance claim.' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
const timeout = setTimeout(() => { active?.kill('SIGKILL'); console.error('Packaged debugging test deadline exceeded'); process.exitCode = 1; }, 45000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(timeout); fs.rmSync(temporary, { recursive: true, force: true }); });

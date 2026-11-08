/* Production bundles, fresh Electron processes, disposable prepared profiles. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const summary = (values) => {
  values = values.filter(Number.isFinite);
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], samples: values.length };
};

async function child(mode, config) {
  const { app, BrowserWindow, WebContentsView, ipcMain, session, nativeTheme, webContents } = require('electron');
  for (const [name, directory] of Object.entries({ userData: config.userData, temp: path.join(config.userData, 'tmp'), downloads: path.join(config.userData, 'downloads'), logs: path.join(config.userData, 'logs') })) {
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  const timeout = setTimeout(() => { console.error('Profile child timed out'); app.exit(1); }, 90000);
  if (mode === '--seed') {
    await app.whenReady();
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadFile(path.join(config.stage, 'dist/renderer/seed.html'));
    await win.webContents.executeJavaScript(`localStorage.clear();localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(config.tabs))});localStorage.setItem('user_last_app_id','synthetic-0');localStorage.setItem('touchbox-active-space','default');localStorage.setItem('touchbox-appearance','light');localStorage.setItem('touchbox-spaces',${JSON.stringify(JSON.stringify([{id:'default',name:'Personal',color:'iris',folders:[],selectedAppId:'synthetic-0'}]))});undefined`);
    session.defaultSession.flushStorageData();
    win.destroy();
    clearTimeout(timeout);
    app.quit();
    return;
  }
  let win;
  const warnings = [];
  process.on('warning', (warning) => {
    warnings.push({ name: warning.name, message: warning.message, stack: warning.stack });
  });
  let phase = 'startup';
  const counts = {};
  const count = () => counts[phase] ??= { preferenceReads: 0, jsonReads: 0, browserSync: 0, recordsSent: 0, browserState: 0 };
  const readFile = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'string' && file.startsWith(config.userData) && file.endsWith('.json')) {
      count().jsonReads += 1;
      if (file === path.join(config.userData, 'browser-preferences.json')) count().preferenceReads += 1;
    }
    return readFile.call(this, file, ...args);
  };
  const nativeMaterials = [];
  app.on('browser-window-created', (_event, window) => {
    if (win) return;
    win = window;
    const setMaterial = win.setVibrancy.bind(win);
    win.setVibrancy = (value, ...args) => { nativeMaterials.push(value); return setMaterial(value, ...args); };
    const send = win.webContents.send.bind(win.webContents);
    win.webContents.send = (channel, ...args) => {
      if (channel === 'browser-state') count().browserState += 1;
      return send(channel, ...args);
    };
  });
  ipcMain.on('browser-sync', (event, layout) => {
    if (win && event.sender === win.webContents) {
      count().browserSync += 1;
      count().recordsSent += layout.apps?.length || 0;
    }
  });
  const start = performance.now();
  require(path.join(config.stage, 'dist/main/main.js'));
  const until = async (predicate, label, milliseconds = 15000) => {
    const deadline = performance.now() + milliseconds;
    while (performance.now() < deadline) {
      if (await predicate()) return;
      await wait(5);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  const websiteViews = () => win.contentView.children.filter((view) => view instanceof WebContentsView && view.webContents.session !== win.webContents.session && !view.webContents.isDestroyed());
  const listenerCounts = () => ({ appWebContentsCreated: app.listenerCount('web-contents-created'), windowClosed: win.listenerCount('closed'), windowFocus: win.listenerCount('focus') });
  const contentsInventory = () => webContents.getAllWebContents().filter((contents) => !contents.isDestroyed()).map((contents) => ({ id: contents.id, pid: contents.getOSProcessId(), type: contents.getType(), url: contents.getURL() }));
  const viewFor = (index) => websiteViews().find((view) => view.webContents.getURL() === config.tabs[index].url);
  const ready = (index) => {
    const view = viewFor(index);
    return !!view && view.getVisible() && !view.webContents.isLoadingMainFrame();
  };
  await until(() => win && !win.webContents.isLoadingMainFrame(), 'app document');
  await until(() => evaluate(`document.querySelectorAll('.sidebar-app').length===${config.tabs.length} && !!document.querySelector('.workspace')`), 'saved layout');
  const wrapperToShellReadyMs = performance.now() - start;
  console.log('TOUCHBOX_PROFILE_EVENT shell');
  await until(() => ready(0), 'initial website');
  await until(() => evaluate(`document.querySelector('#browser-content')?.getAttribute('aria-busy')==='false'`), 'initial page state');
  const wrapperToFirstPageReadyMs = performance.now() - start;
  console.log('TOUCHBOX_PROFILE_EVENT page');
  assert.equal(websiteViews().length, 1, 'Unvisited tabs must remain metadata');
  assert.equal(await evaluate(`document.querySelector('.workspace').getAttribute('data-glass')`), String(config.glass));
  const metrics = () => app.getAppMetrics().map((item) => ({
    pid: item.pid, created: item.creationTime, type: item.type, name: item.name,
    memoryKB: item.memory.workingSetSize, cpuPercent: item.cpu.percentCPUUsage,
    cumulativeCPUSeconds: item.cpu.cumulativeCPUUsage, wakeupsPerSecond: item.cpu.idleWakeupsPerSecond,
  }));
  const idle = async (label) => {
    phase = label;
    await wait(700);
    let previous = metrics();
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const at = performance.now();
      await wait(1000);
      const processes = metrics();
      const elapsedMs = performance.now() - at;
      const cpuSeconds = processes.reduce((sum, process) => {
        const old = previous.find((entry) => entry.pid === process.pid && entry.created === process.created);
        return sum + (old && Number.isFinite(process.cumulativeCPUSeconds) && Number.isFinite(old.cumulativeCPUSeconds) ? Math.max(0, process.cumulativeCPUSeconds - old.cumulativeCPUSeconds) : 0);
      }, 0);
      samples.push({ elapsedMs, summedWorkingSetKB: processes.reduce((sum, process) => sum + process.memoryKB, 0), summedCPUPercent: processes.reduce((sum, process) => sum + process.cpuPercent, 0), gpuCPUPercent: processes.filter((process) => process.type === 'GPU').reduce((sum, process) => sum + process.cpuPercent, 0), cpuSeconds, processes, liveViews: websiteViews().length });
      previous = processes;
    }
    return samples;
  };
  const lazyIdle = await idle('lazyIdle');
  const lazyListeners = listenerCounts();
  async function select(index) {
    const at = performance.now();
    await evaluate(`document.querySelector('[data-tab-motion="sidebar-synthetic-${index}"] .sidebar-app').click();undefined`);
    await until(() => ready(index), `native view ${index}`);
    const selectionToNativeReadyMs = performance.now() - at;
    await until(() => evaluate(`document.querySelector('#browser-content')?.getAttribute('aria-labelledby')==='page-tab-synthetic-${index}' && document.querySelector('#browser-content')?.getAttribute('aria-busy')==='false'`), `selected state ${index}`);
    const presented = await evaluate('new Promise(resolve=>{let done=false;const timeout=setTimeout(()=>{if(!done){done=true;resolve(false)}},1000);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!done){done=true;clearTimeout(timeout);resolve(true)}}))})');
    return { index, selectionToNativeReadyMs, selectionToDoubleRafMs: presented ? performance.now() - at : null, presentationObserved: presented };
  }
  phase = 'coldVisit';
  const coldVisits = [];
  for (let index = 1; index < config.tabs.length; index += 1) coldVisits.push(await select(index));
  assert.equal(websiteViews().length, config.tabs.length, 'All visited tabs must be live before growth metrics');
  phase = 'warmSwitch';
  const warmSwitches = [];
  for (let index = 0; index < 30; index += 1) warmSwitches.push(await select(index % config.tabs.length));
  const visitedIdle = await idle('visitedIdle');
  const visitedListeners = listenerCounts();
  const visitedContents = contentsInventory();
  phase = 'close';
  // Trusted renderer writes the same layout storage/event used by AppManager.
  await evaluate(`localStorage.setItem('user_apps','[]');window.electron.ipcRenderer.sendMessage('ipc-event-bus',[{app_list_update:undefined}]);undefined`);
  await until(() => websiteViews().length === 0, 'native view cleanup');
  await until(() => evaluate(`document.querySelectorAll('.sidebar-app').length===0`), 'empty layout');
  const closedIdle = await idle('closedIdle');
  const closedListeners = listenerCounts();
  const closedContents = contentsInventory();
  const result = {
    wrapperToShellReadyMs, wrapperToFirstPageReadyMs, coldVisits, warmSwitches,
    warmSelectionKind: config.tabs.length === 1 ? 'same-tab reselect control; not a tab switch' : 'switch between visited independent login groups',
    lazyIdle, visitedIdle, closedIdle, counts, nativeMaterials, warnings,
    listeners: { lazy: lazyListeners, visited: visitedListeners, tabsClosed: closedListeners },
    visitedContents, closedContents, reducedTransparency: nativeTheme.prefersReducedTransparency,
    highContrast: nativeTheme.shouldUseHighContrastColors, runtime: process.versions,
  };
  fs.readFileSync = readFile;
  win.close();
  await until(() => BrowserWindow.getAllWindows().length === 0, 'window destruction');
  await wait(100);
  result.afterWindowClose = { appWebContentsCreated: app.listenerCount('web-contents-created'), contents: contentsInventory() };
  fs.writeFileSync(config.result, `${JSON.stringify(result, null, 2)}\n`);
  clearTimeout(timeout);
  app.quit();
}

async function run() {
  const phase = process.argv[2] || 'before';
  assert(['before', 'after', 'confirmation', 'pilot'].includes(phase));
  const repetitions = process.argv.includes('--quick') ? 1 : 5;
  const counts = process.argv.includes('--quick') ? [10] : [1, 10, 50];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-workspace-profile-'));
  const stage = path.join(temporary, 'app');
  fs.mkdirSync(stage);
  fs.cpSync(path.join(root, 'release/app/dist'), path.join(stage, 'dist'), { recursive: true });
  // Electron runs unpackaged; reproduce its expected preload path with the
  // unchanged production preload, without overriding app.isPackaged.
  fs.mkdirSync(path.join(stage, '.erb/dll'), { recursive: true });
  fs.copyFileSync(path.join(stage, 'dist/main/preload.js'), path.join(stage, '.erb/dll/preload.js'));
  fs.symlinkSync(path.join(root, 'release/app/node_modules'), path.join(stage, 'node_modules'), 'dir');
  fs.symlinkSync(path.join(root, 'assets'), path.join(stage, 'assets'), 'dir');
  fs.writeFileSync(path.join(stage, 'dist/renderer/seed.html'), '<!doctype html><title>Profile seed</title>');
  const server = require('node:http').createServer((request, response) => {
    const match = /^\/page\/(\d+)$/.exec(request.url);
    if (!match) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Synthetic ${match[1]}</title><style>body{font:16px system-ui;background:#f6f8fc;padding:30px}.card{background:white;padding:12px;margin:8px;border-radius:10px}</style><h1>Synthetic ${match[1]}</h1>${Array.from({length:200},(_,index)=>`<div class=card>Fixture row ${index}: local static workspace data</div>`).join('')}`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const executable = require('electron');
  const samples = [];
  const output = path.join(root, 'docs/benchmarks/workspace-performance.json');
  const bundledFiles = ['main/main.js', 'main/preload.js', 'renderer/renderer.js', 'renderer/style.css', 'renderer/index.html'];
  const identity = Object.fromEntries(bundledFiles.map((file) => [file, hash(path.join(stage, 'dist', file))]));
  const sourceIdentity = Object.fromEntries(['src/main/main.ts', 'src/main/preferences.ts', 'src/main/electronBrowser.ts', 'src/utils/AppManager.ts', 'src/utils/hooks/useAppList.ts'].map((file) => [file, hash(path.join(root, file))]));
  const execute = (mode, configFile) => new Promise((resolve, reject) => {
    const started = performance.now();
    const processHandle = spawn(executable, [__filename, mode, configFile], { cwd: root, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let buffered = '';
    const times = {};
    processHandle.stdout.on('data', (chunk) => {
      log = (log + chunk).slice(-20000);
      buffered += chunk;
      let end;
      while ((end = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
        if (line.startsWith('TOUCHBOX_PROFILE_EVENT ')) times[line.slice(23).trim()] = performance.now() - started;
      }
    });
    processHandle.stderr.on('data', (chunk) => { log = (log + chunk).slice(-20000); });
    const deadline = setTimeout(() => { processHandle.kill('SIGKILL'); }, 100000);
    processHandle.on('error', reject);
    processHandle.on('close', (code, signal) => {
      clearTimeout(deadline);
      if (code !== 0) reject(new Error(`Profile ${mode} exited ${code}/${signal}: ${log}`));
      else resolve({ times, log });
    });
  });
  let savedOnce = false;
  const save = () => {
    const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
    if (!savedOnce && report[phase]) (report.previousRuns ??= []).push(report[phase]);
    savedOnce = true;
    report[phase] = {
      recordedAt: new Date().toISOString(), repetitions, counts, complete: samples.length === repetitions * counts.length * 2,
      platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model,
      method: 'Actual staged production main/renderer, unpackaged Electron. Fresh prepared userData per run, seeded in an excluded process. Static 200-row local pages, independent login profiles, 30 warm selections, 3 one-second idle intervals at lazy/all-visited/closed stages. Native-ready polling <=5ms, selected UI state then double requestAnimationFrame. Summed working sets double-count shared memory; GPU metric is GPU-process CPU, not hardware utilization. One-tab warm selections are reselect controls.',
      probeSha256: hash(__filename), bundleHashes: identity, sourceHashes: sourceIdentity, samples,
      grouped: counts.flatMap((count) => [true, false].map((glass) => {
        const runs = samples.filter((sample) => sample.count === count && sample.glass === glass);
        return { count, glass, runs: runs.length,
          launchToShellReadyMs: summary(runs.map((run) => run.launchToShellReadyMs)),
          launchToFirstPageReadyMs: summary(runs.map((run) => run.launchToFirstPageReadyMs)),
          coldNativeReadyMs: summary(runs.flatMap((run) => run.coldVisits.map((visit) => visit.selectionToNativeReadyMs))),
          warmNativeReadyMs: summary(runs.flatMap((run) => run.warmSwitches.map((visit) => visit.selectionToNativeReadyMs))),
          warmDoubleRafMs: summary(runs.flatMap((run) => run.warmSwitches.map((visit) => visit.selectionToDoubleRafMs))),
          visitedWorkingSetKB: summary(runs.flatMap((run) => run.visitedIdle.map((idle) => idle.summedWorkingSetKB))),
          lazyWorkingSetKB: summary(runs.flatMap((run) => run.lazyIdle.map((idle) => idle.summedWorkingSetKB))),
          closedWorkingSetKB: summary(runs.flatMap((run) => run.closedIdle.map((idle) => idle.summedWorkingSetKB))),
          visitedCPUPercent: summary(runs.flatMap((run) => run.visitedIdle.map((idle) => idle.summedCPUPercent))),
          warmPreferenceReads: runs.map((run) => run.counts.warmSwitch?.preferenceReads || 0),
        };
      })),
    };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  };
  try {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      for (const count of counts) {
        for (const glass of repetition % 2 === 0 ? [true, false] : [false, true]) {
          const userData = path.join(temporary, `profile-${repetition}-${count}-${glass}`);
          fs.mkdirSync(userData);
          fs.writeFileSync(path.join(userData, 'browser-preferences.json'), JSON.stringify({ translucentChrome: glass, spellcheck: false, discardInactiveTabs: false }));
          const tabs = Array.from({ length: count }, (_, index) => ({ id: `synthetic-${index}`, name: `Synthetic ${index}`, sessionName: `Synthetic ${index}`, sessionSlug: `synthetic-${index}`, sessionId: `synthetic-${index}`, spaceId: 'default', pinned: true, icon: '', url: `http://127.0.0.1:${server.address().port}/page/${index}` }));
          const result = path.join(userData, 'result.json');
          const configFile = path.join(userData, 'config.json');
          fs.writeFileSync(configFile, JSON.stringify({ stage, userData, tabs, glass, result }));
          await execute('--seed', configFile);
          const run = await execute('--run', configFile);
          assert(Number.isFinite(run.times.shell) && Number.isFinite(run.times.page), 'Missing launch events');
          samples.push({ count, glass, repetition, launchToShellReadyMs: run.times.shell, launchToFirstPageReadyMs: run.times.page, ...JSON.parse(fs.readFileSync(result, 'utf8')), log: run.log });
          save();
          console.log(`${phase}: ${count} tabs, glass=${glass}, run ${repetition + 1}/${repetitions}: startup=${run.times.page.toFixed(1)}ms, warm pref reads=${samples.at(-1).counts.warmSwitch?.preferenceReads || 0}`);
        }
      }
    }
  } finally {
    server.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.versions.electron) {
  child(process.argv[2], JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))
    .catch((error) => { console.error(error); require('electron').app.exit(1); });
} else run().catch((error) => { console.error(error); process.exitCode = 1; });

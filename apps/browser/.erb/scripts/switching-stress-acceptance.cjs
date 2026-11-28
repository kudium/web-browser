const { WebContentsView } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ main, evaluate, out, url }) => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, limit = 10000) => {
    const deadline = performance.now() + limit;
    while (performance.now() < deadline) {
      const result = await predicate();
      if (result) return result;
      await wait(10);
    }
    throw new Error(`Switching stress deadline (${limit} ms)`);
  };
  const spaces = Array.from({ length: 10 }, (_, index) => ({
    id: index ? `stress-${index}` : 'default', name: `Space ${index}`,
    color: 'iris', folders: [], selectedAppId: `s${index}-g0-t0`,
  }));
  const tabs = spaces.flatMap((space, s) => Array.from({ length: 20 }, (_, g) =>
    Array.from({ length: 4 }, (_, t) => ({
      id: `s${s}-g${g}-t${t}`, spaceId: space.id, sessionId: `stress-${s}-${g}`,
      sessionName: `Group ${s} ${g}`, sessionNameCustom: true, name: 'Home',
      url: `${url}/stress-${s}-${g}-${t}`, icon: '', pinned: true, groupDisplay: 'stack',
    })))).flat(2);
  const special = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `cold-${i}`, url: `${url}/connection-benchmark?cold=${i}`, kind: 'cold' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `heavy-${i}`, url: `${url}/heavy-switching?tab=${i}`, kind: 'heavy' })),
    { id: 'remote-mdn', url: 'https://developer.mozilla.org/en-US/', kind: 'remote' },
    { id: 'remote-wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page', kind: 'remote' },
    { id: 'remote-github', url: 'https://github.com/', kind: 'remote' },
  ];
  tabs.push(...special.map(item => ({ ...item, spaceId: 'default', sessionId: item.id,
    sessionName: item.id, sessionNameCustom: true, name: item.id, icon: '', pinned: true, groupDisplay: 'stack' })));
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify(spaces))});sessionStorage.clear();undefined`);
  await main.reload();
  await until(() => evaluate(main, `!!document.querySelector('[data-footer-space="stress-9"]')`));
  await evaluate(main, `window.stressLongTasks=[];window.stressFrames=[];new PerformanceObserver(list=>window.stressLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false});let last=performance.now();function measureFrame(now){window.stressFrames.push(now-last);last=now;requestAnimationFrame(measureFrame)}requestAnimationFrame(measureFrame);undefined`);
  const group = name => `document.querySelector('.sidebar-apps button.sidebar-app[aria-label="${name}"]')`;
  const viewFor = id => {
    const target = tabs.find(tab => tab.id === id);
    return main.contentView.children.find(view => view instanceof WebContentsView &&
      !view.webContents.isDestroyed() && view.webContents.getURL().split('#')[0] === target.url);
  };
  const samples = [];
  const select = async (expression, id, kind, deadline = 10000) => {
    const start = performance.now();
    const chromeMs = await evaluate(main, `new Promise((resolve,reject)=>{const start=performance.now();const button=${expression};if(!button){reject(new Error('Missing switch target'));return;}button.click();function ready(){if(document.querySelector('[data-tab-motion="horizontal-main-${id}"]')?.classList.contains('active'))resolve(performance.now()-start);else if(performance.now()-start>10000)reject(new Error('Chrome selection deadline'));else requestAnimationFrame(ready);}requestAnimationFrame(ready);})`);
    const chromeRoundTripMs = performance.now() - start;
    let nativeMs, error;
    try { await until(() => viewFor(id)?.getVisible(), deadline); nativeMs = performance.now() - start; }
    catch (failure) { error = String(failure); console.error('STRESS FAILURE',id,main.contentView.children.filter(view=>view instanceof WebContentsView).map(view=>({url:view.webContents.getURL(),visible:view.getVisible(),loading:view.webContents.isLoadingMainFrame()}))); }
    samples.push({ kind, id, chromeMs, chromeRoundTripMs, nativeMs, error });
    fs.writeFileSync(path.join(out,'switching-stress-partial.json'),JSON.stringify(samples,null,2));
    if (kind !== 'remote') assert(!error, `${kind} page did not become visible: ${id}`);
    return viewFor(id);
  };
  // Cold first use includes a controlled 700 ms response delay.
  for (const item of special.filter(item => item.kind === 'cold')) await select(group(item.id), item.id, 'cold');
  // Each heavy page has 8,000 DOM cards and a 15 ms JS task every 50 ms.
  for (const item of special.filter(item => item.kind === 'heavy')) {
    const view = await select(group(item.id), item.id, 'heavy-cold');
    await until(() => view.webContents.executeJavaScript('window.fixtureReady===true'));
    await view.webContents.executeJavaScript(`document.querySelector('#draft').value='draft:${item.id}'`);
  }
  console.log('STRESS: cold and heavy pages loaded');
  const originals = new Map(special.filter(item => item.kind === 'heavy').map(item => [item.id, viewFor(item.id).webContents.id]));
  for (let index = 0; index < 12; index++) {
    const item = special.filter(item => item.kind === 'heavy')[index % 3];
    const view = await select(group(item.id), item.id, 'heavy-warm');
    assert.equal(view.webContents.id, originals.get(item.id));
    assert.equal(await view.webContents.executeJavaScript(`document.querySelector('#draft').value`), `draft:${item.id}`);
  }
  console.log('STRESS: heavy retained-page switches completed');
  main.webContents.debugger.attach('1.3');
  await main.webContents.debugger.sendCommand('Profiler.enable');
  await main.webContents.debugger.sendCommand('Profiler.start');
  for (let index = 0; index < 20; index++) {
    const s = index % 10;
    const space = spaces[s];
    await select(`document.querySelector('[data-footer-space="${space.id}"]')`, index < 10 ? (s ? `s${s}-g0-t0` : 'heavy-2') : `s${s}-g19-t0`, 'large-space');
    await select(group(`Group ${s} ${index < 10 ? 19 : 0}`), `s${s}-g${index < 10 ? 19 : 0}-t0`, index < 10 ? 'large-group-cold' : 'large-group-warm');
  }
  const { profile } = await main.webContents.debugger.sendCommand('Profiler.stop');
  fs.writeFileSync(path.join(out, 'switching-renderer.cpuprofile'), JSON.stringify(profile));
  main.webContents.debugger.detach();
  await select(`document.querySelector('[data-footer-space="default"]')`, 's0-g0-t0', 'return');
  for (const item of special.filter(item => item.kind === 'remote')) await select(group(item.id), item.id, 'remote', 15000);
  const summary = {};
  for (const kind of new Set(samples.map(sample => sample.kind))) {
    const entries = samples.filter(sample => sample.kind === kind);
    const stats = key => {
      const values = entries.map(sample => sample[key]).filter(value => Number.isFinite(value)).sort((a,b)=>a-b);
      return values.length ? { medianMs: values[Math.floor(values.length/2)], p95Ms: values[Math.min(values.length-1,Math.floor(values.length*.95))], maxMs: values.at(-1) } : null;
    };
    summary[kind] = { count: entries.length, chrome: stats('chromeMs'), native: stats('nativeMs'), failures: entries.filter(sample=>sample.error).length };
  }
  const telemetry = await evaluate(main, `({longTasks:window.stressLongTasks,frameGaps:window.stressFrames.filter(value=>value>50)})`);
  const report = { savedTabs: tabs.length, spaces: spaces.length, groups: 210, summary, samples, telemetry,
    limitations: ['DOM clicks and RAF observation, not physical OS input latency.', 'Native visibility is not first-painted content.', 'Heavy pages are controlled fixtures; live sites can fail due to network or challenges.', 'One Mac and a disposable profile.'] };
  fs.writeFileSync(path.join(out, 'switching-stress.json'), JSON.stringify(report, null, 2));
  console.log('PASS: switching stress correctness. ' + JSON.stringify({ savedTabs: tabs.length, summary, longTasks: telemetry.longTasks.length, evidence: out }));
};

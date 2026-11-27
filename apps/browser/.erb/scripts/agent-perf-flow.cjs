// Timed MCP tool calls against the fixture site. Shared by the Electron runner
// (fresh engine) and the --existing mode (a running Kudium Browser).
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const budgets = require('../../src/__tests__/perf/budgets.json');

function decode(result) {
  if (result.isError)
    throw new Error(result.content.map((x) => x.text || '').join(''));
  const image = result.content.find((x) => x.type === 'image');
  if (image) return image;
  const { text } = result.content.find((x) => x.type === 'text');
  // encoding:lines returns semantic-v1 / TOON text rather than JSON.
  return /^[[{]/.test(text) ? JSON.parse(text) : text;
}

async function timed(client, name, args) {
  const start = performance.now();
  const result = await client.callTool({ name, arguments: args });
  const ms = performance.now() - start;
  return { ms, value: decode(result), bytes: Buffer.byteLength(JSON.stringify(result)) };
}

const find = (snapshot, label, role) =>
  snapshot.elements.find((x) => x.label === label && (!role || x.role === role)) ||
  (() => {
    throw new Error(`No element labelled ${label}`);
  })();

/** Runs the metrics and returns { metrics, calls }. tabId is the fixture tab. */
async function measure(client, { origin, tabId, rounds = 3, probe = {} }) {
  const t = (name, args = {}) => timed(client, name, { tabId, ...args });
  const metrics = {};
  const calls = [];
  const note = (key, sample) => {
    calls.push({ key, ...sample, value: undefined });
    return sample;
  };
  const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

  const first = await timed(client, 'list_tabs', {});
  metrics.firstCallMs = first.ms;
  metrics.listTabsBytes = first.bytes;
  note('first list_tabs', first);

  await t('navigate', { url: `${origin}/dashboard.html` });
  const reads = [];
  for (let i = 0; i < rounds; i += 1) {
    const read = await t('read_page', { format: 'compact', encoding: 'lines' });
    reads.push(read);
    note('read_page compact lines', read);
  }
  metrics.readPageMs = median(reads.map((x) => x.ms));
  metrics.readPageBytes = median(reads.map((x) => x.bytes));

  const plain = [];
  const attachesBefore = probe.attaches ? probe.attaches() : undefined;
  for (let i = 0; i < rounds; i += 1) {
    const nav = await t('navigate', { url: `${origin}/${i % 2 ? 'dashboard' : 'settings'}.html` });
    plain.push(nav);
    note('navigate plain', nav);
  }
  metrics.navigatePlainMs = median(plain.map((x) => x.ms));
  // Debugger attaches during plain navigation (the Electron runner counts them).
  if (attachesBefore !== undefined) metrics.navigateProtocolAttaches = probe.attaches() - attachesBefore;

  // The spec budget is for load; networkidle adds its 500 ms quiet window and is informational.
  const spa = [];
  const idle = [];
  for (let i = 0; i < rounds; i += 1) {
    await t('navigate', { url: `${origin}/list.html` });
    const nav = await t('navigate', { url: `${origin}/spa/#/` });
    spa.push(nav);
    note('navigate spa load', nav);
    await t('navigate', { url: `${origin}/list.html` });
    const settled = await t('navigate', { url: `${origin}/spa/#/`, waitUntil: 'networkidle' });
    idle.push(settled);
    note('navigate spa networkidle', settled);
  }
  metrics.navigateSpaLoadMs = median(spa.map((x) => x.ms));
  metrics.navigateSpaNetworkIdleMs = median(idle.map((x) => x.ms));

  const shots = [];
  for (let i = 0; i < rounds; i += 1) {
    const shot = await t('screenshot');
    shots.push(shot);
    note('screenshot default', { ms: shot.ms, bytes: Buffer.byteLength(shot.value.data || '', 'base64') });
  }
  metrics.screenshotMs = median(shots.map((x) => x.ms));
  metrics.screenshotBytes = median(shots.map((x) => Buffer.byteLength(x.value.data || '', 'base64')));
  metrics.screenshotMimeType = shots[0].value.mimeType;

  // Login → settings → verify as individual tool calls (the pre-script baseline).
  const flowStart = performance.now();
  let steps = 0;
  const step = async (name, args) => {
    steps += 1;
    const sample = await t(name, args);
    note(`flow ${steps} ${name}`, sample);
    return sample.value;
  };
  await step('navigate', { url: `${origin}/login.html` });
  let page = await step('read_page', { format: 'compact' });
  await step('type', { elementId: find(page, 'Username').id, snapshotId: page.snapshotId, text: 'benchmark' });
  page = await step('read_page', { format: 'compact' });
  await step('click', { elementId: find(page, 'Sign in').id, snapshotId: page.snapshotId });
  page = await step('wait_until', { url: `${origin}/dashboard.html`, format: 'compact' });
  await step('click', { elementId: find(page, 'Settings').id, snapshotId: page.snapshotId });
  page = await step('wait_until', { url: `${origin}/settings.html`, format: 'compact' });
  await step('select_options', { elementId: find(page, 'Report month').id, snapshotId: page.snapshotId, values: ['October'] });
  page = await step('read_page', { format: 'compact' });
  await step('click', { elementId: find(page, 'Save').id, snapshotId: page.snapshotId });
  page = await step('read_page', { format: 'compact', maxText: 2000 });
  if (!String(page.text).includes('Saved October'))
    throw new Error('Flow did not verify: settings page does not show "Saved October".');
  metrics.loginSettingsFlowMs = performance.now() - flowStart;
  metrics.loginSettingsFlowCalls = steps;

  // The same flow as one act call. Step lists cannot read earlier outputs, so
  // element IDs come from a discovery pass; they are stable for a fixed page.
  // select_options needs a snapshotId, so act saves the default month.
  await t('navigate', { url: `${origin}/login.html` });
  const loginPage = await t('read_page', { format: 'compact' });
  const usernameId = find(loginPage.value, 'Username').id;
  const signInId = find(loginPage.value, 'Sign in').id;
  await t('navigate', { url: `${origin}/dashboard.html` });
  const settingsId = find((await t('read_page', { format: 'compact' })).value, 'Settings').id;
  await t('navigate', { url: `${origin}/settings.html` });
  const saveId = find((await t('read_page', { format: 'compact' })).value, 'Save').id;
  const actSteps = [
    { tool: 'navigate', args: { tabId, url: `${origin}/login.html` } },
    { tool: 'read_page', args: { tabId, format: 'compact' } },
    { tool: 'type', args: { tabId, elementId: usernameId, text: 'benchmark' } },
    { tool: 'read_page', args: { tabId, format: 'compact' } },
    { tool: 'click', args: { tabId, elementId: signInId } },
    { tool: 'wait_until', args: { tabId, url: `${origin}/dashboard.html`, format: 'compact' } },
    { tool: 'click', args: { tabId, elementId: settingsId } },
    { tool: 'wait_until', args: { tabId, url: `${origin}/settings.html`, format: 'compact' } },
    { tool: 'read_page', args: { tabId, format: 'compact' } },
    { tool: 'click', args: { tabId, elementId: saveId } },
    { tool: 'read_page', args: { tabId, format: 'compact', maxText: 2000 } },
  ];
  const act = await timed(client, 'act', { steps: actSteps, intent: 'benchmark login and settings' });
  note('act login flow', act);
  if (!act.value.ok) throw new Error(`act flow failed: ${act.value.error}`);
  if (!String(act.value.value.text).includes('Saved'))
    throw new Error('act flow did not verify: settings page does not show "Saved".');
  metrics.actFlowMs = act.ms;
  metrics.actFlowSteps = act.value.completed;

  // The same flow as one script through the Page API.
  const source = `
    const s = await session();
    const page = s.page(${JSON.stringify(tabId)});
    await page.goto(${JSON.stringify(origin + '/login.html')}, { waitUntil: 'load' });
    await page.snapshot();
    await page.fill('text=Username', 'benchmark');
    await page.click('text=Sign in');
    await page.waitFor({ url: ${JSON.stringify(origin + '/dashboard.html')} });
    await page.click('text=Settings');
    await page.waitFor({ url: ${JSON.stringify(origin + '/settings.html')} });
    await page.select('text=Report month', ['October']);
    await page.click('text=Save');
    // waitFor's text condition targets a labelled control; the status line is plain text.
    const done = await page.snapshot({ maxText: 2000 });
    if (!String(done.text).includes('Saved October')) throw new Error('Settings page does not show "Saved October".');
    log('saved on', done.url);
    return { url: done.url, elements: done.elements.length };
  `;
  const script = await timed(client, 'run_script', { source, intent: 'benchmark login and settings' });
  note('run_script login flow', script);
  if (!script.value.ok) throw new Error(`run_script flow failed: ${script.value.error}\n${JSON.stringify(script.value.receipts)}`);
  if (!String(script.value.value.url).includes('settings.html'))
    throw new Error('run_script flow did not end on the settings page.');
  metrics.scriptFlowMs = script.ms;
  metrics.scriptFlowSteps = script.value.receipts.length;
  metrics.scriptFlowLogs = script.value.logs;

  const empties = [];
  for (let i = 0; i < rounds; i += 1) {
    const empty = await timed(client, 'run_script', { source: 'return 1;' });
    if (empty.value.value !== 1) throw new Error('Empty script did not return 1.');
    empties.push(empty);
    note('run_script empty', empty);
  }
  metrics.scriptCallOverheadMs = median(empties.map((x) => x.ms));

  await t('navigate', { url: `${origin}/dashboard.html` });
  const tenReads = await timed(client, 'run_script', {
    source: `const s = await session(); const page = s.page(${JSON.stringify(tabId)}); let n = 0; for (let i = 0; i < 10; i += 1) { n += (await page.snapshot()).elements.length; } return n;`,
  });
  if (!tenReads.value.ok) throw new Error(`ten snapshot script failed: ${tenReads.value.error}`);
  note('run_script 10 snapshots', tenReads);
  const inPageMs = tenReads.value.receipts.reduce((sum, r) => sum + r.durationMs, 0);
  // Per-call bridge overhead: total script time minus the engine's own time per step, over the 11 calls.
  metrics.pageApiCallMs = (tenReads.ms - inPageMs) / tenReads.value.receipts.length;
  metrics.pageApiCallTotalMs = tenReads.ms;
  metrics.pageApiReadPageMs = inPageMs / 10;
  return { metrics, calls };
}

function compare(metrics) {
  const failures = [];
  const rows = [];
  Object.entries(budgets).forEach(([key, budget]) => {
    if (typeof budget !== 'number') return;
    const value = metrics[key];
    if (value === undefined) return;
    const limit = budget * 1.2;
    const status = value <= budget ? 'ok' : value <= limit ? 'over budget' : 'FAIL';
    if (status === 'FAIL') failures.push(key);
    rows.push({ key, value: Math.round(value), budget, status });
  });
  return { rows, failures };
}

function writeReport(appRoot, report) {
  const dir = path.join(appRoot, 'release', 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

module.exports = { measure, compare, writeReport, budgets };

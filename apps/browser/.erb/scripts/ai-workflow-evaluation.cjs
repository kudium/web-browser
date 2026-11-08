/* Disposable Electron pages and the production AI loop. --fixture uses no API.
 * Live runs require KUDIUM_AI_EVAL_CONFIG, a JSON array of {endpoint, model,
 * keyEnv, rates?: {input, output, cachedInput, cacheWrite}}. Rates are USD/1M
 * tokens supplied by the evaluator; credentials are read only from the named env.
 */
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const fixtureOnly = process.argv.includes('--fixture');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-ai-evaluation-'));
app.setPath('userData', root);
const output = path.resolve(
  process.env.KUDIUM_AI_EVAL_OUTPUT ||
    `docs/benchmarks/ai-workflow-${fixtureOnly ? 'fixture' : 'live'}.json`
);
const rounds = Number(process.env.KUDIUM_AI_EVAL_ROUNDS || 3);
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 10);
const cases = [
  {
    id: 'query',
    prompt: 'What is 6 times 7? Answer with the number.',
    verify: (text) => /\b42\b/.test(text),
  },
  {
    id: 'form',
    prompt:
      'In the current test page, fill Name with Kudium evaluation, click Apply, and verify the resulting status.',
    verify: async (_, view) =>
      (await view.webContents.executeJavaScript(
        'document.querySelector("#status").textContent'
      )) === 'Done Kudium evaluation',
  },
  {
    id: 'long-page',
    prompt:
      'Read the current page, including its end. What is the release code at the end of the article? Answer with the code.',
    verify: (text) => text.includes('KUDIUM-TAIL-7391'),
  },
  {
    id: 'continuity',
    setup:
      'For this evaluation, the exact project label is LANTERN-582. Preserve it for the next question. Record it in task notes.',
    prompt:
      'What is the exact project label I gave you earlier? Answer with the label.',
    verify: (text) => text.includes('LANTERN-582'),
  },
];
const samples = [];
let fixtureStep = 0;
let host, view, dispose;
let activeEvents = [];
let complete;
function cleanup() {
  dispose?.();
  server.close();
  view?.webContents.close();
  host?.destroy();
  fs.rmSync(root, { recursive: true, force: true });
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/chat/completions') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt =
      body.messages.filter((x) => x.role === 'user').at(-1)?.content || '';
    let message = { role: 'assistant', content: '42' };
    if (!body.tools?.length) message.content = 'Evaluation';
    else if (prompt.includes('fill Name')) {
      const plan = [
        ['read_page', { tabId: 'evaluation' }],
        [
          'type',
          { tabId: 'evaluation', elementId: 0, text: 'Kudium evaluation' },
        ],
        ['click', { tabId: 'evaluation', elementId: 1 }],
        ['read_page', { tabId: 'evaluation' }],
      ][fixtureStep++];
      message = plan
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `fixture-${fixtureStep}`,
                type: 'function',
                function: { name: plan[0], arguments: JSON.stringify(plan[1]) },
              },
            ],
          }
        : { role: 'assistant', content: 'Verified the form status.' };
    } else if (prompt.includes('end of the article')) {
      message =
        fixtureStep++ === 0
          ? {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'long-read',
                  type: 'function',
                  function: {
                    name: 'read_page',
                    arguments: JSON.stringify({
                      tabId: 'evaluation',
                      maxText: 50000,
                    }),
                  },
                },
              ],
            }
          : { role: 'assistant', content: 'KUDIUM-TAIL-7391' };
    } else if (
      prompt.startsWith('For this evaluation') &&
      fixtureStep++ === 0
    ) {
      message = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'memory',
            type: 'function',
            function: {
              name: 'update_task_memory',
              arguments: JSON.stringify({
                decisions: ['Exact project label: LANTERN-582'],
                unfinished: [],
                sources: [],
              }),
            },
          },
        ],
      };
    } else if (prompt.includes('project label'))
      message.content = 'LANTERN-582';
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message,
            finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      })
    );
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><title>Evaluation fixture</title><label>Name<input id="name"></label><button onclick="document.querySelector('#status').textContent='Done '+document.querySelector('#name').value">Apply</button><p id="status">Ready</p><article>${'Background paragraph for long-page evaluation. '.repeat(
      700
    )}<p>Release code: KUDIUM-TAIL-7391</p></article>`
  );
});

const evaluate = (code) => host.webContents.executeJavaScript(code);
async function run(prompt) {
  activeEvents = [];
  const done = new Promise((resolve) => {
    complete = resolve;
  });
  let timer;
  try {
    await evaluate(`evaluation.run(${JSON.stringify(prompt)})`);
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Evaluation deadline exceeded')),
          240000
        );
      }),
    ]);
    return [...activeEvents];
  } finally {
    clearTimeout(timer);
  }
}
function cost(usage, rates) {
  if (!usage?.usageReported || !rates) return null;
  const cached = usage.cachedInputTokens || 0;
  const writes = usage.cacheWriteTokens || 0;
  if (
    ![rates.input, rates.output].every(Number.isFinite) ||
    (cached && !Number.isFinite(rates.cachedInput)) ||
    (writes && !Number.isFinite(rates.cacheWrite))
  )
    return null;
  return (
    (Math.max(0, usage.inputTokens - cached - writes) * rates.input +
      usage.outputTokens * rates.output +
      cached * (rates.cachedInput || 0) +
      writes * (rates.cacheWrite || 0)) /
    1e6
  );
}
(async () => {
  await app.whenReady();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${server.address().port}`;
  const configurations = fixtureOnly
    ? [{ endpoint: `${local}/v1`, model: 'fixture', key: 'synthetic-test-key' }]
    : JSON.parse(fs.readFileSync(process.env.KUDIUM_AI_EVAL_CONFIG, 'utf8'));
  assert(
    Array.isArray(configurations) &&
      configurations.length >= 1 &&
      configurations.length <= 5
  );
  require('esbuild').buildSync({
    entryPoints: ['src/main/ai.ts'],
    bundle: true,
    minify: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(root, 'ai.cjs'),
  });
  fs.writeFileSync(
    path.join(root, 'preload.cjs'),
    `const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('evaluation',{run:p=>ipcRenderer.invoke('ai-run',p),
      settings:p=>ipcRenderer.invoke('ai-settings',p),chats:p=>ipcRenderer.invoke('ai-conversations',p)});
    ipcRenderer.on('ai-event',(_,e)=>ipcRenderer.send('evaluation-event',e));`
  );
  host = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      contextIsolation: true,
    },
  });
  view = new WebContentsView({
    webPreferences: { partition: 'evaluation-only' },
  });
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(`${local}/`) });
  });
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await view.webContents.loadURL(`${local}/fixture`);
  const ai = require(path.join(root, 'ai.cjs'));
  await ai.initializeLocalStorage();
  dispose = ai.registerAI(host, {
    tabs: () => [
      {
        id: 'evaluation',
        name: 'Evaluation',
        url: `${local}/fixture`,
        icon: '',
        sessionId: 'evaluation',
      },
    ],
    focused: () => 'evaluation',
    contents: (id) => (id === 'evaluation' ? view.webContents : undefined),
  });
  // Only disposable fixture actions. No personal profile, external sites or shell.
  dialog.showMessageBox = async () => ({ response: 1 });
  ipcMain.on('evaluation-event', (_, event) => {
    activeEvents.push(event);
    if (event.type === 'done') complete?.();
  });
  await host.loadURL('data:text/html,AI evaluation');
  for (const config of configurations) {
    assert(
      typeof config.endpoint === 'string' && typeof config.model === 'string'
    );
    const key = fixtureOnly ? config.key : process.env[config.keyEnv];
    assert(
      key,
      'The configured provider key environment variable is unavailable'
    );
    await evaluate(
      `evaluation.settings(${JSON.stringify({
        endpoint: config.endpoint,
        model: config.model,
        key,
        remember: false,
      })})`
    );
    for (let round = 0; round < rounds; round += 1) {
      for (const scenario of cases) {
        fixtureStep = 0;
        await evaluate(`evaluation.chats({action:'create'})`);
        await view.webContents.loadURL(`${local}/fixture`);
        const setupEvents = scenario.setup ? await run(scenario.setup) : [];
        const events = await run(scenario.prompt);
        const final = events.filter((x) => x.type === 'message').at(-1);
        const usage = events.filter((x) => x.usage).at(-1)?.usage;
        const passed =
          !events.some((x) => x.type === 'error' || x.type === 'handoff') &&
          !final?.execution?.incomplete &&
          !!(await scenario.verify(final?.text || '', view));
        samples.push({
          provider: new URL(config.endpoint).hostname,
          model: config.model,
          round,
          scenario: scenario.id,
          passed,
          usage: usage || null,
          setupUsage:
            setupEvents.filter((x) => x.type === 'message').at(-1)?.usage ||
            null,
          estimatedReportedUsageUSD: cost(usage, config.rates),
          rates: config.rates || null,
          errorCount: events.filter((x) => x.type === 'error').length,
          usageComplete:
            !!usage?.usageReported &&
            usage.requestsWithUsage === usage.requests &&
            usage.requestAttempts === usage.requests,
        });
      }
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    syntheticProvider: fixtureOnly,
    limitations: [
      'Local fixtures, not real account tasks.',
      'Fixture mode proves the harness only; synthetic usage is not a cost benchmark.',
      'Usage excludes chat naming, failed attempts, fallback attempts and earlier paused segments. Cost estimates use supplied rates, not invoice data.',
      'Continuity is a two-turn check, not proof of long-context memory quality.',
      'No native compaction/tool search or project editing in this harness.',
      'Fixture reviews are auto-accepted; human approval latency is excluded. Fixture network is restricted to localhost.',
    ],
    samples,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    `${samples.filter((x) => x.passed).length}/${
      samples.length
    } workflow checks passed. Report: ${output}`
  );
  cleanup();
  app.exit(samples.every((x) => x.passed) ? 0 : 1);
})().catch(() => {
  console.error(
    'Evaluation failed; provider responses and credentials are not logged.'
  );
  cleanup();
  app.exit(1);
});

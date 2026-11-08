// Run from the repository with Electron; then run ai-ego-benchmark.mjs through
// ego-browser nodejs with ai-ego-dynamic-benchmark.mjs. Uses disposable local pages and the official MCP client.
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
} = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-ego-benchmark-'));
const controlPath = '/tmp/touchbox-dynamic-comparison-control.json';
const format = process.env.TOUCHBOX_BENCHMARK_FORMAT || 'detailed';
const compactWait = process.env.TOUCHBOX_BENCHMARK_COMPACT_WAIT === '1';
assert(['detailed', 'compact'].includes(format));
const secret = crypto.randomBytes(32).toString('hex');
const samples = { snapshot: [], workflow: [] };
app.setPath('userData', root);
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
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('benchmark',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p)});`
);
const fixture = `<!doctype html><title>AI benchmark fixture</title>
<style>body{font:14px system-ui;margin:16px}.grid{display:grid;grid-template-columns:repeat(10,70px);gap:4px;margin-top:12px}button{height:26px}</style>
<label for="name">Name</label><input id="name"><button id="apply" onclick="this.disabled=true;this.textContent='Working';document.querySelector('#status').textContent='Waiting';fetch('/result?value='+encodeURIComponent(document.querySelector('#name').value)).then(r=>r.text()).then(text=>{document.querySelector('#status').textContent=text;this.disabled=false;this.textContent='Apply'})">Apply</button><p id="status">Ready</p>
<div class="grid">${Array.from(
  { length: 100 },
  (_, i) => `<button>Action ${i + 1}</button>`
).join('')}</div>`;
let client, host, dispose, server;
const decode = (result) => {
  if (result.isError)
    throw new Error(result.content.map((x) => x.text || '').join(''));
  return JSON.parse(result.content.find((x) => x.type === 'text').text);
};
const call = async (name, args = {}) =>
  decode(
    await client.callTool({ name, arguments: { tabId: 'benchmark', ...args } })
  );
const summarize = (values) => {
  const sorted = values.map((x) => x.ms).sort((a, b) => a - b);
  return {
    runs: sorted.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms:
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    samples: values,
  };
};
(async () => {
  await app.whenReady();
  let measure;
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/result?')) {
      const value = new URL(req.url, 'http://localhost').searchParams.get('value');
      setTimeout(() => res.end('Done '+value), 75);
      return;
    }
    if (req.url === '/fixture') {
      res.setHeader('Content-Type', 'text/html');
      res.end(fixture);
      return;
    }
    if (
      req.headers.authorization !== `Bearer ${secret}` ||
      req.method !== 'POST'
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1000000) throw new Error('Request too large');
      }
      const input = JSON.parse(body || '{}');
      if (req.url === '/measure') {
        const value = await measure(input);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(value));
        return;
      }
      if (req.url === '/finish') {
        assert(
          input.ego &&
            input.ego.snapshot.length === 20 &&
            input.ego.workflow.length === 20
        );
        assert(
          samples.snapshot.length === 20 && samples.workflow.length === 20
        );
        const report = {
          measuredAt: new Date().toISOString(),
          touchboxFormat: format,
          compactWait,
          fixture: '100 buttons plus Name / Apply form; each Apply awaits localhost response delayed 75ms',
          environment: {
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            chromium: process.versions.chrome,
            egoGuide: '2.2.0',
            cpu: os.cpus()[0]?.model,
          },
          method:
            'Interleaved SDK/MCP calls on one machine; first observation reported separately, two warmups excluded, 20 measured rounds per operation. Dynamic workflow waits for a 75ms localhost response and verifies final status. TouchBox uses five public API calls with compactWait, six otherwise; Ego uses five. No AI inference or CLI process startup included.',
          limitations: [
            'TouchBox uses authenticated localhost Streamable HTTP MCP; Ego uses its documented Page SDK transport. These are different transport paths.',
            'TouchBox native approval dialogs are accepted by a fixture stub; no human decision latency included.',
            compactWait ? 'TouchBox compact wait returns the final observation directly. Both products use five public API calls per workflow.' : 'TouchBox waits using a detailed snapshot then reads compact output; six public calls versus Ego five.',
            'The localhost response has a controlled 75ms delay; this is a dynamic DOM/network fixture, not a remote production application.',
            'Snapshots have different semantic schemas. Fixture fits the viewport; Ego uses full_page and TouchBox discovers all 102 controls (below its 250 cap).',
            'One local static fixture cannot establish complete parity or general browser superiority.',
          ],
          failures: 0,
          retries: 0,
          touchbox: {
            cold: input.coldTouchbox,
            snapshot: summarize(samples.snapshot),
            workflow: summarize(samples.workflow),
          },
          ego: {
            cold: input.coldEgo,
            snapshot: summarize(input.ego.snapshot),
            workflow: summarize(input.ego.workflow),
          },
        };
        const output = path.resolve(
          `docs/benchmarks/ai-ego-comparison-dynamic${
            format === 'compact' ? '-compact' : ''
          }${compactWait ? '-wait' : ''}.json`
        );
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        res.end(
          JSON.stringify({
            output,
            touchbox: report.touchbox.snapshot.p50Ms,
            ego: report.ego.snapshot.p50Ms,
          })
        );
        setTimeout(async () => {
          await client.close();
          dispose();
          host.destroy();
          server.close();
          fs.rmSync(controlPath, { force: true });
          fs.rmSync(root, { recursive: true, force: true });
          app.exit(0);
        }, 200);
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  host = new BrowserWindow({
    show: true,
    width: 900,
    height: 650,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      contextIsolation: true,
    },
  });
  const view = new WebContentsView();
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 850, height: 550 });
  await view.webContents.loadURL(`${origin}/fixture`);
  const tabs = [
    {
      id: 'benchmark',
      name: 'Benchmark',
      url: `${origin}/fixture`,
      icon: '',
      sessionId: 'benchmark',
    },
  ];
  dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => tabs,
    focused: () => tabs[0].id,
    contents: () => view.webContents,
  });
  await host.loadURL('data:text/html,Benchmark host');
  const config = await host.webContents.executeJavaScript(
    `benchmark.mcp('update',{enabled:true,port:${port}}).then(()=>benchmark.mcp('connection'))`
  );
  const connection = config.mcpServers.touchbox;
  client = new Client(
    { name: 'touchbox-comparison', version: '1' },
    { capabilities: {} }
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers: connection.headers },
    })
  );
  dialog.showMessageBox = async () => ({ response: 1 });
  measure = async ({ kind, round = -1 }) => {
    assert(['snapshot', 'workflow'].includes(kind));
    const start = performance.now();
    let snapshot = await call('read_page', { format });
    assert.equal(snapshot.elements.length, 102);
    if (kind === 'workflow') {
      const name = snapshot.elements.find((x) => x.label === 'Name');
      await call('type', {
        elementId: name.id,
        snapshotId: snapshot.snapshotId,
        text: `Sample ${round}`,
      });
      snapshot = await call('read_page', { format });
      const apply = snapshot.elements.find((x) => x.label === 'Apply');
      await call('click', {
        elementId: apply.id,
        snapshotId: snapshot.snapshotId,
      });
      snapshot = await call('wait_until', { label: 'Apply', timeoutMs: 5000, ...(compactWait ? { format } : {}) });
      if (!compactWait) snapshot = await call('read_page', { format });
      assert(snapshot.text.includes(`Done Sample ${round}`));
    }
    const value = {
      ms: performance.now() - start,
      bytes: Buffer.byteLength(JSON.stringify(snapshot)),
      controls: snapshot.elements.length,
      verified: true,
      apiCalls: kind === 'workflow' ? (compactWait ? 5 : 6) : 1,
    };
    if (round >= 0) samples[kind].push(value);
    return value;
  };
  fs.writeFileSync(controlPath, JSON.stringify({ origin, secret }), {
    mode: 0o600,
  });
  console.log(`READY: ${controlPath}`);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});

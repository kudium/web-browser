// Electron side of the agent benchmark: boots the real AI engine from
// src/main/ai.ts, exposes its MCP endpoint on a free port, serves the fixture
// site, and times tool calls through the official MCP client. Same boot path
// as ai-ego-benchmark.cjs. Run through run-agent-perf.cjs.
const { app, BrowserWindow, WebContentsView, dialog } = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { measure, compare, writeReport } = require('./agent-perf-flow.cjs');
const fixture = require('../../demo/fixture/server.cjs');

const appRoot = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-agent-perf-'));
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
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('benchmark',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),access:(m)=>ipcRenderer.invoke('ai-permissions',m)});`
);

(async () => {
  await app.whenReady();
  const server = await fixture.start(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const host = new BrowserWindow({
    show: true,
    width: 1000,
    height: 720,
    webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true },
  });
  const view = new WebContentsView();
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 960, height: 640 });
  await view.webContents.loadURL(`${origin}/`);
  const tabs = [{ id: 'fixture', name: 'Fixture', url: `${origin}/`, icon: '', sessionId: 'fixture' }];
  // Count protocol attaches on the page so navigate's "no attach" budget is observable.
  let attaches = 0;
  const originalAttach = view.webContents.debugger.attach.bind(view.webContents.debugger);
  view.webContents.debugger.attach = (...args) => {
    attaches += 1;
    return originalAttach(...args);
  };
  const dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => tabs,
    focused: () => tabs[0].id,
    contents: () => view.webContents,
  });
  await host.loadURL('data:text/html,Agent benchmark host');
  const config = await host.webContents.executeJavaScript(
    `benchmark.mcp('update',{enabled:true,port:${port}}).then(()=>benchmark.mcp('connection'))`
  );
  const connection = config.mcpServers.kudiumbrowser;
  // The budgets in section 5 are for Full access (zero prompts per run); the
  // run consent in Standard mode is a modal window no stub can answer.
  await host.webContents.executeJavaScript(`benchmark.access('full')`);
  // No human in the loop: remaining native approvals are accepted by this stub.
  dialog.showMessageBox = async () => ({ response: 1 });
  const client = new Client({ name: 'kudiumbrowser-agent-perf', version: '1' }, { capabilities: {} });
  const connectStart = performance.now();
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: connection.headers } })
  );
  const connectMs = performance.now() - connectStart;
  let exitCode = 0;
  try {
    const { metrics, calls } = await measure(client, { origin, tabId: 'fixture', probe: { attaches: () => attaches } });
    metrics.connectMs = connectMs;
    const { rows, failures } = compare(metrics);
    const report = {
      measuredAt: new Date().toISOString(),
      mode: 'fresh-engine',
      fixture: origin,
      environment: {
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        cpu: os.cpus()[0]?.model,
      },
      method:
        'Official MCP client over authenticated localhost Streamable HTTP against the engine bundled from src/main/ai.ts in Full access; remaining approvals auto-accepted; medians of 3 rounds per metric; no model inference.',
      metrics,
      budgets: rows,
      failures,
      calls,
    };
    const file = writeReport(appRoot, report);
    console.table(rows);
    console.log(`Report: ${file}`);
    if (failures.length) {
      console.error(`Budget regressions over 20%: ${failures.join(', ')}`);
      exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await client.close().catch(() => {});
    dispose();
    host.destroy();
    server.close();
    app.exit(exitCode);
  }
})().catch((error) => {
  console.error(error);
  app.exit(1);
});

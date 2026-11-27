#!/usr/bin/env node
// Agent control benchmark (spec: docs/kudium-fast-agent-control-spec.md, section 5).
//   node .erb/scripts/run-agent-perf.cjs            fresh engine inside Electron (default)
//   node .erb/scripts/run-agent-perf.cjs --existing  a running Kudium Browser on --port (43187)
//                                                    using ~/.kudium/mcp-connection.json
// Writes release/perf/<timestamp>.json and exits 1 when a budget regresses by more than 20%.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appRoot = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);

if (!args.includes('--existing')) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), ['.erb/scripts/agent-perf-electron.cjs', ...args], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
    timeout: 180000,
  });
  if (result.error) console.error(result.error);
  process.exitCode = result.error || result.status !== 0 ? result.status || 1 : 0;
} else {
  (async () => {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const { measure, compare, writeReport } = require('./agent-perf-flow.cjs');
    const fixture = require('../../demo/fixture/server.cjs');
    const portIndex = args.indexOf('--port');
    const port = portIndex < 0 ? 43187 : Number(args[portIndex + 1]);
    const file = path.join(os.homedir(), '.kudium', 'mcp-connection.json');
    let connection;
    try {
      connection = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.kudiumbrowser;
    } catch {
      throw new Error(`No connector credential at ${file}. Run: npx @kudiumbrowser/mcp setup`);
    }
    const url = new URL(connection.url);
    url.port = String(port);
    const server = await fixture.start(0);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const client = new Client({ name: 'kudiumbrowser-agent-perf', version: '1' }, { capabilities: {} });
    const connectStart = performance.now();
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: connection.headers } }));
    const connectMs = performance.now() - connectStart;
    try {
      const tabs = JSON.parse(
        (await client.callTool({ name: 'list_tabs', arguments: {} })).content.find((x) => x.type === 'text').text
      );
      if (!Array.isArray(tabs) || !tabs.length) throw new Error('The running browser has no open tab in scope.');
      const fixtureTab = tabs.find((tab) => String(tab.url).startsWith('http://127.0.0.1') || String(tab.url).startsWith('http://localhost')) || tabs[0];
      console.log(`Using tab ${fixtureTab.id} (${fixtureTab.url}); it will be navigated to the fixture site.`);
      const { metrics, calls } = await measure(client, { origin, tabId: fixtureTab.id });
      metrics.connectMs = connectMs;
      const { rows, failures } = compare(metrics);
      const report = {
        measuredAt: new Date().toISOString(),
        mode: 'existing-browser',
        fixture: origin,
        method:
          'Official MCP client over the connector credential against a running Kudium Browser; the current access mode and any native approvals apply; medians of 3 rounds per metric.',
        metrics,
        budgets: rows,
        failures,
        calls,
      };
      const out = writeReport(appRoot, report);
      console.table(rows);
      console.log(`Report: ${out}`);
      if (failures.length) {
        console.error(`Budget regressions over 20%: ${failures.join(', ')}`);
        process.exitCode = 1;
      }
    } finally {
      await client.close().catch(() => {});
      server.close();
    }
  })().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

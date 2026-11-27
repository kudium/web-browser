const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure, installBridge, bridgeFile, caPath } = require('./cli.cjs');
test('JSON setup launches the local bridge copy and preserves other servers without secrets', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-'));
 try {
 fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } } }));
 configure('claude', root, root); configure('claude', root, root);
 const value = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json')));
 assert.equal(value.mcpServers.other.command, 'other'); assert.equal(Object.keys(value.mcpServers).length, 2);
 assert.equal(value.mcpServers.kudiumbrowser.command, process.execPath);
 assert.deepEqual(value.mcpServers.kudiumbrowser.args, [bridgeFile(root), path.join(root, '.kudium', 'mcp-connection.json')]);
 assert.ok(!JSON.stringify(value).includes('npx'));
 assert.ok(!JSON.stringify(value).includes('Bearer'));
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('Codex setup preserves following sections and is repeatable', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-'));
 try {
 fs.mkdirSync(path.join(root, '.codex'));
 fs.writeFileSync(path.join(root, '.codex/config.toml'), 'model = "test"\n[mcp_servers.kudiumbrowser]\ncommand = "old"\n[projects.example]\ntrust_level = "trusted"\n');
 configure('codex', root, root); configure('codex', root, root);
 const text = fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8');
 assert.equal(text.split('[mcp_servers.kudiumbrowser]').length, 2); assert.ok(text.includes('[projects.example]')); assert.ok(text.includes('model = "test"'));
 assert.ok(text.includes(`command = ${JSON.stringify(process.execPath)}`));
 assert.ok(text.includes(JSON.stringify(bridgeFile(root))));
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('--https setup points stdio bridges at the local CA through NODE_EXTRA_CA_CERTS', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-'));
 try {
 configure('claude', root, root, { https: true });
 const value = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json')));
 assert.deepEqual(value.mcpServers.kudiumbrowser.env, { NODE_EXTRA_CA_CERTS: caPath(root) });
 fs.mkdirSync(path.join(root, '.codex'));
 configure('codex', root, root, { https: true }); configure('codex', root, root, { https: true });
 const text = fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8');
 assert.equal(text.split('[mcp_servers.kudiumbrowser]').length, 2);
 assert.ok(text.includes(`env = { NODE_EXTRA_CA_CERTS = ${JSON.stringify(caPath(root))} }`));
 configure('claude', root, root);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'))).mcpServers.kudiumbrowser.env, undefined);
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('installBridge writes a private identical copy once and refreshes a stale one', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-'));
 try {
 const file = installBridge(root);
 assert.equal(file, bridgeFile(root));
 assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(__dirname, 'bridge.cjs'))));
 if (process.platform !== 'win32') {
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
 }
 const first = fs.statSync(file).mtimeMs;
 installBridge(root);
 assert.equal(fs.statSync(file).mtimeMs, first);
 fs.writeFileSync(file, '// stale');
 installBridge(root);
 assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(__dirname, 'bridge.cjs'))));
 assert.equal(fs.readdirSync(path.dirname(file)).length, 1);
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('skill prints the agent skill with the contract version and pair sends only the client name', () => {
 const { skillText, skillContractVersion } = require('./cli.cjs');
 const text = skillText();
 assert.ok(text.startsWith('---\nname: kudium-browser'));
 assert.match(skillContractVersion(), /^\d+\.\d+\.\d+$/);
 assert.ok(text.includes(`Contract version: **${skillContractVersion()}**`));
 assert.ok(text.includes('run_script') && text.includes('kudium.workspace.json') && text.includes('Taint rule'));
 assert.ok(!/Bearer [a-f0-9]{64}/.test(text));
 const browserCopy = fs.readFileSync(path.join(__dirname, '..', '..', 'apps', 'browser', 'mcp', 'SKILL.md'), 'utf8');
 assert.equal(browserCopy, text, 'apps/browser/mcp/SKILL.md must match packages/mcp/SKILL.md');
 const source = fs.readFileSync(path.join(__dirname, 'cli.cjs'), 'utf8');
 assert.ok(source.includes("body: JSON.stringify({ name })"));
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure } = require('./cli.cjs');
test('JSON setup preserves other servers and deduplicates Kudium without secrets', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-'));
 try {
 fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } } }));
 configure('claude', root); configure('claude', root);
 const value = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json')));
 assert.equal(value.mcpServers.other.command, 'other'); assert.equal(Object.keys(value.mcpServers).length, 2);
 assert.equal(value.mcpServers.kudiumbrowser.command, 'npx');
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
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

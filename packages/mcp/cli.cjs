#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline/promises');
const { spawn } = require('node:child_process');
const privateDir = path.join(os.homedir(), '.kudium');
const connectionFile = path.join(privateDir, 'mcp-connection.json');
const serverConfig = { command: 'npx', args: ['-y', '@kudiumbrowser/mcp'] };
function saveJSON(file, update, mode = 0o600) {
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const next = update(previous);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error('Configuration must be a regular file.');
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode, flag: 'wx' });
  fs.renameSync(temp, file);
}
function configure(agent, root = process.cwd(), home = os.homedir()) {
  if (agent === 'codex') {
    const file = path.join(home, '.codex', 'config.toml');
    let text = '';
    try { if (!fs.lstatSync(file).isFile()) throw new Error('Configuration must be a regular file.'); text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const block = '[mcp_servers.kudiumbrowser]\ncommand = "npx"\nargs = ["-y", "@kudiumbrowser/mcp"]\n';
    if (/^\[mcp_servers\.kudiumbrowser\./m.test(text)) throw new Error('Existing Kudium configuration has nested settings. Update it manually to preserve them.');
    text = /^\[mcp_servers\.kudiumbrowser\]\s*$/m.test(text) ? text.replace(/^\[mcp_servers\.kudiumbrowser\][\s\S]*?(?=^\[|$(?![\s\S]))/m, block + '\n') : text + '\n' + block;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, text, { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file); return;
  }
  const targets = { claude: ['.mcp.json', 'mcpServers'], cursor: ['.cursor/mcp.json', 'mcpServers'], vscode: ['.vscode/mcp.json', 'servers'] };
  if (!targets[agent]) throw new Error('Choose codex, claude, cursor, or vscode.');
  const [relative, key] = targets[agent];
  saveJSON(path.join(root, relative), (value) => ({ ...value, [key]: { ...value[key], kudiumbrowser: { ...(key === 'servers' ? { type: 'stdio' } : {}), ...serverConfig } } }));
}
async function main() {
  if (process.argv[2] === '--help') { console.log('Usage: npx @kudiumbrowser/mcp [setup [codex|claude|cursor|vscode] [--port PORT]]\nKeep Kudium open and enable External control first.'); return; }
  if (process.argv[2] !== 'setup') {
    if (!fs.existsSync(connectionFile)) throw new Error('Run npx @kudiumbrowser/mcp setup first.');
    const child = spawn(process.execPath, [path.join(__dirname, 'bridge.cjs'), connectionFile], { stdio: 'inherit' });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
    child.on('error', () => { process.stderr.write('Could not start connector.\n'); process.exitCode = 1; }); return;
  }
  let agent = process.argv[3];
  if (!['codex', 'claude', 'cursor', 'vscode'].includes(agent)) {
    if (!process.stdin.isTTY) throw new Error('Specify an agent: setup codex|claude|cursor|vscode');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { agent = (await prompt.question('Connect which agent? codex / claude / cursor / vscode: ')).trim().toLowerCase(); } finally { prompt.close(); }
  }
  if (!['codex', 'claude', 'cursor', 'vscode'].includes(agent)) throw new Error('Unknown agent.');
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex < 0 ? 43187 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
  console.log('Approve the connection in Kudium Browser.');
  const response = await fetch(`http://127.0.0.1:${port}/connect`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Connection not approved (${response.status}). Enable External control in Kudium and retry.`);
  const connection = await response.json();
  const entry = connection?.mcpServers?.kudiumbrowser;
  if (entry?.url !== `http://127.0.0.1:${port}/mcp` || !/^Bearer [a-f0-9]{64}$/.test(entry?.headers?.Authorization || '')) throw new Error('Invalid browser connection.');
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(privateDir).isDirectory() || fs.lstatSync(privateDir).isSymbolicLink()) throw new Error('Private connection directory must not be a symlink.');
  fs.chmodSync(privateDir, 0o700);
  saveJSON(connectionFile, () => connection);
  configure(agent);
  console.log(`Connected ${agent}. Restart the agent to load Kudium. Reset the token in External AI to revoke access.`);
}
module.exports = { configure, saveJSON };
if (require.main === module) main().catch((error) => { console.error(error.message); console.error('Use --help for setup options.'); process.exitCode = 1; });

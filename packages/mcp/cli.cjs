#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline/promises');
const { spawn } = require('node:child_process');
const privateDir = path.join(os.homedir(), '.kudium');
const connectionFile = path.join(privateDir, 'mcp-connection.json');
const bridgeSource = path.join(__dirname, 'bridge.cjs');
const bridgeFile = (home = os.homedir()) => path.join(home, '.kudium', 'bin', 'kudium-mcp.cjs');
const connectionPath = (home = os.homedir()) => path.join(home, '.kudium', 'mcp-connection.json');
const caPath = (home = os.homedir()) => path.join(home, '.kudium', 'kudium-local-ca.pem');
// Clients launch a private local copy of the bridge: it starts in milliseconds and never waits for the npm registry.
function installBridge(home = os.homedir()) {
  const file = bridgeFile(home);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Bridge directory must be a real directory.');
  const source = fs.readFileSync(bridgeSource);
  try { if (fs.lstatSync(file).isFile() && fs.readFileSync(file).equals(source)) return file; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, source, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  return file;
}
// The Node that ran setup is a known-good absolute path; GUI clients often lack a shell PATH.
// With --https the bridge talks to Kudium's local https endpoint and trusts its name-constrained CA through NODE_EXTRA_CA_CERTS.
const serverEntry = (home = os.homedir(), https = false) => ({ command: process.execPath, args: [bridgeFile(home), connectionPath(home)], ...(https ? { env: { NODE_EXTRA_CA_CERTS: caPath(home) } } : {}) });
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
function configure(agent, root = process.cwd(), home = os.homedir(), options = {}) {
  const https = options.https === true;
  if (agent === 'codex') {
    const file = path.join(home, '.codex', 'config.toml');
    let text = '';
    try { if (!fs.lstatSync(file).isFile()) throw new Error('Configuration must be a regular file.'); text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const entry = serverEntry(home, https);
    const block = `[mcp_servers.kudiumbrowser]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${entry.args.map((value) => JSON.stringify(value)).join(', ')}]\n${entry.env ? `env = { NODE_EXTRA_CA_CERTS = ${JSON.stringify(entry.env.NODE_EXTRA_CA_CERTS)} }\n` : ''}`;
    if (/^\[mcp_servers\.kudiumbrowser\./m.test(text)) throw new Error('Existing Kudium configuration has nested settings. Update it manually to preserve them.');
    text = /^\[mcp_servers\.kudiumbrowser\]\s*$/m.test(text) ? text.replace(/^\[mcp_servers\.kudiumbrowser\][\s\S]*?(?=^\[|$(?![\s\S]))/m, block + '\n') : text + '\n' + block;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, text, { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file); return;
  }
  const targets = { claude: ['.mcp.json', 'mcpServers'], cursor: ['.cursor/mcp.json', 'mcpServers'], vscode: ['.vscode/mcp.json', 'servers'] };
  if (!targets[agent]) throw new Error('Choose codex, claude, cursor, or vscode.');
  const [relative, key] = targets[agent];
  saveJSON(path.join(root, relative), (value) => ({ ...value, [key]: { ...value[key], kudiumbrowser: { ...(key === 'servers' ? { type: 'stdio' } : {}), ...serverEntry(home, https) } } }));
}
// Pair with the running browser: the user approves the connector in Kudium once,
// the token is kept in ~/.kudium and never in a project file.
async function pair(port, https, log = console.log, clientName = 'Agent') {
  log('Approve the connection in Kudium Browser.');
  // The client name becomes this connection's identity in Kudium (its own token,
  // optional permission ceiling, name on receipts). Never a secret.
  const name = (process.argv.includes('--name') ? process.argv[process.argv.indexOf('--name') + 1] : undefined) || clientName;
  const response = await fetch(`http://127.0.0.1:${port}/connect`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) throw new Error(`Connection not approved (${response.status}). Enable External control in Kudium and retry.`);
  const connection = await response.json();
  if (https) {
    if (typeof connection?.httpsUrl !== 'string' || typeof connection?.caPem !== 'string') throw new Error('Kudium has no local https endpoint yet. Enable "Use https locally" in External AI and retry.');
    if (!/^https:\/\/localhost:\d+\/mcp$/.test(connection.httpsUrl) || !/^-----BEGIN CERTIFICATE-----/.test(connection.caPem)) throw new Error('Invalid https connection.');
  }
  const entry = connection?.mcpServers?.kudiumbrowser;
  if (entry?.url !== `http://127.0.0.1:${port}/mcp` || !/^Bearer [a-f0-9]{64}$/.test(entry?.headers?.Authorization || '')) throw new Error('Invalid browser connection.');
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(privateDir).isDirectory() || fs.lstatSync(privateDir).isSymbolicLink()) throw new Error('Private connection directory must not be a symlink.');
  fs.chmodSync(privateDir, 0o700);
  const { httpsUrl, caPem, ...saved } = connection;
  if (https) {
    const temp = `${caPath()}.${process.pid}.tmp`;
    fs.writeFileSync(temp, caPem, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, caPath());
    saved.mcpServers.kudiumbrowser.url = httpsUrl;
  }
  saveJSON(connectionFile, () => saved);
  installBridge();
}
// The agent skill: the script API and consent model in one file, so agents
// learn the surface from this text instead of 70 tool descriptions.
const skillFile = path.join(__dirname, 'SKILL.md');
function skillText() { return fs.readFileSync(skillFile, 'utf8'); }
function skillContractVersion() { const match = skillText().match(/^contract:\s*(\S+)/m); return match ? match[1] : undefined; }
function portOption() {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex < 0 ? 43187 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
  return port;
}
async function main() {
  if (process.argv[2] === 'skill') { process.stdout.write(skillText()); return; }
  if (process.argv[2] === '--help') { console.log('Usage: npx @kudiumbrowser/mcp [setup [codex|claude|cursor|vscode] [--port PORT] [--https] [--name NAME]] | skill\nWithout arguments the bridge starts (pairing with Kudium on its first run, which a project-level .mcp.json written by Kudium relies on). Keep Kudium open and enable External control first. --https uses the local https endpoint (enable "Use https locally" in Kudium first).'); return; }
  if (process.argv[2] !== 'setup') {
    // A project-level entry holds only this command: stdio is the MCP channel,
    // so first-run pairing talks on stderr and the bridge starts once paired.
    if (!fs.existsSync(connectionFile)) await pair(portOption(), process.argv.includes('--https'), (line) => process.stderr.write(`${line}\n`), 'Project bridge');
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
  const https = process.argv.includes('--https');
  await pair(portOption(), https, console.log, { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor', vscode: 'VS Code' }[agent]);
  configure(agent, process.cwd(), os.homedir(), { https });
  console.log(`Connected ${agent}. Restart the agent to load Kudium. Reset the token in External AI to revoke access.`);
}
module.exports = { configure, saveJSON, installBridge, bridgeFile, serverEntry, caPath, pair, skillText, skillContractVersion };
if (require.main === module) main().catch((error) => { console.error(error.message); console.error('Use --help for setup options.'); process.exitCode = 1; });

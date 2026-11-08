/* Actual node-pty processes; no provider calls or user profile. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-command-receipts-'));
app.setPath('userData', root);
let host, manager;
const cleanup = () => {
  manager?.dispose();
  host?.destroy();
  fs.rmSync(root, { recursive: true, force: true });
};
(async () => {
  await app.whenReady();
  const filename = path.join(root, 'terminal.cjs');
  await require('esbuild').build({
    entryPoints: ['src/main/projectTerminal.ts'],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: filename,
    plugins: [
      {
        name: 'native-pty',
        setup(build) {
          build.onResolve({ filter: /^node-pty$/ }, () => ({
            path: require.resolve('node-pty'),
            external: true,
          }));
        },
      },
    ],
  });
  host = new BrowserWindow({ show: false });
  manager = new (require(filename).ProjectTerminals)(host, () => root);
  const wait = async (state) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const current = manager.request('test', {
        action: 'read',
        tab: state.selected,
      });
      if (current.command.status !== 'running') return current;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Command completion deadline exceeded');
  };
  // Shell builtins work on both supported shell transports.
  const success = manager.runCommand('test', 'Success', 'exit 0');
  assert.equal((await wait(success)).command.exitCode, 0);
  const failed = manager.runCommand('test', 'Failure', 'exit 7');
  assert.notEqual((await wait(failed)).command.exitCode, 0);
  const pending = manager.runCommand(
    'test',
    'Long process',
    process.platform === 'win32' ? 'Start-Sleep -Seconds 60' : 'sleep 60'
  );
  manager.request('test', { action: 'close', tab: pending.selected });
  const interrupted = manager.request('test', {
    action: 'read',
    tab: pending.selected,
  });
  assert.equal(interrupted.command.status, 'interrupted');
  assert.equal(interrupted.command.exitCode, undefined);
  cleanup();
  console.log(
    'PASS: actual command success, failure and interruption receipts.'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  cleanup();
  app.exit(1);
});

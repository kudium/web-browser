const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
if (!fs.existsSync(path.join(root, 'release/app/dist/renderer/index.html'))) {
  console.error(
    'Build the browser first with npm run build, then run npm run test:compatibility.',
  );
  process.exit(1);
}
const output =
  process.env.KUDIUMBROWSER_SMOKE_OUTPUT ||
  path.join(
    root,
    'release',
    `local-compatibility-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, KUDIUMBROWSER_SMOKE_OUTPUT: output };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require('electron');
const results = [];
for (const [name, args, executable] of [
  ['global-browser-identity', ['.erb/scripts/browser-identity-smoke.cjs']],
  [
    'production-session-capabilities',
    ['.erb/scripts/browser-ui-smoke.cjs', '--compatibility-only'],
  ],
  [
    'download-recovery',
    ['.erb/scripts/browser-download-recovery.cjs'],
    process.execPath,
  ],
  [
    'file-input-selection',
    ['.erb/scripts/browser-ui-smoke.cjs', '--file-chooser-only'],
  ],
  ['screen-sharing-picker', ['.erb/scripts/screen-sharing-picker-smoke.cjs']],
]) {
  const run = spawnSync(executable || electron, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    timeout: 120000,
  });
  const passed = run.status === 0 && !run.error;
  results.push({
    name,
    outcome: passed ? 'passed' : 'failed',
    exitCode: run.status,
    signal: run.signal,
    ...(run.error && { error: String(run.error) }),
  });
  fs.writeFileSync(
    path.join(output, 'compatibility-suite.json'),
    JSON.stringify(
      {
        outcome: results.every((result) => result.outcome === 'passed')
          ? 'passed'
          : 'failed',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  if (!passed) {
    console.error(`Compatibility suite failed: ${name}. Artifacts: ${output}`);
    process.exit(1);
  }
}
console.log(`Compatibility baseline passed. Artifacts: ${output}`);

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const script = process.argv.includes('--marketplace')
  ? 'panel-marketplace-hooks-smoke.cjs'
  : process.argv.includes('--ui')
  ? 'sidebar-panel-ui-smoke.cjs'
  : process.argv.includes('--muse')
    ? 'muse-compatibility-smoke.cjs'
    : 'extension-side-panel-smoke.cjs';
const result = spawnSync(require('electron'), [path.join(__dirname, script)], {
  env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

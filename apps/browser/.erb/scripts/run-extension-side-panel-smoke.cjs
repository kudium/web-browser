const path = require('node:path');
const { spawnSync } = require('node:child_process');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [path.join(__dirname, 'extension-side-panel-smoke.cjs')], {
  env, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

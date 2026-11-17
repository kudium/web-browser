const { spawnSync } = require('child_process');
const path = require('path');
const appRoot = path.resolve(__dirname, '../..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.KUDIUMBROWSER_SMOKE_OUTPUT ||= path.join(
  appRoot,
  'release',
  `local-tab-switcher-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const result = spawnSync(
  require('electron'),
  ['.erb/scripts/browser-ui-smoke.cjs', '--tab-switcher-only'],
  { cwd: appRoot, env, stdio: 'inherit', timeout: 60000 },
);
if (result.error) console.error(result.error);
process.exitCode = result.error || result.status !== 0 ? result.status || 1 : 0;

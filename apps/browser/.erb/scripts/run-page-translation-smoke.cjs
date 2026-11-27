const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-translation-native-'),
);
const env = { ...process.env, KUDIUM_TRANSLATION_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const result = spawnSync(
    require('electron'),
    [path.join(__dirname, 'page-translation-smoke.cjs')],
    { env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

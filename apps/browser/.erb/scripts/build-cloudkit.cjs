/** Explicit integration build only: normal releases keep unverified iCloud disabled. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
if (process.platform !== 'darwin') throw new Error('CloudKit requires macOS.');
const root = path.resolve(__dirname, '../..');
const version = require(path.join(root, 'node_modules/electron/package.json')).version;
const headers = path.join(os.homedir(), '.electron-gyp', version, 'include/node');
if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
  throw new Error('Install matching Electron headers with electron-rebuild before building CloudKit.');
}
const output = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'kudium-cloudkit-bridge.node'));
const run = (args) => {
  const result = spawnSync('xcrun', args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('CloudKit native build failed.');
};
try {
  for (const arch of ['arm64', 'x86_64']) {
    run(['clang++', '-std=c++17', '-fobjc-arc', '-shared', '-undefined', 'dynamic_lookup', '-target', `${arch}-apple-macos12.0`, '-framework', 'Foundation', '-framework', 'CloudKit', '-I', headers, path.join(root, 'native/cloud-sync/bridge.mm'), '-o', `${output}.${arch}`]);
  }
  run(['lipo', '-create', `${output}.arm64`, `${output}.x86_64`, '-output', output]);
  console.log('Built native CloudKit bridge. Provisioned-app acceptance is still required.');
} finally {
  for (const arch of ['arm64', 'x86_64']) fs.rmSync(`${output}.${arch}`, { force: true });
}

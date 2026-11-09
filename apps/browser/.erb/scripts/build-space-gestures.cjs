const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
if (process.platform !== 'darwin') process.exit(0);
const root = path.resolve(__dirname, '../..');
const version = require(path.join(root, 'node_modules/electron/package.json')).version;
const headers = path.join(os.homedir(), '.electron-gyp', version, 'include/node');
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root });
  if (result.error || result.status !== 0) throw new Error('Native space gesture build failed.');
};
if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
  run(process.execPath, [require.resolve('node-gyp/bin/node-gyp.js'), 'install', `--target=${version}`, '--dist-url=https://electronjs.org/headers', `--devdir=${path.join(os.homedir(), '.electron-gyp')}`]);
}
const output = path.join(root, 'assets/native/kudium-space-gestures.node');
fs.mkdirSync(path.dirname(output), { recursive: true });
try {
  for (const arch of ['arm64', 'x86_64']) {
    run('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-shared', '-undefined', 'dynamic_lookup', '-target', `${arch}-apple-macos12.0`, '-framework', 'AppKit', '-I', headers, path.join(root, 'native/space-gestures/bridge.mm'), '-o', `${output}.${arch}`]);
  }
  run('xcrun', ['lipo', '-create', `${output}.arm64`, `${output}.x86_64`, '-output', output]);
} finally {
  for (const arch of ['arm64', 'x86_64']) fs.rmSync(`${output}.${arch}`, { force: true });
}

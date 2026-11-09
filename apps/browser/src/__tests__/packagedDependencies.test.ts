/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createPackageWithOptions } from '@electron/asar';

const hook = path.resolve(
  __dirname,
  '../../.erb/scripts/check-packaged-dependencies.cjs'
);
let directory: string;
let source: string;
let resources: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-package-test-'));
  source = path.join(directory, 'source');
  resources = path.join(directory, 'resources');
  fs.mkdirSync(source);
  fs.mkdirSync(resources);
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function write(file: string, content: string, mode = 0o644) {
  const target = path.join(source, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode });
}
async function pack(dependencies: Record<string, string>, unpack = '') {
  write('package.json', JSON.stringify({ dependencies }));
  await createPackageWithOptions(source, path.join(resources, 'app.asar'), {
    unpackDir: unpack,
  });
}
function verify() {
  // Execute with Node's resolver, matching electron-builder's hook environment.
  return execFileSync(
    process.execPath,
    [
      '-e',
      'require(process.argv[1]).verifyPackagedDependencies(process.argv[2], "linux", "x64")',
      hook,
      resources,
    ],
    { encoding: 'utf8', stdio: 'pipe' }
  );
}

test('rejects a dependency that is available only in the development checkout', async () => {
  await pack({ 'node-pty': '^1.1.0' });
  expect(verify).toThrow('Packaged runtime dependency is missing: node-pty');
});

test('accepts runtime modules inside the archive', async () => {
  write('node_modules/example/index.js', 'module.exports = {};');
  await pack({ example: '1.0.0' });
  expect(verify()).toContain('Verified packaged runtime dependencies');
});

test('rejects native terminal files left inside the archive', async () => {
  write('node_modules/node-pty/index.js', 'module.exports = {};');
  write('node_modules/node-pty/build/Release/pty.node', 'fixture');
  write('node_modules/node-pty/build/Release/spawn-helper', 'fixture', 0o755);
  await pack({ 'node-pty': '1.1.0' });
  expect(verify).toThrow('native addon is missing or not unpacked');
});

test('rejects an unpacked terminal helper without execute permission', async () => {
  write('node_modules/node-pty/index.js', 'module.exports = {};');
  write('node_modules/node-pty/build/Release/pty.node', 'fixture');
  write('node_modules/node-pty/build/Release/spawn-helper', 'fixture');
  await pack({ 'node-pty': '1.1.0' }, 'node_modules/node-pty');
  expect(verify).toThrow('spawn-helper is missing or not executable');
});

test('accepts unpacked terminal addon and executable helper', async () => {
  write('node_modules/node-pty/index.js', 'module.exports = {};');
  write('node_modules/node-pty/build/Release/pty.node', 'fixture');
  write('node_modules/node-pty/build/Release/spawn-helper', 'fixture', 0o755);
  await pack({ 'node-pty': '1.1.0' }, 'node_modules/node-pty');
  expect(verify()).toContain('Verified packaged runtime dependencies');
});

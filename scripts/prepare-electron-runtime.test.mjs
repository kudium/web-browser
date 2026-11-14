import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  options,
  requireSpace,
  gnArgs,
  writeOwned,
} from './prepare-electron-runtime.mjs';
const require = createRequire(import.meta.url);
const {
  validateSource,
} = require('../apps/browser/.erb/scripts/patch-browser-passkeys.cjs');

test('runtime commands reject invalid targets and dangerous configuration ambiguity', () => {
  assert.equal(options(['prepare']).mode, 'prepare');
  assert.deepEqual(
    options([
      'build',
      '--root',
      '/Volumes/Runtime/kudium',
      '--arch',
      'x64',
      '--jobs',
      '6',
    ]),
    { mode: 'build', root: '/Volumes/Runtime/kudium', arch: 'x64', jobs: 6 }
  );
  for (const args of [
    ['publish'],
    ['sync', '--root'],
    ['build', '--arch', 'x86'],
    ['build', '--jobs', 'NaN'],
    ['build', '--jobs', '0'],
    ['prepare', '--root', '/a path'],
    ['prepare', '--unknown', 'x'],
  ])
    assert.throws(() => options(args));
});

test('source download/compilation gate refuses the current low-space scenario', () => {
  assert.throws(
    () => requireSpace(11 * 1024 ** 3),
    /No dependency sync or compilation started/
  );
  assert.doesNotThrow(() => requireSpace(100 * 1024 ** 3));
});

test('both target configurations keep local execution and upstream release settings', () => {
  for (const arch of ['arm64', 'x64']) {
    const args = gnArgs(arch);
    assert.match(args, /build\/args\/release.gn/);
    assert.match(args, new RegExp(`target_cpu = "${arch}"`));
    assert.match(args, /use_remoteexec = false/);
  }
  assert.throws(() => gnArgs('unknown'));
});

test('preparation never overwrites a differing existing build configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-config-'));
  try {
    const file = path.join(root, 'config/args.gn');
    writeOwned(file, 'original\n');
    writeOwned(file, 'original\n');
    assert.throws(
      () => writeOwned(file, 'changed\n'),
      /Existing runtime configuration differs/
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'original\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a package.json claiming Electron 45 does not establish source provenance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-impostor-'));
  try {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ version: '45.0.0' })
    );
    assert.throws(() => validateSource(root), /pinned Electron/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { options, buildSteps, verifyArtifacts } from './local-release.mjs';

test('commands validate channels, version options and matching retry tags', () => {
  assert.deepEqual(options(['beta']), { mode: 'beta', bump: 'auto', dryRun: false, retry: undefined });
  assert.equal(options(['stable', '--bump', 'minor', '--dry-run']).bump, 'minor');
  assert.equal(options(['beta', '--retry', 'v1.2.3-beta.2']).retry, 'v1.2.3-beta.2');
  for (const args of [['production'], ['test', '--bump', 'major'], ['beta', '--retry'], ['stable', '--retry', 'v1.2.3-beta.1'], ['beta', '--bump', 'typo'], ['beta', '--unknown']]) assert.throws(() => options(args));
});

test('builds both architectures with separate output, verification and collection', () => {
  const steps = buildSteps('/checkout with spaces', '/output with spaces', 'v1.2.3-beta.1');
  assert.deepEqual(steps.slice(0, 6).map(([command, args]) => [command, args[0]]), [['npm', 'ci'], ['node', 'node_modules/electron/install.js'], ['npx', 'tsc'], ['npm', 'test'], ['npm', 'run'], ['node', 'scripts/ci/prepare-browser-release.mjs']]);
  for (const arch of ['arm64', 'x64']) {
    const index = steps.findIndex(([, args]) => args.includes(`--${arch}`));
    assert.ok(index > 0);
    assert.ok(steps[index][1].includes(`-c.directories.output=/output with spaces/builds/${arch}`));
    assert.equal(steps[index + 1][1][0], 'scripts/ci/verify-macos-release.mjs');
    assert.deepEqual(steps[index + 2][1], ['scripts/ci/collect-browser-release.mjs', 'darwin', arch, 'beta']);
  }
  assert.ok(!steps.some(([command]) => command === 'git'));
});

test('blocks corrupted artifacts, incomplete targets and a wrong channel before publication', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-release-test-'));
  try {
    for (const arch of ['arm64', 'x64']) {
      const target = path.join(directory, 'installers', `darwin-${arch}`);
      fs.mkdirSync(target, { recursive: true });
      const content = Buffer.from(`fixture-${arch}`);
      fs.writeFileSync(path.join(target, 'app.zip'), content);
      fs.writeFileSync(path.join(target, 'app.dmg'), content);
      fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ version: '1.2.3-beta.1', channel: 'beta', platform: 'darwin', arch, files: ['zip', 'dmg'].map((extension) => ({ url: `https://browser.kudium.com/app.${extension}`, size: content.length, sha512: createHash('sha512').update(content).digest('base64') })) }));
    }
    verifyArtifacts(directory, 'v1.2.3-beta.1', 'beta');
    assert.throws(() => verifyArtifacts(directory, 'v1.2.3', 'stable'));
    const manifestPath = path.join(directory, 'installers/darwin-x64/manifest.json');
    const originalManifest = fs.readFileSync(manifestPath, 'utf8');
    const incomplete = JSON.parse(originalManifest);
    incomplete.files = incomplete.files.filter((file) => file.url.endsWith('.zip'));
    fs.writeFileSync(manifestPath, JSON.stringify(incomplete));
    assert.throws(() => verifyArtifacts(directory, 'v1.2.3-beta.1', 'beta'), /both/);
    fs.writeFileSync(manifestPath, originalManifest);
    fs.appendFileSync(path.join(directory, 'installers/darwin-x64/app.zip'), 'corruption');
    assert.throws(() => verifyArtifacts(directory, 'v1.2.3-beta.1', 'beta'), /checksum/);
    fs.rmSync(path.join(directory, 'installers/darwin-x64'), { recursive: true });
    assert.throws(() => verifyArtifacts(directory, 'v1.2.3-beta.1', 'beta'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('collector supports isolated output paths containing spaces and rejects stale checksums', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release collector '));
  const build = path.join(directory, 'build #1');
  const artifacts = path.join(directory, 'artifacts');
  try {
    fs.mkdirSync(build);
    const version = JSON.parse(fs.readFileSync(new URL('../apps/browser/package.json', import.meta.url))).version;
    const content = Buffer.from('zip fixture');
    const yaml = `version: ${version}\nfiles:\n  - url: app.zip\n    size: ${content.length}\n    sha512: ${createHash('sha512').update(content).digest('base64')}\n`;
    fs.writeFileSync(path.join(build, 'app.zip'), content);
    fs.writeFileSync(path.join(build, 'beta-mac.yml'), yaml);
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./ci/collect-browser-release.mjs', import.meta.url)), 'darwin', 'arm64', 'beta'], { env: { ...process.env, RELEASE_BUILD_DIR: build, RELEASE_ARTIFACTS_DIR: artifacts }, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const manifest = JSON.parse(fs.readFileSync(path.join(artifacts, 'darwin-arm64/manifest.json')));
    assert.equal(manifest.arch, 'arm64');
    fs.appendFileSync(path.join(build, 'app.zip'), 'changed');
    assert.notEqual(run().status, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

import { fileURLToPath } from 'node:url';

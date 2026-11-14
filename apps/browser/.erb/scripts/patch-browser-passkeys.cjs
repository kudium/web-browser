// Apply to an Electron source checkout, never to a shipped binary.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const inputs = require('../../patches/electron/runtime-inputs.json');
const patch = path.resolve(
  __dirname,
  '../../patches/electron/browser-passkeys.patch'
);
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
function validateSource(cwd) {
  // Electron's source package.json is 0.0.0-development, even on release tags.
  // Validate the actual pinned source revision instead of the npm package version.
  const head = git(cwd, ['rev-parse', 'HEAD']);
  if (head.status !== 0 || head.stdout.trim() !== inputs.electronCommit)
    throw new Error(
      `Patch requires the pinned Electron ${inputs.electronVersion} source commit`
    );
  const tag = git(cwd, ['rev-parse', `v${inputs.electronVersion}^{commit}`]);
  if (tag.status !== 0 || tag.stdout.trim() !== inputs.electronCommit)
    throw new Error(
      'Electron release tag does not match the pinned source commit'
    );
  const deps = fs.readFileSync(path.join(cwd, 'DEPS'), 'utf8');
  for (const [name, expected] of [
    ['chromium_version', inputs.chromiumVersion],
    ['node_version', inputs.nodeVersion],
  ]) {
    const value = deps.match(new RegExp(`'${name}':\\s*'([^']+)'`))?.[1];
    if (value !== expected)
      throw new Error(`Unexpected ${name} in Electron DEPS`);
  }
}
function applyPatch(source, mode) {
  if (!source || !['--check', '--apply'].includes(mode))
    throw new Error(
      'Usage: node patch-browser-passkeys.cjs /path/to/src/electron --check|--apply'
    );
  const cwd = path.resolve(source);
  validateSource(cwd);
  if (git(cwd, ['apply', '--reverse', '--check', patch]).status === 0) {
    console.log('Browser passkey patch already applied.');
    return;
  }
  const check = git(cwd, ['apply', '--check', patch]);
  if (check.status !== 0)
    throw new Error(check.stderr || 'Patch does not match this checkout');
  if (mode === '--apply') {
    const result = git(cwd, ['apply', patch]);
    if (result.status !== 0) throw new Error(result.stderr);
  }
  console.log(
    mode === '--apply'
      ? 'Browser passkey patch applied.'
      : 'Browser passkey patch applies cleanly.'
  );
}
module.exports = { applyPatch, validateSource };
if (require.main === module) applyPatch(...process.argv.slice(2));

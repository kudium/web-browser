import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { selectRelease } from './ci/select-browser-release.mjs';
import { validateManifests } from './ci/browser-release-targets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const identity = 'Developer ID Application: Kudium LTD (79VCL28M9P)';

export function options(args) {
  const mode = args.shift();
  if (!['test', 'beta', 'stable'].includes(mode)) throw new Error('Choose test, beta or stable');
  let bump = 'auto', dryRun = false, retry;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--bump') bump = args.shift();
    else if (arg === '--retry') {
      retry = args.shift();
      if (!retry) throw new Error('Supply the version tag after --retry');
    }
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['auto', 'patch', 'minor', 'major'].includes(bump)) throw new Error('Invalid version bump');
  if (retry && (!/^v\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(retry) ||
    (retry.includes('-beta.') ? 'beta' : 'stable') !== mode)) throw new Error('Retry tag must match the release channel');
  if (mode === 'test' && (retry || bump !== 'auto')) throw new Error('Test builds do not create release versions');
  return { mode, bump, dryRun, retry };
}

export function buildSteps(checkout, artifacts, tag) {
  const browser = path.join(checkout, 'apps/browser');
  const steps = [
    ['npm', ['ci'], browser],
    // Electron 45 no longer installs its runtime during npm ci.
    // The installer checks the downloaded/cached distribution's upstream checksum.
    ['node', ['node_modules/electron/install.js'], browser],
    ['node', ['--test', 'scripts/release-update-metadata.test.cjs'], checkout],
    ['npx', ['tsc', '--noEmit'], browser],
    ['npm', ['test', '--', '--runInBand', '--roots', 'src', '--config', '.erb/configs/jest.ci.cjs'], browser],
    ['npm', ['run', 'test:migrations'], browser],
    ['node', ['scripts/ci/prepare-browser-release.mjs', tag], checkout],
    ['npm', ['run', 'build'], browser],
  ];
  for (const arch of ['arm64', 'x64']) {
    const build = path.join(artifacts, 'builds', arch);
    steps.push(
      ['npx', ['electron-builder', 'build', '--config', '.erb/configs/electron-builder.web.cjs', '--publish', 'never', '--dir', '--mac', `--${arch}`, `-c.directories.output=${build}`], browser, { RELEASE_DEFER_NOTARIZATION: 'true' }],
    );
  }
  // Submit both architectures before waiting for Apple's asynchronous review.
  for (const arch of ['arm64', 'x64']) {
    const build = path.join(artifacts, 'builds', arch);
    const application = path.join(build, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Kudium Browser.app');
    steps.push(
      ['node', ['.erb/scripts/notarize.js', application], browser],
      ['npx', ['electron-builder', 'build', '--config', '.erb/configs/electron-builder.web.cjs', '--publish', 'never', '--prepackaged', application, '--mac', `--${arch}`, `-c.directories.output=${build}`], browser],
      ['node', ['scripts/ci/verify-macos-release.mjs', build], checkout],
      ['node', ['scripts/ci/collect-browser-release.mjs', 'darwin', arch, tag.includes('-beta.') ? 'beta' : 'stable'], checkout, { RELEASE_BUILD_DIR: build, RELEASE_ARTIFACTS_DIR: path.join(artifacts, 'installers') }],
    );
  }
  return steps;
}

function run(command, args, cwd = root, env = process.env, log) {
  console.log(`→ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env, stdio: log ? ['inherit', log, log] : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed${log ? '; see the retained build.log' : ''}`);
}
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git command failed');
  return result.stdout.trim();
}
function pushRelease(commit, tag) {
  const alreadyOnMain = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'origin/main'], { cwd: root }).status === 0;
  if (!alreadyOnMain) git('merge-base', '--is-ancestor', 'origin/main', commit);
  run('git', ['push', '--atomic', 'origin', ...(!alreadyOnMain ? [`${commit}:refs/heads/main`] : []), `refs/tags/${tag}`]);
}
function credentials() {
  const configPath = process.env.KUDIUM_RELEASE_CONFIG || path.join(os.homedir(), 'Library/Application Support/Kudium/release.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const env = { ...process.env, RELEASE_SIGNING_REQUIRED: 'true', CSC_NAME: identity, CSC_IDENTITY_AUTO_DISCOVERY: 'true' };
  if (config.appleApiKeyPath && !env.APPLE_API_KEY) env.APPLE_API_KEY = fs.readFileSync(config.appleApiKeyPath, 'utf8');
  env.APPLE_API_KEY_ID ||= config.appleApiKeyId;
  env.APPLE_API_ISSUER ||= config.appleApiIssuer;
  env.RELEASE_PUBLISH_TOKEN ||= config.publishToken;
  const required = env.APPLE_API_KEY?.trim()
    ? ['APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'RELEASE_PUBLISH_TOKEN']
    : ['APPLE_ID', 'APPLE_ID_PASS', 'APPLE_TEAM_ID', 'RELEASE_PUBLISH_TOKEN'];
  for (const name of required) if (!env[name]?.trim()) throw new Error(`Missing ${name}. Configure ${configPath} or your shell environment; never commit secrets.`);
  const github = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (github.error || github.status !== 0) throw new Error('Authenticate GitHub CLI with release write access before building');
  const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  if (!identities.stdout?.includes(identity)) throw new Error('Install the Kudium Developer ID certificate and private key in Keychain first');
  return env;
}

export function verifyArtifacts(directory, tag, channel) {
  const manifests = ['arm64', 'x64'].map((arch) => {
    const target = path.join(directory, 'installers', `darwin-${arch}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
    if (manifest.version !== tag.slice(1) || manifest.channel !== channel || manifest.platform !== 'darwin' || manifest.arch !== arch) throw new Error('Artifacts do not match the requested release');
    if (!Array.isArray(manifest.files) || !['.zip', '.dmg'].every((suffix) => manifest.files.some((file) => new URL(file.url).pathname.endsWith(suffix)))) throw new Error('Release requires both the update ZIP and DMG installer');
    for (const file of manifest.files) {
      const content = fs.readFileSync(path.join(target, path.basename(new URL(file.url).pathname)));
      if (content.length !== file.size || createHash('sha512').update(content).digest('base64') !== file.sha512) throw new Error('Artifact checksum mismatch; publication blocked');
    }
    return manifest;
  });
  validateManifests(manifests, 'macos');
}

export function main(args = process.argv.slice(2)) {
  const opt = options([...args]);
  if (process.platform !== 'darwin') throw new Error('These commands build macOS installers and must run on a Mac');
  if (opt.mode === 'test') {
    const output = path.join(root, 'apps/browser/release', `local-test-${Date.now()}`);
    console.log(`Local test build (${process.arch}), no push or publication. Output: ${output}`);
    if (opt.dryRun) return;
    const env = { ...process.env, CI: 'false', RELEASE_SIGNING_REQUIRED: 'false' };
    run('npm', ['run', 'build'], path.join(root, 'apps/browser'), env);
    run('npx', ['electron-builder', 'build', '--config', '.erb/configs/electron-builder.web.cjs', '--publish', 'never', '--mac', `--${process.arch}`, `-c.directories.output=${output}`], path.join(root, 'apps/browser'), env);
    console.log(`Test installer ready: ${output}`);
    return;
  }
  if (!opt.dryRun) {
    if (git('branch', '--show-current') !== 'main') throw new Error('Run beta/stable releases from main');
    if (git('status', '--porcelain')) throw new Error('Commit your changes first. Beta/stable releases require a clean working tree');
  }
  const commit = git('rev-parse', 'HEAD');
  const env = opt.dryRun ? {} : credentials();
  if (!opt.dryRun) {
    run('git', ['fetch', 'origin', 'main', '--tags']);
    git('merge-base', '--is-ancestor', 'origin/main', commit);
  }
  const tag = opt.retry || selectRelease(opt.bump, opt.mode, git('tag', '--list').split('\n'));
  const artifacts = path.join(root, 'release-artifacts', 'local', tag);
  const checkout = path.join(artifacts, 'source');
  const steps = buildSteps(checkout, artifacts, tag);
  console.log(`${opt.retry ? 'Retrying publication of' : 'Building'} ${tag} (${opt.mode}) from ${commit}`);
  if (opt.dryRun) {
    console.log(JSON.stringify({ tag, channel: opt.mode, artifacts, steps: steps.map(([command, args]) => [command, ...args]), finalSteps: ['Push main and version tag atomically', `Publish ${opt.mode} feed after both architectures pass`] }, null, 2));
    return;
  }
  env.RELEASE_CHANNEL = opt.mode;
  env.RELEASE_VERSION = tag;
  if (!opt.retry) {
    if (fs.existsSync(artifacts)) throw new Error(`Artifacts already exist at ${artifacts}. Inspect them; use --retry ${tag} only for a completed build`);
    fs.mkdirSync(path.dirname(artifacts), { recursive: true });
    fs.mkdirSync(artifacts);
    const log = fs.openSync(path.join(artifacts, 'build.log'), 'a', 0o600);
    try {
      run('git', ['clone', '--shared', '--no-checkout', root, checkout]);
      run('git', ['checkout', '--detach', commit], checkout);
      for (const [command, args, cwd, extra] of steps) run(command, args, cwd, { ...env, ...extra }, log);
      verifyArtifacts(artifacts, tag, opt.mode);
      fs.writeFileSync(path.join(artifacts, 'release.json'), JSON.stringify({ tag, channel: opt.mode, commit, verified: true }, null, 2));
    } finally { fs.closeSync(log); }
    // Both verified artifacts exist before any push or publication.
    run('git', ['tag', tag, commit]);
    pushRelease(commit, tag);
  } else {
    const record = JSON.parse(fs.readFileSync(path.join(artifacts, 'release.json'), 'utf8'));
    if (!record.verified || record.tag !== tag || record.channel !== opt.mode || git('rev-parse', `${tag}^{commit}`) !== record.commit) throw new Error('Retry requires retained verified artifacts matching the release tag');
    for (const arch of ['arm64', 'x64']) run('node', ['scripts/ci/verify-macos-release.mjs', path.join(artifacts, 'builds', arch)], root, env);
    verifyArtifacts(artifacts, tag, opt.mode);
    pushRelease(record.commit, tag);
  }
  run('node', ['scripts/ci/publish-browser-release.mjs', path.join(artifacts, 'installers'), 'macos'], root, env);
  console.log(`Published ${tag} to ${opt.mode}. Artifacts and build log: ${artifacts}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let awake;
  try {
    if (process.platform === 'darwin' && !process.argv.includes('--dry-run')) {
      awake = spawn('/usr/bin/caffeinate', ['-ims', '-w', String(process.pid)], { stdio: 'ignore' });
      awake.on('error', error => console.error(`Could not prevent idle sleep: ${error.message}`));
      console.log('Preventing idle sleep during release. Keep the lid open and connect power; lid closure can still interrupt uploads.');
    }
    main();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { awake?.kill(); }
}

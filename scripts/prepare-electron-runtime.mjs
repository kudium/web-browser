import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const inputs = require('../apps/browser/patches/electron/runtime-inputs.json');
const {
  applyPatch,
  validateSource,
} = require('../apps/browser/.erb/scripts/patch-browser-passkeys.cjs');
const patchFile = path.join(
  repository,
  'apps/browser/patches/electron/browser-passkeys.patch'
);
const GiB = 1024 ** 3;

export function options(args) {
  const mode = args.shift();
  if (!['prepare', 'sync', 'build', 'verify'].includes(mode))
    throw new Error('Choose prepare, sync, build or verify');
  let root = path.join(
    repository,
    'release-artifacts/electron-runtime',
    inputs.electronVersion
  );
  let arch = os.arch(),
    jobs = Math.min(8, os.availableParallelism());
  while (args.length) {
    const name = args.shift(),
      value = args.shift();
    if (!value) throw new Error(`Missing value for ${name}`);
    if (name === '--root') root = path.resolve(value);
    else if (name === '--arch') arch = value;
    else if (name === '--jobs') jobs = Number(value);
    else throw new Error(`Unknown option: ${name}`);
  }
  if (!['arm64', 'x64'].includes(arch))
    throw new Error('Architecture must be arm64 or x64');
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 64)
    throw new Error('Jobs must be an integer from 1 to 64');
  if (/\s/.test(root))
    throw new Error('Chromium requires a build root without whitespace');
  return { mode, root, arch, jobs };
}

export function requireSpace(
  availableBytes,
  minimumGiB = inputs.minimumFreeGiB
) {
  if (availableBytes < minimumGiB * GiB)
    throw new Error(
      `Runtime source sync/build requires at least ${minimumGiB} GiB free; ${(
        availableBytes / GiB
      ).toFixed(
        1
      )} GiB available. Choose a larger build volume with --root. No dependency sync or compilation started.`
    );
}

export function gnArgs(arch) {
  if (!['arm64', 'x64'].includes(arch))
    throw new Error('Unsupported runtime architecture');
  return `import("//electron/build/args/release.gn")\ntarget_os = "mac"\ntarget_cpu = "${arch}"\nuse_remoteexec = false\nuse_siso = true\nsymbol_level = 1\n`;
}

export function writeOwned(file, content) {
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== content)
      throw new Error(
        `Existing runtime configuration differs: ${file}. Preserve it and choose a separate build root.`
      );
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { flag: 'wx' });
}

function run(command, args, cwd, env, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed${
        capture ? ': ' + (result.stderr || result.stdout).trim() : ''
      }`
    );
  return result.stdout?.trim();
}
const sha = (content) => createHash('sha256').update(content).digest('hex');
function freeSpace(root) {
  const stats = fs.statfsSync(root);
  return stats.bavail * stats.bsize;
}

function verifySource(source, env) {
  validateSource(source);
  const diff = spawnSync(
    'git',
    [
      'diff',
      '--binary',
      '--no-ext-diff',
      '--no-color',
      '--src-prefix=a/',
      '--dst-prefix=b/',
    ],
    { cwd: source, env, encoding: 'utf8' }
  );
  if (diff.status !== 0 || diff.stdout !== fs.readFileSync(patchFile, 'utf8'))
    throw new Error(
      'Runtime source changes do not exactly match the reviewed browser passkey patch'
    );
  if (run('git', ['diff', '--cached', '--name-only'], source, env, true))
    throw new Error(
      'Runtime source has staged changes; use a separate pinned checkout'
    );
}

function fingerprint(directory) {
  const files = {};
  function walk(folder) {
    for (const entry of fs
      .readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const file = path.join(folder, entry.name);
      const name = path.relative(directory, file);
      if (entry.isSymbolicLink())
        files[name] = { symlink: fs.readlinkSync(file) };
      else if (entry.isDirectory()) walk(file);
      else
        files[name] = {
          sha256: sha(fs.readFileSync(file)),
          size: fs.statSync(file).size,
        };
    }
  }
  walk(directory);
  return files;
}

function verifyChromium(root, env) {
  // Electron's patch hooks may add commits above Chromium's release revision.
  // Require that exact upstream revision to remain the base of the patched tree.
  run(
    'git',
    ['merge-base', '--is-ancestor', inputs.chromiumCommit, 'HEAD'],
    path.join(root, 'src'),
    env,
    true
  );
}

function probe(directory, arch, env) {
  const executable = path.join(
    directory,
    'Electron.app/Contents/MacOS/Electron'
  );
  const probeScript = path.join(
    repository,
    'apps/browser/.erb/scripts/browser-passkey-runtime-probe.cjs'
  );
  const output = run(executable, [probeScript], repository, env, true);
  const line = output
    .split('\n')
    .find((value) => value.startsWith('KUDIUM_RUNTIME_PROBE:'));
  if (!line) throw new Error('Custom runtime did not return its probe result');
  const result = JSON.parse(line.slice('KUDIUM_RUNTIME_PROBE:'.length));
  if (result.arch !== arch)
    throw new Error(
      'Built runtime architecture does not match the requested target'
    );
  return result;
}

function toolchain(root, env) {
  const node = process.versions.node.split('.').map(Number);
  if (node[0] < 22 || (node[0] === 22 && node[1] < 18))
    throw new Error('Electron source builds require Node 22.18 or newer');
  const python = run('python3', ['--version'], root, env, true);
  const version = python.match(/Python (\d+)\.(\d+)/);
  if (
    !version ||
    Number(version[1]) < 3 ||
    (Number(version[1]) === 3 && Number(version[2]) < 9)
  )
    throw new Error('Electron source builds require Python 3.9 or newer');
  const xcode = run('/usr/bin/xcodebuild', ['-version'], root, env, true);
  const developerDirectory = run(
    '/usr/bin/xcode-select',
    ['-p'],
    root,
    env,
    true
  );
  if (
    !fs.existsSync(
      path.join(developerDirectory, 'Platforms/MacOSX.platform/Developer/SDKs')
    )
  )
    throw new Error(
      'Select a full Xcode installation before synchronizing Electron'
    );
  if (os.arch() === 'arm64')
    run('/usr/bin/arch', ['-x86_64', '/usr/bin/true'], root, env, true);
  return {
    node: process.versions.node,
    python,
    xcode,
    developerDirectory,
    hostArch: os.arch(),
    memoryBytes: os.totalmem(),
  };
}

export async function main(config) {
  if (process.platform !== 'darwin')
    throw new Error('The custom passkey runtime workflow requires a Mac');
  const { root, mode, arch, jobs } = config;
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, '.kudium-runtime.lock');
  const handle = fs.openSync(lock, 'wx');
  fs.writeFileSync(handle, `${process.pid}\n`);
  const depot = path.join(root, 'depot_tools');
  const source = path.join(root, 'src/electron');
  const env = {
    ...process.env,
    PATH: `${depot}${path.delimiter}${process.env.PATH}`,
    DEPOT_TOOLS_UPDATE: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_OVERRIDE_DIST_PATH;
  const patchSha256 = sha(fs.readFileSync(patchFile));
  const output = path.join(root, `src/out/Kudium-${arch}`);
  const distributionRoot = path.join(
    root,
    'distributions',
    `darwin-${arch}-${patchSha256.slice(0, 12)}`
  );
  const distribution = path.join(distributionRoot, 'dist');
  try {
    if (mode === 'prepare') {
      requireSpace(freeSpace(root), 1);
      const tools = toolchain(root, env);
      if (!fs.existsSync(source)) {
        fs.mkdirSync(path.dirname(source), { recursive: true });
        run(
          'git',
          [
            'clone',
            '--depth',
            '1',
            '--single-branch',
            '--branch',
            `v${inputs.electronVersion}`,
            inputs.electronRepository,
            source,
          ],
          root,
          env
        );
      }
      if (!fs.existsSync(depot)) {
        fs.mkdirSync(depot);
        run('git', ['init'], depot, env);
        run(
          'git',
          ['remote', 'add', 'origin', inputs.depotToolsRepository],
          depot,
          env
        );
        run(
          'git',
          ['fetch', '--depth', '1', 'origin', inputs.depotToolsCommit],
          depot,
          env
        );
        run('git', ['checkout', '--detach', 'FETCH_HEAD'], depot, env);
      }
      const depotCommit = run('git', ['rev-parse', 'HEAD'], depot, env, true);
      if (depotCommit !== inputs.depotToolsCommit)
        throw new Error('depot_tools does not match the pinned revision');
      applyPatch(source, '--apply');
      verifySource(source, env);
      const gclient = `solutions = [{\n  "name": "src/electron",\n  "url": ${JSON.stringify(
        inputs.electronRepository
      )},\n  "deps_file": "DEPS",\n  "managed": False,\n  "custom_deps": {},\n  "custom_vars": {"mac_xcode_version": "default"},\n}]\ntarget_os = ["mac"]\n`;
      writeOwned(path.join(root, '.gclient'), gclient);
      for (const target of ['arm64', 'x64'])
        writeOwned(
          path.join(root, 'config', `${target}.args.gn`),
          gnArgs(target)
        );
      const availableBytes = freeSpace(root);
      const preparation = {
        inputs,
        patchSha256,
        source,
        depotToolsCommit: depotCommit,
        toolchain: tools,
        preparedAt: new Date().toISOString(),
        availableBytes,
        dependencySyncReady: availableBytes >= inputs.minimumFreeGiB * GiB,
        compiled: false,
      };
      fs.writeFileSync(
        path.join(root, 'preparation.json'),
        JSON.stringify(preparation, null, 2) + '\n'
      );
      console.log(
        `Prepared pinned Electron ${inputs.electronVersion} source and local arm64/x64 build configurations.`
      );
      console.log(
        `${(availableBytes / GiB).toFixed(
          1
        )} GiB free; dependency sync requires ${
          inputs.minimumFreeGiB
        } GiB. Native passkeys remain unverified.`
      );
      return preparation;
    }
    if (!fs.existsSync(path.join(root, 'preparation.json')))
      throw new Error('Run runtime:prepare for this build root first');
    verifySource(source, env);
    if (
      run('git', ['rev-parse', 'HEAD'], depot, env, true) !==
      inputs.depotToolsCommit
    )
      throw new Error('depot_tools revision changed');
    if (mode === 'sync' || mode === 'build') {
      requireSpace(freeSpace(root));
      toolchain(root, env);
    }
    if (mode === 'sync') {
      run(
        path.join(depot, 'gclient'),
        [
          'sync',
          '--no-history',
          '--shallow',
          '--jobs',
          String(Math.min(jobs, 4)),
        ],
        root,
        env
      );
      verifySource(source, env);
      verifyChromium(root, env);
      console.log(
        'Electron dependencies and upstream patches synchronized. No compilation performed.'
      );
      return;
    }
    if (mode === 'verify') {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(distributionRoot, 'runtime.json'), 'utf8')
      );
      if (
        manifest.patchSha256 !== patchSha256 ||
        manifest.inputs.electronCommit !== inputs.electronCommit ||
        manifest.arch !== arch ||
        JSON.stringify(fingerprint(distribution)) !==
          JSON.stringify(manifest.files)
      )
        throw new Error(
          'Custom runtime metadata or distribution checksum mismatch'
        );
      console.log(JSON.stringify(probe(distribution, arch, env), null, 2));
      return;
    }
    if (!fs.existsSync(path.join(root, 'src/DEPS')))
      throw new Error(
        'Chromium dependencies are not synchronized; run runtime:sync first'
      );
    verifyChromium(root, env);
    if (fs.existsSync(distributionRoot))
      throw new Error(
        'Runtime distribution already exists; verify it or choose a separate build root'
      );
    fs.mkdirSync(output, { recursive: true });
    writeOwned(path.join(output, 'args.gn'), gnArgs(arch));
    run(
      path.join(depot, 'gn'),
      ['gen', output, '--fail-on-unused-args'],
      path.join(root, 'src'),
      env
    );
    run(
      path.join(depot, 'autoninja'),
      [
        '--offline',
        '-C',
        output,
        '-j',
        String(jobs),
        'electron:electron_dist_zip',
      ],
      path.join(root, 'src'),
      env
    );
    fs.mkdirSync(distribution, { recursive: true });
    const zip = path.join(output, 'dist.zip');
    run('/usr/bin/ditto', ['-x', '-k', zip, distribution], root, env);
    const result = probe(distribution, arch, env);
    const manifest = {
      inputs,
      patchSha256,
      arch,
      builtAt: new Date().toISOString(),
      zipSha256: sha(fs.readFileSync(zip)),
      probe: result,
      files: fingerprint(distribution),
      nativePasskeyAcceptance: 'unverified',
    };
    fs.writeFileSync(
      path.join(distributionRoot, 'runtime.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' }
    );
    console.log(
      `Custom runtime prepared at ${distribution}. Signing and native passkey acceptance remain separate.`
    );
  } finally {
    fs.closeSync(handle);
    fs.unlinkSync(lock);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    await main(options(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

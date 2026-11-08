/* Disposable copies of an actual packaged executable; never flips development Electron. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { getCurrentFuseWire, flipFuses, FuseVersion } = require('@electron/fuses');
const asar = require('@electron/asar');
const plist = require('plist');
const root = path.resolve(__dirname, '../..');
const packagePath = path.resolve(process.argv[2] || '');
assert.equal(process.platform, 'darwin', 'This native packaged regression currently verifies macOS only');
assert(packagePath.endsWith('.app') && fs.existsSync(packagePath), 'Supply an existing packaged .app');
const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).build.electronFuses;
const mapping = { runAsNode: 0, enableNodeOptionsEnvironmentVariable: 2, enableNodeCliInspectArguments: 3, enableEmbeddedAsarIntegrityValidation: 4, onlyLoadAppFromAsar: 5 };
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-fuses-'));
const fixtureCode = `const {app}=require('electron');const fs=require('fs'),path=require('path');const {Worker}=require('worker_threads');const directory=process.env.KUDIUMBROWSER_FUSE_PROFILE;app.setPath('userData',directory);app.whenReady().then(()=>{fs.writeFileSync(path.join(directory,'FIXTURE_MARKER_SAFE'),'ran');fs.writeFileSync(path.join(directory,'http-header-size'),String(require('http').maxHeaderSize));const worker=new Worker("require('fs').writeFileSync(require('worker_threads').workerData,'ran')",{eval:true,workerData:path.join(directory,'worker-ran')});worker.on('error',error=>{console.error(error);app.exit(1)});worker.on('exit',code=>setTimeout(()=>app.exit(code),200));});`;
const packagedWire = async () => {
  const wire = await getCurrentFuseWire(packagePath);
  assert.equal(wire.version, '1');
  assert.equal(Object.keys(wire).filter((key) => /^\d+$/.test(key)).length, 9, 'Review newly added/removed Electron fuses');
  for (const [key, index] of Object.entries(mapping)) assert.equal(wire[index], config[key] ? 49 : 48, key);
  return wire;
};
const launch = (executable, args, env, profile, signalTest = false) => new Promise((resolve, reject) => {
  const start = performance.now();
  const child = spawn(executable, [...args, `--user-data-dir=${profile}`], { env: { ...process.env, NODE_OPTIONS: '', ELECTRON_RUN_AS_NODE: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 6000);
  const signalTimer = signalTest ? setInterval(() => { if (fs.existsSync(path.join(profile, 'FIXTURE_MARKER_SAFE'))) { clearInterval(signalTimer); child.kill('SIGUSR1'); } }, 20) : undefined;
  child.on('error', (error) => { clearTimeout(timeout); clearInterval(signalTimer); reject(error); });
  child.on('close', (exitCode, signal) => {
    clearTimeout(timeout); clearInterval(signalTimer);
    resolve({ exitCode, signal, timedOut, elapsedMs: performance.now() - start, inspectorOpened: /Debugger listening on ws:/.test(output), stderrTail: output.slice(-1800), safeBootstrap: fs.existsSync(path.join(profile, 'FIXTURE_MARKER_SAFE')), tamperedBootstrap: fs.existsSync(path.join(profile, 'FIXTURE_MARKER_EVIL')), attackExecuted: fs.existsSync(path.join(profile, 'attack-ran')), workerExecuted: fs.existsSync(path.join(profile, 'worker-ran')), httpHeaderSize: fs.existsSync(path.join(profile, 'http-header-size')) ? Number(fs.readFileSync(path.join(profile, 'http-header-size'))) : null });
  });
});
async function run() {
  const wire = await packagedWire();
  const infoPath = path.join(packagePath, 'Contents/Info.plist');
  const originalInfo = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  const originalArchive = path.join(packagePath, 'Contents/Resources/app.asar');
  const actualHeader = asar.getRawHeader(originalArchive);
  assert.equal(originalInfo.ElectronAsarIntegrity['Resources/app.asar'].hash, hash(actualHeader.headerString));
  const sourceDir = path.join(temporary, 'fixture-source');
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'package.json'), JSON.stringify({ name: 'fuse-regression', main: 'main.js' }));
  fs.writeFileSync(path.join(sourceDir, 'main.js'), fixtureCode);
  const fixtureArchive = path.join(temporary, 'fixture.asar');
  await asar.createPackage(sourceDir, fixtureArchive);
  const fixtureHeader = asar.getRawHeader(fixtureArchive);
  const phases = {};
  for (const phase of ['before', 'after']) {
    const appPath = path.join(temporary, `${phase}.app`);
    fs.cpSync(packagePath, appPath, { recursive: true, verbatimSymlinks: true });
    const framework = fs.realpathSync(path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Electron Framework'));
    assert(framework.startsWith(`${fs.realpathSync(appPath)}${path.sep}`), 'Fuse edits must stay inside the disposable copy');
    const info = plist.parse(fs.readFileSync(path.join(appPath, 'Contents/Info.plist'), 'utf8'));
    info.ElectronAsarIntegrity = { 'Resources/app.asar': { algorithm: 'SHA256', hash: hash(fixtureHeader.headerString) } };
    fs.writeFileSync(path.join(appPath, 'Contents/Info.plist'), plist.build(info));
    const archive = path.join(appPath, 'Contents/Resources/app.asar');
    fs.copyFileSync(fixtureArchive, archive);
    const target = { version: FuseVersion.V1, resetAdHocDarwinSignature: true };
    for (const [key, index] of Object.entries(mapping)) target[index] = phase === 'before' ? index < 4 : config[key];
    await flipFuses(appPath, target);
    const executable = path.join(appPath, 'Contents/MacOS', info.CFBundleExecutable);
    const attack = path.join(temporary, 'attack.cjs');
    fs.writeFileSync(attack, "require('fs').writeFileSync(require('path').join(process.env.KUDIUMBROWSER_FUSE_PROFILE,'attack-ran'),'ran');");
    const cases = {};
    const runCase = async (name, args = [], env = {}, signal = false) => {
      const profile = path.join(temporary, `${phase}-${name}`); fs.mkdirSync(profile);
      cases[name] = await launch(executable, args, { KUDIUMBROWSER_FUSE_PROFILE: profile, ...env }, profile, signal);
      console.log(`${phase}/${name}: exit=${cases[name].exitCode} signal=${cases[name].signal} timeout=${cases[name].timedOut}`);
      return cases[name];
    };
    let result = await runCase('clean');
    assert.equal(result.exitCode, 0, JSON.stringify(result)); assert(result.safeBootstrap && result.workerExecuted);
    result = await runCase('runAsNode', [attack], { ELECTRON_RUN_AS_NODE: '1' });
    assert.equal(result.attackExecuted, phase === 'before', JSON.stringify(result));
    if (phase === 'after') assert(result.safeBootstrap && result.workerExecuted);
    result = await runCase('nodeOptionsRequire', [], { NODE_OPTIONS: `--require=${attack}` });
    assert.equal(result.attackExecuted, false, 'Packaged Electron already rejects --require in NODE_OPTIONS');
    assert(result.safeBootstrap && result.workerExecuted);
    result = await runCase('nodeOptionsSupported', [], { NODE_OPTIONS: '--max-http-header-size=12345' });
    assert.equal(result.httpHeaderSize, phase === 'before' ? 12345 : 16384, JSON.stringify(result));
    assert(result.safeBootstrap && result.workerExecuted);
    result = await runCase('inspect', ['--inspect=127.0.0.1:0']);
    assert.equal(result.inspectorOpened, phase === 'before', JSON.stringify(result));
    assert(result.safeBootstrap && result.workerExecuted);
    // Hold the fixture long enough to deliver SIGUSR1 to the main process.
    result = await runCase('signalInspector', [], {}, true);
    assert.equal(result.inspectorOpened, phase === 'before', JSON.stringify(result));
    if (phase === 'before') assert.equal(result.exitCode, 0, JSON.stringify(result));
    else assert.equal(result.signal, 'SIGUSR1', 'With no inspector handler, SIGUSR1 keeps its default termination behavior');
    const bytes = fs.readFileSync(archive);
    const position = bytes.indexOf(Buffer.from('FIXTURE_MARKER_SAFE'), 8 + fixtureHeader.headerSize);
    assert(position >= 0);
    bytes.write('FIXTURE_MARKER_EVIL', position);
    fs.writeFileSync(archive, bytes);
    result = await runCase('tamperedArchive');
    assert.equal(result.tamperedBootstrap, phase === 'before', JSON.stringify(result));
    if (phase === 'after') { assert(!result.safeBootstrap); assert(!result.timedOut); assert.match(result.stderrTail, /integrity/i); }
    fs.renameSync(archive, `${archive}.saved`);
    const fallback = path.join(appPath, 'Contents/Resources/app'); fs.mkdirSync(fallback);
    fs.writeFileSync(path.join(fallback, 'package.json'), '{"name":"fallback-attack","main":"main.js"}');
    fs.writeFileSync(path.join(fallback, 'main.js'), `const {app}=require('electron');${fs.readFileSync(attack, 'utf8')}app.whenReady().then(()=>app.exit(0));`);
    result = await runCase('unpackedFallback');
    assert.equal(result.attackExecuted, phase === 'before', JSON.stringify(result));
    if (phase === 'after') { assert(!result.safeBootstrap); assert(!result.timedOut); assert.equal(result.exitCode, 1, JSON.stringify(result)); }
    phases[phase] = { wire: await getCurrentFuseWire(appPath), cases };
    fs.rmSync(appPath, { recursive: true, force: true });
  }
  assert.deepEqual(await getCurrentFuseWire(packagePath), wire, 'Input package must remain unchanged');
  const report = { recordedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, packagedWire: wire, packageConfig: config, packageManifestSha256: hash(fs.readFileSync(path.join(root, 'package.json'))), executableSha256: hash(fs.readFileSync(path.join(packagePath, 'Contents/MacOS', originalInfo.CFBundleExecutable))), frameworkSha256: hash(fs.readFileSync(path.join(packagePath, 'Contents/Frameworks/Electron Framework.framework/Electron Framework'))), appAsarSha256: hash(fs.readFileSync(originalArchive)), headerIntegrityVerified: true, probeSha256: hash(fs.readFileSync(__filename)), toolVersions: { fuses: require('@electron/fuses/package.json').version, asar: require('@electron/asar/package.json').version, builder: require('electron-builder/package.json').version }, phases, scope: 'Actual packaged executable copies on macOS arm64, unsigned/ad-hoc. Baseline restores the five original default fuse bits; both phases use identical synthetic app.asar, header integrity metadata and bootstrap code. This tests fuse effects and worker_threads compatibility, not full application flows, release signatures, update authenticity, external resources or cookies. No performance gain claim.' };
  const output = path.join(root, 'docs/benchmarks/electron-fuses.json');
  if (fs.existsSync(output)) report.previousRuns = [JSON.parse(fs.readFileSync(output, 'utf8'))];
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: packaged fuse bits, injected Node entry points, inspector, ASAR tampering/fallback and worker compatibility');
}
run().then(() => fs.rmSync(temporary, { recursive: true, force: true })).catch((error) => {
  console.error(error); fs.rmSync(temporary, { recursive: true, force: true }); process.exitCode = 1;
});

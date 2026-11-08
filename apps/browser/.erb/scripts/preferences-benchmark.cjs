/* Actual main-process preferences in Electron; disposable JSON, no user profile. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const phase = process.argv[2];
assert(['before', 'after', 'confirmation'].includes(phase), 'Expected before, after or confirmation');
if (!process.versions.electron) {
  const result = spawnSync(require('electron'), [__filename, phase], { stdio: 'inherit', timeout: 30000 });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app } = require('electron');
const root = path.resolve(__dirname, '../..');
const baseline = 'de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-preferences-'));
app.setPath('userData', temporary);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const source = phase === 'before'
  ? execFileSync('git', ['show', `${baseline}:src/main/preferences.ts`], { cwd: root })
  : fs.readFileSync(path.join(root, 'src/main/preferences.ts'));
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
let readOriginal;
let parseOriginal;
async function run() {
  await app.whenReady();
  const entry = path.join(temporary, 'entry.ts');
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/main/preferences.ts'))}; export {defaultAdvanced} from ${JSON.stringify(path.join(root, 'src/browser/advancedPreferences.ts'))}; export {websitePermissionCheckHandler} from ${JSON.stringify(path.join(root, 'src/main/websitePermissions.ts'))};`);
  const bundle = path.join(temporary, 'preferences.cjs');
  const build = await require('esbuild').build({
    entryPoints: [entry], bundle: true, platform: 'node', external: ['electron'], outfile: bundle, metafile: true,
    plugins: [{ name: 'exact-preferences', setup(builder) {
      builder.onLoad({ filter: /\/src\/main\/preferences\.ts$/ }, () => ({ contents: source.toString(), loader: 'ts', resolveDir: path.join(root, 'src/main') }));
    } }],
  });
  const runtime = require(bundle);
  const sourceHashes = Object.fromEntries(Object.keys(build.metafile.inputs).filter((file) => file.startsWith('src/')).map((file) => [file, hash(file === 'src/main/preferences.ts' ? source : fs.readFileSync(path.join(root, file)))]));
  const workloads = [];
  for (const siteRules of [0, 256]) {
    const directory = path.join(temporary, `rules-${siteRules}`);
    fs.mkdirSync(directory);
    app.setPath('userData', directory);
    const file = path.join(directory, 'browser-preferences.json');
    fs.writeFileSync(file, JSON.stringify({ permissions: 'ask', advanced: { ...runtime.defaultAdvanced, siteRules: Array.from({ length: siteRules }, (_, index) => ({ origin: `https://site-${index}.example`, javascript: true, images: true, autoplay: false, popups: false, zoom: 1, userAgent: '' })) } }));
    let reads = 0;
    let parses = 0;
    readOriginal = fs.readFileSync;
    parseOriginal = JSON.parse;
    fs.readFileSync = function (target, ...args) {
      if (target === file) reads += 1;
      return readOriginal.call(this, target, ...args);
    };
    JSON.parse = function (...args) { parses += 1; return parseOriginal.apply(this, args); };
    const started = performance.now();
    const snapshot = runtime.getBrowserPreferences();
    const coldReadMs = performance.now() - started;
    const coldReads = reads;
    const coldParses = parses;
    assert.equal(snapshot.advanced.siteRules.length, siteRules);
    for (const tabs of [10, 50]) {
      const calls = tabs * 2 * 30;
      const burst = () => {
        let observed = 0;
        for (let index = 0; index < calls; index += 1) observed += runtime.getBrowserPreferences().advanced.siteRules.length;
        assert.equal(observed, siteRules * calls);
      };
      for (let index = 0; index < 3; index += 1) burst();
      reads = 0; parses = 0;
      const samplesMs = [];
      for (let index = 0; index < 21; index += 1) {
        const start = performance.now(); burst(); samplesMs.push(performance.now() - start);
      }
      workloads.push({ siteRules, modeledTabs: tabs, callsPerBurst: calls, samplesMs, warmBurstMs: summarize(samplesMs), fileReadsPerBurst: reads / samplesMs.length, jsonParsesPerBurst: parses / samplesMs.length, coldReadMs, coldReads, coldParses, serializedSnapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)) });
      assert.equal(reads, phase === 'before' ? calls * samplesMs.length : 0);
      assert.equal(parses, phase === 'before' ? calls * samplesMs.length : 0);
    }
    const permission = runtime.websitePermissionCheckHandler('fixture');
    let observed;
    const stop = runtime.onBrowserPreferencesChanged(() => { observed = runtime.getBrowserPreferences().permissions; });
    const updated = runtime.updateBrowserPreferences({ permissions: 'block' });
    stop();
    assert.equal(observed, 'block');
    assert.equal(permission(null, 'media', 'https://site.example', { securityOrigin: 'https://site.example' }), false);
    assert.equal(parseOriginal(readOriginal(file, 'utf8')).permissions, 'block');
    if (phase !== 'before') {
      assert.equal(runtime.getBrowserPreferences(), updated);
      assert.equal(snapshot.permissions, 'ask');
      assert(Object.isFrozen(updated));
      assert(Object.isFrozen(updated.advanced.siteRules));
      assert.throws(() => updated.advanced.siteRules.push({}), TypeError);
    }
    fs.readFileSync = readOriginal; JSON.parse = parseOriginal;
    readOriginal = undefined; parseOriginal = undefined;
  }
  const output = path.join(root, 'docs/benchmarks/preferences.json');
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
  if (report[phase]) (report.previousRuns ??= []).push({ phase, ...report[phase] });
  report[phase] = { recordedAt: new Date().toISOString(), baselineRevision: phase === 'before' ? baseline : null, runtime: process.versions, platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model, probeSha256: hash(fs.readFileSync(__filename)), sourceHashes, workloads, functionalChecks: { persistedBlock: true, listenerSeesCurrent: true, websitePermissionDenied: true, immutableNestedSnapshot: phase !== 'before' }, method: 'Actual bundled preferences and permission-check handler in Electron. Baseline substitutes only preferences.ts; dependencies are current and hashed. Cold load separate; 3 warmup and 21 measured bursts per workload. 600/3000 direct reads model observed getter amplification at 10/50 tabs; these are component timings, not UI switching latency. 0/256 site rules, disposable local JSON. Manual external edits require restart after caching.' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ phase, workloads: workloads.map(({ siteRules, modeledTabs, warmBurstMs, fileReadsPerBurst, jsonParsesPerBurst, coldReadMs }) => ({ siteRules, modeledTabs, warmBurstMs, fileReadsPerBurst, jsonParsesPerBurst, coldReadMs })) }));
}
run().then(() => { fs.rmSync(temporary, { recursive: true, force: true }); app.exit(0); }).catch((error) => {
  if (readOriginal) fs.readFileSync = readOriginal;
  if (parseOriginal) JSON.parse = parseOriginal;
  console.error(error); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1);
});

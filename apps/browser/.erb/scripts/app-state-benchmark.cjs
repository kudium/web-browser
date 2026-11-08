/* Actual renderer state modules and React hook; synthetic storage, no user profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const esbuild = require('esbuild');
const React = require('react');
const Renderer = require('react-test-renderer');

const root = path.resolve(__dirname, '../..');
const baselineRevision = 'de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};

async function run() {
  const phase = process.argv[2];
  assert(['before', 'after', 'confirmation'].includes(phase), 'Expected before, after or confirmation');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-state-bench-'));
  const originalParse = JSON.parse;
  const workloads = [];
  const sourceFiles = ['src/utils/AppManager.ts', 'src/utils/hooks/useAppList.ts'];
  const source = (file) => phase === 'before' && sourceFiles.includes(file)
    ? execFileSync('git', ['show', `${baselineRevision}:${file}`], { cwd: root })
    : fs.readFileSync(path.join(root, file));
  const sourceHash = (file) => crypto.createHash('sha256').update(source(file)).digest('hex');
  try {
    const entry = path.join(directory, 'entry.ts');
    fs.writeFileSync(entry, `export { AppManager } from ${JSON.stringify(path.join(root, 'src/utils/AppManager.ts'))}; export { useAppList } from ${JSON.stringify(path.join(root, 'src/utils/hooks/useAppList.ts'))};`);
    const bundle = path.join(directory, 'state.cjs');
    const build = await esbuild.build({
      entryPoints: [entry], bundle: true, platform: 'node', outfile: bundle,
      external: ['react', 'electron'], metafile: true,
      plugins: [{ name: 'exact-baseline', setup(builder) {
        builder.onLoad({ filter: /(?:AppManager|useAppList)\.ts$/ }, (args) => {
          const file = path.relative(root, args.path);
          return { contents: source(file).toString(), loader: 'ts', resolveDir: path.dirname(args.path) };
        });
      } }],
    });
    // Bundles outside the checkout resolve the same actual React instance.
    const Module = require('node:module');
    const loaded = new Module(bundle, module);
    loaded.filename = bundle;
    loaded.paths = module.paths;
    loaded._compile(fs.readFileSync(bundle, 'utf8'), bundle);
    const { AppManager, useAppList } = loaded.exports;
    for (const count of [1, 10, 50, 1000]) {
      const saved = new Map();
      const listeners = new Set();
      let storageReads = 0;
      let parses = 0;
      const rows = Array.from({ length: count }, (_, index) => ({
        id: `synthetic-${count}-${index}`, name: `Synthetic ${index}`, icon: '',
        url: `https://fixture.example/${index}`, sessionId: `account-${index}`,
        sessionName: `Synthetic ${index}`, sessionSlug: `synthetic-${index}`, spaceId: 'default',
      }));
      saved.set('user_apps', JSON.stringify(rows));
      global.window = {
        localStorage: {
          getItem: (key) => { storageReads += 1; return saved.get(key) ?? null; },
          setItem: (key, value) => saved.set(key, value),
          removeItem: (key) => saved.delete(key),
        },
        electron: { ipcRenderer: {
          on: (_channel, callback) => { listeners.add(callback); return () => listeners.delete(callback); },
          sendMessage: (_channel, message) => { for (const callback of listeners) callback(message); },
        } },
      };
      global.localStorage = window.localStorage;
      JSON.parse = (value, ...args) => { parses += 1; return originalParse(value, ...args); };
      const coldStart = performance.now();
      assert.equal(AppManager.getAll().length, count);
      const coldReadMs = performance.now() - coldStart;
      // Separate cold load, JIT warmup and steady-state bursts.
      for (let index = 0; index < 30; index += 1) AppManager.getAll();
      storageReads = 0; parses = 0;
      const durations = [];
      for (let sample = 0; sample < 30; sample += 1) {
        const start = performance.now();
        for (let index = 0; index < 300; index += 1) AppManager.getAll();
        durations.push(performance.now() - start);
      }
      const reads = { calls: 9000, burstOf300Ms: stats(durations), storageReads, parses };
      let renders = 0;
      function Consumer({ tick }) {
        const { appList } = useAppList();
        renders += 1;
        return React.createElement('span', null, `${tick}:${appList.length}:${appList[0].name}`);
      }
      const tree = (tick) => React.createElement(React.Fragment, null,
        Array.from({ length: 5 }, (_, key) => React.createElement(Consumer, { key, tick })));
      let view;
      storageReads = 0; parses = 0;
      Renderer.act(() => { view = Renderer.create(tree(0)); });
      const mount = { storageReads, parses };
      storageReads = 0; parses = 0;
      const rerenders = [];
      for (let tick = 1; tick <= 30; tick += 1) {
        const start = performance.now();
        Renderer.act(() => view.update(tree(tick)));
        rerenders.push(performance.now() - start);
      }
      const hook = { consumers: 5, unrelatedUpdates: 30, renders, mount, updateMs: stats(rerenders), storageReads, parses };
      // Verify the measured modules can still observe a committed layout change.
      Renderer.act(() => AppManager.update('id', rows[0].id, { ...rows[0], name: 'Changed' }));
      assert(view.toJSON().every((node) => node.children[0].endsWith(':Changed')));
      Renderer.act(() => view.unmount());
      assert.equal(listeners.size, 0);
      function Writer() {
        React.useLayoutEffect(() => AppManager.update('id', rows[0].id, { ...rows[0], name: 'During mount' }), []);
        return null;
      }
      // A write dispatched before passive subscription used to be missed.
      Renderer.act(() => { view = Renderer.create(React.createElement(React.Fragment, null,
        React.createElement(Consumer, { tick: 0 }), React.createElement(Writer))); });
      const subscriptionRaceObserved = view.toJSON().children[0];
      assert.equal(subscriptionRaceObserved, `0:${count}:${phase === 'before' ? 'Changed' : 'During mount'}`);
      Renderer.act(() => view.unmount());
      assert.equal(listeners.size, 0);
      workloads.push({ records: count, coldReadMs, reads, hook, subscriptionRaceObserved });
      JSON.parse = originalParse;
    }
    const report = {
      recordedAt: new Date().toISOString(), phase, runtime: process.versions, platform: process.platform,
      architecture: process.arch, cpu: os.cpus()[0].model,
      scope: 'Node actual AppManager and React 18 test renderer; synthetic localStorage. Excludes browser IPC/disk, Chromium paint, websites and whole-app latency.',
      sources: {
        manager: sourceHash('src/utils/AppManager.ts'),
        hook: sourceHash('src/utils/hooks/useAppList.ts'),
        recovery: hash(path.join(root, 'src/utils/storageRecovery.ts')),
        probe: hash(__filename),
      }, baselineRevision: phase === 'before' ? baselineRevision : null,
      bundledSources: Object.fromEntries(Object.keys(build.metafile.inputs)
        .filter((file) => fs.realpathSync(path.resolve(root, file)) !== fs.realpathSync(entry))
        .map((file) => [file, sourceHash(file)])), workloads,
    };
    const file = path.join(root, 'docs/benchmarks/app-state.json');
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    if (previous[phase]) (previous.previousRuns ??= []).push(previous[phase]);
    previous[phase] = report;
    fs.writeFileSync(file, `${JSON.stringify(previous, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    JSON.parse = originalParse;
    delete global.window;
    delete global.localStorage;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });

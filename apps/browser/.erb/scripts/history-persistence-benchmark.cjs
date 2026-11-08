/* Actual history module, synthetic data, disposable filesystem and mocked UI. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const esbuild = require('esbuild');

async function run() {
  const phase = process.argv[2];
  if (!['before', 'after', 'confirmation'].includes(phase))
    throw new Error('Expected before, after or confirmation');
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-history-bench-')
  );
  const read = fs.readFileSync;
  const write = fs.writeFileSync;
  const workloads = [];
  const modules = [];
  try {
    for (const count of [100, 1000, 10000]) {
      const directory = path.join(temporary, String(count));
      fs.mkdirSync(directory);
      const file = path.join(directory, 'browsing-history.json');
      fs.writeFileSync(
        file,
        JSON.stringify(
          Array.from({ length: count }, (_, index) => ({
            id: `synthetic-${index}`,
            url: `https://fixture.example/page/${index}`,
            title: `Synthetic page ${index}`,
            profile: 'synthetic',
            visitedAt: index + 1,
          }))
        )
      );
      const entry = path.join(temporary, `history-${count}.cjs`);
      await esbuild.build({
        entryPoints: ['src/main/history.ts'],
        bundle: true,
        platform: 'node',
        outfile: entry,
        plugins: [
          {
            name: 'synthetic-electron',
            setup(build) {
              build.onResolve({ filter: /^electron$/ }, () => ({
                path: 'electron',
                namespace: 'fixture',
              }));
              build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                contents: `export const app = {getPath: () => ${JSON.stringify(
                  directory
                )}}; export const BrowserWindow = {getAllWindows: () => []}; export const ipcMain = {handle: () => {}};`,
              }));
            },
          },
        ],
      });
      let reads = 0;
      let writes = 0;
      let writtenBytes = 0;
      fs.readFileSync = function (filename, ...args) {
        if (filename === file) reads += 1;
        return read.call(this, filename, ...args);
      };
      fs.writeFileSync = function (filename, data, ...args) {
        if (typeof filename === 'string' && filename.startsWith(file)) {
          writes += 1;
          writtenBytes += Buffer.byteLength(data);
        }
        return write.call(this, filename, data, ...args);
      };
      const history = require(entry);
      modules.push(history);
      const coldStart = performance.now();
      history.getBrowsingHistory();
      const coldReadMs = performance.now() - coldStart;
      const durations = [];
      const timerStart = performance.now();
      const timer = new Promise((resolve) =>
        setTimeout(() => resolve(performance.now() - timerStart), 0)
      );
      for (let sample = 0; sample < 30; sample += 1) {
        const start = performance.now();
        await history.recordVisit(
          `https://fixture.example/new/${sample}`,
          'Synthetic visit',
          'synthetic'
        );
        durations.push(performance.now() - start);
      }
      const flushStart = performance.now();
      if (history.flushHistory) await history.flushHistory();
      const durableFlushMs = performance.now() - flushStart;
      const batchCompletionMs = performance.now() - timerStart;
      const firstVisitMs = durations[0];
      const eventLoopTimerDelayMs = await timer;
      durations.sort((a, b) => a - b);
      workloads.push({
        initialRecords: count,
        samples: 30,
        coldReadMs,
        operationMedianMs: durations[15],
        operationP95Ms: durations[28],
        operationMaxMs: durations[29],
        firstVisitMs,
        eventLoopTimerDelayMs,
        syncReads: reads,
        syncWrites: writes,
        syncWrittenBytes: writtenBytes,
        workerWrites: history.historyPersistenceDiagnostics?.()?.writes || 0,
        workerWrittenBytes:
          history.historyPersistenceDiagnostics?.()?.bytes || 0,
        durableFlushMs,
        batchCompletionMs,
        resultingRecords: history.getBrowsingHistory().length,
      });
      if (history.closeHistoryPersistence)
        await history.closeHistoryPersistence();
      fs.readFileSync = read;
      fs.writeFileSync = write;
    }
    const result = {
      measuredAt: new Date().toISOString(),
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      sourceSHA256: crypto
        .createHash('sha256')
        .update(read('src/main/history.ts'))
        .digest('hex'),
      persistenceSourceSHA256: fs.existsSync('src/main/historyPersistence.ts')
        ? crypto
            .createHash('sha256')
            .update(read('src/main/historyPersistence.ts'))
            .digest('hex')
        : undefined,
      method:
        'Actual bundled history.ts, UI mocked only. One cold read followed by 30 unique visits at each synthetic dataset size, same process and disk. No warmup; batch timer delay captures event-loop blocking. Sync I/O counts exclude fixture construction and bundling.',
      workloads,
      limitations: [
        'Node microbenchmark, not Electron whole-app responsiveness or total process memory.',
        'Timer delay includes scheduling overhead; latency and filesystem cache vary.',
        'Worker I/O is reported from the actual worker commit counters; main-thread spies do not observe worker filesystem calls.',
        'Visit call duration measures scheduling, not durability; explicit flush waits for file fsync and atomic rename. The lazy worker startup and initial transfer are included in the first visit and batch completion, not the cold read.',
      ],
    };
    const filename = 'docs/benchmarks/history-persistence.json';
    const report = fs.existsSync(filename)
      ? JSON.parse(read(filename, 'utf8'))
      : {};
    if (report[phase])
      throw new Error(`Refusing to overwrite ${phase} evidence`);
    report[phase] = result;
    write(filename, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.readFileSync = read;
    fs.writeFileSync = write;
    await Promise.all(
      modules.map((module) => module.closeHistoryPersistence?.())
    );
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

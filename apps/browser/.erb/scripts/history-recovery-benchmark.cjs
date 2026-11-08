/* Compare exact pre-change source with current code on malformed local fixtures. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
async function run() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-history-recovery-')
  );
  const ref = 'de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
  const baseline = execFileSync('git', ['show', `${ref}:src/main/history.ts`], {
    encoding: 'utf8',
  });
  const sources = {
    before: baseline,
    after: fs.readFileSync('src/main/history.ts', 'utf8'),
  };
  const result = {
    measuredAt: new Date().toISOString(),
    baselineRef: ref,
    runtime: process.version,
    method:
      'Exact baseline git source and current history source bundled with UI mocked. Attempt a visit and clear against malformed synthetic files; compare original bytes afterward.',
    workloads: [],
  };
  try {
    for (const [phase, source] of Object.entries(sources)) {
      for (const [index, raw] of [
        '{damaged',
        '{}',
        '[{"id":"incomplete"}]',
      ].entries()) {
        const directory = path.join(temporary, `${phase}-${index}`);
        fs.mkdirSync(directory);
        const filename = path.join(directory, 'browsing-history.json');
        fs.writeFileSync(filename, raw);
        const entry = path.join(directory, 'history.cjs');
        await esbuild.build({
          stdin: {
            contents: source,
            loader: 'ts',
            resolveDir: path.resolve('src/main'),
          },
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
                  contents: `export const app={getPath:()=>${JSON.stringify(
                    directory
                  )}};export const BrowserWindow={getAllWindows:()=>[]};export const ipcMain={handle:()=>{}};`,
                }));
              },
            },
          ],
        });
        const history = require(entry);
        let error;
        try {
          history.recordVisit(
            'https://fixture.example/new',
            'Synthetic',
            'synthetic'
          );
          await history.historyAction('clear');
        } catch (reason) {
          error = reason.message;
        }
        result.workloads.push({
          phase,
          malformedFixture: raw,
          originalPreserved: fs.readFileSync(filename, 'utf8') === raw,
          clearRejected: !!error,
          error,
          sourceSHA256: crypto
            .createHash('sha256')
            .update(source)
            .digest('hex'),
        });
        await history.closeHistoryPersistence?.();
      }
    }
    fs.writeFileSync(
      'docs/benchmarks/history-recovery.json',
      `${JSON.stringify(result, null, 2)}\n`
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

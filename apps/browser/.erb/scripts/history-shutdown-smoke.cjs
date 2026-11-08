/* Real Electron shutdown, fixed worker program, disposable history only. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const esbuild = require('esbuild');
const assert = require('assert');
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudiumbrowser-history-shutdown-')
);
const data = path.join(temporary, 'user-data');
fs.mkdirSync(data);
app.setPath('userData', data);
app.setPath('sessionData', data);
process.on('exit', () =>
  fs.rmSync(temporary, { recursive: true, force: true })
);
const timer = setTimeout(() => {
  console.error('History shutdown timed out');
  app.exit(1);
}, 15000);
timer.unref();
esbuild.buildSync({
  entryPoints: ['src/main/history.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(temporary, 'history.js'),
});
esbuild.buildSync({
  entryPoints: ['src/main/advancedPreferences.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './history', './siteData'],
  outfile: path.join(temporary, 'lifecycle.js'),
});
// No session-clearing work is requested in this history-only fixture.
fs.writeFileSync(
  path.join(temporary, 'siteData.js'),
  'exports.clearSessionSiteData=async()=>{throw new Error("Unexpected session clearing");};'
);
app
  .whenReady()
  .then(() => {
    const history = require(path.join(temporary, 'history.js'));
    const lifecycle = require(path.join(temporary, 'lifecycle.js'));
    lifecycle.registerAdvancedLifecycle();
    history.registerHistory(() => false);
    for (let index = 0; index < 30; index += 1)
      history.recordVisit(
        `https://fixture.example/${index}`,
        'Synthetic shutdown visit',
        'synthetic'
      );
    // Do not manually flush: the production quit coordinator must do it.
    app.on('will-quit', () => {
      try {
        const file = path.join(data, 'browsing-history.json');
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(saved.length, 30);
        assert.equal(saved[0].url, 'https://fixture.example/29');
        assert.equal(fs.statSync(file).mode % 0o1000, 0o600);
        assert.equal(history.historyPersistenceDiagnostics().pendingVisits, 0);
        const report = {
          measuredAt: new Date().toISOString(),
          runtime: process.versions,
          platform: `${process.platform}/${process.arch}`,
          method:
            'Actual Electron app.quit immediately after 30 visits. No manual flush. Production quit coordinator waits for the bundled history worker before will-quit; synthetic profile and no native windows.',
          result: 'passed',
          recordsAtWillQuit: saved.length,
          diagnostics: history.historyPersistenceDiagnostics(),
          sourceSHA256: Object.fromEntries(
            [
              'src/main/history.ts',
              'src/main/historyPersistence.ts',
              'src/main/advancedPreferences.ts',
            ].map((file) => [
              file,
              crypto
                .createHash('sha256')
                .update(fs.readFileSync(file))
                .digest('hex'),
            ])
          ),
          limitations: [
            'Source bundled with esbuild in actual Electron; packaged ASAR/signing and other target platforms remain separate gates.',
            'Does not simulate sudden power loss or process termination.',
          ],
        };
        fs.writeFileSync(
          'docs/benchmarks/history-shutdown.json',
          `${JSON.stringify(report, null, 2)}\n`
        );
        console.log(
          'PASS: actual Electron quit flushes all 30 pending visits before will-quit; owner-only atomic file and no lost records'
        );
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
    app.quit();
    return undefined;
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

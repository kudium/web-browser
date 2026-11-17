// Verify the actual production renderer inside an ASAR, without a release or
// personal profile. Keep tampered assets confined to disposable test archives.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { createPackage } = require('@electron/asar');

const appRoot = path.resolve(__dirname, '../..');
const output =
  process.env.KUDIUMBROWSER_SMOKE_OUTPUT ||
  path.join(
    appRoot,
    'release',
    `local-notes-editor-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudium-notes-package-'),
);
fs.mkdirSync(output, { recursive: true });

(async () => {
  const source = path.join(temporary, 'source');
  const renderer = path.join(source, 'renderer');
  fs.cpSync(path.join(appRoot, 'release/app/dist/renderer'), renderer, {
    recursive: true,
  });
  const archive = path.join(temporary, 'renderer.asar');
  await createPackage(source, archive);
  const results = [];
  const run = (name, script, args, extraEnv = {}) => {
    const artifacts = path.join(output, name);
    fs.mkdirSync(artifacts, { recursive: true });
    const env = {
      ...process.env,
      KUDIUMBROWSER_SMOKE_OUTPUT: artifacts,
      ...extraEnv,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [script, ...args], {
      cwd: appRoot,
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
    fs.writeFileSync(
      path.join(artifacts, 'native.log'),
      (result.stdout || '') + (result.stderr || ''),
    );
    const outcome = result.status === 0 && !result.error ? 'passed' : 'failed';
    results.push({ name, outcome, exitCode: result.status });
    console.log(`${outcome.toUpperCase()}: ${name}`);
    if (outcome !== 'passed') {
      console.error(result.error || result.stderr || result.stdout);
      throw new Error(`${name} failed; inspect ${artifacts}`);
    }
  };
  try {
    run(
      'packaged-notes-editor',
      '.erb/scripts/browser-ui-smoke.cjs',
      ['--notes-editor-only'],
      {
        KUDIUMBROWSER_SMOKE_RENDERER: path.join(archive, 'renderer'),
      },
    );
    run(
      'other-production-assets',
      '.erb/scripts/browser-ui-smoke.cjs',
      ['--production-assets-only'],
      { KUDIUMBROWSER_SMOKE_RENDERER: path.join(archive, 'renderer') },
    );
    const chunks = fs
      .readdirSync(renderer)
      .filter((name) => name.endsWith('.js') && name !== 'renderer.js');
    if (!chunks.length)
      throw new Error('Production fixture has no lazy chunks.');
    for (const name of chunks)
      fs.appendFileSync(
        path.join(renderer, name),
        '\n;window.notesTamperExecuted=true;',
      );
    const tampered = path.join(temporary, 'tampered.asar');
    await createPackage(source, tampered);
    run(
      'modified-lazy-chunks',
      '.erb/scripts/browser-ui-smoke.cjs',
      ['--notes-editor-only', '--notes-editor-tampered'],
      {
        KUDIUMBROWSER_SMOKE_RENDERER: path.join(tampered, 'renderer'),
      },
    );
    run('renderer-security-policy', '.erb/scripts/renderer-csp-smoke.cjs', [], {
      KUDIUMBROWSER_CSP_REPORT: path.join(output, 'renderer-csp.json'),
      KUDIUMBROWSER_CSP_PHASE: 'after',
    });
  } finally {
    fs.writeFileSync(
      path.join(output, 'notes-editor-suite.json'),
      JSON.stringify(
        {
          outcome:
            results.length === 4 &&
            results.every((result) => result.outcome === 'passed')
              ? 'passed'
              : 'failed',
          results,
          limitations: [
            'Tests the emitted production renderer in fixture ASAR archives with the real preload and synthetic note IPC. Does not install, sign, notarize or publish a browser release.',
          ],
        },
        null,
        2,
      ),
    );
  }
  console.log(`Notes editor evidence: ${output}`);
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(temporary, { recursive: true, force: true }));

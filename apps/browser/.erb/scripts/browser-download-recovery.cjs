// Two actual Electron processes: terminate a transfer, then recover its saved record.
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (operation) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await wait(50);
  }
  throw new Error('Download recovery timed out');
};

async function child() {
  const { app, BrowserWindow, session } = require('electron');
  const phase = process.argv.find((arg) => arg.startsWith('--phase=')).slice(8);
  const profile = process.env.KUDIUM_RECOVERY_PROFILE;
  const origin = process.env.KUDIUM_RECOVERY_ORIGIN;
  app.setPath('userData', profile);
  const bundled = path.join(profile, `downloads-${phase}.cjs`);
  require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, '../../src/main/downloads.ts')],
    bundle: true,
    platform: 'node',
    external: ['electron', './preferences'],
    outfile: bundled,
  });
  fs.writeFileSync(
    path.join(profile, 'preferences.js'),
    `exports.getBrowserPreferences=()=>({askDownloadLocation:false,downloadDirectory:${JSON.stringify(path.join(profile, 'files'))}});`,
  );
  const downloads = require(bundled);
  await app.whenReady();
  const original = session.fromPartition(
    'persist:kudiumbrowser-recovery-login',
  );
  downloads.trackDownloads(original);
  if (phase === 'seed') {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { session: original, sandbox: true },
    });
    downloads.bindDownloadSource(
      window.webContents,
      JSON.stringify(['recovery-login', 'source-tab']),
      'recovery-login',
    );
    await original.cookies.set({
      url: origin,
      name: 'login',
      value: 'original',
      path: '/',
      expirationDate: Math.floor(Date.now() / 1000) + 3600,
    });
    await original.cookies.flushStore();
    await window.loadURL(origin);
    window.webContents.downloadURL(`${origin}/transfer`);
    const record = await until(() =>
      downloads.getDownloadHistory().find((item) => item.receivedBytes > 0),
    );
    await until(
      () => fs.existsSync(record.path) && fs.statSync(record.path).size > 0,
    );
    await until(() =>
      JSON.parse(
        fs.readFileSync(path.join(profile, 'download-history.json'), 'utf8'),
      ).some((item) => item.id === record.id && item.receivedBytes > 0),
    );
    fs.writeFileSync(
      path.join(profile, 'seed.json'),
      JSON.stringify({ id: record.id, path: record.path }),
    );
    // The parent kills this process; no orderly download cancellation or quit handler runs.
    console.log('READY_FOR_FORCED_EXIT');
    await new Promise(() => {});
  } else if (phase === 'live') {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { session: original, sandbox: true },
    });
    downloads.bindDownloadSource(
      window.webContents,
      JSON.stringify(['recovery-login', 'range-tab']),
      'recovery-login',
    );
    await window.loadURL(origin);
    window.webContents.downloadURL(`${origin}/range-transfer`);
    const record = await until(() =>
      downloads
        .getDownloadHistory()
        .find((item) => item.name === 'range.txt' && item.receivedBytes > 0),
    );
    await downloads.performDownloadAction('pause', record.id);
    assert.equal(
      downloads.getDownloadHistory().find((item) => item.id === record.id)
        .paused,
      true,
    );
    await wait(4500); // The fixture drops the paused connection after its first chunk.
    await downloads.performDownloadAction('resume', record.id);
    const completed = await until(() =>
      downloads
        .getDownloadHistory()
        .find((item) => item.id === record.id && item.state === 'completed'),
    );
    assert.equal(fs.readFileSync(completed.path, 'utf8'), 'x'.repeat(8192));
    app.exit(0);
  } else {
    const old = JSON.parse(
      fs.readFileSync(path.join(profile, 'seed.json'), 'utf8'),
    );
    const before = fs.readFileSync(old.path);
    const record = downloads
      .getDownloadHistory()
      .find((item) => item.id === old.id);
    assert.equal(record.state, 'interrupted');
    assert.equal(record.active, false);
    assert.equal(record.retryable, true);
    assert.equal(
      record.retrySource,
      undefined,
      'URLs and login identifiers stay in the main process',
    );
    await downloads.performDownloadAction('retry', old.id);
    const completed = await until(() =>
      downloads
        .getDownloadHistory()
        .find((item) => item.id !== old.id && item.state === 'completed'),
    );
    assert.notEqual(completed.path, old.path);
    assert(
      fs.readFileSync(old.path).equals(before),
      'Recovery must preserve the partial file',
    );
    assert.equal(fs.readFileSync(completed.path, 'utf8'), 'x'.repeat(8192));
    fs.writeFileSync(
      path.join(profile, 'recovered.json'),
      JSON.stringify({
        previousId: old.id,
        id: completed.id,
        name: completed.name,
        partialPreserved: true,
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          platform: process.platform,
          arch: process.arch,
        },
      }),
    );
    app.exit(0);
  }
}

async function parent() {
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-download-recovery-'),
  );
  fs.mkdirSync(path.join(profile, 'files'));
  const out =
    process.env.KUDIUMBROWSER_SMOKE_OUTPUT ||
    path.resolve(
      __dirname,
      '../../release',
      `local-download-recovery-${Date.now()}`,
    );
  fs.mkdirSync(out, { recursive: true });
  const requests = [];
  const rangeRequests = [];
  const payload = 'x'.repeat(8192);
  const server = http.createServer((request, response) => {
    if (request.url === '/range-transfer') {
      const offset = Number(
        (request.headers.range || '').match(/bytes=(\d+)-/)?.[1] || 0,
      );
      rangeRequests.push(offset);
      response.writeHead(offset ? 206 : 200, {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="range.txt"',
        'Content-Length': 8192 - offset,
        'Accept-Ranges': 'bytes',
        ETag: '"range-fixture"',
        ...(offset && { 'Content-Range': `bytes ${offset}-8191/8192` }),
      });
      if (offset) response.end(payload.slice(offset));
      else {
        response.write(payload.slice(0, 1024));
        const timer = setTimeout(() => response.destroy(), 4000);
        response.on('close', () => clearTimeout(timer));
      }
      return;
    }
    if (request.url !== '/transfer') {
      response.end('<title>Recovery fixture</title>');
      return;
    }
    requests.push({
      cookie: request.headers.cookie || '',
      range: request.headers.range || null,
    });
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename="recovery.txt"',
      'Content-Length': Buffer.byteLength(payload),
    });
    if (requests.length === 1) response.write(payload.slice(0, 1024));
    else response.end(payload);
  });
  let outcome = 'failed';
  let runtime;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const env = {
      ...process.env,
      KUDIUM_RECOVERY_PROFILE: profile,
      KUDIUM_RECOVERY_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = (phase) =>
      new Promise((resolve, reject) => {
        const processChild = spawn(
          require('electron'),
          [__filename, `--phase=${phase}`],
          { env, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        let forced = false;
        const timer = setTimeout(() => {
          processChild.kill('SIGKILL');
          reject(new Error(`${phase} child timed out`));
        }, 30000);
        processChild.stdout.on('data', (chunk) => {
          output += chunk;
          if (
            phase === 'seed' &&
            !forced &&
            output.includes('READY_FOR_FORCED_EXIT')
          ) {
            forced = true;
            processChild.kill('SIGKILL');
          }
        });
        processChild.stderr.on('data', (chunk) => {
          output += chunk;
        });
        processChild.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        processChild.on('exit', (code, signal) => {
          clearTimeout(timer);
          if (phase === 'seed' ? forced && signal === 'SIGKILL' : code === 0)
            resolve();
          else
            reject(
              new Error(
                `${phase} child failed (${code}, ${signal}): ${output}`,
              ),
            );
        });
      });
    await run('seed');
    await run('recover');
    runtime = JSON.parse(
      fs.readFileSync(path.join(profile, 'recovered.json'), 'utf8'),
    ).runtime;
    assert.equal(requests.length, 2);
    assert(
      requests.every((request) => request.cookie.includes('login=original')),
      'Retry must use the original persisted login cookie',
    );
    assert.equal(
      requests[1].range,
      null,
      'Download again starts from the beginning',
    );
    await run('live');
    assert(
      rangeRequests.some((offset) => offset > 0),
      'Live resume must request the remaining byte range',
    );
    outcome = 'passed';
    console.log(
      'PASS: forced process exit, persisted interrupted download, original-login retry, complete bytes and preserved partial file',
    );
  } finally {
    server.close();
    server.closeAllConnections();
    fs.writeFileSync(
      path.join(out, 'download-recovery-results.json'),
      JSON.stringify(
        {
          outcome,
          measuredAt: new Date().toISOString(),
          runtime,
          checks: [
            'Actual SIGKILL during transfer',
            'Cold-process history recovery',
            'Original login session cookie',
            'Fresh complete transfer',
            'Partial file preservation',
            'Live pause/resume after connection loss with HTTP byte-range continuation',
          ],
          limitations: [
            'Download again restarts from byte zero; byte-range continuation after restart is not implemented.',
            'Synthetic HTTP download; no native Save sheet is exercised.',
          ],
        },
        null,
        2,
      ) + '\n',
    );
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

(process.versions.electron ? child() : parent()).catch((error) => {
  console.error(error);
  if (process.versions.electron) require('electron').app.exit(1);
  else process.exitCode = 1;
});

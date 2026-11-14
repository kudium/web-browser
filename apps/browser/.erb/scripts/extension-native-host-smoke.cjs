// Real native-host process, frame/worker IPC and framed UTF-8 responses.
const { app, session, BrowserWindow } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-native-host-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => {
  console.error('Native host acceptance timed out');
  app.exit(1);
}, 30000);
const hostName = 'com.kudium.disposable_fixture';
const host = path.join(root, 'echo-host');
fs.writeFileSync(
  host,
  `#!/usr/bin/env node
let input = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  input = Buffer.concat([input, chunk]);
  while(input.length >= 4 && input.length >= 4 + input.readUInt32LE(0)) {
    const length = input.readUInt32LE(0);
    const request = JSON.parse(input.subarray(4, length+4).toString());
    input = input.subarray(length+4);
    if (request.mode === 'exit') { process.exit(request.code || 0); }
    if (request.mode === 'signal') { process.kill(process.pid, 'SIGTERM'); return; }
    if (request.mode === 'bad-json') { process.stdout.write(Buffer.from([1,0,0,0,123])); return; }
    if (request.mode === 'bad-length') { process.stdout.write(Buffer.from([0,0,0,0])); return; }
    const body = Buffer.from(JSON.stringify({echo:request, origin:process.argv[2]}));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    const frame = Buffer.concat([header, body]);
    if (request.mode === 'final-response') { process.stdout.write(frame, () => process.exit(0)); return; }
    process.stdout.write(frame.subarray(0,2));
    process.stdout.write(frame.subarray(2));
  }
});
`,
  { mode: 0o700 }
);
app
  .whenReady()
  .then(async () => {
    const target = session.fromPartition('persist:native-host-fixture');
    const api = new ElectronChromeExtensions({ session: target });
    const dir = path.join(root, 'extension');
    fs.mkdirSync(dir);
    const key = crypto
      .generateKeyPairSync('rsa', { modulusLength: 1024 })
      .publicKey.export({ type: 'spki', format: 'der' })
      .toString('base64');
    const id = crypto
      .createHash('sha256')
      .update(Buffer.from(key, 'base64'))
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (value) =>
        String.fromCharCode(97 + parseInt(value, 16))
      );
    const hostDir = path.join(app.getPath('userData'), 'NativeMessagingHosts');
    fs.mkdirSync(hostDir, { recursive: true });
    fs.writeFileSync(
      path.join(hostDir, `${hostName}.json`),
      JSON.stringify({
        name: hostName,
        description: 'Disposable test host',
        path: host,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${id}/`],
      })
    );
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Native host fixture',
        version: '1',
        key,
        permissions: ['storage', 'nativeMessaging'],
        background: { service_worker: 'worker.js', type: 'module' },
      })
    );
    fs.writeFileSync(
      path.join(dir, 'page.html'),
      '<title>Native host fixture</title>'
    );
    fs.writeFileSync(
      path.join(dir, 'worker.js'),
      `chrome.runtime.sendNativeMessage('${hostName}', {source:'worker',text:'こんにちは 🔐'}).then(result=>chrome.storage.local.set({workerResult:result}),error=>chrome.storage.local.set({workerError:error.message}));`
    );
    const extension = await target.extensions.loadExtension(dir);
    assert.equal(extension.id, id);
    const owner = new BrowserWindow({
      show: false,
      webPreferences: {
        session: target,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    api.addTab(owner.webContents, owner);
    await owner.loadURL(`chrome-extension://${id}/page.html`);
    const failures = [];
    const nonExecutable = path.join(root, 'non-executable-host');
    fs.writeFileSync(nonExecutable, '#!/usr/bin/env node\n', { mode: 0o600 });
    const launchCases = [
      ['missing', undefined, 'Specified native messaging host not found'],
      [
        'forbidden',
        { path: host, allowed_origins: [] },
        'Access to the native messaging host is forbidden',
      ],
      [
        'missing_executable',
        { path: path.join(root, 'absent') },
        'Native messaging host executable not found',
      ],
      [
        'spawn_failure',
        { path: nonExecutable },
        'Failed to start native messaging host',
      ],
    ];
    const checkFailure = async (name, request, expected) => {
      const result = await owner.webContents
        .executeJavaScript(`new Promise(resolve => {
        const port = chrome.runtime.connectNative(${JSON.stringify(name)});
        let events = 0;
        port.onDisconnect.addListener(disconnected => {
          events++;
          const message = chrome.runtime.lastError?.message;
          const samePort = disconnected === port;
          let writeError;
          try { port.postMessage({afterDisconnect: true}); }
          catch (error) { writeError = error.message; }
          port.disconnect();
          setTimeout(() => resolve({message, samePort, events, writeError, leaked: !!chrome.runtime.lastError}), 20);
        });
        port.postMessage(${JSON.stringify(request)});
      })`);
      assert.equal(result.message, expected);
      assert.equal(result.samePort, true);
      assert.equal(result.events, 1);
      assert.equal(result.leaked, false);
      assert.match(result.writeError, /disconnected port object/);
      const oneShotError = await owner.webContents.executeJavaScript(
        `browser.runtime.sendNativeMessage(${JSON.stringify(
          name
        )}, ${JSON.stringify(
          request
        )}).then(() => null, error => error.message)`
      );
      assert.match(oneShotError, new RegExp(expected));
      failures.push({ name, request, ...result, oneShotError });
    };
    for (const [suffix, config, reason] of launchCases) {
      const name = `com.kudium.${suffix}`;
      if (config)
        fs.writeFileSync(
          path.join(hostDir, `${name}.json`),
          JSON.stringify({
            name,
            description: 'Disposable failure fixture',
            type: 'stdio',
            allowed_origins: [`chrome-extension://${id}/`],
            ...config,
          })
        );
      await checkFailure(name, {}, reason);
    }
    for (const [request, reason] of [
      [{ mode: 'exit', code: 0 }, 'Native messaging host exited'],
      [{ mode: 'exit', code: 7 }, 'Native messaging host exited with an error'],
      [{ mode: 'signal' }, 'Native messaging host terminated by signal'],
      [{ mode: 'bad-json' }, 'Invalid native messaging response JSON'],
      [{ mode: 'bad-length' }, 'Invalid native messaging response length'],
    ])
      await checkFailure(hostName, request, reason);
    const finalResponse = await owner.webContents.executeJavaScript(
      `chrome.runtime.sendNativeMessage('${hostName}', {mode: 'final-response'})`
    );
    assert.equal(finalResponse.echo.mode, 'final-response');
    const oneShot = await owner.webContents.executeJavaScript(
      `browser.runtime.sendNativeMessage('${hostName}', {source:'frame',text:'こんにちは 🔐'})`
    );
    assert.deepEqual(oneShot, {
      echo: { source: 'frame', text: 'こんにちは 🔐' },
      origin: `chrome-extension://${id}/`,
    });
    const port = await owner.webContents
      .executeJavaScript(`new Promise((resolve,reject)=>{
    const port=browser.runtime.connectNative('${hostName}'); const replies=[]; let disconnects=0;
    port.onDisconnect.addListener(()=>disconnects++);
    port.onMessage.addListener(reply=>{replies.push(reply);if(replies.length===2){port.disconnect();try {port.postMessage({afterDisconnect:true});return reject(new Error('Disconnected port accepted a write'));}catch(error){if(!/disconnected port object/.test(error.message))return reject(error);}setTimeout(()=>disconnects ? reject(new Error('Explicit disconnect emitted a local event')) : resolve(replies),20)}});
    port.onDisconnect.addListener(()=>{if(replies.length!==2) reject(new Error('Premature host disconnect'))});
    port.postMessage({sequence:1});port.postMessage({sequence:2});
  })`);
    assert.deepEqual(
      port.map((reply) => reply.echo.sequence),
      [1, 2]
    );
    let worker;
    for (let attempt = 0; attempt < 100; attempt++) {
      worker = await owner.webContents.executeJavaScript(
        `chrome.storage.local.get(['workerResult','workerError'])`
      );
      if (worker.workerResult || worker.workerError) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(worker.workerError, undefined);
    assert.deepEqual(worker.workerResult, {
      echo: { source: 'worker', text: 'こんにちは 🔐' },
      origin: `chrome-extension://${id}/`,
    });
    // A manifest that omits nativeMessaging must not acquire host access.
    const deniedDir = path.join(root, 'denied');
    fs.mkdirSync(deniedDir);
    fs.writeFileSync(
      path.join(deniedDir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Unprivileged fixture',
        version: '1',
      })
    );
    fs.writeFileSync(
      path.join(deniedDir, 'page.html'),
      '<title>Unprivileged</title>'
    );
    const denied = await target.extensions.loadExtension(deniedDir);
    await owner.loadURL(`chrome-extension://${denied.id}/page.html`);
    const nativeCallbackError = await owner.webContents
      .executeJavaScript(`new Promise(resolve => {
      chrome.runtime.sendMessage({noReceiver: true}, () => {
        const message = chrome.runtime.lastError?.message;
        setTimeout(() => resolve({message, leaked: !!chrome.runtime.lastError}), 0);
      });
    })`);
    assert.match(nativeCallbackError.message, /Receiving end does not exist/);
    assert.equal(nativeCallbackError.leaked, false);
    const rejected = await owner.webContents.executeJavaScript(
      `chrome.runtime.sendNativeMessage('${hostName}', {forbidden:true}).then(()=>false,()=>true)`
    );
    const callbackError = await owner.webContents
      .executeJavaScript(`new Promise(resolve => {
      chrome.runtime.sendNativeMessage('${hostName}', {forbidden:true}, value => {
        const message = chrome.runtime.lastError?.message;
        setTimeout(() => resolve({value, message, leaked:!!chrome.runtime.lastError}), 0);
      });
    })`);
    assert.equal(callbackError.value, undefined);
    assert.match(callbackError.message, /nativeMessaging permissions/);
    assert.equal(
      callbackError.leaked,
      false,
      'Callback error must expire after the callback'
    );
    assert(
      rejected,
      'Extension without nativeMessaging permission must be rejected'
    );
    const portRefusal = await owner.webContents
      .executeJavaScript(`new Promise(resolve => {
      const port=browser.runtime.connectNative('${hostName}'); let events=0;
      port.onDisconnect.addListener(disconnected => {
        events++;
        const message=browser.runtime.lastError?.message;
        const samePort=disconnected===port;
        port.disconnect();
        setTimeout(()=>resolve({message,samePort,events,leaked:!!browser.runtime.lastError}),20);
      });
    })`);
    assert.match(portRefusal.message, /nativeMessaging permissions/);
    assert.equal(portRefusal.samePort, true);
    assert.equal(portRefusal.events, 1);
    assert.equal(portRefusal.leaked, false);
    await owner.loadURL('data:text/html,<title>Website</title>');
    assert(
      await owner.webContents.executeJavaScript(
        `typeof chrome.runtime?.connectNative === 'undefined'`
      )
    );
    const report = {
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        arch: process.arch,
      },
      oneShot,
      port,
      worker: worker.workerResult,
      portRefusal,
      nativeCallbackError,
      failures,
      finalResponse,
      verified: [
        'real native child process',
        'UTF-8 framing and split responses',
        'frame one-shot and persistent port',
        'module worker one-shot',
        'permission refusal',
        'callback lastError and post-callback cleanup',
        'native runtime.sendMessage callback lastError getter and cleanup',
        'native port refusal details, event identity and scoped lastError cleanup',
        'explicit disconnect emits no local onDisconnect event',
        'writes to disconnected native ports throw synchronously',
        'missing/forbidden host, absent executable and OS spawn failure reasons',
        'clean/nonzero/signal exit and invalid-response reasons in ports and promises',
        'final stdout response delivered before host exit',
        'website containment',
      ],
      probeSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .digest('hex'),
    };
    fs.writeFileSync(
      'docs/benchmarks/extension-native-host.json',
      JSON.stringify(report, null, 2) + '\n'
    );
    owner.destroy();
    target.extensions.removeExtension(id);
    target.extensions.removeExtension(denied.id);
    clearTimeout(deadline);
    fs.rmSync(root, { recursive: true, force: true });
    console.log(
      'PASS: actual native host process, frame/worker messaging, framing and permission boundaries'
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

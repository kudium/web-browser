/* eslint-disable no-restricted-syntax, no-await-in-loop */
/* Actual Electron/MCP redirects; disposable profiles and synthetic data only. */
const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const assert = require('assert/strict');
const crypto = require('crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const root = path.resolve(__dirname, '../..');
const phase = process.argv[2] || 'after';
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kudiumbrowser-private-navigation-')
);
app.setPath('userData', temporary);
app.on('window-all-closed', () => {});
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const files = [
  'src/main/ai.ts',
  'src/main/aiNavigation.ts',
  'src/main/advancedPreferences.ts',
  'src/main/aiDialogs.ts',
  'src/main/requestRules.ts',
];
const source = (file) =>
  fs.readFileSync(
    path.join(
      root,
      phase === 'before' &&
        ['aiNavigation.ts', 'advancedPreferences.ts'].includes(
          path.basename(file)
        )
        ? `docs/benchmarks/baselines/private-navigation/${path.basename(
            file
          )}.txt`
        : file
    )
  );
let host;
let sibling;
let dispose;
let client;
let server;
let second;
const results = [];
const requests = [];
let reviews = [];
let response = 0;
let mutate;
const deadline = setTimeout(() => {
  console.error('Private navigation probe timed out');
  app.exit(1);
}, 60000);
const listen = (target) =>
  new Promise((resolve) => {
    target.listen(0, '127.0.0.1', resolve);
  });
const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
app
  .whenReady()
  .then(async () => {
    const bundle = path.join(temporary, 'runtime.cjs');
    await require('esbuild').build({
      stdin: {
        contents: `${source(
          'src/main/ai.ts'
        ).toString()}\nexport {passwordVault,registerPasswordManager} from './passwordManager';export {applyAdvancedContents,waitForBrowserNetwork} from './advancedPreferences';export {defaultAdvanced} from '../browser/advancedPreferences';export {navigateAIPage} from './aiNavigation';`,
        resolveDir: path.join(root, 'src/main'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      external: ['electron'],
      outfile: bundle,
      plugins: [
        {
          name: 'retained-navigation-baseline',
          setup(build) {
            if (phase === 'before')
              for (const name of ['aiNavigation', 'advancedPreferences'])
                build.onLoad(
                  { filter: new RegExp(`/src/main/${name}\\.ts$`) },
                  () => ({
                    contents: source(`src/main/${name}.ts`).toString(),
                    loader: 'ts',
                  })
                );
          },
        },
      ],
    });
    let origin;
    let other;
    const handler = async (req, res) => {
      let body = '';
      for await (const part of req) body += part;
      requests.push({
        url: req.url,
        method: req.method,
        body,
        cookie: req.headers.cookie || '',
      });
      const parsed = new URL(req.url, origin);
      if (parsed.pathname === '/redirect') {
        res.writeHead(307, {
          Location: `${
            parsed.searchParams.get('cross') ? other : origin
          }/received?synthetic=private`,
        });
        res.end();
      } else if (parsed.pathname === '/chain') {
        res.writeHead(302, { Location: `${origin}/redirect` });
        res.end();
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<title>Navigation fixture</title><script src="/resource.js"></script><img src="/image.png">'
        );
      }
    };
    server = http.createServer(handler);
    second = http.createServer(handler);
    await Promise.all([listen(server), listen(second)]);
    origin = `http://127.0.0.1:${server.address().port}`;
    other = `http://127.0.0.1:${second.address().port}`;
    fs.writeFileSync(
      path.join(temporary, 'preload.cjs'),
      "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),permissions:m=>ipcRenderer.invoke('ai-permissions',m),stop:()=>ipcRenderer.invoke('ai-stop')});"
    );
    const profile = session.fromPartition('private-navigation-fixture');
    host = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(temporary, 'preload.cjs'),
        contextIsolation: true,
      },
    });
    await host.loadURL('data:text/html,Navigation host');
    const page = new BrowserWindow({
      show: false,
      webPreferences: { session: profile, sandbox: true },
    });
    sibling = new BrowserWindow({
      show: false,
      webPreferences: { session: profile, sandbox: true },
    });
    const runtime = require(bundle);
    const settings = {
      ...runtime.defaultAdvanced,
      javascript: false,
      images: false,
    };
    runtime.applyAdvancedContents(page.webContents, settings);
    await runtime.waitForBrowserNetwork(page.webContents);
    await page.loadURL(`${origin}/source`);
    const tabs = [
      {
        id: 'first',
        name: 'Fixture',
        url: `${origin}/source`,
        icon: '',
        sessionId: 'fixture',
      },
    ];
    const vault = runtime.passwordVault();
    vault.unlock('disposable private navigation fixture', true);
    const record = {
      id: 'private',
      title: 'Fixture',
      origin: '',
      kind: 'profile',
      username: '',
      password: '',
      fields: [
        { name: 'occupation', value: 'synthetic-private', secret: false },
      ],
      notes: '',
      allowAI: true,
    };
    vault.save(record);
    runtime.registerPasswordManager(() => false, {
      authenticateOS: async () => {},
    });
    await runtime.initializeLocalStorage();
    dispose = runtime.registerAI(host, {
      tabs: () => tabs,
      focused: () => 'first',
      contents: (id) => (id === 'first' ? page.webContents : undefined),
    });
    const evaluate = (code) => host.webContents.executeJavaScript(code);
    const reserve = net.createServer();
    await listen(reserve);
    const { port } = reserve.address();
    await new Promise((resolve) => {
      reserve.close(resolve);
    });
    await evaluate(`fixture.mcp('update',{enabled:true,port:${port}})`);
    const connection = (await evaluate("fixture.mcp('connection')")).mcpServers
      .kudiumbrowser;
    client = new Client(
      { name: 'private-navigation-fixture', version: '1' },
      { capabilities: {} }
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers: connection.headers },
      })
    );
    await evaluate("fixture.permissions('full')");
    dialog.showMessageBox = async (_host, options) => {
      reviews.push({ message: options.message, detail: options.detail });
      if (options.message === 'Allow this navigation destination?') {
        if (mutate) {
          const action = mutate;
          mutate = undefined;
          await action();
        }
        return { response };
      }
      return { response: 1 };
    };
    async function navigate(label, url, accepted = false) {
      await page.loadURL(`${origin}/source`);
      requests.length = 0;
      reviews = [];
      response = accepted ? 1 : 0;
      const result = await client.callTool({
        name: 'navigate',
        arguments: { tabId: 'first', url },
      });
      await wait(50);
      const row = {
        label,
        isError: !!result.isError,
        destinationReviews: reviews.filter(
          (item) => item.message === 'Allow this navigation destination?'
        ).length,
        received: requests.filter((item) => item.url.startsWith('/received'))
          .length,
        resourceRequests: requests.filter((item) =>
          ['/resource.js', '/image.png'].includes(item.url)
        ).length,
      };
      results.push(row);
      assert.equal(
        row.resourceRequests,
        0,
        'Preferences must coexist with navigation policy'
      );
      return row;
    }
    const publicRow = await navigate(
      'public Full access redirect',
      `${origin}/redirect`
    );
    assert.equal(publicRow.received, 1);
    assert.equal(publicRow.destinationReviews, 0);
    await client.callTool({
      name: 'read_personal_data',
      arguments: { tabId: 'first', recordId: 'private' },
    });
    for (const [label, url] of [
      ['same-origin changed path/query denied', `${origin}/redirect`],
      ['cross-origin redirect denied', `${origin}/redirect?cross=1`],
    ]) {
      const row = await navigate(label, url);
      assert.equal(row.received, phase === 'before' ? 1 : 0);
      assert.equal(row.isError, phase === 'after');
      assert.equal(row.destinationReviews, phase === 'before' ? 0 : 1);
    }
    const approved = await navigate(
      'approved two-hop redirect',
      `${origin}/chain`,
      true
    );
    assert.equal(approved.received, 1);
    assert.equal(approved.destinationReviews, phase === 'before' ? 0 : 2);
    if (phase === 'after') {
      mutate = async () => {
        await sibling.loadURL(`${other}/sibling`);
        assert.equal(
          requests.filter((item) => item.url.startsWith('/received')).length,
          0,
          'Held destination must not reach socket'
        );
      };
      const held = await navigate(
        'held redirect with sibling sharing profile',
        `${origin}/redirect`,
        true
      );
      assert.equal(held.received, 1);
      assert(requests.some((item) => item.url === '/sibling'));
      mutate = async () => {
        await evaluate('fixture.stop()');
      };
      const stopped = await navigate(
        'Stop while redirect review pending',
        `${origin}/redirect`,
        true
      );
      assert.equal(stopped.received, 0);
      assert(stopped.isError);
      mutate = async () => {
        record.allowAI = false;
        vault.save(record);
        record.allowAI = true;
        vault.save(record);
      };
      const changed = await navigate(
        'private consent changed and restored during redirect review',
        `${origin}/redirect`,
        true
      );
      assert.equal(changed.received, 0);
      assert(changed.isError);
      await page.loadURL(`${origin}/source`);
      requests.length = 0;
      await profile.cookies.set({
        url: origin,
        name: 'fixture',
        value: 'synthetic-cookie',
      });
      const control = new AbortController();
      let metadata;
      await runtime.navigateAIPage(
        page.webContents,
        `${origin}/redirect`,
        control.signal,
        () => {
          page.webContents
            .loadURL(`${origin}/redirect`, {
              postData: [
                { type: 'rawData', bytes: Buffer.from('synthetic-post-body') },
              ],
              extraHeaders: 'Content-Type: text/plain',
            })
            .catch(() => {});
        },
        undefined,
        async (request) => {
          metadata = request;
          assert.equal(
            requests.filter((item) => item.url.startsWith('/received')).length,
            0
          );
        }
      );
      const received = requests.find((item) =>
        item.url.startsWith('/received')
      );
      assert.equal(received.method, 'POST');
      assert.equal(received.body, 'synthetic-post-body');
      assert(received.cookie.includes('fixture=synthetic-cookie'));
      assert.equal(metadata.method, 'POST');
      assert.equal(metadata.hasBody, true);
      results.push({
        label: 'approved POST 307 preserves body and cookie',
        method: received.method,
        body: received.body,
        cookie: received.cookie,
        reviewMetadata: metadata,
      });
    }
    const output = path.join(root, 'docs/benchmarks/private-navigation.json');
    const report = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output))
      : {};
    report[phase] = {
      recordedAt: new Date().toISOString(),
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      probeSha256: hash(fs.readFileSync(__filename)),
      sourceHashes: Object.fromEntries(
        files.map((file) => [file, hash(source(file))])
      ),
      bundleSha256: hash(fs.readFileSync(bundle)),
      results,
      scope:
        'Actual registerAI/encrypted vault/MCP/native request callbacks and loopback HTTP socket counts. Before replaces only the navigation and preference modules with retained pre-change files; other modules use current source. Controlled native reviews; synthetic values. Main-frame navigation only; no containment of descendants, fetch, workers, existing WebSocket/WebRTC channels or later sends after navigation completes. macOS native Electron only; no signed/cross-platform release claim.',
    };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ phase, results }));
    await client.close();
    client = undefined;
    await dispose();
    dispose = undefined;
    sibling.destroy();
    page.destroy();
    host.destroy();
    for (const target of [server, second]) {
      target.closeAllConnections();
      await new Promise((resolve) => {
        target.close(resolve);
      });
    }
    app.exit(0);
    return undefined;
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => {
  clearTimeout(deadline);
  fs.rmSync(temporary, { recursive: true, force: true });
});

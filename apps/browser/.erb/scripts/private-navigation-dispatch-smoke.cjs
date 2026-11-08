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
  path.join(os.tmpdir(), 'touchbox-private-navigation-dispatch-')
);
app.setPath('userData', temporary);
app.commandLine.appendSwitch('disable-features', 'BackForwardCache');
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
        ['ai.ts', 'aiNavigation.ts', 'requestRules.ts'].includes(
          path.basename(file)
        )
        ? `docs/benchmarks/baselines/private-navigation-dispatch/${path.basename(
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
let mutateCreate;
let mutateDispatch;
let historyRedirect = false;
const createdWindows = [];
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
              for (const name of ['aiNavigation', 'requestRules'])
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
      res.setHeader('Cache-Control', 'no-store');
      if (parsed.pathname === '/history' && historyRedirect) {
        res.writeHead(307, { Location: `${origin}/received?history=private` });
        res.end();
      } else if (parsed.pathname === '/redirect') {
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
    const nativeContents = new Map([['first', page.webContents]]);
    const originalLoadURL = page.webContents.loadURL.bind(page.webContents);
    page.webContents.loadURL = (url, options) => {
      const pending = originalLoadURL(url, options);
      if (mutateDispatch && url.includes('/received')) {
        const action = mutateDispatch;
        mutateDispatch = undefined;
        action();
      }
      return pending;
    };
    dispose = runtime.registerAI(host, {
      tabs: () => tabs,
      focused: () => 'first',
      contents: (id) => nativeContents.get(id),
      createTab: async (item) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: { session: profile, sandbox: true },
        });
        createdWindows.push(window);
        tabs.push(item);
        nativeContents.set(item.id, window.webContents);
        runtime.applyAdvancedContents(window.webContents, settings);
        await runtime.waitForBrowserNetwork(window.webContents);
        await window.loadURL('about:blank');
        if (window.webContents.isLoadingMainFrame())
          await new Promise((resolve) => {
            window.webContents.once('did-stop-loading', resolve);
          });
        if (mutateCreate) {
          const action = mutateCreate;
          mutateCreate = undefined;
          await action();
        }
        return window.webContents;
      },
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
      .touchbox;
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
    const revokeAndRestore = () => {
      record.allowAI = false;
      vault.save(record);
      record.allowAI = true;
      vault.save(record);
    };
    mutateDispatch = revokeAndRestore;
    const dispatch = await navigate(
      'consent changed after loadURL before initial request',
      `${origin}/received?dispatch=private`,
      true
    );
    assert.equal(dispatch.received, phase === 'before' ? 1 : 0);
    assert.equal(dispatch.isError, phase === 'after');
    async function newTab(
      label,
      mutation,
      allowRedirect,
      destination = `${origin}/redirect`
    ) {
      await page.loadURL(`${origin}/source`);
      requests.length = 0;
      reviews = [];
      response = allowRedirect ? 1 : 0;
      mutateCreate = mutation;
      const result = await client.callTool({
        name: 'new_tab',
        arguments: { tabId: 'first', url: destination },
      });
      await wait(50);
      const row = {
        label,
        isError: !!result.isError,
        received: requests.filter((item) => item.url.startsWith('/received'))
          .length,
        destinationReviews: reviews.filter(
          (item) => item.message === 'Allow this navigation destination?'
        ).length,
        tabURL: createdWindows[createdWindows.length - 1].webContents.getURL(),
      };
      results.push(row);
      if (result.isError)
        console.error(JSON.stringify({ row, toolResult: result }));
      return row;
    }
    const created = await newTab(
      'new-tab consent changed during native creation',
      revokeAndRestore,
      true,
      `${origin}/received?creation=private`
    );
    assert.equal(created.received, phase === 'before' ? 1 : 0);
    assert.equal(created.isError, phase === 'after');
    const originalHostURL = host.webContents.getURL();
    const hostChanged = await newTab(
      'new-tab host navigated and restored during native creation',
      async () => {
        await host.loadURL('data:text/html,Replacement');
        await host.loadURL(originalHostURL);
      },
      true,
      `${origin}/received?host=private`
    );
    assert.equal(hostChanged.received, phase === 'before' ? 1 : 0);
    assert.equal(hostChanged.isError, phase === 'after');
    const deniedTab = await newTab(
      'new-tab redirect declined',
      undefined,
      false
    );
    assert.equal(deniedTab.received, 0);
    assert(deniedTab.isError);
    assert.equal(deniedTab.destinationReviews, 1);
    const allowedTab = await newTab(
      'new-tab redirect accepted',
      undefined,
      true
    );
    assert.equal(allowedTab.received, 1);
    assert(!allowedTab.isError);
    assert.equal(allowedTab.destinationReviews, 1);
    for (const action of ['back', 'forward', 'reload']) {
      historyRedirect = false;
      if (action === 'forward') {
        await page.loadURL(`${origin}/source`);
        await page.loadURL(`${origin}/history`);
        await runtime.navigateAIPage(
          page.webContents,
          `${origin}/source`,
          new AbortController().signal,
          () => page.webContents.navigationHistory.goBack()
        );
      } else {
        await page.loadURL(`${origin}/history`);
        if (action === 'back') await page.loadURL(`${origin}/source`);
      }
      historyRedirect = true;
      requests.length = 0;
      reviews = [];
      response = 0;
      const result = await client.callTool({
        name: action,
        arguments: { tabId: 'first' },
      });
      await wait(50);
      const row = {
        label: `private ${action} redirect declined`,
        isError: !!result.isError,
        received: requests.filter((item) => item.url.startsWith('/received'))
          .length,
        destinationReviews: reviews.filter(
          (item) => item.message === 'Allow this navigation destination?'
        ).length,
      };
      results.push(row);
      assert.equal(row.received, 0);
      assert(row.isError);
      assert.equal(row.destinationReviews, 1);
    }
    const output = path.join(
      root,
      'docs/benchmarks/private-navigation-dispatch.json'
    );
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
        'Actual registerAI/encrypted vault/MCP/native request callbacks and loopback HTTP socket counts. Before replaces AI, navigation and request-rule modules with retained pre-dispatch-guard files; other modules use current source. Controlled native reviews; synthetic values. Main-frame navigation only; no containment of descendants, fetch, workers, existing WebSocket/WebRTC channels or later sends after navigation completes. macOS native Electron only; no signed/cross-platform release claim.',
    };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ phase, results }));
    await client.close();
    client = undefined;
    await dispose();
    dispose = undefined;
    createdWindows.forEach((window) => window.destroy());
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

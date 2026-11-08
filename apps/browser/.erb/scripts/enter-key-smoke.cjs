/* Native MCP Enter behavior: disposable pages, synthetic values, local sockets. */
/* eslint-disable no-restricted-syntax, no-await-in-loop */
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
} = require('electron');
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
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-enter-key-'));
app.setPath('userData', temporary);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const source = (file) =>
  fs.readFileSync(
    path.join(
      root,
      phase === 'before' &&
        ['src/browser/aiKeys.ts', 'src/main/ai.ts'].includes(file)
        ? `docs/benchmarks/baselines/enter-key/${path.basename(file)}.txt`
        : file
    )
  );
let host;
let client;
let dispose;
let server;
const requests = [];
const results = [];
let reviews = 0;
let response = 1;
const deadline = setTimeout(() => {
  console.error('Enter probe timed out');
  app.exit(1);
}, 60000);
const wait = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
app
  .whenReady()
  .then(async () => {
    const bundle = path.join(temporary, 'runtime.cjs');
    await require('esbuild').build({
      stdin: {
        contents: `${source(
          'src/main/ai.ts'
        ).toString()}\nexport {passwordVault,registerPasswordManager} from './passwordManager';`,
        resolveDir: path.join(root, 'src/main'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      external: ['electron'],
      outfile: bundle,
      plugins: [
        {
          name: 'retained-enter-baseline',
          setup(build) {
            if (phase === 'before')
              build.onLoad({ filter: /\/src\/browser\/aiKeys\.ts$/ }, () => ({
                contents: source('src/browser/aiKeys.ts').toString(),
                loader: 'ts',
              }));
          },
        },
      ],
    });
    server = http.createServer(async (req, res) => {
      if (req.url === '/receive') {
        let body = '';
        for await (const part of req) body += part;
        requests.push(body);
        res.end('Received');
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        `<title>Enter fixture</title><form><label>Account<input aria-label="Account" name="account" value="synthetic-enter-value"></label><button>Send</button></form><label>Notes<textarea aria-label="Notes">first</textarea></label><script>window.keyEvents=[];window.submits=0;for(const name of ['keydown','keypress','keyup'])document.addEventListener(name,e=>{keyEvents.push({type:e.type,key:e.key,trusted:e.isTrusted});if(window.cancelEnter&&e.type==='keydown'&&e.key==='Enter')e.preventDefault()});document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;fetch('/receive',{method:'POST',body:e.currentTarget.elements.account.value})}</script>`
      );
    });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    fs.writeFileSync(
      path.join(temporary, 'preload.cjs'),
      "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),permissions:m=>ipcRenderer.invoke('ai-permissions',m)});"
    );
    host = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(temporary, 'preload.cjs'),
        contextIsolation: true,
      },
    });
    await host.loadURL('data:text/html,Enter host');
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    host.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 600, height: 400 });
    await view.webContents.loadURL(url);
    const runtime = require(bundle);
    const tabs = [
      { id: 'first', name: 'Fixture', url, icon: '', sessionId: 'fixture' },
    ];
    const vault = runtime.passwordVault();
    vault.unlock('Disposable Enter fixture', true);
    vault.save({
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
    });
    runtime.registerPasswordManager(() => false, {
      authenticateOS: async () => {},
    });
    dispose = runtime.registerAI(host, {
      tabs: () => tabs,
      focused: () => 'first',
      contents: (id) => (id === 'first' ? view.webContents : undefined),
    });
    const nativeHooks = [];
    let keyCommands = 0;
    const nativeSend = view.webContents.debugger.sendCommand.bind(
      view.webContents.debugger
    );
    view.webContents.debugger.sendCommand = (method, params, sessionId) => {
      if (method === 'Input.dispatchKeyEvent') keyCommands += 1;
      return nativeSend(method, params, sessionId);
    };
    view.webContents.on('before-input-event', (event, input) =>
      nativeHooks.push({
        type: input.type,
        key: input.key,
        prevented: event.defaultPrevented,
      })
    );
    const evaluate = (code) => host.webContents.executeJavaScript(code);
    const reserve = net.createServer();
    await new Promise((resolve) => {
      reserve.listen(0, '127.0.0.1', resolve);
    });
    const { port } = reserve.address();
    await new Promise((resolve) => {
      reserve.close(resolve);
    });
    await evaluate(`fixture.mcp('update',{enabled:true,port:${port}})`);
    const connection = (await evaluate("fixture.mcp('connection')")).mcpServers
      .touchbox;
    client = new Client(
      { name: 'enter-fixture', version: '1' },
      { capabilities: {} }
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers: connection.headers },
      })
    );
    await evaluate("fixture.permissions('full')");
    dialog.showMessageBox = async () => {
      reviews += 1;
      return { response };
    };
    const parse = (result) =>
      JSON.parse(result.content.find((item) => item.type === 'text').text);
    async function press(
      label,
      key,
      targetLabel = 'Account',
      cancel = false,
      allow = true,
      mutation = false
    ) {
      await view.webContents.loadURL(url);
      await wait();
      if (cancel)
        await view.webContents.executeJavaScript('window.cancelEnter=true');
      if (mutation)
        await view.webContents.executeJavaScript(
          'document.querySelector("input").addEventListener("focus",e=>e.target.setAttribute("readonly",""),{once:true})'
        );
      requests.length = 0;
      keyCommands = 0;
      nativeHooks.length = 0;
      reviews = 0;
      response = allow ? 1 : 0;
      const observation = parse(
        await client.callTool({
          name: 'read_page',
          arguments: { tabId: 'first', format: 'detailed' },
        })
      );
      const target = observation.elements.find(
        (item) => item.label === targetLabel
      );
      assert(target, 'Missing observed target');
      if (targetLabel === 'Notes')
        await view.webContents.executeJavaScript(
          'document.querySelector("textarea").setSelectionRange(5,5)'
        );
      const result = await client.callTool({
        name: 'press_key',
        arguments: {
          tabId: 'first',
          elementId: target.id,
          snapshotId: observation.snapshotId,
          key,
        },
      });
      await wait();
      const page = await view.webContents.executeJavaScript(
        '({events:keyEvents,submits,notes:document.querySelector("textarea").value})'
      );
      const row = {
        label,
        key,
        isError: !!result.isError,
        reviews,
        ...page,
        socketRequests: requests.length,
        bodies: [...requests],
        nativeHooks: [...nativeHooks],
        keyCommands,
      };
      results.push(row);
      console.error(JSON.stringify(row));
      return row;
    }
    const enter = await press('public Enter implicit submit', 'Enter');
    assert.equal(enter.submits, phase === 'before' ? 0 : 1);
    assert.equal(enter.socketRequests, phase === 'before' ? 0 : 1);
    assert(!enter.isError);
    assert.equal(enter.reviews, 0);
    assert(enter.events.every((event) => event.trusted));
    const newline = await press(
      'Shift+Enter textarea newline',
      'Shift+Enter',
      'Notes'
    );
    assert.equal(newline.notes, phase === 'before' ? 'first' : 'first\n');
    assert.equal(newline.socketRequests, 0);
    assert(!newline.isError);
    const canceled = await press(
      'page prevents Enter default',
      'Enter',
      'Account',
      true
    );
    assert.equal(canceled.socketRequests, 0);
    assert.equal(canceled.submits, 0);
    const modified = await press(
      'Control+Enter no character insertion',
      'Control+Enter',
      'Notes'
    );
    assert.equal(modified.notes, 'first');
    assert.equal(modified.socketRequests, 0);
    response = 1;
    await client.callTool({
      name: 'read_personal_data',
      arguments: { tabId: 'first', recordId: 'private' },
    });
    const denied = await press(
      'private Enter review declined',
      'Enter',
      'Account',
      false,
      false
    );
    assert(denied.isError);
    assert.equal(denied.reviews, 1);
    assert.equal(denied.socketRequests, 0);
    assert.equal(denied.events.length, 0);
    const approved = await press('private Enter review accepted', 'Enter');
    assert(!approved.isError);
    assert.equal(approved.reviews, 1);
    assert.equal(approved.socketRequests, phase === 'before' ? 0 : 1);
    assert.equal(approved.submits, phase === 'before' ? 0 : 1);
    const mutated = await press(
      'field changes during focus',
      'Enter',
      'Account',
      false,
      true,
      true
    );
    assert.equal(mutated.isError, phase === 'after');
    assert.equal(mutated.keyCommands, phase === 'before' ? 2 : 0);
    for (let index = 0; index < 12; index += 1) {
      const repeated = await press(
        `approved Enter repeat ${index + 1}`,
        'Enter'
      );
      assert(!repeated.isError);
      assert.equal(repeated.keyCommands, 2);
      assert.equal(repeated.submits, phase === 'before' ? 0 : 1);
      assert.equal(repeated.socketRequests, phase === 'before' ? 0 : 1);
    }
    const output = path.join(root, 'docs/benchmarks/enter-key.json');
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
        [
          'src/browser/aiKeys.ts',
          'src/main/ai.ts',
          'src/main/aiProtocol.ts',
          'src/main/aiInterrupt.ts',
        ].map((file) => [file, hash(source(file))])
      ),
      bundleSha256: hash(fs.readFileSync(bundle)),
      results,
      scope:
        'Actual registerAI/encrypted vault, official MCP SDK, hidden native WebContentsView, trusted Chromium key events and loopback POST bodies. Native reviews are controlled; page submit handler prevents navigation and fetches the synthetic form value. Baseline substitutes retained aiKeys.ts and ai.ts; other modules use current source. No physical keyboard, nested-frame coverage, original activity UnknownVizError fix, all-channel containment or signed/cross-platform claim.',
    };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ phase, results }));
    await client.close();
    client = undefined;
    await dispose();
    dispose = undefined;
    server.closeAllConnections();
    await new Promise((resolve) => {
      server.close(resolve);
    });
    host.destroy();
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

// Real Electron + official MCP client, isolated profile and deterministic provider.
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
} = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  net = require('net'),
  assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-group-scope-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/ai.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'ai.cjs'),
});
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{groups:g=>ipcRenderer.invoke('ai-groups',g),mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),settings:p=>ipcRenderer.invoke('ai-settings',p),run:p=>ipcRenderer.invoke('ai-run',p),status:()=>ipcRenderer.invoke('ai-task-status'),resume:()=>ipcRenderer.invoke('ai-resume'),tasks:()=>ipcRenderer.invoke('ai-tasks','list')});`
);
let host, dispose, client, server, provider;
const views = new Map();
let pauseMode = false;
let approval = 0,
  approved = false,
  builtInDenied = false;
(async () => {
  await app.whenReady();
  server = http.createServer((req, res) =>
    res.end('<title>Fixture</title><button>Apply</button>')
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const tabs = [
    {
      id: 'work-tab',
      name: 'GitHub',
      sessionId: 'work',
      sessionName: 'Work',
      sessionSlug: 'work',
      url,
      icon: '',
    },
    {
      id: 'home-tab',
      name: 'Mail',
      sessionId: 'home',
      sessionName: 'Home',
      sessionSlug: 'home',
      url,
      icon: '',
    },
  ];
  host = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'preload.cjs') },
  });
  for (const tab of tabs) {
    const view = new WebContentsView();
    views.set(tab.id, view);
    await view.webContents.loadURL(url);
  }
  dispose = require(path.join(root, 'ai.cjs')).registerAI(host, {
    tabs: () => tabs,
    focused: () => 'home-tab',
    contents: (id) => views.get(id)?.webContents,
    createTab: async (item) => {
      tabs.push(item);
      const view = new WebContentsView();
      views.set(item.id, view);
      return view.webContents;
    },
  });
  dialog.showMessageBox = async () => {
    approval++;
    return { response: approved ? 1 : 0 };
  };
  await host.loadURL('data:text/html,fixture');
  const evaluate = (code) => host.webContents.executeJavaScript(code);
  const all = await evaluate('test.groups()');
  assert.equal(all.groupId, null);
  assert.equal(all.groups.length, 2);
  const work = all.groups.find((g) => g.slug === 'work').id;
  await evaluate(`test.groups(${JSON.stringify(work)})`);
  const reserve = net.createServer();
  await new Promise((r) => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  await evaluate(`test.mcp('update',{enabled:true,port:${port}})`);
  const connection = (await evaluate("test.mcp('connection')")).mcpServers
    .touchbox;
  client = new Client({ name: 'scope-fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers: connection.headers },
    })
  );
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  const data = (result) =>
    JSON.parse(result.content.find((c) => c.type === 'text').text);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  ['list_groups', 'set_scope', 'resolve_reference'].forEach((t) =>
    assert(tools.includes(t))
  );
  assert.equal(data(await call('list_tabs')).length, 1);
  assert.equal(
    data(await call('read_page')).elements[0].label,
    'Apply',
    'Implicit targeting must stay within Work despite Home focus'
  );
  for (const name of [
    'read_page',
    'screenshot',
    'select_tab',
    'navigate',
    'new_tab',
    'close_tab',
    'list_frames',
    'list_downloads',
  ])
    assert(
      (await call(name, { tabId: 'home-tab', url })).isError,
      `${name} escaped scope`
    );
  assert(
    (await call('resolve_reference', { reference: '@home/mail' })).isError
  );
  assert.equal(
    data(await call('resolve_reference', { reference: '@work/github' })).tabId,
    'work-tab'
  );
  assert((await call('set_scope', { groupId: null })).isError);
  assert.equal(approval, 1);
  assert.equal(data(await call('list_tabs')).length, 1);
  approved = true;
  assert.equal(data(await call('set_scope', { groupId: null })).groupId, null);
  assert.equal(data(await call('list_tabs')).length, 2);
  assert.equal(
    (await evaluate('test.groups()')).groupId,
    null,
    'External scope visible locally'
  );
  await evaluate(`test.groups(${JSON.stringify(work)})`);
  const newResult = await call('new_tab', { url });
  assert(!newResult.isError, JSON.stringify(newResult));
  const created = data(newResult);
  assert.equal(tabs.find((t) => t.id === created.tabId).sessionId, 'work');
  tabs[0].sessionSlug = 'engineering';
  assert.equal(
    data(await call('resolve_reference', { reference: '@engineering/github' }))
      .tabId,
    'work-tab'
  );
  const savedResult = await call('create_task', {name:'Read Work later',instructions:'Read @engineering/github',scheduleKind:'manual'});
  assert(!savedResult.isError, JSON.stringify(savedResult));
  const savedTasks = await evaluate('test.tasks()');
  assert.equal(savedTasks[0].groupId, work);
  assert(savedTasks[0].instructions.includes('"tabId":"work-tab"'));
  assert.equal(savedTasks[0].runs.length, 0);
  provider = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const messages = JSON.parse(body).messages;
    let message;
    const result = messages.filter((m) => m.role === 'tool').at(-1);
    if (pauseMode) {
      const resumed = messages.some((entry) => entry.role === 'user' && entry.content.startsWith('Continue the original task'));
      message = resumed ? {role:'assistant',content:'Resumed scoped task.'} : {role:'assistant',tool_calls:[{id:'pause',type:'function',function:{name:'hand_off',arguments:JSON.stringify({reason:'Fixture human action'})}}]};
    } else if (result) {
      builtInDenied = JSON.parse(result.content).error.includes(
        'outside AI scope'
      );
      message = { role: 'assistant', content: 'Cannot read outside Work.' };
    } else
      message = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'read',
            type: 'function',
            function: {
              name: 'read_page',
              arguments: JSON.stringify({ tabId: 'home-tab' }),
            },
          },
        ],
      };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  await evaluate(
    `test.settings({endpoint:'http://127.0.0.1:${
      provider.address().port
    }/v1',model:'fixture',key:'fixture-only',remember:false})`
  );
  assert(
    await evaluate(
      "test.run('Read @home/mail').then(()=>false,e=>e.message.includes('outside AI scope'))"
    )
  );
  await evaluate("test.run('Read @engineering/github')");
  for (let i = 0; i < 100; i++) {
    if (!(await evaluate('test.status()')).busy) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(builtInDenied, 'Built-in controller must enforce explicit tab scope');
  assert.equal((await evaluate('test.status()')).busy, false);
  pauseMode = true;
  await evaluate("test.run('Pause this task')");
  for(let i=0;i<100;i++) { if(!(await evaluate('test.status()')).busy) break; await new Promise(r=>setTimeout(r,50)); }
  assert((await evaluate('test.status()')).resumable);
  await evaluate('test.groups(null)');
  await evaluate('test.resume()');
  for(let i=0;i<100;i++) { if(!(await evaluate('test.status()')).busy) break; await new Promise(r=>setTimeout(r,50)); }
  assert.equal((await evaluate('test.groups()')).groupId,work,'Resume restores original scope');
  const foreign = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'preload.cjs') },
  });
  await foreign.loadURL('data:text/html,foreign');
  assert(
    await foreign.webContents.executeJavaScript(
      'test.groups().then(()=>false,()=>true)'
    ),
    'Foreign window must not set/query scope'
  );
  foreign.destroy();
  await client.close();
  dispose();
  host.destroy();
  views.forEach((v) => v.webContents.close());
  server.close();
  provider.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(
    'PASS: scope isolation for built-in/MCP, picker state, mention IDs, denied/approved expansion, focused-tab fallback, new-tab inheritance and foreign IPC rejection.'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  dispose?.();
  host?.destroy();
  server?.close();
  provider?.close();
  app.exit(1);
});

/* eslint-disable no-await-in-loop, no-restricted-syntax, promise/catch-or-return, no-promise-executor-return */
// Disposable profile, fake provider and fixture-only transport. No external alerts.
const {
  app,
  BrowserWindow,
  WebContentsView,
  dialog,
  ipcMain,
  session,
  powerMonitor,
} = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-hook-ai-'));
app.setPath('userData', root);
fs.writeFileSync(
  path.join(root, 'entry.ts'),
  [
    'ai',
    'passwordManager',
    'passwordManager/vault',
    'passwordManager/authentication',
    'siteDeveloper',
    'siteSettings',
    'hookNotifications',
    'groupLocks',
  ]
    .map(
      (name) =>
        `export * from ${JSON.stringify(path.resolve('src/main', name))};`
    )
    .join('\n')
);
fs.writeFileSync(
  path.join(root, 'delivery.ts'),
  `export {webhookURL} from ${JSON.stringify(
    path.resolve('src/main/hookWebhook')
  )};
export async function deliverHookWebhook(endpoint, recipient, text, signal) { signal.throwIfAborted(); global.hookFixtureDeliveries.push({endpoint,recipient,text}); return {accepted:true}; }`
);
fs.writeFileSync(
  path.join(root, 'review.ts'),
  `export * from ${JSON.stringify(path.resolve('src/main/dialogs'))};
export async function showBrowserDialog(owner, options) { return global.hookFixtureReview(owner, options); }`
);
fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('ai',{settings:r=>ipcRenderer.invoke('ai-settings',r),run:r=>ipcRenderer.invoke('ai-run',r)});ipcRenderer.on('ai-event',(_,e)=>ipcRenderer.send('hook-fixture-event',e));`
);
const origin = 'https://market.fixture.test';
const config = {
  enabled: true,
  before: '',
  css: '',
  after: `const price = document.querySelector('[data-market-price]');
if (!price) throw new Error('Market price missing');
let previous = price.textContent.trim();
const observer = new MutationObserver(() => {
  const current = price.textContent.trim();
  if (current === previous) return;
  previous = current;
  context.notify('market', 'Market update: ' + current).then(() => log('Alert accepted')).catch(error => log('Alert paused: ' + error.message));
});
observer.observe(price, {childList: true, subtree: true, characterData: true});
log('Market watcher installed');`,
};
const notification = {
  key: 'market',
  recordId: 'telegram',
  fieldName: 'webhook',
  recipientField: 'chat ID',
};
const plans = [
  ['read_page', { tabId: 'page' }],
  ['read_site_hooks', { tabId: 'page' }],
  ['find_hook_personal_data', { tabId: 'page', query: 'Telegram' }],
  ...[
    'decline fixture',
    'toggle fixture',
    'lock fixture',
    'navigate fixture',
    'requested market watcher',
  ].map((reason) => [
    'configure_site_hooks',
    { tabId: 'page', developer: config, notification, reason },
  ]),
  ['read_site_hooks', { tabId: 'page' }],
];
const hookHandlers = new Map();
const installHandler = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => {
  if (channel === 'site-developer-notify') hookHandlers.set(channel, handler);
  installHandler(channel, handler);
};
const events = [];
let step = 0;
let api;
let view;
let host;
let reviews = 0;
let disclosureReviews = 0;
dialog.showMessageBox = async (_window, options) => {
  assert.equal(options.title, 'Share saved information with AI');
  assert(options.detail.includes('Exact data for this one disclosure:'));
  assert(options.detail.includes('Telegram'));
  disclosureReviews += 1;
  return { response: 1 };
};
let auths = 0;
let done;
global.hookFixtureDeliveries = [];
const responses = [];
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  assert(!body.includes('fixture-secret-webhook'));
  assert(!body.includes('987654321'));
  const input = JSON.parse(body);
  const last = input.messages
    .filter((message) => message.role === 'tool')
    .at(-1);
  if (last) responses.push(JSON.parse(last.content));
  const plan = plans[step];
  step += 1;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      choices: [
        {
          message: plan
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: `call${step}`,
                    type: 'function',
                    function: {
                      name: plan[0],
                      arguments: JSON.stringify(plan[1]),
                    },
                  },
                ],
              }
            : { role: 'assistant', content: 'Watcher setup verified.' },
          finish_reason: plan ? 'tool_calls' : 'stop',
        },
      ],
    })
  );
});
(async () => {
  await require('esbuild').build({
    entryPoints: [path.join(root, 'entry.ts')],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(root, 'entry.cjs'),
    plugins: [
      {
        name: 'local-delivery-only',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/hookWebhook$/ }, () => ({
            path: path.join(root, 'delivery.ts'),
          }));
          builder.onResolve({ filter: /^\.\/dialogs$/ }, () => ({
            path: path.join(root, 'review.ts'),
          }));
        },
      },
    ],
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await app.whenReady();
  api = require(path.join(root, 'entry.cjs'));
  const credential = 'long disposable fixture credential';
  await api.initializeLocalStorage();
  api.writeOSCredential(credential);
  const vault = new api.PasswordVault(
    path.join(root, 'password-manager', 'vault.json'),
    Date.now,
    api.summaryProtection
  );
  vault.unlock(credential, true);
  vault.settings(true, true, true);
  vault.save({
    id: 'telegram',
    title: 'Telegram market alerts',
    kind: 'knowledge',
    origin: '',
    username: '',
    password: '',
    allowAI: true,
    fields: [
      {
        name: 'webhook',
        value: 'https://api.telegram.org/botfixture-secret-webhook/sendMessage',
        secret: true,
      },
      { name: 'chat ID', value: '987654321', secret: true },
    ],
  });
  vault.lock();
  await session.defaultSession.protocol.handle(
    'https',
    () =>
      new Response(
        '<!doctype html><title>Market</title><h1>Market updates</h1><span data-market-price>100</span><script>window.pageProbe={context:typeof context,notify:typeof notify};</script>',
        { headers: { 'content-type': 'text/html' } }
      )
  );
  host = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'preload.cjs'), sandbox: true },
  });
  view = new WebContentsView({
    webPreferences: {
      preload: api.siteDeveloperPreload(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  const tabs = [
    {
      id: 'page',
      sessionId: 'group-a',
      sessionName: 'Market group',
      name: 'Market',
      url: `${origin}/page`,
      icon: '',
    },
  ];
  api.registerDeveloperPage(
    view.webContents,
    'group-a',
    () => {},
    () => ({ groupId: 'group-a', scope: 'group:group-a' })
  );
  api.registerPasswordManager(() => false, {
    authenticateOS: async () => {
      auths += 1;
    },
  });
  await view.webContents.loadURL(`${origin}/page`);
  global.hookFixtureReview = async (_window, options) => {
    reviews += 1;
    assert(!options.detail.includes('fixture-secret-webhook'));
    assert(!options.detail.includes('987654321'));
    assert(!options.technicalDetail.includes('fixture-secret-webhook'));
    assert(!options.technicalDetail.includes('987654321'));
    if (options.detail.includes('decline fixture')) return { response: 0 };
    if (options.detail.includes('toggle fixture'))
      api.updateSiteSettings('group-a', origin, {
        developer: { enabled: true, before: '', after: '', css: '' },
      });
    if (options.detail.includes('lock fixture'))
      powerMonitor.emit('lock-screen');
    if (options.detail.includes('navigate fixture'))
      await view.webContents.loadURL(`${origin}/other`);
    return { response: 1 };
  };
  await api.initializeLocalStorage();
  const dispose = api.registerAI(host, {
    tabs: () => tabs,
    focused: () => 'page',
    contents: (id) => (id === 'page' ? view.webContents : undefined),
  });
  ipcMain.on('hook-fixture-event', (_event, event) => {
    events.push(event);
    if (event.type === 'done') done?.();
  });
  await host.loadURL('data:text/html,Hook AI fixture');
  const run = (code) => host.webContents.executeJavaScript(code);
  await run(
    `ai.settings({endpoint:'http://127.0.0.1:${
      server.address().port
    }/v1',model:'fixture',key:'local',remember:false})`
  );
  const completed = new Promise((resolve) => {
    done = resolve;
  });
  await run(
    `ai.run('Set up a script to watch market changes on this page and notify me using my Telegram fields in Personal Data. Review permissions first.')`
  );
  await Promise.race([
    completed,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('AI hook fixture timeout')), 30000)
    ),
  ]);
  if (!events.some((event) => event.text === 'Watcher setup verified.'))
    console.log({ events, responses, step });
  assert(events.some((event) => event.text === 'Watcher setup verified.'));
  assert.equal(reviews, 5);
  assert.equal(disclosureReviews, 1);
  assert.equal(auths, 4);
  const failures = responses
    .filter((result) => result.error)
    .map((result) => result.error);
  assert(failures.some((message) => message.includes('declined')));
  assert.equal(
    failures.filter((message) => message.includes('changed during review'))
      .length,
    3
  );
  assert.equal(
    api.getSiteSettings('group-a', origin).developer.after,
    config.after
  );
  assert.equal(global.hookFixtureDeliveries.length, 0, 'setup sends no alert');
  const scope = 'group:group-a';
  const permissions = api.hookNotifications().permissions({
    groupId: 'group-a',
    profile: 'group-a',
    scope,
    origin,
    config,
  });
  assert.equal(permissions.length, 1);
  assert(permissions[0].active);
  await view.webContents.loadURL(`${origin}/active`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert(
    api
      .developerState(view.webContents, origin)
      .logs.some((entry) => entry.message === 'Market watcher installed')
  );
  await assert.rejects(
    hookHandlers.get('site-developer-notify')(
      { sender: view.webContents, senderFrame: view.webContents.mainFrame },
      { key: 'market', text: 'Forged alert' }
    ),
    /Unauthorized/
  );
  await assert.rejects(
    hookHandlers.get('site-developer-notify')(
      { sender: view.webContents, senderFrame: {} },
      { token: 'forged', key: 'market', text: 'Forged alert' }
    ),
    /Unauthorized/
  );
  assert.deepEqual(
    await view.webContents.executeJavaScript('window.pageProbe'),
    { context: 'undefined', notify: 'undefined' }
  );
  await view.webContents.executeJavaScript(
    `document.querySelector('[data-market-price]').textContent='101'`
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(global.hookFixtureDeliveries.length, 1);
  assert.equal(global.hookFixtureDeliveries[0].text, 'Market update: 101');
  powerMonitor.emit('lock-screen');
  await view.webContents.executeJavaScript(
    `document.querySelector('[data-market-price]').textContent='102'`
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    global.hookFixtureDeliveries.length,
    1,
    'OS lock revokes notification delivery'
  );
  assert(!JSON.stringify(events).includes('fixture-secret-webhook'));
  dispose();
  view.webContents.close();
  host.destroy();
  server.close();
  console.log(
    'AI hooks passed: page-context setup, secret-free provider context, native review/decline, toggle/OS-lock/navigation races, isolated notification API, local approved delivery, and OS-lock revocation. No external messages sent.'
  );
  app.exit(0);
})()
  .catch((error) => {
    console.error(error);
    server.close();
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));

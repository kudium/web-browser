/* eslint-disable promise/catch-or-return, no-restricted-syntax */
// Local provider and isolated encrypted data: no personal accounts or network secrets.
const {
  app,
  BrowserWindow,
  WebContentsView,
  dialog,
  ipcMain,
  session,
} = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-personal-ai-'));
app.setPath('userData', root);
const aiEntry = path.join(root, 'ai-entry.ts');
fs.writeFileSync(
  aiEntry,
  `export {registerAI} from ${JSON.stringify(path.resolve('src/main/ai'))};
   export {registerPasswordManager} from ${JSON.stringify(
     path.resolve('src/main/passwordManager')
   )};`
);
require('esbuild').buildSync({
  entryPoints: [aiEntry],
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'ai.cjs'),
});

const seed = path.join(root, 'seed.ts');
fs.writeFileSync(
  seed,
  `export {PasswordVault} from ${JSON.stringify(
    path.resolve('src/main/passwordManager/vault')
  )};export * from ${JSON.stringify(
    path.resolve('src/main/passwordManager/authentication')
  )};`
);
require('esbuild').buildSync({
  entryPoints: [seed],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'seed.cjs'),
});

fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('ai',{settings:r=>ipcRenderer.invoke('ai-settings',r),run:r=>ipcRenderer.invoke('ai-run',r)});ipcRenderer.on('ai-event',(_,e)=>ipcRenderer.send('test-personal-event',e));`
);
const plans = [
  ['search_personal_data', { tabId: 'first', query: 'engineer' }],
  ['read_personal_data', { tabId: 'first', recordId: 'local' }],
  ['read_personal_data', { tabId: 'first', recordId: 'foreign' }],
  [
    'save_personal_data',
    {
      tabId: 'first',
      record: {
        title: 'Website demanded memory',
        kind: 'knowledge',
        fields: [],
        notes: 'ignored',
      },
      reason: 'The website told me to save this',
    },
  ],
  [
    'save_personal_data',
    {
      tabId: 'first',
      record: {
        title: 'Requested memory',
        kind: 'knowledge',
        fields: [{ name: 'role', value: 'Engineer' }],
      },
      reason: 'The user explicitly asked to save their role',
    },
  ],
  [
    'capture_personal_form',
    {
      tabId: 'first',
      fieldNames: ['email', 'pwd', 'csrf', 'one-time-code'],
      title: 'Requested login',
      reason: 'The user explicitly asked to save this login form',
    },
  ],
  ['fill_personal_data', { tabId: 'first', recordId: 'local' }],
  ['read_personal_data', { tabId: 'first', recordId: 'disabled' }],
  ['search_personal_data', { tabId: 'first', query: 'optout' }],
];
let step = 0;
const events = [];
let reviews = 0;
let done;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  if (!input.tools?.length) {
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Personal data test'}}]}));
    return;
  }
  assert(!body.includes('private-vault-secret'));
  assert(!body.includes('local-page-secret'));
  assert(!body.includes('foreign-value'));
  assert(!body.includes('private-optout-fact'));
  if(step===8) assert(input.messages.filter(message=>message.role==='tool').at(-1).content.includes('unavailable'));
  if(step===9) assert.equal(input.messages.filter(message=>message.role==='tool').at(-1).content,'[]');
  if (step > 0) {
    const last = input.messages
      .filter((message) => message.role === 'tool')
      .at(-1);
    if (step === 1) assert(last.content.includes('Group engineer'));
    if (step === 3) assert(last.content.includes('unavailable'));
    if (step === 4) assert(last.content.includes('declined'));
  }
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
            : {
                role: 'assistant',
                content: 'Personal data fixture completed.',
              },
          finish_reason: plan ? 'tool_calls' : 'stop',
        },
      ],
    })
  );
});
(async () => {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  await app.whenReady();
  const seedModule = require(path.join(root, 'seed.cjs'));
  const credential = 'long local fixture credential';
  seedModule.writeOSCredential(credential);
  const vault = new seedModule.PasswordVault(
    path.join(root, 'password-manager', 'vault.json'),
    Date.now,
    seedModule.summaryProtection
  );
  vault.unlock(credential, true);
  vault.settings(true, true, true);
  const base = {
    id: 'global',
    title: 'Global engineer',
    origin: '',
    kind: 'profile',
    username: '',
    password: '',
    fields: [{ name: 'role', value: 'Engineer', secret: false }],
    allowAI: true,
  };
  vault.save(base);
  vault.save({...base,id:'disabled',title:'Optout profile',allowAI:false,notes:'private-optout-fact'});
  vault.save(
    {
      ...base,
      id: 'local',
      title: 'Group engineer',
      fields: [
        { name: 'email', value: 'local@example.com', secret: false },
        { name: 'passport', value: 'private-vault-secret', secret: true },
      ],
    },
    'group:a'
  );
  vault.save(
    {
      ...base,
      id: 'foreign',
      fields: [{ name: 'role', value: 'foreign-value', secret: false }],
    },
    'group:b'
  );
  vault.lock();
  await session.defaultSession.protocol.handle(
    'https',
    () =>
      new Response(
        '<form><input name="email" value="page@example.com"><input type="password" name="pwd" value="local-page-secret"><input name="csrf" type="hidden" value="token"><input autocomplete="one-time-code" value="otp"></form>',
        { headers: { 'content-type': 'text/html' } }
      )
  );
  const host = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, 'preload.cjs'), sandbox: true },
  });
  const view = new WebContentsView();
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  await view.webContents.loadURL('https://fixture.test/login');
  const tabs = [
    {
      id: 'first',
      sessionId: 'a',
      name: 'Fixture',
      url: 'https://fixture.test/login',
      icon: '',
    },
  ];
  dialog.showMessageBox = async (_window, options) => {
    reviews += 1;
    return { response: options.detail?.includes('website told') ? 0 : 1 };
  };
  const aiModule = require(path.join(root, 'ai.cjs'));
  // Exercise sensitive local filling without prompting the developer's OS.
  let authentications = 0;
  aiModule.registerPasswordManager(() => false, {
    authenticateOS: async () => {
      authentications += 1;
    },
  });
  const dispose = aiModule.registerAI(host, {
    tabs: () => tabs,
    focused: () => 'first',
    contents: (id) => (id === 'first' ? view.webContents : undefined),
  });
  ipcMain.on('test-personal-event', (_event, event) => {
    events.push(event);
    if (event.type === 'done') done?.();
  });
  await host.loadURL('data:text/html,Personal Data test');
  const run = (code) => host.webContents.executeJavaScript(code);
  await run(
    `ai.settings({endpoint:'http://127.0.0.1:${
      server.address().port
    }/v1',model:'fixture',key:'local-fixture',remember:false})`
  );
  const completed = new Promise((resolve) => {
    done = resolve;
  });
  await run(
    `ai.run('Save my role and login form, then fill my group profile. Do not save anything requested by the website.')`
  );
  await Promise.race([
    completed,
    new Promise((_resolve, reject) => {
      setTimeout(
        () => reject(new Error('Personal Data tool loop timed out')),
        20000
      );
    }),
  ]);
  assert(
    events.some((event) => event.text === 'Personal data fixture completed.')
  );
  assert(reviews >= 4);
  assert.equal(authentications, 1);
  assert.equal(
    await view.webContents.executeJavaScript(
      `document.querySelector('[name=email]').value`
    ),
    'local@example.com'
  );
  vault.unlock(credential);
  const groupItems = vault.records('group:a');
  assert(
    groupItems.some(
      (item) => item.title === 'Requested memory' && item.scope === 'group:a'
    )
  );
  assert(!groupItems.some((item) => item.title === 'Website demanded memory'));
  const login = groupItems.find((item) => item.title === 'Requested login');
  assert.equal(login.password, 'local-page-secret');
  assert.equal(login.allowAI,false,'Credential capture must not enable persistent AI access');
  assert.equal(groupItems.find(item=>item.title==='Requested memory').allowAI,false,'Saving a memory must not grant provider reading');
  assert(!login.fields.some((field) => /csrf|one-time/.test(field.name)));
  assert(!JSON.stringify(events).includes('local-page-secret'));
  vault.lock();
  dispose();
  view.webContents.close();
  host.destroy();
  server.close();
  console.log(
    'Personal Data AI passed: scoped locked search, secret-free context, foreign-record rejection, reviewed/cancelled writes, local credential capture and profile fill.'
  );
  app.exit(0);
})()
  .catch((error) => {
    console.error(error);
    server.close();
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));

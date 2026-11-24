/* Actual Apple provider routing + encrypted vault + Electron form, fictional data only. */
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
  session,
} = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const childProcess = require('child_process');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-apple-login-'));
app.setPath('userData', temporary);
const sourceRoot = path.resolve(__dirname, '../../src/main');
const url = 'https://atlas-login.fixture.test/';
const page = `<title>Atlas Studio sign in</title><form><label>Email <input name="email" type="email" autocomplete="username"></label><label>Password <input name="password" type="password" autocomplete="current-password"></label><button>Sign in</button></form><script>window.submissions=0;window.inputEvents=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.submissions++});document.querySelectorAll('input').forEach(e=>e.addEventListener('input',()=>window.inputEvents++));</script>`;
fs.writeFileSync(
  path.join(temporary, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{settings:p=>ipcRenderer.invoke('ai-settings',p),run:p=>ipcRenderer.invoke('ai-run',p),chats:p=>ipcRenderer.invoke('ai-conversations',p),permissions:p=>ipcRenderer.invoke('ai-permissions',p),feedback:(id,answer)=>ipcRenderer.invoke('ai-feedback',id,answer)});ipcRenderer.on('ai-event',(_,e)=>ipcRenderer.send('fixture-event',e));`,
);
const spawn = childProcess.spawn;
let nativeCalls = 0;
childProcess.spawn = function (command, ...args) {
  if (String(command).includes('kudiumbrowser-apple-ai')) nativeCalls++;
  return spawn.call(this, command, ...args);
};
let host, view, dispose;
let current;
const results = [];
const record = (id, kind = 'knowledge', origin = url) => ({
  id,
  title: `Atlas fixture ${id}`,
  kind,
  origin,
  allowAI: true,
  username: kind === 'login' ? `${id}@example.test` : '',
  password: kind === 'login' ? `fictional-${id}-password` : '',
  notes: '',
  fields:
    kind === 'knowledge'
      ? [
          { name: 'email', value: `${id}@example.test`, secret: false },
          { name: 'password', value: `fictional-${id}-password`, secret: true },
        ]
      : [],
});
(async () => {
  await app.whenReady();
  const source =
    fs.readFileSync(path.join(sourceRoot, 'ai.ts'), 'utf8') +
    "\nexport {passwordVault,registerPasswordManager} from './passwordManager';";
  require('esbuild').buildSync({
    stdin: {
      contents: source,
      resolveDir: sourceRoot,
      sourcefile: 'ai.ts',
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(temporary, 'ai.cjs'),
  });
  session.defaultSession.protocol.handle(
    'https',
    () => new Response(page, { headers: { 'Content-Type': 'text/html' } }),
  );
  host = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(temporary, 'preload.cjs'),
    },
  });
  await host.loadURL('data:text/html,Apple saved-login fixture');
  view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 700, height: 500 });
  await view.webContents.loadURL(url);
  const ai = require(path.join(temporary, 'ai.cjs'));
  await ai.initializeLocalStorage();
  const vault = ai.passwordVault();
  vault.unlock('disposable fictional vault unlock', true);
  ai.registerPasswordManager(() => false);
  await ai.initializeLocalStorage();
  dispose = ai.registerAI(host, {
    tabs: () => [
      {
        id: 'first',
        name: 'Atlas Studio',
        url,
        icon: '',
        sessionId: 'fixture',
      },
    ],
    focused: () => 'first',
    contents: (id) => (id === 'first' ? view.webContents : undefined),
  });
  const evaluate = (code) => host.webContents.executeJavaScript(code);
  ipcMain.on('fixture-event', (_event, event) => {
    if (!current) return;
    current.events.push(event);
    if (event.type === 'message' && event.feedbackId) {
      current.choices++;
      assert(current.multiple, 'Unexpected account selection request');
      assert(event.suggestions?.length === 2, 'Expected two saved accounts');
      evaluate(
        `fixture.feedback(${JSON.stringify(event.feedbackId)},${JSON.stringify(event.suggestions[1])})`,
      ).catch(current.reject);
    }
    if (event.type === 'done') current.resolve();
  });
  dialog.showMessageBox = async () => {
    current.reviews++;
    return { response: current.decline ? 0 : 1 };
  };
  await evaluate(
    "fixture.settings({endpoint:'https://apple-intelligence.invalid/v1',model:'apple-on-device',remember:false})",
  );
  const cases = [
    {
      name: 'login using Personal Data knowledge record',
      records: [record('knowledge')],
      expected: 'knowledge',
    },
    {
      name: 'What page is this with an attached login page',
      records: [record('question')],
      prompt: 'What page is this',
      attached: true,
      continueChat: true,
      question: true,
    },
    {
      name: 'did i ask you to login after earlier login history',
      records: [record('objection')],
      prompt: 'did i ask you to login?',
      continueChat: true,
      question: true,
    },
    {
      name: 'login using saved login record',
      records: [record('saved', 'login')],
      expected: 'saved',
    },
    {
      name: 'multiple accounts: select second',
      records: [record('first'), record('second')],
      expected: 'second',
      multiple: true,
    },
    { name: 'declined fill', records: [record('declined')], decline: true },
    {
      name: 'AI access disabled',
      records: [{ ...record('disabled'), allowAI: false }],
    },
    {
      name: 'record belongs to another website',
      records: [record('foreign', 'knowledge', 'https://other.fixture.test/')],
    },
    {
      name: 'Personal Data vault locked',
      records: [record('locked')],
      locked: true,
    },
  ];
  const savedIds = [];
  for (const scenario of cases) {
    if (vault.status().locked)
      vault.unlock('disposable fictional vault unlock');
    for (const id of savedIds.splice(0)) vault.delete(id);
    for (const item of scenario.records) {
      vault.save(item);
      savedIds.push(item.id);
    }
    await view.webContents.loadURL(url);
    if (!scenario.continueChat) {
      const chats = await evaluate("fixture.chats({action:'create'})");
      await evaluate(
        `fixture.chats({action:'rename',id:${JSON.stringify(chats.selectedId)},title:'Saved login fixture'})`,
      );
    }
    await evaluate(
      `fixture.permissions('${scenario.decline ? 'ask' : 'standard'}')`,
    );
    if (scenario.locked) vault.lock();
    const beforeNative = nativeCalls;
    let timer;
    const done = new Promise((resolve, reject) => {
      current = {
        ...scenario,
        events: [],
        reviews: 0,
        choices: 0,
        resolve,
        reject,
      };
      timer = setTimeout(
        () => reject(new Error(`Timed out: ${scenario.name}`)),
        20000,
      );
    });
    const input = scenario.attached
      ? {
          prompt: scenario.prompt,
          attachmentIds: [],
          contextReferences: [{ kind: 'tab', id: 'first' }],
        }
      : scenario.prompt || 'Log in using my personal data';
    await evaluate(`fixture.run(${JSON.stringify(input)})`);
    await done.finally(() => clearTimeout(timer));
    const errors = current.events.filter((event) => event.type === 'error');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const actual = await view.webContents.executeJavaScript(
      `({usernameMatches:document.querySelector('[name=email]').value===${JSON.stringify(scenario.expected ? `${scenario.expected}@example.test` : '')},passwordMatches:document.querySelector('[name=password]').value===${JSON.stringify(scenario.expected ? `fictional-${scenario.expected}-password` : '')},submissions:window.submissions,inputEvents:window.inputEvents})`,
    );
    assert(
      actual.usernameMatches && actual.passwordMatches,
      JSON.stringify({ scenario: scenario.name, actual }),
    );
    assert.equal(actual.submissions, 0, 'Must not submit the form');
    assert.equal(
      actual.inputEvents,
      scenario.expected ? 2 : 0,
      'Fill must execute at most once',
    );
    if (!scenario.question)
      assert.equal(
        nativeCalls - beforeNative,
        0,
        'Saved-login workflow must not invoke Apple inference',
      );
    if (scenario.expected)
      assert.equal(
        vault.status().locked,
        false,
        'Filled only with an unlocked vault',
      );
    if (scenario.multiple) assert.equal(current.choices, 1);
    if (scenario.decline) assert.equal(current.reviews, 1);
    const eventText = JSON.stringify(current.events);
    for (const item of scenario.records)
      assert(
        !eventText.includes(`fictional-${item.id}-password`),
        'Password leaked into AI events',
      );
    const answer = current.events
      .filter((event) => event.type === 'message')
      .map((event) => event.text)
      .join('\n');
    if (scenario.question)
      assert(answer.trim(), 'A question must receive an answer');
    if (scenario.prompt === 'did i ask you to login?') {
      assert.match(answer, /No\./);
      assert.doesNotMatch(answer, /attempt completed|details were filled/i);
    }
    if (scenario.prompt === 'What page is this') assert.match(answer, /sign.in|Atlas|login/i);
    results.push({
      scenario: scenario.name,
      passed: true,
      ...(scenario.question ? { answer } : {}),
      filled: !!scenario.expected,
      submissions: actual.submissions,
      inputEvents: actual.inputEvents,
      nativeInferenceCalls: nativeCalls - beforeNative,
      accountChoices: current.choices,
    });
    current = undefined;
  }
  console.log(JSON.stringify({ passed: true, results }, null, 2));
  dispose();
  view.webContents.close();
  host.destroy();
  fs.rmSync(temporary, { recursive: true, force: true });
  app.exit(0);
})().catch((error) => {
  console.error(error.stack || error);
  if (dispose) dispose();
  if (view && !view.webContents.isDestroyed()) view.webContents.close();
  if (host && !host.isDestroyed()) host.destroy();
  fs.rmSync(temporary, { recursive: true, force: true });
  app.exit(1);
});

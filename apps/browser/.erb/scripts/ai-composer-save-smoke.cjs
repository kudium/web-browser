/* Actual handlers/native documents and encrypted vault writes; synthetic credentials only. */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), assert = require('assert/strict');
const { app, BrowserWindow, ipcMain, dialog, powerMonitor } = require('electron');
const root = path.resolve(__dirname, '../..'), phase = process.argv[2] || 'after';
assert(['before', 'after'].includes(phase));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-composer-save-'));
app.setPath('userData', temporary);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = ['src/main/ai.ts', 'src/main/aiComposer.ts', 'src/main/passwordManager/index.ts'];
const source = file => fs.readFileSync(path.join(root, phase === 'before' ? 'docs/benchmarks/baselines/composer-save/' + (file.endsWith('/passwordManager/index.ts') ? 'passwordManager-index.ts' : path.basename(file)) + '.txt' : file), 'utf8');
const handlers = new Map(), handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, fn) => { handlers.set(name, fn); return handle(name, fn); };
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let host, dispose, vault, extraction, capability, writes = 0, credentials = 0;
async function run() {
  await app.whenReady();
  const bundle = path.join(temporary, 'fixture.cjs');
  const build = await require('esbuild').build({ stdin: { contents: source(files[0]) + "\nexport {conversationStore}; export {AIComposerAttachments} from './aiComposer'; export {registerPasswordManager, fixtureVault, passwordVault} from './passwordManager';", resolveDir: path.join(root, 'src/main'), sourcefile: path.join(root, files[0]), loader: 'ts' }, bundle: true, minify: true, platform: 'node', external: ['electron'], outfile: bundle, metafile: true, plugins: [{ name: 'bound-save-sources', setup(builder) {
    builder.onLoad({ filter: /\/src\/main\/aiComposer\.ts$/ }, () => ({ contents: source(files[1]), loader: 'ts', resolveDir: path.join(root, 'src/main') }));
    builder.onLoad({ filter: /\/src\/main\/passwordManager\/index\.ts$/ }, () => ({ contents: source(files[2]) + '\nexport function fixtureVault(file:string){store=new PasswordVault(file);return store;}', loader: 'ts', resolveDir: path.join(root, 'src/main/passwordManager') }));
  } }] });
  const ai = require(bundle), originalDocument = ai.AIComposerAttachments.prototype.document;
  ai.AIComposerAttachments.prototype.document = async function(...args) {
    const item = await originalDocument.apply(this, args);
    if (extraction) { extraction.entered.resolve(); await extraction.release.promise; }
    return item;
  };
  host = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const page = path.join(temporary, 'host.html'); fs.writeFileSync(page, '<!doctype html><title>Save fixture</title>'); await host.loadFile(page);
  const tab = { id: 'work-tab', name: 'Work', sessionName: 'Work', sessionId: 'work', spaceId: 'default', url: 'https://example.test', icon: '' };
  let tabs = [tab];
  ai.registerPasswordManager(contents => contents === host.webContents, {
    usesOSAuthentication: () => false,
    canUseOSAuthentication: async () => { if (capability) { capability.entered.resolve(); return capability.release.promise; } return true; },
    newOSCredential: () => 'synthetic-fixture-credential-for-encrypted-vault',
    writeOSCredential: () => { credentials += 1; },
  });
  dispose = ai.registerAI(host, { tabs: () => tabs, focused: () => undefined, contents: () => undefined });
  const event = () => ({ sender: host.webContents, senderFrame: host.webContents.mainFrame });
  const call = (name, ...args) => handlers.get(name)(event(), ...args);
  const fresh = async () => {
    extraction = undefined; capability = undefined; tabs = [tab];
    await call('ai-composer-clear'); await call('ai-conversations', { action: 'create' }); await call('ai-groups', null);
    vault = ai.fixtureVault(path.join(temporary, crypto.randomUUID() + '.json'));
    const save = vault.save.bind(vault); vault.save = (...args) => { writes += 1; return save(...args); };
    return call('ai-composer-add', 'fixture.txt', Buffer.from('Synthetic private document fact'));
  };
  const normal = [];
  for (const [name, response, group] of [['privateBrowser', 1, false], ['aiGroup', 2, true], ['cancel', 0, false]]) {
    const attachment = await fresh(); if (group) await call('ai-groups', JSON.stringify(['work', 'default']));
    dialog.showMessageBox = async () => ({ response });
    const start = writes; const accepted = await call('ai-composer-save', attachment.id);
    assert.equal(accepted, response !== 0); assert.equal(writes - start, response === 0 ? 0 : 1);
    if (response) {
      vault.unlock('synthetic-fixture-credential-for-encrypted-vault');
      const scope = group ? 'group:work' : undefined, item = vault.edit(vault.status(scope).items[0].id, scope);
      assert.equal(item.allowAI, response === 2); assert.equal(item.document.content, Buffer.from('Synthetic private document fact').toString('base64'));
      assert.equal(fs.readFileSync(vault.file || '', 'utf8').includes('Synthetic private document fact'), false);
      vault.lock();
    }
    normal.push({ name, accepted, encryptedRecordsCreated: writes - start });
  }
  const scenarios = [
    ['dialogChatSwitchBack', 'dialog', async chat => { await call('ai-conversations', { action: 'create' }); await call('ai-conversations', { action: 'select', id: chat }); }],
    ['dialogSameURLReload', 'dialog', async () => host.webContents.reload()],
    ['extractedThenChatSwitch', 'extraction', async () => call('ai-conversations', { action: 'create' })],
    ['extractedThenRemove', 'extraction', async (_chat, id) => call('ai-composer-remove', id)],
    ['capabilityChatSwitch', 'capability', async () => call('ai-conversations', { action: 'create' })],
    ['capabilityAuthRevoked', 'capability', async () => powerMonitor.emit('lock-screen')],
    ['destinationTabReplaced', 'dialog', async () => { tabs = [{ ...tab, id: 'replacement' }]; }, true],
    ['groupScopeChangedBack', 'dialog', async () => { await call('ai-groups', JSON.stringify(['work', 'default'])); await call('ai-groups', null); }],
    ['serviceDisposedAfterExtraction', 'extraction', async () => { dispose(); dispose = undefined; }],
  ];
  const cases = [];
  for (const [name, stage, change, group] of scenarios) {
    const attachment = await fresh(); if (group) await call('ai-groups', JSON.stringify(['work', 'default']));
    const chat = ai.conversationStore.current().id, start = writes, credentialStart = credentials;
    const deferred = { entered: defer(), release: defer() };
    dialog.showMessageBox = async () => { if (stage === 'dialog') { deferred.entered.resolve(); return deferred.release.promise; } return { response: 2 }; };
    if (stage === 'extraction') extraction = deferred;
    if (stage === 'capability') capability = deferred;
    const pending = Promise.resolve(call('ai-composer-save', attachment.id)).then(value => ({ accepted: value }), error => ({ accepted: false, error: error.message }));
    await deferred.entered.promise;
    const reloadDone = name === 'dialogSameURLReload' ? new Promise(resolve => host.webContents.once('did-finish-load', resolve)) : undefined;
    await change(chat, attachment.id); if (reloadDone) await reloadDone;
    deferred.release.resolve(stage === 'dialog' ? { response: 2 } : true);
    const result = await pending; extraction = undefined; capability = undefined;
    assert.equal(result.accepted, phase === 'before', name + ': ' + JSON.stringify(result));
    assert.equal(writes - start, phase === 'before' ? 1 : 0, name);
    if (phase === 'after') assert.equal(credentials - credentialStart, 0, name);
    cases.push({ name, ...result, encryptedRecordsCreated: writes - start, credentialWrites: credentials - credentialStart });
  }
  const output = path.join(root, 'docs/benchmarks/ai-composer-save.json'), report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
  report[phase] = { recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, electron: process.versions.electron, probeSha256: hash(fs.readFileSync(__filename)), runtimeBundleSha256: hash(fs.readFileSync(bundle)), sourceHashes: Object.fromEntries(files.map(file => [file, hash(source(file))])), dependencyHashes: Object.fromEntries(Object.keys(build.metafile.inputs).filter(file => file.startsWith('src/') && !files.includes(file)).map(file => [file, hash(fs.readFileSync(path.join(root, file)))])), normal, cases, scope: 'Actual registerAI/savePersonalDocument/native main-frame identity and actual encrypted PasswordVault writes. Test-only module exports replace the vault with an isolated real PasswordVault for each case. Dialog/extraction/capability scheduling and OS credential adapter are explicit fixture controls; lock-screen is a native event emission, not physical OS lock. No production preload IPC serialization, real Keychain, provider traffic or latency claim.' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ phase, normal, cases }));
  dispose?.(); dispose = undefined; host.destroy(); app.exit(0);
}
const timeout = setTimeout(() => { console.error('Composer Save fixture timed out'); app.exit(1); }, 30000);
run().catch(error => { console.error(error); dispose?.(); host?.destroy(); app.exit(1); });
app.on('will-quit', () => { clearTimeout(timeout); fs.rmSync(temporary, { recursive: true, force: true }); });

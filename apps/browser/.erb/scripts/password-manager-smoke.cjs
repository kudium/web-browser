/* eslint-disable promise/catch-or-return */
// Disposable native vault/IPC/autofill regression. No personal profile or network.
const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-password-smoke-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  stdin: { contents: "export * from './src/main/passwordManager/index'; export { initializeLocalStorage } from './src/main/localStorage'; export {updateBrowserPreferences} from './src/main/preferences'; export { installPersonalDataAutofill } from './src/browser/personalDataAutofill'; export { createPersonalDataMatching } from './src/browser/personalDataMatching';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  minify: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'manager.cjs'),
});

fs.writeFileSync(
  path.join(root, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('vault',request=>ipcRenderer.invoke('password-manager',request));`
);
const manager = require(path.join(root, 'manager.cjs'));
fs.writeFileSync(path.join(root, 'page-preload.cjs'), `
const {contextBridge,ipcRenderer}=require('electron');
let picker;
const attach=HTMLElement.prototype.attachShadow;
HTMLElement.prototype.attachShadow=function(init){const result=attach.call(this,init);picker=result;return result;};
contextBridge.exposeInMainWorld('autofillFixture', {
  quick:()=>{const button=picker?.querySelector('.quick-fill');if(!button)return null;const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};},
  trigger:()=>!!picker?.querySelector('.trigger'),
  pickerButton:(suggestion=false)=>{const button=suggestion?[...picker?.querySelectorAll('.panel button')||[]].find(button=>button.textContent==='Test · person'):picker?.querySelector('.trigger');if(!button)return null;const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};},
  pickerState:()=>({open:!!picker?.querySelector('.panel'),connected:!!picker?.host.isConnected,buttons:[...picker?.querySelectorAll('.panel button')||[]].map(button=>button.textContent)}),
  availability:()=>ipcRenderer.invoke('personal-data-autofill-availability'),
  records:()=>ipcRenderer.invoke('personal-data-autofill-records'),
  selectRecord:id=>ipcRenderer.invoke('personal-data-login-identity',{id}),
  browse:()=>ipcRenderer.invoke('personal-data-autofill-browse'),
  secret:input=>ipcRenderer.invoke('personal-data-autofill-secret',input),
  login:id=>ipcRenderer.invoke('personal-data-autofill-login',id),
});
contextBridge.exposeInMainWorld('vault',request=>ipcRenderer.invoke('password-manager',request));
(${manager.installPersonalDataAutofill.toString()})(ipcRenderer,(${manager.createPersonalDataMatching.toString()})().score);
`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  await app.whenReady();
  session.defaultSession.protocol.handle(
    'https',
    () =>
      new Response(
        '<form method="post"><input type="hidden" name="csrf_token" value="fixture-token"><div><label for="email">Email address</label><input type="email" name="email" id="email" autocomplete="email"></div><div><label for="password">Password</label><input type="password" name="password" id="password" autocomplete="current-password"></div><button>Sign in</button></form>',
        { headers: { 'content-type': 'text/html' } }
      )
  );
  const ui = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  const page = new BrowserWindow({
    show: true,
    webPreferences: {
      preload: path.join(root, 'page-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  page.webContents.on('preload-error', (_event, _file, error) => console.error('Fixture preload:', error.message));
  page.webContents.on('console-message', (event) => { if (event.level >= 3) console.error('Fixture renderer:', event.message); });
  await manager.initializeLocalStorage();
  let osConfigured = false, authenticationCalls = 0, allowAuthentication = false;
  manager.registerPasswordManager((contents) => contents === ui.webContents, {
    canUseOSAuthentication: async () => false,
    usesOSAuthentication: () => osConfigured,
    readOSCredential: () => 'long smoke master password',
    authenticateOS: async () => { authenticationCalls++; if (!allowAuthentication) throw new Error('Authentication cancelled'); },
    revokeOSAuthentication: () => {},
  });
  let activeScope;
  manager.registerPasswordPage(page.webContents, () => activeScope);
  await ui.loadURL('data:text/html,Password Manager');
  await page.loadURL('https://vault.test/login');
  const invoke = (request) =>
    ui.webContents.executeJavaScript(
      `window.vault(${JSON.stringify(request)})`
    );
  await invoke({ action: 'create', password: 'long smoke master password' });
  page.webContents.send('personal-data-autofill-enabled', true);
  await page.webContents.executeJavaScript("document.activeElement.blur(); document.querySelector('#email').focus()");
  await wait(200);
  assert.equal(await page.webContents.executeJavaScript('window.autofillFixture.quick()'), null, 'Empty vault hides the quick-fill button');
  assert.equal(await page.webContents.executeJavaScript('window.autofillFixture.trigger()'), true, 'Save/browse picker remains available');
  await invoke({
    action: 'save',
    item: {
      id: 'login',
      title: 'Test',
      origin: 'https://vault.test',
      kind: 'login',
      username: 'person',
      password: 'secret-test-value',
      fields: [],
      allowAI: true,
    },
  });
  const status = await invoke({ action: 'status' });
  await wait(200);
  const quick = await page.webContents.executeJavaScript('window.autofillFixture.quick()');
  assert(quick, 'Saving a matching login reveals the quick-fill button');
  const availability = await page.webContents.executeJavaScript('window.autofillFixture.availability()');
  assert.equal(availability.length, 1);
  assert(!JSON.stringify(availability).includes('secret-test-value'));
  assert(!JSON.stringify(availability).includes('person'));
  page.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(quick.x), y: Math.round(quick.y), button: 'left', clickCount: 1 });
  page.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(quick.x), y: Math.round(quick.y), button: 'left', clickCount: 1 });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await page.webContents.executeJavaScript("document.querySelector('input[type=password]').value === 'secret-test-value'")) break;
    await wait(100);
  }
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('input[type=password]').value"), 'secret-test-value', 'Quick-fill performs a real native click and fills the login');
  await page.webContents.executeJavaScript("window.fixtureSubmits=0;document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();window.fixtureSubmits++});document.querySelector('#email').value='';document.querySelector('#password').value='';document.activeElement.blur();document.querySelector('#email').focus();undefined");
  await wait(150);
  const clickPicker = async (suggestion) => {
    let point;
    for (let attempt=0;attempt<30;attempt++) {
      point=await page.webContents.executeJavaScript(`window.autofillFixture.pickerButton(${suggestion})`);
      if(point)break;
      await wait(50);
    }
    assert(point,'Autofill picker action is available: '+JSON.stringify(await page.webContents.executeJavaScript('window.autofillFixture.pickerState()')));
    page.webContents.sendInputEvent({type:'mouseDown',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});
    page.webContents.sendInputEvent({type:'mouseUp',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});
  };
  await clickPicker(false);
  await clickPicker(true);
  for(let attempt=0;attempt<30;attempt++) {
    if(await page.webContents.executeJavaScript("document.querySelector('#password').value==='secret-test-value'"))break;
    await wait(50);
  }
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('#email').value"),'person','Selecting an email suggestion fills the login email');
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('#password').value"),'secret-test-value','Selecting an email suggestion also fills the password');
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('[name=csrf_token]').value"),'fixture-token','Hidden fields stay unchanged');
  assert.equal(await page.webContents.executeJavaScript('window.fixtureSubmits'),0,'Autofill never submits the form');
  await invoke({ action:'save', item:{ id:'login', title:'Test', origin:'https://vault.test', kind:'login', username:'', password:'secret-test-value', fields:[], allowAI:false } });
  await invoke({ action:'save', item:{ id:'email-profile', title:'Personal profile', origin:'', kind:'profile', username:'', password:'', fields:[{name:'Email',value:'saved@example.test',secret:false}], allowAI:false } });
  await page.webContents.executeJavaScript("document.querySelector('#email').value='';document.querySelector('#password').value='';document.activeElement.blur();document.querySelector('#password').focus();undefined");
  await wait(200);
  const supplementalQuick = await page.webContents.executeJavaScript('window.autofillFixture.quick()');
  assert(supplementalQuick,'A saved password and profile email enable the form shortcut');
  page.webContents.sendInputEvent({type:'mouseDown',x:Math.round(supplementalQuick.x),y:Math.round(supplementalQuick.y),button:'left',clickCount:1});
  page.webContents.sendInputEvent({type:'mouseUp',x:Math.round(supplementalQuick.x),y:Math.round(supplementalQuick.y),button:'left',clickCount:1});
  for(let attempt=0;attempt<30;attempt++) {
    if(await page.webContents.executeJavaScript("document.querySelector('#email').value==='saved@example.test'"))break;
    await wait(50);
  }
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('#email').value"),'saved@example.test','Lightning fills email from the separate Personal Data profile');
  assert.equal(await page.webContents.executeJavaScript("document.querySelector('#password').value"),'secret-test-value','Lightning keeps the chosen account password');
  assert.equal(await page.webContents.executeJavaScript('window.fixtureSubmits'),0,'Supplementing the form never submits it');
  await invoke({action:'delete',id:'email-profile'});
  await invoke({action:'save',item:{id:'login',title:'Test',origin:'https://vault.test',kind:'login',username:'person',password:'secret-test-value',fields:[],allowAI:true}});
  assert(!JSON.stringify(status).includes('secret-test-value'));
  await invoke({action:'save',item:{id:'priority-global',title:'Global profile',origin:'',kind:'profile',username:'',password:'',fields:[{name:'Email',value:'global@example.test',secret:false}],allowAI:false}});
  await page.webContents.executeJavaScript("window.autofillFixture.selectRecord('priority-global')");
  const prioritized = await page.webContents.executeJavaScript('window.autofillFixture.records()');
  assert(prioritized.findIndex(record=>record.id==='login') < prioritized.findIndex(record=>record.id==='priority-global'), 'Website account precedes a remembered browser-wide choice in authenticated suggestions');
  assert.equal(prioritized.find(record=>record.id==='priority-global').selected,true);
  assert.equal(prioritized.find(record=>record.id==='priority-global').website,false);
  await invoke({action:'delete',id:'priority-global'});
  for (const [id, scope] of [['browser-data', undefined], ['group-data', 'group:current'], ['other-group-data', 'group:other']]) {
    manager.withPersonalData(vault => vault.save({ id, title: id, origin: 'https://other-website.test', kind: 'knowledge', username: '', password: '', allowAI: false, fields: [
      { name: 'Email', value: id + '@example.test', secret: false },
      { name: 'Password', value: 'never-browse-this', secret: true },
    ] }, scope));
  }
  activeScope = 'group:current';
  const browsed = await page.webContents.executeJavaScript('window.autofillFixture.browse()');
  assert(browsed.some(record => record.id === 'browser-data'));
  assert(browsed.some(record => record.id === 'group-data'));
  assert(!browsed.some(record => record.id === 'other-group-data'));
  assert(!JSON.stringify(browsed).includes('never-browse-this'));
  assert(browsed.findIndex(record => record.id === 'group-data') < browsed.findIndex(record => record.id === 'browser-data'));
  activeScope = undefined;
  let untrusted = false;
  try {
    await page.webContents.executeJavaScript("window.vault({action:'status'})");
  } catch {
    untrusted = true;
  }
  assert(untrusted, 'Website IPC must be rejected');
  dialog.showMessageBox = async () => ({ response: 1 });
  const result = await invoke({
    action: 'fill',
    id: 'login',
    pageId: page.webContents.id,
  });
  assert.equal(result.filled, 2);
  assert.equal(
    await page.webContents.executeJavaScript(
      "document.querySelector('input[type=password]').value"
    ),
    'secret-test-value'
  );
  assert(!JSON.stringify(result).includes('secret-test-value'));
  await invoke({action:'save',item:{id:'secret-boundary',title:'Boundary fixture',origin:'https://vault.test',kind:'knowledge',username:'',password:'',allowAI:false,fields:[{name:'Email',value:'public@example.test',secret:false},{name:'Password',value:'protected-fixture',secret:true}]}});
  manager.updateBrowserPreferences({personalDataAutofillOnFocus:false});
  await page.webContents.executeJavaScript("document.activeElement.blur();document.querySelector('#email').focus();undefined");
  await wait(200);
  assert.equal((await page.webContents.executeJavaScript('window.autofillFixture.pickerState()')).open,false,'Preference disables automatic opening');
  assert.equal(await page.webContents.executeJavaScript('window.autofillFixture.trigger()'),true,'Manual autofill remains available');
  manager.updateBrowserPreferences({personalDataAutofillOnFocus:true});
  await page.webContents.executeJavaScript("document.activeElement.blur();document.querySelector('#email').focus();undefined");
  await wait(200);
  assert.equal((await page.webContents.executeJavaScript('window.autofillFixture.pickerState()')).open,true,'Preference restores automatic opening');
  assert.equal(await page.webContents.executeJavaScript('document.activeElement.id'),'email','Suggestions preserve input focus');
  osConfigured = true;
  await invoke({action:'lock'});
  const publicRecords = await page.webContents.executeJavaScript('window.autofillFixture.records()');
  const publicBrowse = await page.webContents.executeJavaScript('window.autofillFixture.browse()');
  assert.equal(authenticationCalls,0,'Opening suggestions and browsing never requests biometric authentication');
  assert(publicRecords.some(record=>record.fields.some(field=>field.value==='public@example.test')));
  assert(!JSON.stringify(publicRecords).includes('protected-fixture'));
  assert(!JSON.stringify(publicBrowse).includes('protected-fixture'));
  assert(!JSON.stringify(publicRecords).includes('secret-test-value'));
  assert.equal(manager.passwordVault().status().locked,true,'Browsing never grants lasting secret access');
  await assert.rejects(page.webContents.executeJavaScript('window.autofillFixture.secret({id:"secret-boundary",fieldIndex:1})'),/Authentication cancelled/);
  assert.equal(authenticationCalls,1,'Selecting a secret requests authentication');
  await assert.rejects(page.webContents.executeJavaScript('window.autofillFixture.login("login")'),/Authentication cancelled/);
  assert.equal(authenticationCalls,2,'Filling a saved login requests authentication');
  allowAuthentication = true;
  assert.equal(await page.webContents.executeJavaScript('window.autofillFixture.secret({id:"secret-boundary",fieldIndex:1})'),'protected-fixture');
  assert.equal(authenticationCalls,3);
  assert.equal(manager.passwordVault().status().locked,true);
  osConfigured = false;
  await page.loadURL('https://different.test');
  page.webContents.send('personal-data-autofill-enabled', true);
  await page.webContents.executeJavaScript("document.activeElement.blur(); document.querySelector('#email').focus()");
  await wait(200);
  assert.equal(await page.webContents.executeJavaScript('window.autofillFixture.quick()'), null, 'Unrelated website hides the shortcut');
  await assert.rejects(manager.fillSavedItem(page.webContents, 'login'));
  await invoke({ action: 'lock' });
  await assert.rejects(manager.fillSavedItem(page.webContents, 'login'));
  ui.destroy();
  page.destroy();
  console.log(
    'Password Manager native smoke passed: quick-fill visibility and click, serialized filling, secret-free receipts, trusted IPC, origin and lock boundaries.'
  );
  app.quit();
})()
  .catch((error) => {
    console.error(error);
    app.exit(1);
  })
  .finally(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

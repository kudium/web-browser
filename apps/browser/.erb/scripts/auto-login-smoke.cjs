// Disposable native WebContentsView + encrypted vault. No live credentials or network.
const { app, BrowserWindow, WebContentsView, session, dialog } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-auto-login-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  stdin: { contents: "export {runAutoLogin} from './src/main/passwordManager/autoLogin'; export {PasswordVault} from './src/main/passwordManager/vault';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, minify: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'login.cjs'),
});
const { runAutoLogin, PasswordVault } = require(path.join(root, 'login.cjs'));
let window, vault, signedIn = false, submissions = 0, epoch = 0, confirmed = true;
const origin = 'https://login-fixture.test';
const prompts = [];
const choices = [];
dialog.showMessageBox = async (_owner, options) => {
  prompts.push(options);
  return { response: choices.length ? choices.shift() : 0 };
};
(async () => {
  await app.whenReady();
  vault = new PasswordVault(path.join(root, 'vault.json'));
  vault.unlock('fixture-master-password', true);
  const record = { id:'fixture',title:'Fixture account',origin,kind:'login',username:'fixture-user',password:'fixture-secret',fields:[],allowAI:false,loginURL:origin+'/old-login' };
  vault.save(record);
  const restartedVault = new PasswordVault(path.join(root, 'vault.json'));
  await restartedVault.prepareAutoLoginMetadata();
  assert.equal(restartedVault.autoLoginMenuState(origin).accounts[0].id, 'fixture', 'Electron loads menu metadata without unlocking');
  assert.equal(restartedVault.status().locked, true);

  session.defaultSession.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      submissions++;
      signedIn = true;
      return new Response('<script>location.href="/dashboard"</script>', {headers:{'content-type':'text/html'}});
    }
    const html = signedIn ? (confirmed ? '<h1>Signed in</h1><button>Sign out</button>' : '<h1>Complete verification</h1>') :
      url.pathname === '/changed-login' || url.pathname === '/business/login' ?
        '<form method="post"><input autocomplete="username"><input type="password" autocomplete="current-password"><button type="submit" disabled>Sign in</button></form><script>document.addEventListener("input",()=>{document.querySelector("button").disabled=false})</script>' :
        url.pathname === '/no-links' ? '<h1>Signed out</h1>' : '<h1>Signed out</h1><a href="/changed-login">Login</a><a href="/business/login">Business login</a>';
    return new Response(html, {headers:{'content-type':'text/html'}});
  });
  window = new BrowserWindow({show:true,width:900,height:700});
  const view = new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.contentView.addChildView(view);
  view.setBounds({x:0,y:0,width:900,height:700});
  const contents = view.webContents;
  const options = {owner:window,contents,read:work=>work(vault),authenticate:async()=>{},check:()=>{},epoch:()=>epoch};
  await contents.loadURL(origin+'/orders');
  await runAutoLogin(options);
  assert.equal(submissions,1);
  assert.equal(contents.getURL(),origin+'/orders', 'Returns to the original page only after confirmed sign-in');
  assert.equal(vault.forFill('fixture',origin).loginURL,origin+'/changed-login', 'Changed route replaces the hint');
  assert(prompts.some(p=>p.buttons.some(b=>b.includes('Business login'))),'Both login destinations are offered');
  assert(!JSON.stringify(prompts).includes('fixture-secret'),'Native dialogs never contain the saved password');
  await runAutoLogin(options);
  assert.equal(submissions,1,'Already signed-in pages are a quiet no-op');
  signedIn = false;
  await contents.loadURL(origin+'/business/login');
  const promptsBeforeSingleAccount = prompts.length;
  await runAutoLogin(options);
  assert.equal(prompts.length,promptsBeforeSingleAccount,'A single account runs directly without a chooser');
  assert.equal(submissions,2, 'A current business login form takes precedence over the saved regular route');
  assert.equal(vault.forFill('fixture',origin).loginURL,origin+'/business/login');
  signedIn = false;
  await contents.loadURL(origin+'/orders');
  vault.save({...vault.forFill('fixture',origin),loginURL:undefined});
  choices.push(prompts.length + 100);
  await runAutoLogin(options);
  assert.equal(submissions,2,'Cancelling never fills or submits');
  vault.save({...vault.forFill('fixture',origin),loginURL:origin+'/business/login'});
  await contents.loadURL(origin+'/no-links');
  await runAutoLogin(options);
  assert.equal(submissions,3,'The remembered route is a fallback when the page has no login links');
  signedIn = false;
  await contents.loadURL(origin+'/orders');
  vault.save({...record,id:'business',title:'Business account',loginURL:origin+'/business/login'});
  await runAutoLogin({...options,accountId:'business'});
  assert.equal(submissions,4,'An explicit account choice controls the preferred destination');
  assert.equal(vault.forFill('business',origin).loginURL,origin+'/business/login');
  signedIn = false;
  await contents.loadURL(origin+'/orders');
  vault.save({...vault.forFill('fixture',origin),loginURL:undefined});
  const previousDialog = dialog.showMessageBox;
  dialog.showMessageBox = async (...args) => { const result=await previousDialog(...args); epoch++; return result; };
  await assert.rejects(runAutoLogin({...options,accountId:'fixture'}), /access changed/);
  assert.equal(submissions,4,'Revocation during the chooser prevents filling and submission');
  dialog.showMessageBox = previousDialog;
  choices.push(0);
  await assert.rejects(runAutoLogin({...options,authenticate:async()=>{await contents.loadURL('https://other-fixture.test/login')}}), /website.*changed/);
  assert.equal(submissions,4,'Origin changes never submit');
  await contents.loadURL(origin+'/business/login');
  confirmed = false;
  const promptsBeforeVerification = prompts.length;
  await runAutoLogin({...options,accountId:'business'});
  assert.equal(submissions,5);
  assert.equal(contents.getURL(),origin+'/dashboard','Verification stays on the website instead of returning early');
  assert.equal(prompts.length,promptsBeforeVerification,'Unconfirmed submission never opens a redundant dialog');
  console.log('PASS: native Auto login with production-minified helpers; saved-route fallback, changed routes, multiple destinations, current business form, return navigation, cancellation, origin rejection, encrypted route persistence, no secrets in dialogs, direct single-account login, quiet website verification.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  vault?.lock();
  if(window&&!window.isDestroyed())window.destroy();
  fs.rmSync(root,{recursive:true,force:true});
  app.exit(process.exitCode||0);
});

// Uses a virtual authenticator and fictional identities in TEST_DATABASE_URL.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), assert = require('assert');
const base = path.resolve(__dirname, '..');
if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated TEST_DATABASE_URL required');
let server;
app.whenReady().then(async () => {
  server = spawn('bun', ['scripts/passkey-test-server.ts'], { cwd: base, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { if (String(data).includes('PASSKEY_TEST_READY')) resolve(); });
    server.stderr.on('data', data => process.stderr.write(data)); server.on('exit', code => reject(new Error(`Fixture server exited ${code}`)));
  });
  const win = new BrowserWindow({ width: 1200, height: 1000, show: false, webPreferences: { backgroundThrottling: false, partition: `passkey-qa-${Date.now()}` } });
  const wc = win.webContents; wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('WebAuthn.enable', { enableUI: false });
  let { authenticatorId } = await wc.debugger.sendCommand('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const js = code => wc.executeJavaScript(code, true);
  async function wait(code) { for (let i=0; i<100; i++) { if (await js(code)) return; await new Promise(resolve=>setTimeout(resolve,50)); } console.error(await js(`({path:location.pathname,message:document.querySelector('[data-auth-message]')?.textContent,getError:window.getError,body:document.body.innerText.slice(-700)})`)); throw new Error(`Timed out: ${code}`); }
  const suffix = Date.now();
  await win.loadURL('http://localhost:3137/sign-up');
  await wait(`!!document.querySelector('[data-google-sign-in]') && !document.querySelector('[data-passkey-sign-in]').disabled`);
  for (const width of [320, 390, 768, 1200]) { win.setSize(width,1000); await new Promise(r=>setTimeout(r,80)); assert.equal(await js('document.documentElement.scrollWidth > innerWidth'),false,`auth overflow ${width}`); }
  win.setSize(1200,1000);
  const signedUp = await js(`fetch('/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Passkey QA',email:'passkey-${suffix}@example.com',password:'fictional passkey QA password 123'})}).then(r=>r.ok)`);
  assert.equal(signedUp,true);
  await win.loadURL('http://localhost:3137/account');
  await wait(`!!document.querySelector('[data-passkey-list] p')`);
  await js(`document.querySelector('[data-data-category="devices"]').click();document.querySelector('[data-passkey-name]').value='QA Mac';document.querySelector('[data-passkey-add]').click();`);
  await wait(`document.querySelector('[data-passkey-message]').textContent.includes('Passkey created')`);
  assert.equal(await js(`document.querySelector('[data-passkey-list] strong').textContent`),'QA Mac');
  const credentials = await wc.debugger.sendCommand('WebAuthn.getCredentials', { authenticatorId });
  assert.equal(credentials.credentials.length, 1);
  // Electron's virtual-authenticator picker needs a known credential allow-list.
  // Native signatures and server verification are real; biometric/discoverable UI needs live QA.
  const pinTestCredential = () => js(`const nativeGet=navigator.credentials.get.bind(navigator.credentials);navigator.credentials.get=async(...args)=>{args[0].publicKey.allowCredentials=[{type:'public-key',id:Uint8Array.from(atob(${JSON.stringify(credentials.credentials[0].credentialId)}),c=>c.charCodeAt(0))}];return nativeGet(...args);};void 0;`);
  const output = process.env.AUTH_PREVIEW_DIR;
  if(output) {fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'passkeys.png'),(await win.capturePage()).toPNG());}
  await js(`fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})`);
  await win.loadURL('http://localhost:3137/sign-in?next=%2Fdevice%3Fuser_code%3DABCD-1234');
  await wc.debugger.sendCommand('WebAuthn.enable',{enableUI:false});
  await wc.debugger.sendCommand('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
  ({authenticatorId}=await wc.debugger.sendCommand('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
  for(const credential of credentials.credentials)await wc.debugger.sendCommand('WebAuthn.addCredential',{authenticatorId,credential});
  await wait(`!document.querySelector('[data-passkey-sign-in]').disabled`);
  if(output) fs.writeFileSync(path.join(output,'sign-in.png'),(await win.capturePage()).toPNG());
  await pinTestCredential();
  await js(`document.querySelector('[data-passkey-sign-in]').click()`);
  await wait(`location.pathname === '/device'`);
  assert.equal(await js(`location.search`),'?user_code=ABCD-1234');
  const current = await js(`fetch('/api/auth/get-session').then(r=>r.json()).then(r=>r.user.email)`); assert.equal(current,`passkey-${suffix}@example.com`);
  // Cross-account ownership is enforced by Better Auth, not just the UI.
  const ownId = await js(`fetch('/api/auth/passkey/list-user-passkeys').then(r=>r.json()).then(r=>r[0].id)`);
  await js(`fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})`);
  await js(`fetch('/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Other QA',email:'other-${suffix}@example.com',password:'fictional passkey QA password 123'})})`);
  assert.equal(await js(`fetch('/api/auth/passkey/delete-passkey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:${JSON.stringify(ownId)}})}).then(r=>r.ok)`),false);
  await js(`fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})`);
  await win.loadURL('http://localhost:3137/sign-in');await pinTestCredential();await wait(`!document.querySelector('[data-passkey-sign-in]').disabled`);await js(`document.querySelector('[data-passkey-sign-in]').click()`);await wait(`location.pathname === '/account'`);
  await wait(`document.querySelectorAll('[data-passkey-remove]').length === 1`);
  await js(`window.confirm=()=>true;document.querySelector('[data-data-category="devices"]').click();document.querySelector('[data-passkey-remove]').click()`);
  await wait(`document.querySelector('[data-passkey-message]').textContent === 'Passkey removed.'`);
  assert.equal(await js(`document.querySelectorAll('[data-passkey-remove]').length`),0);
  // OAuth initiation preserves device approval, scope and server state.
  const oauth = await js(`fetch('/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:location.origin+'/device?user_code=ABCD-1234',disableRedirect:true})}).then(r=>r.json())`);
  const url = new URL(oauth.url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3137/api/auth/callback/google');assert.ok(url.searchParams.get('state'));assert.ok(url.searchParams.get('scope').includes('openid'));
  console.log('PASS: real passkey create/sign-in, device return, ownership, removal, OAuth initiation, responsive auth UI');
  win.destroy();server.kill();app.quit();
}).catch(error=>{console.error(error);server?.kill();app.exit(1);});

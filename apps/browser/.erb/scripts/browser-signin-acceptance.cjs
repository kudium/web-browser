// Optional public-provider checks through the production backend, in fresh profiles.
// No credentials are stored here and no authenticated page content is captured.
const { WebContentsView } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ main, evaluate, out, url }) => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (web, expression, timeout = 45000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await web.executeJavaScript(expression).catch(() => false)) return;
      await wait(200);
    }
    throw new Error('Provider did not reach the expected public entry state');
  };
  const tabs = ['google', 'whatsapp'].map(id => ({
    id: `signin-${id}`, name: id, sessionId: `signin-${id}`,
    sessionName: `Disposable ${id}`, url: `${url}/${id}`, icon: '',
  }));
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','signin-google');undefined`);
  main.reload();
  await until(main.webContents, "!!document.getElementById('page-tab-signin-google')");
  const report = {
    date: new Date().toISOString(),
    runtime: { electron: process.versions.electron, chromium: process.versions.chrome },
    scope: 'Public entry pages only. Optional user-provided email reaches a Google credential challenge; full authentication requires a separate user-assisted test.',
    results: [],
  };
  const visit = async (id, destination) => {
    main.webContents.send('browser-tab-request', {action: 'select', id: `signin-${id}`});
    let web;
    for (let i = 0; i < 100 && !web; i++) {
      web = main.contentView.children.find(view => view instanceof WebContentsView && view.webContents.getURL() === `${url}/${id}`)?.webContents;
      await wait(100);
    }
    assert(web, 'Production website view exists');
    const prefs = web.getLastWebPreferences();
    assert(prefs.sandbox && prefs.contextIsolation && prefs.webSecurity && !prefs.nodeIntegration);
    assert(!web.debugger.isAttached(), 'No debugger attached during provider sign-in');
    await web.loadURL(destination);
    const ua = await web.executeJavaScript('navigator.userAgent');
    assert(ua.includes(`Chrome/${process.versions.chrome}`));
    assert(ua.includes(`Electron/${process.versions.electron}`));
    assert(!/touch-?box|kudium/i.test(ua));
    return web;
  };
  try {
    const google = await visit('google', 'https://accounts.google.com/ServiceLogin?service=mail');
    await until(google, "!!document.querySelector('#identifierId')");
    assert(new URL(google.getURL()).searchParams.get('flowName') === 'WebLiteSignIn', 'Google selects the compatible runtime sign-in flow');
    report.results.push({name: 'Google compatible public sign-in flow', outcome: 'passed'});
    if (process.env.KUDIUM_SIGNIN_EMAIL) {
      google.focus();
      await google.executeJavaScript("document.querySelector('#identifierId').focus();undefined");
      await google.insertText(process.env.KUDIUM_SIGNIN_EMAIL);
      await wait(300);
      // Activate the normal submit control; native focus delivery varies when
      // macOS is locked or another test window owns foreground focus.
      await google.executeJavaScript("(document.querySelector('#identifierNext button') || document.querySelector('#identifierNext')).click();undefined", true);
      await until(google, "location.pathname.includes('/challenge/') || location.pathname.includes('/rejected')");
      assert(!new URL(google.getURL()).pathname.includes('/rejected'), 'Google accepts the account identifier');
      report.results.push({name: 'Google account reaches credential challenge', outcome: 'passed'});
    }
    const whatsapp = await visit('whatsapp', 'https://web.whatsapp.com/');
    await until(whatsapp, "!!document.querySelector('canvas') || /Log into WhatsApp|Log in to WhatsApp|Scan.*QR|Steps to log in|Use WhatsApp on your computer|WhatsApp works with/i.test(document.body.innerText)");
    assert(await whatsapp.executeJavaScript("!/WhatsApp works with.*Google Chrome|update Chrome/i.test(document.body.innerText)"), 'WhatsApp does not reject the actual runtime identity');
    report.results.push({name: 'WhatsApp public linking page', outcome: 'passed'});
    report.outcome = 'passed';
    console.log('PASS: Google compatible sign-in flow and WhatsApp linking page' + (process.env.KUDIUM_SIGNIN_EMAIL ? ', including Google account credential challenge' : ''));
  } catch (error) {
    report.outcome = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'browser-signin-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  }
};

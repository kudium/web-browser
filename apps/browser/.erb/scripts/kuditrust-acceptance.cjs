// User-authorized account acceptance. Credentials are supplied outside Git.
const { BrowserWindow, WebContentsView } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
module.exports = async ({
  main,
  evaluate,
  out,
  url,
  runtimeDir,
  windows,
  registerBrowser,
}) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const report = {
    date: new Date().toISOString(),
    site: 'https://kuditrust.com/',
    runtime: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
    },
    outcome: 'incomplete',
    results: [],
    scope:
      'Disposable production browser profiles; user-provided test account only. No transfers, purchases, messages or account changes.',
  };
  const save = () =>
    fs.writeFileSync(
      'docs/benchmarks/kuditrust-acceptance.json',
      JSON.stringify(report, null, 2) + '\n'
    );
  const tabs = ['login', 'shared', 'isolated'].map((id) => ({
    id: 'kuditrust-' + id,
    name: 'KudiTrust ' + id,
    sessionId: id === 'isolated' ? 'kuditrust-isolated' : 'kuditrust-shared',
    sessionName: id === 'isolated' ? 'KudiTrust isolated' : 'KudiTrust shared',
    url: url + '/' + id,
    icon: '',
  }));
  await evaluate(
    main,
    `localStorage.setItem('user_apps',${JSON.stringify(
      JSON.stringify(tabs)
    )});localStorage.setItem('user_last_app_id','kuditrust-login');true`
  );
  main.reload();
  const until = async (web, expression, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const result = await web.executeJavaScript(expression);
        if (result) return result;
      } catch {}
      await wait(200);
    }
    throw new Error('Expected page state was not reached');
  };
  await until(
    main.webContents,
    "!!document.getElementById('page-tab-kuditrust-login')"
  );
  const views = new Map();
  const visit = async (id, destination) => {
    main.webContents.send('browser-tab-request', {
      action: 'select',
      id: 'kuditrust-' + id,
    });
    await wait(300);
    let web = views.get(id);
    for (let attempt = 0; attempt < 100 && !web; attempt++) {
      web = main.contentView.children.find(
        (view) =>
          view instanceof WebContentsView &&
          view.webContents.getURL() === url + '/' + id
      )?.webContents;
      if (!web) await wait(50);
    }
    assert(web, 'Production native page must exist');
    views.set(id, web);
    const preferences = web.getLastWebPreferences();
    assert(
      preferences.sandbox &&
        preferences.contextIsolation &&
        preferences.webSecurity &&
        !preferences.nodeIntegration
    );
    assert.equal(preferences.preload, undefined);
    await evaluate(
      main,
      `window.electron.browser.command({id:'kuditrust-${id}',action:'navigate',url:${JSON.stringify(
        destination
      )}});true`
    );
    await until(
      web,
      `location.href!==${JSON.stringify(
        url + '/' + id
      )}&&document.readyState==='complete'`
    );
    return web;
  };
  const web = await visit('login', 'https://kuditrust.com/');
  await wait(2500);
  report.entry = await web.executeJavaScript(
    `({url:location.origin+location.pathname,title:document.title,hasLoginControl:Array.from(document.querySelectorAll('button')).some(b=>b.innerText.trim()==='Login')})`
  );
  assert(report.entry.hasLoginControl, 'Public entry must expose sign-in');
  console.log('PASS: KudiTrust public entry loads');
  fs.writeFileSync(
    path.join(out, 'kuditrust-entry.png'),
    (await main.capturePage()).toPNG()
  );
  report.results.push({ name: 'Public entry inspection', status: 'passed' });
  const credentialFile = process.env.KUDIUM_TEST_CREDENTIALS_FILE;
  if (credentialFile) {
    const credentials = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
    assert(
      typeof credentials.username === 'string' &&
        typeof credentials.password === 'string'
    );
    const signedIn =
      "location.pathname==='/dashboard'&&Array.from(document.querySelectorAll('button')).some(b=>b.innerText.trim()==='Sign out')";
    const signedOut =
      "location.pathname==='/login'&&!!document.querySelector('#account-identifier')&&!!document.querySelector('input[type=password]')";
    const check = async (name, run) => {
      const result = { name, status: 'running' };
      report.results.push(result);
      save();
      try {
        await run();
        result.status = 'passed';
        console.log('PASS:', name);
      } catch {
        result.status = 'incomplete';
        result.reason = 'Expected page/session state was not reached';
        console.log('INCOMPLETE:', name);
      }
      save();
    };
    const signIn = async (page) => {
      await until(page, signedOut);
      assert.equal(new URL(page.getURL()).origin, 'https://kuditrust.com');
      page.focus();
      for (const [selector, value] of [
        ['#account-identifier', credentials.username],
        ['input[type=password]', credentials.password],
      ]) {
        await page.executeJavaScript(
          `document.querySelector(${JSON.stringify(selector)}).focus();true`
        );
        await page.insertText(value);
        assert(
          await page.executeJavaScript(
            `document.querySelector(${JSON.stringify(
              selector
            )}).value===${JSON.stringify(value)}`
          ),
          'Test input must be accepted'
        );
      }
      await page.executeJavaScript(
        "document.querySelector('button[type=submit]').click();true",
        true
      );
      await until(page, signedIn);
    };
    await visit('login', 'https://kuditrust.com/login');
    await until(
      web,
      "!!document.querySelector('#account-identifier')&&!!document.querySelector('input[type=password]')"
    );
    report.loginControls = await web.executeJavaScript(
      "({password:!!document.querySelector('input[type=password]'),google:Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Continue with Google'),passkey:Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Sign in with passkey')})"
    );
    try {
      await signIn(web);
      report.results.push({
        name: 'Test account password sign-in',
        status: 'passed',
        path: new URL(web.getURL()).pathname,
      });
      console.log('PASS: Test account sign-in', new URL(web.getURL()).pathname);
      await check('Authenticated reload retains sign-in', async () => {
        web.reload();
        await until(web, signedIn);
      });
      await check('Shared-group authenticated session', async () => {
        const shared = await visit('shared', 'https://kuditrust.com/dashboard');
        assert.equal(shared.session, web.session);
        await until(shared, signedIn);
      });
      await check('Isolated-group authentication rejection', async () => {
        const isolated = await visit(
          'isolated',
          'https://kuditrust.com/dashboard'
        );
        assert.notEqual(isolated.session, web.session);
        await until(isolated, signedOut);
      });
      await check(
        'Private sign-in, final-window cleanup and regular-session preservation',
        async () => {
          const api = require(path.join(runtimeDir, 'electronBrowser.js'));
          const target = api.createPrivateSession();
          const createShell = async () => {
            const win = new BrowserWindow({
              width: 1160,
              height: 850,
              show: true,
              titleBarStyle: 'hiddenInset',
              trafficLightPosition: { x: 12, y: 13 },
              webPreferences: {
                session: target,
                preload: path.join(runtimeDir, 'preload.js'),
                contextIsolation: true,
                sandbox: true,
                backgroundThrottling: false,
              },
            });
            windows['private-kuditrust-' + win.id] = win;
            const manager = api.registerPrivateBrowserWindow(win, createShell);
            api.attachPrivateWindow(win, target);
            if (!manager.hasOtherWindows(win)) registerBrowser(win);
            await win.loadFile(
              path.resolve('release/app/dist/renderer/index.html'),
              { query: { view: 'main', private: '1' } }
            );
            await until(
              win.webContents,
              "!!document.querySelector('.workspace')"
            );
            return win;
          };
          const privateWindow = await createShell();
          try {
            privateWindow.webContents.send('browser-tab-request', {
              action: 'create',
              app: {
                id: 'private-kuditrust',
                sessionId: 'private-kuditrust-group',
                name: 'Private KudiTrust',
                url: 'https://kuditrust.com/dashboard',
                icon: '',
                spaceId: 'default',
                pinned: false,
              },
            });
            let privatePage;
            for (let attempt = 0; attempt < 100 && !privatePage; attempt++) {
              privatePage = privateWindow.contentView.children.find(
                (view) =>
                  view instanceof WebContentsView &&
                  view.webContents.getURL().startsWith('https://kuditrust.com/')
              )?.webContents;
              if (!privatePage) await wait(50);
            }
            assert(privatePage);
            assert.equal(privatePage.session, target);
            assert(!target.isPersistent());
            await until(privatePage, signedOut);
            privateWindow.focus();
            await signIn(privatePage);
            assert(
              !(await evaluate(
                main,
                "JSON.parse(localStorage.getItem('user_apps')).some(app=>app.id==='private-kuditrust')"
              ))
            );
            await target.cookies.set({
              url: 'https://kuditrust.com/',
              name: 'kuditrust_acceptance_marker',
              value: 'fixture',
              secure: true,
            });
            assert.equal(
              (
                await web.session.cookies.get({
                  name: 'kuditrust_acceptance_marker',
                })
              ).length,
              0
            );
          } finally {
            privateWindow.destroy();
          }
          for (
            let attempt = 0;
            attempt < 100 &&
            (await target.cookies.get({ url: 'https://kuditrust.com/' }))
              .length;
            attempt++
          )
            await wait(100);
          assert.equal(
            (await target.cookies.get({ url: 'https://kuditrust.com/' }))
              .length,
            0
          );
          web.reload();
          await until(web, signedIn);
        }
      );
      await check('Regular sign-out propagates to shared profile', async () => {
        await visit('login', 'https://kuditrust.com/dashboard');
        await until(web, signedIn);
        await web.executeJavaScript(
          "Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Sign out').click();true",
          true
        );
        await until(web, "location.pathname!='/dashboard'", 30000);
        const shared = await visit('shared', 'https://kuditrust.com/dashboard');
        await until(shared, signedOut);
        await visit('login', 'https://kuditrust.com/dashboard');
        await until(web, signedOut);
      });
    } catch {
      report.results.push({
        name: 'Test account password sign-in',
        status: 'incomplete',
        reason: 'Authenticated page was not reached',
      });
    }
  }
  report.outcome =
    credentialFile &&
    report.results.every((result) => result.status === 'passed')
      ? 'passed'
      : 'incomplete';
  report.sourceHashes = Object.fromEntries(
    [
      '.erb/scripts/kuditrust-acceptance.cjs',
      '.erb/scripts/browser-ui-smoke.cjs',
      'src/main/electronBrowser.ts',
      'src/main/privateSessions.ts',
    ].map((file) => [
      file,
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ])
  );
  save();
  return report;
};

// Deterministic capabilities through the production backend, never real accounts.
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow, WebContentsView } = require('electron');

// Runs inside a sandboxed website renderer, including the production site preload.
function fixturePage() {
  const database = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('compatibility', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const record = async (write, value) => {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('records', write ? 'readwrite' : 'readonly');
        const request = write
          ? tx.objectStore('records').put(value, 'marker')
          : tx.objectStore('records').get('marker');
        let result;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result ?? null);
        tx.onerror = tx.onabort = () =>
          reject(tx.error || new Error('Transaction aborted'));
      });
    } finally {
      db.close();
    }
  };
  window.probe = {
    oauth() {
      return new Promise((resolve, reject) => {
        let child;
        const receive = (event) => {
          if (event.origin !== location.origin || event.source !== child)
            return;
          removeEventListener('message', receive);
          resolve({
            state: event.data.state,
            sourceRetained: event.source === child,
          });
        };
        addEventListener('message', receive);
        child = window.open(
          '/oauth/start?state=fixture-state',
          'compatibility-auth',
        );
        if (!child) {
          removeEventListener('message', receive);
          reject(new Error('Popup was blocked'));
        }
      });
    },
    async store(marker) {
      document.cookie = `fixture=${marker}; path=/; SameSite=Lax`;
      localStorage.setItem('marker', marker);
      await record(true, marker);
    },
    async read() {
      const cache = await caches.match('/offline-marker');
      return {
        cookie:
          document.cookie
            .split('; ')
            .find((item) => item.startsWith('fixture='))
            ?.split('=')[1] ?? null,
        local: localStorage.getItem('marker'),
        idb: await record(false),
        cache: cache ? await cache.text() : null,
      };
    },
    async install(marker) {
      await navigator.serviceWorker.register(
        `/sw.js?marker=${encodeURIComponent(marker)}`,
      );
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            resolve,
            { once: true },
          ),
        );
      return (await fetch('/offline-marker')).text();
    },
    async identity() {
      const worker = await new Promise((resolve, reject) => {
        const child = new Worker('/worker.js');
        child.onmessage = (event) => {
          child.terminate();
          resolve(event.data);
        };
        child.onerror = (event) => {
          child.terminate();
          reject(new Error(event.message));
        };
      });
      const frame = await new Promise((resolve) => {
        const child = document.createElement('iframe');
        const origin = location.origin.replace('127.0.0.1', 'localhost');
        const receive = (event) => {
          if (event.source !== child.contentWindow || event.origin !== origin)
            return;
          removeEventListener('message', receive);
          child.remove();
          resolve(event.data);
        };
        addEventListener('message', receive);
        child.src = `${origin}/frame`;
        document.body.appendChild(child);
      });
      const serviceWorker = await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          channel.port1.close();
          resolve(event.data);
        };
        navigator.serviceWorker.controller.postMessage('identity', [
          channel.port2,
        ]);
      });
      return {
        document: {
          js: navigator.userAgent,
          http: await (await fetch('/echo')).json(),
        },
        worker,
        frame,
        serviceWorker,
        nodeExposed:
          typeof require !== 'undefined' || typeof process !== 'undefined',
      };
    },
    async capabilities(marker) {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(marker),
      );
      const plain = new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes),
      );
      const form = new FormData();
      form.append(
        'attachment',
        new File([marker], 'fixture.txt', { type: 'text/plain' }),
      );
      const upload = await (
        await fetch('/upload', { method: 'POST', body: form })
      ).json();
      const events = await new Promise((resolve, reject) => {
        const source = new EventSource('/events');
        const values = [];
        source.onmessage = (event) => {
          values.push(event.data);
          if (values.length === 2) {
            source.close();
            resolve(values);
          }
        };
        source.onerror = () => {
          source.close();
          reject(new Error('Event stream failed'));
        };
      });
      return { secure: isSecureContext, plain, upload, events };
    },
  };
}

module.exports = async ({ main, evaluate, runtimeDir, out, windows }) => {
  const results = [];
  const privateOwners = [];
  let offlineNetworkHits = 0;
  const oauthPosts = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url.pathname === '/oauth/start') {
      response.writeHead(302, {
        Location: `http://localhost:${server.address().port}/oauth/login?state=fixture-state`,
      });
      response.end();
    } else if (url.pathname === '/oauth/login') {
      response.end(
        '<form method="POST" action="/oauth/approve"><input name="state" value="fixture-state"><input name="decision" value="approve"></form><script>document.forms[0].submit();</script>',
      );
    } else if (url.pathname === '/oauth/approve') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        oauthPosts.push({ method: request.method, body });
        response.writeHead(303, {
          Location: `http://127.0.0.1:${server.address().port}/oauth/callback?state=fixture-state`,
        });
        response.end();
      });
    } else if (url.pathname === '/oauth/callback') {
      response.end(
        '<script>opener.postMessage({state:new URL(location.href).searchParams.get("state")},location.origin);window.close();</script>',
      );
    } else if (url.pathname === '/echo') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(request.headers['user-agent']));
    } else if (url.pathname === '/worker.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(
        'fetch("/echo").then(r=>r.json()).then(http=>postMessage({js:navigator.userAgent,http}))',
      );
    } else if (url.pathname === '/sw.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.setHeader('Cache-Control', 'no-store');
      response.end(`const marker=${JSON.stringify(url.searchParams.get('marker'))};
        self.addEventListener('install',event=>event.waitUntil(caches.open('fixture').then(cache=>cache.put('/offline-marker',new Response(marker))).then(()=>self.skipWaiting())));
        self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
        self.addEventListener('fetch',event=>{if(new URL(event.request.url).pathname==='/offline-marker')event.respondWith(caches.match(event.request));});
        self.addEventListener('message',event=>event.waitUntil(fetch('/echo').then(r=>r.json()).then(http=>event.ports[0].postMessage({js:navigator.userAgent,http}))));`);
    } else if (url.pathname === '/frame') {
      response.end(
        '<script>fetch("/echo").then(r=>r.json()).then(http=>parent.postMessage({js:navigator.userAgent,http},"*"));</script>',
      );
    } else if (url.pathname === '/offline-marker') {
      offlineNetworkHits += 1;
      response.writeHead(503);
      response.end('Service worker did not intercept');
    } else if (url.pathname === '/upload') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            body: Buffer.concat(chunks).toString(),
            contentType: request.headers['content-type'],
          }),
        );
      });
    } else if (url.pathname === '/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      response.write('data: first\n\n');
      const timer = setTimeout(() => response.end('data: second\n\n'), 100);
      request.on('close', () => clearTimeout(timer));
    } else {
      response.end(
        `<!doctype html><title>Compatibility fixture</title><h1>Browser capability fixture</h1><script>(${fixturePage.toString()})();</script>`,
      );
    }
  });
  const bounded = async (operation) => {
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Compatibility check timed out')),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const check = async (name, operation) => {
    console.log(`Checking: ${name}`);
    try {
      await bounded(operation);
      results.push({ name, outcome: 'passed' });
    } catch (error) {
      results.push({ name, outcome: 'failed', error: String(error) });
      throw error;
    }
  };
  const until = async (operation) =>
    bounded(async () => {
      for (;;) {
        const value = await operation();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
  const page = (owner, url) =>
    owner.contentView.children.find(
      (view) =>
        view instanceof WebContentsView &&
        !view.webContents.isDestroyed() &&
        view.webContents.getURL() === url,
    )?.webContents;
  const ready = async (owner, url) => {
    const contents = await until(() => page(owner, url));
    await until(() => contents.executeJavaScript('!!window.probe'));
    return contents;
  };
  let passed = false;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const tabs = ['a', 'shared', 'isolated'].map((id, index) => ({
      id: `compatibility-${id}`,
      name: id,
      sessionId:
        index === 2 ? 'compatibility-isolated' : 'compatibility-shared',
      sessionName: 'Compatibility fixture',
      url: `${origin}/${id}`,
      icon: '',
      pinned: true,
    }));
    await evaluate(
      main,
      `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','compatibility-a');undefined`,
    );
    main.reload();
    const first = await ready(main, tabs[0].url);
    await check('Regular storage and service-worker registration', async () => {
      await first.executeJavaScript("probe.store('regular-marker')");
      assert.equal(
        await first.executeJavaScript("probe.install('regular-marker')"),
        'regular-marker',
      );
      assert.deepEqual(await first.executeJavaScript('probe.read()'), {
        cookie: 'regular-marker',
        local: 'regular-marker',
        idb: 'regular-marker',
        cache: 'regular-marker',
      });
    });
    const exercise = async (contents, label) => {
      await check(
        `${label}: document, cross-site frame, worker and service-worker identity`,
        async () => {
          const identities =
            await contents.executeJavaScript('probe.identity()');
          const expected = identities.document.js;
          assert(expected.includes(`Chrome/${process.versions.chrome}`));
          assert(expected.includes(`Electron/${process.versions.electron}`));
          assert(!/kudium|touch-?box/i.test(expected));
          assert.equal(
            identities.nodeExposed,
            false,
            'Website must stay sandboxed',
          );
          for (const identity of [
            identities.document,
            identities.frame,
            identities.worker,
            identities.serviceWorker,
          ]) {
            assert.equal(identity.js, expected);
            assert.equal(identity.http, expected);
          }
        },
      );
      await check(
        `${label}: WebCrypto, multipart upload and live event stream`,
        async () => {
          const result = await contents.executeJavaScript(
            "probe.capabilities('capability-marker')",
          );
          assert.equal(result.secure, true);
          assert.equal(result.plain, 'capability-marker');
          assert(
            result.upload.contentType.startsWith(
              'multipart/form-data; boundary=',
            ),
          );
          assert(result.upload.body.includes('filename="fixture.txt"'));
          assert(result.upload.body.includes('\r\n\r\ncapability-marker\r\n'));
          assert.deepEqual(result.events, ['first', 'second']);
        },
      );
    };
    await exercise(first, 'Regular');
    const siteSettings = require(path.join(runtimeDir, 'siteSettings.js'));
    const dialogs = require(path.join(runtimeDir, 'dialogs.js'));
    const originalDialog = dialogs.showBrowserDialog;
    const media = (expression) => first.executeJavaScript(expression);
    try {
      await check(
        'Microphone grant remains separate from camera and revocation applies after reload',
        async () => {
          let prompts = 0;
          dialogs.showBrowserDialog = async () => {
            prompts += 1;
            return { response: 1 };
          };
          assert.deepEqual(
            await media(
              `navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{const kinds=s.getTracks().map(t=>t.kind);s.getTracks().forEach(t=>t.stop());return kinds;})`,
            ),
            ['audio'],
          );
          assert.equal(prompts, 1);
          const saved = siteSettings.getSiteSettings(
            'compatibility-shared',
            origin,
          ).permissions;
          assert.equal(saved.microphone, 'allow');
          assert.equal(saved.camera, undefined);
          dialogs.showBrowserDialog = async () => {
            prompts += 1;
            return { response: 0 };
          };
          assert.equal(
            await media(
              `navigator.mediaDevices.getUserMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'allowed';},e=>e.name)`,
            ),
            'NotAllowedError',
          );
          assert.equal(prompts, 2);
          assert.deepEqual(
            await media(
              `navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{const kinds=s.getTracks().map(t=>t.kind);s.getTracks().forEach(t=>t.stop());return kinds;})`,
            ),
            ['audio'],
          );
          assert.equal(prompts, 2, 'Microphone retains its independent grant');
          siteSettings.updateSiteSettings('compatibility-shared', origin, {
            permissions: { camera: 'block', microphone: 'block' },
          });
          const loaded = new Promise((resolve) =>
            first.once('did-finish-load', resolve),
          );
          first.reload();
          await loaded;
          assert.equal(
            await media(
              `navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'allowed';},e=>e.name)`,
            ),
            'NotAllowedError',
          );
          assert.equal(
            prompts,
            2,
            'Revoked grant does not prompt or regain access',
          );
        },
      );
      await check(
        'Blocked screen-sharing request is denied by the production session',
        async () => {
          siteSettings.updateSiteSettings('compatibility-shared', origin, {
            permissions: { 'display-capture': 'block' },
          });
          assert.equal(
            await first.executeJavaScript(
              `navigator.mediaDevices.getDisplayMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'allowed';},e=>e.name)`,
              true,
            ),
            'NotAllowedError',
          );
        },
      );
    } finally {
      dialogs.showBrowserDialog = originalDialog;
    }
    await check(
      'OAuth-style cross-site redirect, POST return and preserved opener messaging',
      async () => {
        const result = await first.executeJavaScript('probe.oauth()', true);
        assert.deepEqual(result, {
          state: 'fixture-state',
          sourceRetained: true,
        });
        assert.deepEqual(oauthPosts, [
          { method: 'POST', body: 'state=fixture-state&decision=approve' },
        ]);
        assert.equal(first.getURL(), tabs[0].url);
        await until(
          () =>
            !main.contentView.children.some(
              (view) =>
                view instanceof WebContentsView &&
                !view.webContents.isDestroyed() &&
                view.webContents.getURL().includes('/oauth/'),
            ),
        );
      },
    );
    await check(
      'Service-worker cache survives reload without hitting network fallback',
      async () => {
        const loaded = new Promise((resolve) =>
          first.once('did-finish-load', resolve),
        );
        first.reload();
        await loaded;
        await until(() =>
          first.executeJavaScript(
            '!!window.probe && !!navigator.serviceWorker.controller',
          ),
        );
        assert.equal(
          await first.executeJavaScript(
            "fetch('/offline-marker').then(r=>r.text())",
          ),
          'regular-marker',
        );
        assert.equal(offlineNetworkHits, 0);
      },
    );
    main.webContents.send('browser-tab-request', {
      action: 'select',
      id: tabs[1].id,
    });
    const shared = await ready(main, tabs[1].url);
    await check(
      'Tabs sharing a login share cookie, localStorage, IndexedDB and worker cache',
      async () => {
        assert.equal(shared.session, first.session);
        assert.deepEqual(await shared.executeJavaScript('probe.read()'), {
          cookie: 'regular-marker',
          local: 'regular-marker',
          idb: 'regular-marker',
          cache: 'regular-marker',
        });
      },
    );
    main.webContents.send('browser-tab-request', {
      action: 'select',
      id: tabs[2].id,
    });
    const isolated = await ready(main, tabs[2].url);
    await check(
      'Different login on the same origin has independent storage and worker registration',
      async () => {
        assert.notEqual(isolated.session, first.session);
        assert.deepEqual(await isolated.executeJavaScript('probe.read()'), {
          cookie: null,
          local: null,
          idb: null,
          cache: null,
        });
        assert.equal(
          await isolated.executeJavaScript(
            'navigator.serviceWorker.getRegistrations().then(r=>r.length)',
          ),
          0,
        );
      },
    );
    const api = require(path.join(runtimeDir, 'electronBrowser.js'));
    const createPrivate = async (id) => {
      console.log(`Opening private family: ${id}`);
      const owner = new BrowserWindow({
        show: true,
        webPreferences: {
          session: api.createPrivateSession(),
          preload: path.join(runtimeDir, 'preload.js'),
          contextIsolation: true,
          sandbox: true,
        },
      });
      privateOwners.push(owner);
      windows[`compatibility-private-${id}`] = owner;
      owner.once('closed', () => {
        delete windows[`compatibility-private-${id}`];
      });
      api.attachPrivateWindow(owner, owner.webContents.session);
      api.registerPrivateBrowserWindow(owner, async () => {
        throw new Error('No secondary fixture');
      });
      require(path.join(runtimeDir, 'browser.js')).registerBrowser(owner);
      console.log(`Loading private shell: ${id}`);
      await bounded(() => owner.loadFile(
        path.resolve('release/app/dist/renderer/index.html'),
        { query: { view: 'main', private: '1' } },
      ));
      console.log(`Private shell loaded: ${id}`);
      await until(() =>
        evaluate(owner, "!!document.querySelector('[data-private]')"),
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      const item = {
        ...tabs[0],
        id: `compatibility-private-${id}`,
        url: `${origin}/private-${id}`,
      };
      owner.webContents.send('browser-tab-request', {
        action: 'create',
        app: item,
      });
      return { owner, contents: await ready(owner, item.url) };
    };
    const privateFirst = await createPrivate('first');
    await check(
      'Private login is memory-only and cannot read regular records',
      async () => {
        assert.equal(privateFirst.contents.session.isPersistent(), false);
        assert.deepEqual(
          await privateFirst.contents.executeJavaScript('probe.read()'),
          { cookie: null, local: null, idb: null, cache: null },
        );
        await privateFirst.contents.executeJavaScript(
          "probe.store('private-marker')",
        );
        assert.equal(
          await privateFirst.contents.executeJavaScript(
            "probe.install('private-marker')",
          ),
          'private-marker',
        );
        assert.deepEqual(
          await privateFirst.contents.executeJavaScript('probe.read()'),
          {
            cookie: 'private-marker',
            local: 'private-marker',
            idb: 'private-marker',
            cache: 'private-marker',
          },
        );
      },
    );
    await exercise(privateFirst.contents, 'Private');
    console.log('Closing first private family');
    privateFirst.owner.destroy();
    console.log('First private family closed');
    const privateFresh = await createPrivate('fresh');
    await check(
      'Fresh private family has no previous private records or service workers',
      async () => {
        assert.deepEqual(
          await privateFresh.contents.executeJavaScript('probe.read()'),
          { cookie: null, local: null, idb: null, cache: null },
        );
        assert.equal(
          await privateFresh.contents.executeJavaScript(
            'navigator.serviceWorker.getRegistrations().then(r=>r.length)',
          ),
          0,
        );
        assert.deepEqual(await shared.executeJavaScript('probe.read()'), {
          cookie: 'regular-marker',
          local: 'regular-marker',
          idb: 'regular-marker',
          cache: 'regular-marker',
        });
      },
    );
    passed = true;
    console.log(
      `PASS: ${results.length} native compatibility checks. Report: ${path.join(out, 'compatibility-results.json')}`,
    );
  } finally {
    for (const owner of privateOwners)
      if (!owner.isDestroyed()) { console.log('Cleaning private fixture'); owner.destroy(); }
    for (const key of Object.keys(windows))
      if (key.startsWith('compatibility-private-')) delete windows[key];
    server.close();
    server.closeAllConnections();
    fs.writeFileSync(
      path.join(out, 'compatibility-results.json'),
      JSON.stringify(
        {
          outcome: passed ? 'passed' : 'failed',
          measuredAt: new Date().toISOString(),
          runtime: {
            electron: process.versions.electron,
            chromium: process.versions.chrome,
            platform: process.platform,
            arch: process.arch,
            packaged: app.isPackaged,
          },
          results,
          limitations: [
            'Camera/microphone streams use Chromium fake devices; hardware and OS grants are separate checks.',
            'Screen-sharing denial is exercised; native OS picker approval and real screen pixels remain separate checks.',
            'Local synthetic pages; no real provider sign-in, purchase, payment, DRM or codec certification.',
            'Uploads use a synthetic File; native file chooser and OS device permissions are not exercised.',
            'Cached responses test service-worker interception, not an OS network disconnect.',
            'A fresh private family is tested; inspecting disk remnants and multi-window family lifetime are separate checks.',
          ],
        },
        null,
        2,
      ) + '\n',
    );
  }
};

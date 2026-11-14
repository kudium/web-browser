// Optional network acceptance in the production Kudium workspace, with fresh profiles.
const { app, BrowserWindow, WebContentsView } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const captureWorkspace = require('./capture-workspace-fixture.cjs');
module.exports = async ({
  main,
  evaluate,
  runtimeDir,
  out,
  url,
  windows,
  registerBrowser,
}) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const report = {
    date: '2026-11-14',
    runtime: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      arch: process.arch,
    },
    scope:
      'Production workspace/backend with disposable profiles. Published demo credentials only, fake media devices and controlled file selection; no OS chooser, real accounts, real payment, native passkeys or actual camera/microphone claim.',
    inputMode: process.argv.includes('--native-clicks')
      ? 'Native browser mouse events for main-frame controls; focused input with controlled private/checkout activation.'
      : 'Controlled page activation and focused input.',
    outcome: 'running',
    captures: out,
    captureMethod:
      'Diagnostic composition of shell and visible native page surfaces; native screenshots require separate review.',
    results: [],
  };
  const reportFile = process.argv.includes('--checkout-only')
    ? 'docs/benchmarks/stripe-checkout-acceptance.json'
    : 'docs/benchmarks/real-sites-acceptance.json';
  const save = () =>
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  const until = async (web, expression, timeout = 25000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const result = await web.executeJavaScript(expression);
        if (result) return result;
      } catch {}
      await wait(200);
    }
    throw new Error('Timed out waiting for ' + expression);
  };
  const tabs = [
    ['login', 'demo'],
    ['shared', 'demo'],
    ['isolated', 'isolated'],
    ['upload', 'web'],
    ['payment', 'web'],
    ['media', 'web'],
    ['rtc', 'web'],
    ['google', 'web'],
    ['microsoft', 'web'],
    ['meeting', 'web'],
  ].map(([id, group]) => ({
    id: 'real-' + id,
    name: id,
    sessionId: 'real-' + group,
    sessionName: 'Acceptance ' + group,
    url: url + '/' + id,
    icon: '',
  }));
  await evaluate(
    main,
    `localStorage.setItem('user_apps',${JSON.stringify(
      JSON.stringify(tabs)
    )});localStorage.setItem('user_last_app_id','real-login');undefined`
  );
  main.reload();
  await until(
    main.webContents,
    "!!document.getElementById('page-tab-real-login')"
  );
  const views = new Map();
  const visit = async (id, destination) => {
    main.webContents.send('browser-tab-request', {
      action: 'select',
      id: 'real-' + id,
    });
    await wait(300);
    let web = views.get(id);
    if (!web) {
      await until(main.webContents, `!!document.querySelector('.workspace')`);
      for (let i = 0; i < 100 && !web; i++) {
        web = main.contentView.children.find(
          (view) =>
            view instanceof WebContentsView &&
            view.webContents.getURL() === url + '/' + id
        )?.webContents;
        if (!web && i > 5) {
          const active = main.contentView.children.filter(
            (view) =>
              view instanceof WebContentsView &&
              view.webContents.session !== main.webContents.session &&
              view.getBounds().width > 0 &&
              view.getBounds().height > 0
          );
          if (active.length === 1) web = active[0].webContents;
        }
        if (!web) await wait(50);
      }
      assert(web, 'Production tab must create a native page');
      views.set(id, web);
    }
    const prefs = web.getLastWebPreferences();
    assert(
      prefs.sandbox &&
        prefs.contextIsolation &&
        prefs.webSecurity &&
        !prefs.nodeIntegration
    );
    assert.equal(prefs.preload, undefined);
    await evaluate(
      main,
      `window.electron.browser.command({id:'real-${id}',action:'navigate',url:${JSON.stringify(
        destination
      )}});undefined`
    );
    await until(
      web,
      `location.href!==${JSON.stringify(
        url + '/' + id
      )} && document.readyState==='complete'`
    );
    return web;
  };
  const click = async (web, selector) => {
    if (!process.argv.includes('--native-clicks')) {
      await web.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)}).click();true`,
        true
      );
      await wait(100);
      return;
    }
    main.show();
    main.focus();
    web.focus();
    await wait(100);
    await web.executeJavaScript(
      `document.querySelector(${JSON.stringify(
        selector
      )}).scrollIntoView({block:'center',behavior:'instant'});true`
    );
    await wait(200);
    const point = await web.executeJavaScript(
      `(()=>{const element=document.querySelector(${JSON.stringify(
        selector
      )});if(!element)throw new Error('Missing target');element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`
    );
    web.sendInputEvent({
      type: 'mouseDown',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    web.sendInputEvent({
      type: 'mouseUp',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    await wait(100);
  };
  const fill = async (web, selector, text) => {
    await click(web, selector);
    await web.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).focus();undefined`
    );
    await web.insertText(text);
    assert.equal(
      await web.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)}).value`
      ),
      text,
      'Actual input must contain the entered demo value'
    );
  };
  const check = async (name, run) => {
    if (process.argv.includes('--checkout-only') && !name.startsWith('Stripe'))
      return;
    console.log('SITE CHECK', name);
    const result = { name, status: 'running' };
    report.results.push(result);
    save();
    try {
      Object.assign(result, await run(), { status: 'passed' });
      console.log('PASS', name);
    } catch (error) {
      result.status = 'incomplete';
      result.error = String(error.message);
      console.error(error.stack);
      if (name === 'Stripe demo test payment confirmation' && stripeContext) {
        result.diagnostics = [];
        for (const frame of stripeContext.web.mainFrame.framesInSubtree) {
          try {
            const site = new URL(frame.url);
            if (
              !['checkout.stripe.dev', 'js.stripe.com'].includes(site.hostname)
            )
              continue;
            result.diagnostics.push({
              site: site.origin + site.pathname,
              text: await frame.executeJavaScript(
                'document.body?.innerText.slice(-3500)'
              ),
              buttons: await frame.executeJavaScript(
                "Array.from(document.querySelectorAll('button[type=submit]')).map(button=>({text:button.innerText,disabled:button.disabled,testId:button.dataset.testid}))"
              ),
            });
          } catch {}
        }
      }
      fs.writeFileSync(
        path.join(out, `incomplete-${report.results.length}.png`),
        await captureWorkspace(main)
      );
      console.log('INCOMPLETE', name, result.error);
    }
    save();
  };
  await check(
    'SauceDemo real login, shared profile and isolated profile',
    async () => {
      const web = await visit('login', 'https://www.saucedemo.com/');
      await until(web, "!!document.querySelector('[data-test=username]')");
      // Credentials are published directly by this deliberately public demo site.
      assert(
        await web.executeJavaScript(
          "document.body.innerText.includes('standard_user') && document.body.innerText.includes('secret_sauce')"
        )
      );
      await fill(web, '[data-test=username]', 'standard_user');
      await fill(web, '[data-test=password]', 'secret_sauce');
      await click(web, '[data-test=login-button]');
      await until(
        web,
        "location.pathname==='/inventory.html' && !!document.querySelector('[data-test=inventory-list]')"
      );
      web.reload();
      await until(
        web,
        "!!document.querySelector('[data-test=inventory-list]')"
      );
      const shared = await visit(
        'shared',
        'https://www.saucedemo.com/inventory.html'
      );
      await until(
        shared,
        "!!document.querySelector('[data-test=inventory-list]')"
      );
      const isolated = await visit(
        'isolated',
        'https://www.saucedemo.com/inventory.html'
      );
      await until(
        isolated,
        "!!document.querySelector('[data-test=login-button]')"
      );
      assert.equal(web.session, shared.session);
      assert.notEqual(web.session, isolated.session);
      main.webContents.send('browser-tab-request', {
        action: 'select',
        id: 'real-shared',
      });
      await wait(300);
      fs.writeFileSync(
        path.join(out, 'real-login.png'),
        await captureWorkspace(main)
      );
      return {
        site: 'https://www.saucedemo.com/',
        verified: [
          'actual published demo login',
          'reload retains authenticated session',
          'shared-group login',
          'separate-group authentication isolation',
        ],
      };
    }
  );
  await check(
    'Private real-site login and regular-session isolation',
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
        windows['private-real-' + win.id] = win;
        const manager = api.registerPrivateBrowserWindow(win, createShell);
        api.attachPrivateWindow(win, target);
        if (!manager.hasOtherWindows(win)) registerBrowser(win);
        await win.loadFile(
          path.resolve('release/app/dist/renderer/index.html'),
          { query: { view: 'main', private: '1' } }
        );
        await until(win.webContents, "!!document.querySelector('.workspace')");
        return win;
      };
      const win = await createShell();
      try {
        win.webContents.send('browser-tab-request', {
          action: 'create',
          app: {
            id: 'private-real-login',
            sessionId: 'private-real-group',
            name: 'Private demo login',
            url: 'https://www.saucedemo.com/',
            icon: '',
            spaceId: 'default',
            pinned: false,
          },
        });
        let web;
        for (let attempt = 0; attempt < 100 && !web; attempt++) {
          web = win.contentView.children.find(
            (view) =>
              view instanceof WebContentsView &&
              view.webContents.getURL().startsWith('https://www.saucedemo.com/')
          )?.webContents;
          if (!web) await wait(50);
        }
        assert(web);
        assert.equal(web.session, target);
        assert(!target.isPersistent());
        await until(web, "!!document.querySelector('[data-test=username]')");
        assert(
          await web.executeJavaScript(
            "document.body.innerText.includes('standard_user') && document.body.innerText.includes('secret_sauce')"
          )
        );
        win.focus();
        web.focus();
        for (const [selector, value] of [
          ['[data-test=username]', 'standard_user'],
          ['[data-test=password]', 'secret_sauce'],
        ]) {
          await web.executeJavaScript(
            `document.querySelector(${JSON.stringify(
              selector
            )}).focus();undefined`
          );
          await web.insertText(value);
        }
        await web.executeJavaScript(
          "document.querySelector('[data-test=login-button]').click();undefined",
          true
        );
        await until(
          web,
          "!!document.querySelector('[data-test=inventory-list]')"
        );
        assert(
          await evaluate(win, "!!document.querySelector('[data-private]')")
        );
        await target.cookies.set({
          url: 'https://www.saucedemo.com/',
          name: 'private_acceptance',
          value: 'fixture',
          secure: true,
        });
        assert.equal(
          (
            await views
              .get('login')
              .session.cookies.get({ name: 'private_acceptance' })
          ).length,
          0
        );
        fs.writeFileSync(
          path.join(out, 'real-private-login.png'),
          await captureWorkspace(win)
        );
        assert(
          !(await evaluate(
            main,
            "JSON.parse(localStorage.getItem('user_apps')).some(item=>item.id==='private-real-login')"
          ))
        );
      } finally {
        win.destroy();
      }
      for (
        let attempt = 0;
        attempt < 100 &&
        (await target.cookies.get({ name: 'private_acceptance' })).length;
        attempt++
      )
        await wait(50);
      assert.equal(
        (await target.cookies.get({ name: 'private_acceptance' })).length,
        0
      );
      await until(
        views.get('login'),
        "!!document.querySelector('[data-test=inventory-list]')"
      );
      return {
        site: 'https://www.saucedemo.com/',
        verified: [
          'regular login absent in fresh private session',
          'actual published demo login privately',
          'existing shared private workspace UI',
          'private tab excluded from regular workspace',
          'final-window cookie cleanup',
          'regular authentication survives private closure',
        ],
        limitation:
          'Native passkey providers and private authenticated OAuth remain separate acceptance items.',
      };
    }
  );
  await check('Real multipart file upload', async () => {
    const web = await visit(
      'upload',
      'https://the-internet.herokuapp.com/upload'
    );
    await until(web, "!!document.querySelector('#file-upload')");
    const file = path.join(runtimeDir, 'kudium-disposable-upload.txt');
    fs.writeFileSync(
      file,
      'Disposable Kudium upload acceptance fixture. No user data.\n'
    );
    web.debugger.attach('1.3');
    try {
      const doc = await web.debugger.sendCommand('DOM.getDocument');
      const node = await web.debugger.sendCommand('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: '#file-upload',
      });
      await web.debugger.sendCommand('DOM.setFileInputFiles', {
        nodeId: node.nodeId,
        files: [file],
      });
    } finally {
      web.debugger.detach();
    }
    await click(web, '#file-submit');
    await until(
      web,
      "document.body.innerText.includes('File Uploaded!') && document.querySelector('#uploaded-files')?.innerText.trim()==='kudium-disposable-upload.txt'"
    );
    fs.writeFileSync(
      path.join(out, 'real-upload.png'),
      await captureWorkspace(main)
    );
    return {
      site: 'https://the-internet.herokuapp.com/upload',
      verified: [
        'real file input',
        'real multipart submission',
        'remote server confirms generated filename',
      ],
      limitation:
        'File selection controlled through CDP; native chooser not exercised.',
    };
  });
  let stripeContext;
  await check('Stripe hosted test checkout entry', async () => {
    const web = await visit('payment', 'https://checkout.stripe.dev/');
    await until(web, 'document.body.innerText.length>100');
    await web.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(button=>button.innerText.trim()==='View demo').id='fixture-view-demo';undefined`
    );
    await click(web, '#fixture-view-demo');
    await wait(1500);

    const livePaymentFrame = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const frames = web.mainFrame.framesInSubtree;
        for (const frame of frames) {
          try {
            if (
              !frame.url.startsWith(
                'https://js.stripe.com/v3/embedded-checkout-inner.html'
              )
            )
              continue;
            if (
              await frame.executeJavaScript(
                `!!document.querySelector('input[name="email"]')`
              )
            ) {
              assert(
                frame.url.includes('pk_test_') &&
                  frame.url.includes('cs_test_'),
                'Only test-mode frames may receive fixture data'
              );
              return frame;
            }
          } catch (error) {
            if (!/disposed|destroyed|detached/.test(String(error))) throw error;
          }
        }
        await wait(100);
      }
      throw new Error('Live hosted test payment form is unavailable');
    };
    const paymentFrame = await livePaymentFrame();
    assert(
      paymentFrame.url.includes('pk_test_') &&
        paymentFrame.url.includes('cs_test_'),
      'Use only the explicit Stripe test session'
    );
    const paymentFields = await until(
      paymentFrame,
      `(()=>{const fields=Array.from(document.querySelectorAll('input')).map(input=>({name:input.name,type:input.type,autocomplete:input.autocomplete,placeholder:input.placeholder}));return fields.length>2 && {fields,text:document.body.innerText.slice(0,2000)}})()`
    );
    stripeContext = { web, livePaymentFrame, paymentFields };
    fs.writeFileSync(
      path.join(out, 'real-checkout-entry.png'),
      await captureWorkspace(main)
    );
    return {
      site: 'https://checkout.stripe.dev/',
      paymentFields,
      verified: [
        'checkout demo document renders',
        'cross-origin Stripe hosted test session',
        'real payment form inputs render',
      ],
      limitation:
        'Hosted test form rendering only; submission is checked separately.',
    };
  });
  await check('Stripe demo test payment confirmation', async () => {
    assert(
      stripeContext,
      'Hosted checkout entry must pass before test submission'
    );
    const { web, livePaymentFrame, paymentFields } = stripeContext;
    let paymentFrame = await livePaymentFrame();
    assert(
      await paymentFrame.executeJavaScript(`(()=>{
      const select=Array.from(document.querySelectorAll('select')).find(element=>Array.from(element.options).some(option=>option.text==='Canada'));
      if(!select)return false;
      const option=Array.from(select.options).find(option=>option.text==='Canada');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,option.value);
      select.dispatchEvent(new Event('change',{bubbles:true}));return true;
    })()`),
      'Fixture shipping country must be Canada'
    );
    await wait(200);
    for (const [name, value] of [
      ['email', 'kudium-acceptance@example.com'],
      ['shippingName', 'Atlas Test'],
      ['shippingAddressLine1', '123 Example Street'],
      ['shippingLocality', 'Toronto'],
      ['shippingPostalCode', 'M5V2T6'],
      ['cardNumber', '4242424242424242'],
      ['cardExpiry', '1230'],
      ['cardCvc', '123'],
    ]) {
      paymentFrame = await livePaymentFrame();
      web.focus();
      await paymentFrame.executeJavaScript(
        `document.querySelector('input[name="${name}"]').focus();true`
      );
      if (process.argv.includes('--native-clicks')) {
        if (!web.debugger.isAttached()) web.debugger.attach('1.3');
        await web.debugger.sendCommand('Input.insertText', { text: value });
      } else {
        await paymentFrame.executeJavaScript(`(()=>{
          const input=document.querySelector('input[name="${name}"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(
            value
          )});
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
          return true;
        })()`);
      }
      await wait(200);
      paymentFrame = await livePaymentFrame();
      const entered = await paymentFrame.executeJavaScript(
        `document.querySelector('input[name="${name}"]').value`
      );
      assert(
        name.startsWith('card')
          ? entered.replace(/\D/g, '') === value
          : name === 'shippingPostalCode'
          ? entered.replace(/\s/g, '') === value
          : entered === value,
        'Actual hosted field must accept input: ' + name
      );
    }
    paymentFrame = await livePaymentFrame();
    await paymentFrame.executeJavaScript(
      `(()=>{for(const element of document.querySelectorAll('select')){const option=Array.from(element.options).find(option=>option.text==='Ontario');if(option){element.value=option.value;element.dispatchEvent(new Event('change',{bubbles:true}));}}})()`
    );
    assert(
      paymentFrame.url.includes('pk_test_') &&
        paymentFrame.url.includes('cs_test_') &&
        paymentFrame.url.includes('__isDemoMode=true')
    );
    await paymentFrame.executeJavaScript(
      `(()=>{const button=Array.from(document.querySelectorAll('button[type="submit"]')).find(element=>/^Pay\\b/i.test(element.innerText.trim()));
      if(!button)throw new Error('Payment submit control is unavailable');
      if(button.disabled)throw new Error('Payment submit control is disabled');
      button.click();return true;})()`,
      true
    );
    const paymentResult = await until(
      paymentFrame,
      `(()=>{const text=document.body.innerText;return /payment.*successful|thank you|payment complete|paid successfully/i.test(text) && text.slice(0,1000)})()`,
      25000
    );
    const snapshot = await web.executeJavaScript(
      "({title:document.title, text:document.body.innerText.slice(0,3500), buttons:Array.from(document.querySelectorAll('button')).map(x=>x.innerText), frames:Array.from(document.querySelectorAll('iframe')).map(x=>{try{const u=new URL(x.src);return u.origin+u.pathname}catch{return x.src}})})"
    );
    fs.writeFileSync(
      path.join(out, 'real-checkout-confirmation.png'),
      await captureWorkspace(main)
    );
    return {
      site: new URL(web.getURL()).origin + new URL(web.getURL()).pathname,
      snapshot,
      paymentFields,
      paymentResult,
      verified: [
        'checkout demo document renders',
        'cross-origin Stripe hosted test session',
        'real payment form inputs render',
        'hosted iframe accepts dummy shipping and published test card',
        'Stripe demo test-mode payment confirmation',
      ],
      limitation:
        'Stripe demo test-mode confirmation only. Real charges, wallet authentication and 3DS are not tested.',
    };
  });
  await check('Public video playback', async () => {
    const web = await visit(
      'media',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
    );
    await until(web, "!!document.querySelector('video')");
    await web.executeJavaScript(
      "(()=>{const video=document.querySelector('video');video.muted=true;video.play();})()",
      true
    );
    const before = await web.executeJavaScript(
      'document.querySelector("video").currentTime'
    );
    await wait(1500);
    const state = await web.executeJavaScript(
      '(()=>{const v=document.querySelector("video");return {time:v.currentTime,ready:v.readyState,width:v.videoWidth,height:v.videoHeight,error:v.error?.code}})()'
    );
    assert(
      state.time > before && state.ready >= 2 && state.width > 0 && !state.error
    );
    fs.writeFileSync(
      path.join(out, 'real-video.png'),
      await captureWorkspace(main)
    );
    await web.executeJavaScript(
      'document.querySelector("video").pause();undefined'
    );
    return {
      site: new URL(web.getURL()).origin + new URL(web.getURL()).pathname,
      state,
      verified: [
        'real HTTPS media bytes',
        'decoded video dimensions',
        'playback time advances',
      ],
    };
  });
  await check('WebRTC public two-peer media transport', async () => {
    const web = await visit(
      'rtc',
      'https://webrtc.github.io/samples/src/content/peerconnection/pc1/'
    );
    await until(web, "!!document.querySelector('#startButton')");
    await click(web, '#startButton');
    await until(
      web,
      "!!document.querySelector('#localVideo').srcObject && document.querySelector('#localVideo').readyState>=2 && !document.querySelector('#callButton').disabled"
    );
    await click(web, '#callButton');
    const state = await until(
      web,
      "(()=>{const v=document.querySelector('#remoteVideo');return v.videoWidth>0 && v.currentTime>0 && {width:v.videoWidth,height:v.videoHeight,time:v.currentTime,tracks:v.srcObject.getTracks().map(t=>({kind:t.kind,ready:t.readyState}))}})()",
      30000
    );
    const stats = await web.executeJavaScript(
      "pc2.getStats().then(stats=>Array.from(stats.values()).filter(s=>s.type==='inbound-rtp').map(s=>({kind:s.kind,packetsReceived:s.packetsReceived,bytesReceived:s.bytesReceived,framesDecoded:s.framesDecoded})))"
    );
    assert(
      stats.some(
        (item) =>
          item.kind === 'video' &&
          item.bytesReceived > 0 &&
          item.framesDecoded > 0
      )
    );
    await click(web, '#hangupButton');
    return {
      site: new URL(web.getURL()).origin + new URL(web.getURL()).pathname,
      state,
      stats,
      verified: [
        'public sample uses production permission path',
        'actual RTCPeerConnection negotiation',
        'remote RTP bytes and decoded frames',
        'hangup',
      ],
      limitation:
        'Fake camera/microphone sources; no OS device-grant or remote meeting provider claim.',
    };
  });
  for (const [id, site, expression] of [
    [
      'google',
      'https://accounts.google.com/',
      "!!document.querySelector('#identifierId') || document.body.innerText.includes('Choose an account')",
    ],
    [
      'microsoft',
      'https://login.microsoftonline.com/',
      "!!document.querySelector('input[type=email]')",
    ],
    [
      'meeting',
      'https://zoom.us/test',
      '/Join|Test Meeting/i.test(document.body.innerText)',
    ],
  ])
    await check(id + ' public entry page', async () => {
      const web = await visit(id, site);
      await until(web, expression);
      fs.writeFileSync(
        path.join(out, 'real-' + id + '-entry.png'),
        await captureWorkspace(main)
      );
      return {
        site: new URL(web.getURL()).origin + new URL(web.getURL()).pathname,
        verified: ['HTTPS navigation and entry UI'],
        limitation:
          'No private account credentials, authenticated OAuth redirect or external meeting app launch performed.',
      };
    });
  report.sourceHashes = Object.fromEntries(
    [
      'src/main/electronBrowser.ts',
      'src/main/websitePermissions.ts',
      '.erb/scripts/real-sites-acceptance.cjs',
      '.erb/scripts/capture-workspace-fixture.cjs',
      '.erb/scripts/browser-ui-smoke.cjs',
    ].map((file) => [
      file,
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ])
  );
  report.outcome = report.results.every((result) => result.status === 'passed')
    ? 'passed'
    : 'incomplete';
  save();
  console.log(
    'Real-site evidence:',
    path.resolve(reportFile),
    'captures:',
    out
  );
  return report;
};

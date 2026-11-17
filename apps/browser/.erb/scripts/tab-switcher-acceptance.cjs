const { WebContentsView } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ main, evaluate, out, url }) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let index = 0; index < 100; index++) {
      if (await evaluate(main, expression)) return;
      await wait(20);
    }
    throw new Error('Tab switcher timed out: ' + expression);
  };
  const tabs = ['one', 'two', 'three'].map((id) => ({
    id,
    name: id,
    url: url + '/' + id,
    sessionName: 'Switch fixture',
    sessionId: 'switch-fixture',
    spaceId: 'default',
    icon: '',
  }));
  await evaluate(
    main,
    `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{ id: 'default', name: 'Personal', color: 'iris', folders: [], selectedAppId: 'one' }]))});undefined`,
  );
  await main.reload();
  await until(`document.querySelectorAll('.horizontal-tab').length===3`);
  const active = () =>
    evaluate(
      main,
      `document.querySelector('.horizontal-tab.active')?.getAttribute('data-tab-motion')?.split('-').pop()`,
    );
  for (const id of ['two', 'three', 'one']) {
    await evaluate(
      main,
      `document.querySelector('[data-tab-motion="horizontal-main-${id}"] .horizontal-tab-select').click();undefined`,
    );
    await until(
      `document.querySelector('[data-tab-motion="horizontal-main-${id}"]').classList.contains('active')`,
    );
    await wait(40);
  }
  await evaluate(
    main,
    `window.switcherAppearances=0;new MutationObserver(()=>{if(document.querySelector('.tab-switcher-dialog'))window.switcherAppearances++}).observe(document.body,{childList:true,subtree:true});undefined`,
  );
  const key = (target, type, keyCode, modifiers = []) =>
    target.sendInputEvent({ type, keyCode, modifiers });
  const begin = (target, reverse = false) => {
    key(target, 'keyDown', 'Control', ['control']);
    key(target, 'keyDown', 'Tab', reverse ? ['control', 'shift'] : ['control']);
    key(target, 'keyUp', 'Tab', reverse ? ['control', 'shift'] : ['control']);
  };
  const end = (target) => key(target, 'keyUp', 'Control');
  const samples = [];
  const inputs = [];
  main.webContents.on('before-input-event', (_event, input) =>
    inputs.push(input),
  );
  main.focus();
  await wait(80);
  for (let index = 0; index < 6; index++) {
    const target =
      index % 2 === 0
        ? main.webContents
        : main.contentView.children.find(
            (view) =>
              view instanceof WebContentsView &&
              view.getVisible() &&
              view.webContents.session !== main.webContents.session,
          ).webContents;
    target.focus();
    const started = Date.now();
    begin(target);
    end(target);
    const expected = index % 2 === 0 ? 'three' : 'one';
    try {
      await until(
        `document.querySelector('[data-tab-motion="horizontal-main-${expected}"]').classList.contains('active')`,
      );
    } catch (error) {
      console.error('Native inputs:', inputs, 'Active:', await active());
      throw error;
    }
    samples.push({
      expected,
      elapsedMs: Date.now() - started,
      origin: index % 2 === 0 ? 'chrome' : 'website',
    });
  }
  assert.equal(
    await evaluate(main, 'window.switcherAppearances'),
    0,
    'Quick chords must never display the popup',
  );
  main.webContents.focus();
  begin(main.webContents);
  await wait(100);
  assert.equal(
    await evaluate(main, `!!document.querySelector('.tab-switcher-dialog')`),
    false,
    'Brief hold must stay quiet',
  );
  // Keep Control held while releasing Tab: the chooser must still open.
  const holdStarted = Date.now();
  await until(`!!document.querySelector('.tab-switcher-dialog')`);
  assert(Date.now() - holdStarted < 700, 'Held chooser must appear promptly');
  assert.equal(
    await active(),
    'one',
    'Holding must not activate the preview before release',
  );
  assert.equal(
    await evaluate(
      main,
      `document.querySelector('.tab-switcher-card[aria-current=true]').getAttribute('aria-label')`,
    ),
    'Home',
  );
  key(main.webContents, 'keyDown', 'Tab', ['control']);
  key(main.webContents, 'keyUp', 'Tab', ['control']);
  await until(
    `document.querySelectorAll('.tab-switcher-card')[2].getAttribute('aria-current')==='true'`,
  );
  fs.writeFileSync(
    path.join(out, 'tab-switcher-held.png'),
    (await main.capturePage()).toPNG(),
  );
  end(main.webContents);
  await until(
    `!document.querySelector('.tab-switcher-dialog') && document.querySelector('[data-tab-motion="horizontal-main-two"]').classList.contains('active')`,
  );
  begin(main.webContents, true);
  await until(`!!document.querySelector('.tab-switcher-dialog')`);
  key(main.webContents, 'keyDown', 'Escape', ['control']);
  key(main.webContents, 'keyUp', 'Escape', ['control']);
  end(main.webContents);
  await until(`!document.querySelector('.tab-switcher-dialog')`);
  assert.equal(
    await active(),
    'two',
    'Escape must cancel without activating the preview',
  );
  fs.writeFileSync(
    path.join(out, 'tab-switcher-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
        },
        checks: [
          'Quick Ctrl+Tab toggles last/current from chrome and websites without popup',
          'Holding Control after releasing Tab opens chooser promptly',
          'Repeated Tab while held browses without activating',
          'Control release commits highlighted tab',
          'Reverse navigation and Escape cancellation',
        ],
        samples,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: native quick MRU switching, held chooser, cycling, release and Escape. Evidence: ' +
      out,
  );
};

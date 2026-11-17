const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

module.exports = async ({ main, evaluate, out }) => {
  const spaces = Array.from({ length: 12 }, (_, index) => ({
    id: index ? 'space-' + (index + 1) : 'default',
    name: index ? 'Space ' + (index + 1) : 'Personal',
    color: ['iris', 'green', 'orange'][index % 3],
    folders: [],
    icon: 'layers',
    ...(index % 4 === 2 ? { iconEmoji: '🚀' } : {}),
  }));
  await evaluate(
    main,
    `localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify(spaces))});undefined`,
  );
  await main.reload();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let index = 0; index < 80; index++) {
      if (await evaluate(main, expression)) return;
      await wait(30);
    }
    throw new Error('Space footer timed out: ' + expression);
  };
  await until(`document.querySelectorAll('.space-switch').length===12`);
  main.webContents.send('browser-downloads-changed', [
    {
      id: 'fixture-download',
      name: 'fixture.txt',
      path: '/disposable/fixture.txt',
      mime: 'text/plain',
      startedAt: 1,
      receivedBytes: 100,
      totalBytes: 100,
      state: 'completed',
      active: false,
      paused: false,
    },
  ]);
  await until(
    `document.querySelectorAll('.system-space-switcher button').length===2`,
  );
  const measured = [];
  for (const width of [240, 300, 420]) {
    await evaluate(
      main,
      `document.querySelector('.workspace-sidebar').style.width='${width}px';document.querySelector('.workspace-sidebar').style.maxWidth='none';document.querySelector('.space-switcher').scrollLeft=0;undefined`,
    );
    await wait(350);
    const layout = await evaluate(
      main,
      `(()=>{const footer=document.querySelector('.sidebar-bottom').getBoundingClientRect(),strip=document.querySelector('.space-switcher').getBoundingClientRect(),create=document.querySelector('.footer-create-space').getBoundingClientRect(),buttons=[...document.querySelectorAll('.space-switch')].map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}});return {width:footer.width,height:footer.height,create:{left:create.left,right:create.right},gap:getComputedStyle(document.querySelector('.space-switcher')).gap,visible:buttons.filter(r=>r.left>=strip.left-1&&r.right<=strip.right+1).length,buttons,footerRight:footer.right}})()`,
    );
    assert(
      layout.buttons.every(
        (button) => button.width >= 24 && button.height >= 24,
      ),
    );
    assert(
      layout.visible >= (width === 240 ? 5 : width === 300 ? 7 : 12),
      'Compact footer must fit expected space buttons at ' + width + ': ' + JSON.stringify(layout),
    );
    assert(
      layout.create.right <= layout.footerRight + 1,
      'Create action must fit',
    );
    measured.push({ sidebarWidth: width, ...layout });
    const bounds = await evaluate(
      main,
      `(()=>{const r=document.querySelector('.sidebar-bottom').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`,
    );
    fs.writeFileSync(
      path.join(out, `space-footer-${width}.png`),
      (await main.capturePage(bounds)).toPNG(),
    );
  }
  await evaluate(
    main,
    `document.querySelector('.workspace').classList.add('compact-sidebar');document.querySelector('.workspace-sidebar').style.width='76px';undefined`,
  );
  await wait(350);
  await evaluate(main, `document.querySelector('[data-footer-space="space-12"]').focus();undefined`);
  await wait(80);
  assert(
    await evaluate(main, `(()=>{const strip=document.querySelector('.space-switcher'),s=strip.getBoundingClientRect(),b=document.querySelector('[data-footer-space="space-12"]').getBoundingClientRect();return strip.scrollTop>0&&b.top>=s.top-1&&b.bottom<=s.bottom+1})()`),
    'Collapsed sidebar must keep overflowed spaces reachable',
  );
  await evaluate(main, `document.querySelector('.workspace').classList.remove('compact-sidebar');document.querySelector('.space-switcher').scrollTop=0;undefined`);
  await evaluate(
    main,
    `document.querySelector('.workspace-sidebar').style.width='240px';document.querySelector('.space-switcher').scrollLeft=0;undefined`,
  );
  await wait(350);
  const positions = () =>
    evaluate(
      main,
      `[...document.querySelectorAll('.sidebar-bottom button')].map(button=>button.getBoundingClientRect().x)`,
    );
  const before = await positions();
  await evaluate(
    main,
    `document.querySelector('.system-space-switcher button').focus();undefined`,
  );
  await wait(80);
  assert.deepEqual(
    await positions(),
    before,
    'Focus must not shift the footer to reveal Create',
  );
  await evaluate(
    main,
    `document.querySelector('[data-footer-space="space-12"]').focus();undefined`,
  );
  await wait(80);
  assert(
    await evaluate(
      main,
      `(()=>{const strip=document.querySelector('.space-switcher'),s=strip.getBoundingClientRect(),b=document.querySelector('[data-footer-space="space-12"]').getBoundingClientRect();return strip.scrollLeft>0&&b.left>=s.left-1&&b.right<=s.right+1})()`,
    ),
    'Keyboard focus must reveal overflowed spaces',
  );
  await evaluate(
    main,
    `document.querySelector('[data-footer-space="space-12"]').click();undefined`,
  );
  await until(
    `document.querySelector('[data-footer-space="space-12"]').getAttribute('aria-pressed')==='true'`,
  );
  await evaluate(
    main,
    `document.querySelector('.footer-create-space').click();undefined`,
  );
  await until(
    `!!document.querySelector('[role="dialog"] [aria-label="Space name"]')`,
  );
  fs.writeFileSync(
    path.join(out, 'space-footer-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
        },
        measured,
        checks: [
          'Click targets remain at least 24px in each direction',
          'Five, seven and twelve fully visible space buttons at 240/300/420px sidebar widths',
          'Stable layout on keyboard focus',
          'Overflowed spaces reachable with keyboard focus',
          'Collapsed sidebar keeps overflowed spaces reachable',
          'Overflowed space activates and shows selected state',
          'Create space remains usable',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: compact space footer, stable layout, overflow navigation and Create. Evidence: ' +
      out,
  );
};

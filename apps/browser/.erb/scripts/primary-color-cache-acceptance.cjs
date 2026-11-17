const assert = require('assert/strict');
module.exports = async ({ main, evaluate, url, finishReload }) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(main, expression)) return; await wait(40); }
    throw new Error('Primary color cache timed out: ' + expression);
  };
  const tabs = [{ id: 'cached-color', sessionId: 'cache-group', sessionName: 'Cache fixture', name: 'Cache page', url: url + '/primary-color-cache', icon: '', spaceId: 'default' }];
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','cached-color');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{ id: 'default', name: 'Personal', color: 'iris', folders: [], selectedAppId: 'cached-color', useWebsiteColors: true }]))});undefined`);
  await main.reload();
  await until(`!!document.querySelector('.workspace')`);
  const primary = `getComputedStyle(document.querySelector('.workspace')).getPropertyValue('--kudium-primary').trim()`;
  await until(`${primary}==='#fcd72b'`);
  await evaluate(main, `window.electron.browser.command({id:'cached-color',action:'reload'})`);
  await until(`!!document.querySelector('[aria-label="Stop loading"]')`);
  for (let sample = 0; sample < 8; sample++) {
    assert.equal(await evaluate(main, primary), '#fcd72b', 'Reload retains the cached primary color');
    await wait(40);
  }
  finishReload();
  await until(`${primary}==='#00b53f'`);
  await until(`!document.querySelector('[aria-label="Stop loading"]')`);
  await evaluate(main, `window.electron.browser.command({id:'cached-color',action:'navigate',url:${JSON.stringify(url + '/primary-color-redirect')}})`);
  await until(`!!document.querySelector('.address-bar-input input')&&document.querySelector('.address-bar-input input').value.includes('localhost')`);
  await until(`${primary}==='#5aaca8'`);
  console.log('PASS: cached color remains stable through a stalled reload, a fresh header updates it, and an uncached redirect clears it.');
};

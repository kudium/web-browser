const { WebContentsView, ipcMain } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ main, evaluate, out, url }) => {
  const tabs = ['default', 'work'].flatMap(spaceId => [1, 2].flatMap(group => [1, 2].map(tab => ({
    id: `${spaceId}-${group}-${tab}`, spaceId, sessionId: `${spaceId}-${group}`,
    sessionName: `${spaceId} group ${group}`, name: `Tab ${tab}`, icon: '',
    url: `${url}/${spaceId}-${group}-${tab}`, pinned: true, groupDisplay: 'stack',
  }))));
  const spaces = ['default', 'work'].map(id => ({ id, name: id, color: 'iris', folders: [], selectedAppId: `${id}-1-1` }));
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify(spaces))});sessionStorage.clear();undefined`);
  await main.reload();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    for (let index = 0; index < 200; index++) {
      if (await predicate()) return;
      await wait(10);
    }
    throw new Error('Space/group switching did not settle within two seconds');
  };
  await until(() => evaluate(main, `!!document.querySelector('[data-footer-space="work"]')`));
  const requests = [];
  const observe = (event, layout) => {
    if (event.sender === main.webContents && !layout.geometryOnly) requests.push(layout.focusedId);
  };
  ipcMain.on('browser-sync', observe);
  const mark = (event, command) => { if (event.sender === main.webContents && command.id === 'fixture-switch-marker') requests.length = 0; };
  ipcMain.on('browser-command', mark);
  const originals = new Map();
  const samples = [];
  const visible = id => main.contentView.children.find(view => view instanceof WebContentsView &&
    !view.webContents.isDestroyed() && view.getVisible() && view.webContents.getURL() === `${url}/${id}`);
  const click = async (expression, expected, measured = true) => {
    requests.length = 0;
    const started = performance.now();
    await evaluate(main, `window.electron.browser.command({id:'fixture-switch-marker',action:'reload'});${expression}.click();undefined`);
    try { await until(() => !!visible(expected)); } catch (error) {
      console.error({expected,requests,element:await evaluate(main,`${expression}.outerHTML`),views:main.contentView.children.filter(view=>view instanceof WebContentsView).map(view=>({url:view.webContents.getURL(),visible:view.getVisible()})),ui:await evaluate(main,`({active:document.querySelector('.horizontal-tab.active')?.getAttribute('data-tab-motion'),space:document.querySelector('[data-sidebar-page]')?.getAttribute('data-sidebar-page')})`)});
      throw error;
    }
    if (measured) samples.push(performance.now() - started);
    assert(requests.every(id => !id || id === expected), `Intermediate native focus: ${requests} instead of ${expected}`);
    const view = visible(expected);
    if (originals.has(expected)) assert.equal(view.webContents.id, originals.get(expected), 'Switching must retain the live page');
    else originals.set(expected, view.webContents.id);
  };
  const group = (space, number) => `document.querySelector('.sidebar-apps button.sidebar-app[aria-label="${space} group ${number}"]')`;
  const tab = id => `document.querySelector('[data-tab-motion="horizontal-main-${id}"] .horizontal-tab-select')`;
  try {
    // Warm each group and remember its second tab through actual UI actions.
    for (const space of ['default', 'work']) {
      if (space === 'work') await click(`document.querySelector('[data-footer-space="work"]')`, 'work-1-1', false);
      for (const number of [1, 2]) {
        await click(group(space, number), `${space}-${number}-1`, false);
        await click(tab(`${space}-${number}-2`), `${space}-${number}-2`, false);
      }
    }
    for (let index = 0; index < 10; index++) {
      for (const space of ['default', 'work']) {
        await click(`document.querySelector('[data-footer-space="${space}"]')`, `${space}-${index % 2 ? 1 : 2}-2`);
        await click(group(space, index % 2 ? 2 : 1), `${space}-${index % 2 ? 2 : 1}-2`);
      }
    }
    samples.sort((a, b) => a - b);
    const report = { switches: samples.length, medianMs: samples[Math.floor(samples.length / 2)],
      p95Ms: samples[Math.floor(samples.length * .95)], maxMs: samples.at(-1), retainedPages: originals.size,
      method: 'Production React renderer and real Electron WebContentsViews, UI click to matching visible native page; 10 ms observation interval; local warmed pages in a disposable profile.' };
    fs.writeFileSync(path.join(out, 'space-switching.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'space-switching.png'), (await main.capturePage()).toPNG());
    console.log('PASS: remembered space/group tabs, no intermediate wrong native focus, retained pages. ' + JSON.stringify(report));
  } finally {
    ipcMain.removeListener('browser-sync', observe);
    ipcMain.removeListener('browser-command', mark);
  }
};

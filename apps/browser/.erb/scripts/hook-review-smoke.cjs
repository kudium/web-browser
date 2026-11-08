/* eslint-disable no-await-in-loop, no-restricted-syntax, promise/catch-or-return */
// Review the shared trusted dialog in a disposable profile; no site script runs.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-hook-review-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: [path.resolve('src/main/dialogs.ts')],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'dialogs.cjs'),
});

const { showBrowserDialog } = require(path.join(root, 'dialogs.cjs'));
const out = path.resolve('docs/evidence/hook-notifications');
fs.mkdirSync(out, { recursive: true });
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
async function ready(owner) {
  for (let i = 0; i < 100; i += 1) {
    const modal = BrowserWindow.getAllWindows().find(
      (window) => window !== owner
    );
    if (modal && !modal.webContents.isLoading() && modal.isVisible())
      return modal;
    await wait(50);
  }
  throw new Error('Review dialog timeout');
}
(async () => {
  await app.whenReady();
  const owner = new BrowserWindow({ show: false });
  await owner.loadURL('data:text/html,review fixture');
  const options = {
    message: 'Set up these site hooks?',
    detail:
      'User request: Watch market changes and alert me on Telegram.\nWebsite: https://market.fixture.test\nGroup: Markets\n\nAllow this exact script to send alert text to api.telegram.org using saved Telegram webhook and chat ID fields. Credentials stay local. Permission lasts for this browser session.\n\nMonitoring runs only while the page is loaded. Setup sends no test message.',
    technicalDetailLabel: 'Review script',
    technicalDetail: `After load:\nconst price = document.querySelector("[data-market-price]");\n${'// fixture code\n'.repeat(
      2000
    )}\n</pre><script>window.injected=true</script>`,
    buttons: ['Cancel', 'Save and allow setup'],
    defaultId: 0,
    cancelId: 0,
  };
  for (const [theme, width, height] of [
    ['light', 440, 640],
    ['dark', 440, 640],
    ['dark', 400, 480],
  ]) {
    nativeTheme.themeSource = theme;
    const result = showBrowserDialog(owner, options);
    const modal = await ready(owner);
    modal.setContentSize(width, height);
    await wait(150);
    const wc = modal.webContents;
    fs.writeFileSync(
      path.join(out, `review-${theme}-${width}-closed.png`),
      (await wc.capturePage()).toPNG()
    );
    await wc.executeJavaScript('document.querySelector("details").open=true');
    await wait(100);
    const layout = await wc.executeJavaScript(
      `(()=>{const pre=document.querySelector('pre'),footer=document.querySelector('footer').getBoundingClientRect();return {scroll:pre.scrollHeight>pre.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth,footer:footer.bottom,injected:window.injected===true,focused:document.activeElement.id}})()`
    );
    assert(layout.scroll, 'long source scrolls');
    assert(!layout.overflow, 'no horizontal overflow');
    assert(layout.footer <= height + 1, 'review actions remain visible');
    assert(!layout.injected, 'source is text, never executed');
    assert.equal(layout.focused, 'cancel', 'default focus is safe');
    fs.writeFileSync(
      path.join(out, `review-${theme}-${width}-open.png`),
      (await wc.capturePage()).toPNG()
    );
    await wc
      .executeJavaScript('document.getElementById("confirm").click()')
      .catch((error) => {
        if (!modal.isDestroyed()) throw error;
      });
    assert.equal((await result).response, 1);
  }
  const controller = new AbortController();
  const cancelled = showBrowserDialog(owner, {
    ...options,
    signal: controller.signal,
  });
  const modal = await ready(owner);
  controller.abort();
  assert.equal((await cancelled).response, 0);
  assert(modal.isDestroyed(), 'Stop cancels review');
  owner.destroy();
  console.log(
    'Shared hook review passed: light/dark, compact layout, long code disclosure/scroll, escaped source, safe initial focus, approval and cancellation.'
  );
  app.exit(0);
})()
  .catch((error) => {
    console.error(error);
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));

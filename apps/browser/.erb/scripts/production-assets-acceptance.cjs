const { BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

module.exports = async ({ main, evaluate, runtimeDir, out, url }) => {
  const renderer = path.resolve(
    process.env.KUDIUMBROWSER_SMOKE_RENDERER || 'release/app/dist/renderer',
  );
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const runtime = fs.readFileSync(path.join(renderer, 'renderer.js'), 'utf8');
  const scripts = fs
    .readdirSync(renderer)
    .filter((name) => name.endsWith('.js'));
  const assets = scripts.map((name) => {
    const hash =
      'sha256-' +
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(renderer, name)))
        .digest('base64');
    assert(
      html.includes(`'${hash}'`),
      `${name} must have its exact hash in CSP`,
    );
    assert(
      name === 'renderer.js' || runtime.includes(hash),
      `${name} must have runtime integrity metadata`,
    );
    return { name, hash, policy: true, integrity: true };
  });
  const print = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });
  let bytes;
  try {
    await print.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>h1{color:black}section{break-after:page}</style><section><h1>Production PDF fixture page one</h1></section><h1>Production PDF fixture page two</h1>',
        ),
    );
    bytes = await print.webContents.printToPDF({ printBackground: true });
  } finally {
    print.destroy();
  }
  ipcMain.removeHandler('site-developer-project');
  ipcMain.removeHandler('site-developer-files');
  ipcMain.handle('site-developer-project', () => ({
    name: 'Fixture project',
    path: runtimeDir,
    available: true,
  }));
  ipcMain.handle('site-developer-files', (_event, _id, request) =>
    request.action === 'preview'
      ? {
          path: 'fixture.pdf',
          file: {
            name: 'fixture.pdf',
            path: 'fixture.pdf',
            size: bytes.length,
            media: {
              type: 'application/pdf',
              url: 'data:application/pdf;base64,' + bytes.toString('base64'),
            },
          },
        }
      : {
          path: '',
          entries: [{ name: 'fixture.pdf', path: 'fixture.pdf', kind: 'file' }],
        },
  );
  const tab = {
    id: 'asset-fixture',
    name: 'Asset fixture',
    sessionName: 'Fixture project',
    url,
    sessionId: 'asset-fixture',
    spaceId: 'default',
    icon: '',
  };
  await evaluate(
    main,
    `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify([tab]))});localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{ id: 'default', name: 'Personal', color: 'iris', folders: [], selectedAppId: tab.id }]))});localStorage.setItem('kudiumbrowser.developer.views',JSON.stringify({'asset-fixture':'files'}));localStorage.setItem(${JSON.stringify('kudiumbrowser-file-position:asset-fixture:' + runtimeDir)},JSON.stringify({folder:'',openFile:'fixture.pdf'}));undefined`,
  );
  await main.reload();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let index = 0; index < 100; index++) {
      if (await evaluate(main, expression)) return;
      await wait(100);
    }
    throw new Error(
      'Production asset check timed out: ' +
        expression +
        '; ' +
        (await evaluate(main, `document.body.innerText`)),
    );
  };
  await until(
    `!!document.querySelector('[aria-label^="Toggle Chat sidebar"]')`,
  );
  await evaluate(
    main,
    `window.assetViolations=[];document.addEventListener('securitypolicyviolation',event=>window.assetViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));document.querySelector('[aria-label^="Toggle Chat sidebar"]').click();undefined`,
  );
  await wait(300);
  await evaluate(
    main,
    `localStorage.setItem('kudiumbrowser-ai-page-pane',JSON.stringify('developer'));window.dispatchEvent(new CustomEvent('ai-page-preference-changed',{detail:'kudiumbrowser-ai-page-pane'}));undefined`,
  );
  await until(
    `!!document.querySelector('[aria-label="Files"]:not([disabled])')`,
  );
  await evaluate(
    main,
    `document.querySelector('[aria-label="Files"]').click();undefined`,
  );
  await until(
    `!!document.querySelector('.developer-preview-controls') && document.querySelector('.developer-preview-controls').textContent.includes('1 / 2')`,
  );
  await until(
    `(()=>{const canvas=document.querySelector('[aria-label="PDF page 1"]');if(!canvas?.width)return false;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i]<100&&data[i+1]<100&&data[i+2]<100)count++;return count>50})()`,
  );
  const pixels = await evaluate(
    main,
    `(()=>{const canvas=document.querySelector('[aria-label="PDF page 1"]');if(!canvas?.width)return 0;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i]<100&&data[i+1]<100&&data[i+2]<100)count++;return count})()`,
  );
  assert(pixels > 50, 'PDF preview must draw real text pixels');
  const originalWidth = await evaluate(
    main,
    `document.querySelector('[aria-label="PDF page 1"]').style.width`,
  );
  await evaluate(
    main,
    `[...document.querySelectorAll('.developer-preview-controls button')].find(button=>button.textContent==='Next').click();undefined`,
  );
  await until(
    `document.querySelector('.developer-preview-controls').textContent.includes('2 / 2')`,
  );
  await evaluate(
    main,
    `document.querySelector('.developer-preview-controls [aria-label="Zoom in"]').click();undefined`,
  );
  await until(
    `document.querySelector('.developer-preview-controls').textContent.includes('125%')`,
  );
  await until(
    `parseFloat(document.querySelector('[aria-label="PDF page 2"]').style.width)>parseFloat(${JSON.stringify(originalWidth)})`,
  );
  const violations = await evaluate(main, 'window.assetViolations');
  assert.deepEqual(
    violations,
    [],
    'PDF preview must work without policy violations',
  );
  fs.writeFileSync(
    path.join(out, 'production-assets.png'),
    (await main.capturePage()).toPNG(),
  );
  fs.writeFileSync(
    path.join(out, 'production-assets-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
        },
        assets,
        checks: [
          'Every emitted script has matching policy hash and integrity metadata',
          'Production PDF preview parses a real two-page PDF',
          'Canvas draws real text pixels',
          'Page navigation and zoom work without CSP violations',
        ],
        pixels,
        violations,
        limitations: [
          'Synthetic local files and IPC; does not certify every PDF font, image codec or document format.',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: all production script hashes and actual PDF preview, page navigation and zoom',
  );
};

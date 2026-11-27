// Native offline translation regression. First run downloads only Spanish ->
// English model files; all subsequent translation checks block network access.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { copyTranslationEngine } = require('./copy-translation-engine.cjs');
const directory =
  process.env.KUDIUM_TRANSLATION_TEST_DIRECTORY ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-page-translation-'));
app.setPath('userData', path.join(directory, 'profile'));
const cache =
  process.env.KUDIUM_TRANSLATION_TEST_CACHE ||
  path.join(directory, 'profile/translation-models');
fs.mkdirSync(path.join(directory, 'profile/translation-models'), {
  recursive: true,
});
if (process.env.KUDIUM_TRANSLATION_TEST_CACHE && fs.existsSync(cache))
  fs.cpSync(cache, path.join(directory, 'profile/translation-models'), {
    recursive: true,
  });
let online = true,
  downloads = 0;
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  assert(
    String(url).startsWith(
      'https://storage.googleapis.com/bergamot-models-sandbox/0.3.3/',
    ),
    'Only model downloads may use the network',
  );
  assert(
    online,
    'Translation tried to use the network after packs were cached',
  );
  assert(!options?.body, 'Page text must not be sent over the network');
  downloads++;
  return originalFetch(url, options);
};
const wait = async (predicate) => {
  const end = Date.now() + 180000;
  while (!(await predicate())) {
    if (Date.now() > end) throw new Error('Translation check timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};
let server, window;
(async () => {
  await build({
    entryPoints: ['src/main/pageTranslation.ts'],
    bundle: true,
    platform: 'node',
    external: ['electron'],
    outfile: path.join(directory, 'host.cjs'),
    plugins: [
      {
        name: 'fixture-preferences',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/preferences$/ }, (args) =>
            args.importer.endsWith('/pageTranslation.ts')
              ? { path: 'preferences', namespace: 'fixture' }
              : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents:
              'let prefs={pageTranslation:{target:"en",always:{},never:[]}};exports.getBrowserPreferences=()=>prefs;exports.updateBrowserPreferences=p=>{prefs={...prefs,...p}};',
            loader: 'js',
          }));
        },
      },
    ],
  });
  await build({
    entryPoints: ['src/main/offlineTranslation.ts'],
    bundle: true,
    platform: 'node',
    outfile: path.join(directory, 'engine.cjs'),
  });
  await build({
    entryPoints: ['src/browser/pageTranslation.ts'],
    bundle: true,
    platform: 'node',
    outfile: path.join(directory, 'runtime.cjs'),
  });
  copyTranslationEngine(directory);
  const { installPageTranslation } = require(
    path.join(directory, 'runtime.cjs'),
  );
  const preload = path.join(directory, 'preload.cjs');
  fs.writeFileSync(
    preload,
    `(${installPageTranslation.toString()})(require('electron').ipcRenderer);`,
  );
  await app.whenReady();
  server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      '<html lang="es"><body><h1>Hola mundo</h1><p>Esta página se traduce sin enviar datos a un servidor.</p><a href="/original">Abrir enlace</a><input value="Private input"><textarea>Private textarea</textarea><div contenteditable="true">Private editor</div><pre>Code</pre><span translate="no">Brand</span></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  window = new BrowserWindow({
    show: false,
    width: 900,
    height: 650,
    webPreferences: { sandbox: true, contextIsolation: true, preload },
  });
  const contents = window.webContents;
  const {
    registerTranslationPage,
    translationAction,
    translationMenu,
    pageTranslationState,
  } = require(path.join(directory, 'host.cjs'));
  const notices = [];
    registerTranslationPage(contents, () => true, () => {}, (title, message, type) => notices.push({title, message, type}));
  await contents.loadURL(`http://127.0.0.1:${server.address().port}/`);
  console.log('Checking language detection…');
  await wait(() => pageTranslationState(contents)?.needed);
  assert.match(translationMenu(contents).label, /Translate to English/);
  console.log('Checking local translation…');
  translationMenu(contents).click();
  assert.equal(notices.at(-1).title, 'Translating page…');
  assert.equal(pageTranslationState(contents).translating, true);
  await wait(
    () =>
      pageTranslationState(contents)?.translated &&
      !pageTranslationState(contents)?.translating,
  );
  assert(notices.some(item => item.type === 'success'));
    const values = await contents.executeJavaScript(
    `({title:document.querySelector('h1').textContent,input:document.querySelector('input').value,textarea:document.querySelector('textarea').value,editable:document.querySelector('[contenteditable]').textContent,href:document.querySelector('a').getAttribute('href'),overlay:!!document.querySelector('[data-kudium-translation]')})`,
  );
  assert.equal(values.title, 'Hello world');
  assert.equal(values.input, 'Private input');
  assert.equal(values.textarea, 'Private textarea');
  assert.equal(values.editable, 'Private editor');
  assert.equal(values.href, '/original');
  assert.equal(values.overlay, false);
  online = false;
  await contents.executeJavaScript(
    `document.body.insertAdjacentHTML('beforeend','<p id="added">Buenos días</p>')`,
  );
  await wait(
    async () =>
      !['Buenos días', ''].includes(
        await contents.executeJavaScript(
          `document.querySelector('#added').textContent`,
        ),
      ),
  );
  assert.equal(translationMenu(contents).label, 'Show original language');
  translationMenu(contents).click();
  await wait(() => !pageTranslationState(contents)?.translated);
  assert.equal(
    await contents.executeJavaScript(
      `document.querySelector('h1').textContent`,
    ),
    'Hola mundo',
  );
  translationAction(contents, 'page-translation-target', 'fr');
  assert.equal(pageTranslationState(contents).targetName, 'French');
  translationAction(contents, 'page-translation-target', 'en');
  translationAction(contents, 'page-translation-target', 'ja');
  assert.equal(pageTranslationState(contents).targetName, 'English');
  const { OfflinePageTranslator } = require(path.join(directory, 'engine.cjs'));
  const fresh = new OfflinePageTranslator(
    path.join(directory, 'profile/translation-models'),
    path.join(directory, 'translation-engine/translator-worker.cjs'),
    async () => {
      throw new Error('Offline model cache tried to download');
    },
  );
  try {
    const result = await fresh.translate(
      { source: 'es', target: 'en', texts: ['Hola mundo'] },
      AbortSignal.timeout(30000),
    );
    assert.equal(result.texts[0], 'Hello world');
  } finally {
    fresh.dispose();
  }
  translationMenu(contents).click();
  await contents.loadURL(`http://127.0.0.1:${server.address().port}/next`);
  await wait(() => pageTranslationState(contents)?.needed);
  assert.equal(
    await contents.executeJavaScript(
      `document.querySelector('h1').textContent`,
    ),
    'Hola mundo',
  );
  if (process.env.KUDIUM_TRANSLATION_TEST_CACHE) {
    fs.mkdirSync(cache, { recursive: true });
    fs.cpSync(path.join(directory, 'profile/translation-models'), cache, {
      recursive: true,
    });
  }
  console.log(
    `PASS native sandboxed page: direct context action, local WASM translation, restored originals, dynamic text, untouched private inputs and links, no page overlay, navigation cancellation, fresh worker with cached packs and network blocked (${downloads} model downloads).`,
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    window?.destroy();
    server?.close();
    app.exit(process.exitCode || 0);
  });

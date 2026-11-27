const fs = require('node:fs');
const path = require('node:path');
function copyTranslationEngine(destination) {
  const output = path.join(destination, 'translation-engine');
  fs.mkdirSync(output, { recursive: true });
  for (const name of ['translation-LICENSE.txt', 'translation-NOTICES.md'])
    fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
  const bergamot = path.dirname(
    require.resolve('@browsermt/bergamot-translator'),
  );
  // Upstream's Node worker uses CommonJS inside an ESM package. Its glue also
  // uses global importScripts, so supply the Node globals in the CJS entry.
  fs.writeFileSync(
    path.join(output, 'translator-worker.cjs'),
    'global.require = require; global.__dirname = __dirname; global.__filename = __filename;\n' +
      fs.readFileSync(
        path.join(bergamot, 'worker/translator-worker.js'),
        'utf8',
      ),
  );
  for (const file of [
    'bergamot-translator-worker.js',
    'bergamot-translator-worker.wasm',
  ])
    fs.copyFileSync(
      path.join(bergamot, 'worker', file),
      path.join(output, file),
    );
}
module.exports = { copyTranslationEngine };

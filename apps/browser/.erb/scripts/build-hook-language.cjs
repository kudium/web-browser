const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const destination = path.join(root, 'assets/hook-language');
fs.mkdirSync(destination, { recursive: true });
const compiler = path.dirname(require.resolve('typescript'));
for (const file of fs.readdirSync(compiler)) {
  if (file === 'typescript.js' || /^lib\..*\.d\.ts$/.test(file)) {
    fs.copyFileSync(path.join(compiler, file), path.join(destination, file));
  }
}
fs.copyFileSync(path.join(compiler, '../LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
fs.copyFileSync(path.join(root, 'src/main/hookLanguageWorker.cjs'), path.join(destination, 'worker.cjs'));
fs.copyFileSync(path.join(root, '.erb/resources/hook-api.txt'), path.join(destination, 'hook-api.d.ts'));

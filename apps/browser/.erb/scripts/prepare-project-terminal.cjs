const fs = require('fs');
const path = require('path');
function prepareProjectTerminal() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const directory of ['build/Release', 'prebuilds/darwin-arm64', 'prebuilds/darwin-x64']) {
      const helper = path.join(root, tree, 'node-pty', directory, 'spawn-helper');
      if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
    }
  }
}
module.exports = { prepareProjectTerminal };
if (require.main === module) prepareProjectTerminal();

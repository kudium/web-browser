/* eslint-disable */
// Compatibility fix for electron-chrome-extensions 4.10.0. Keep it reproducible
// across installs and both the development and packaged dependency trees.
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// KudiumBrowser: native framing v2')) return source;
  const alreadyPatched = source.includes(
    '// KudiumBrowser: handle native host pipe disconnects'
  );
  const launch = '    this.process.stdout.on("data", this.receive);';
  const write = '    this.process.stdin.write(buffer);';
  if (
    !source.includes(launch) ||
    (!alreadyPatched && !source.includes(write))
  ) {
    throw new Error(
      'Native messaging compatibility patch needs review for this dependency version'
    );
  }
  if (!alreadyPatched)
    source = source
      .replace(
        launch,
        `    // KudiumBrowser: handle native host pipe disconnects
    this.process.stdin.on("error", (error) => {
      d7("native host input disconnected: %s", error);
      this.destroy();
    });
${launch}`
      )
      .replace(
        write,
        `    const input = this.process?.stdin;
    if (!input || input.destroyed || !input.writable) {
      this.destroy();
      return;
    }
    try {
      input.write(buffer, (error) => {
        if (error) this.destroy();
      });
    } catch (error) {
      d7("native host write failed: %s", error);
      this.destroy();
    }`
      );
  const receiveStart = source.indexOf('    this.receive = (data) => {');
  const receiveEnd = source.indexOf(
    '    this.keepAlive = keepAlive;',
    receiveStart
  );
  if (receiveStart < 0 || receiveEnd < 0)
    throw new Error('Native receive patch requires review');
  source =
    source.slice(0, receiveStart) +
    `    // KudiumBrowser: native framing v2
    this.incoming = Buffer.alloc(0);
    this.receive = (data) => {
      if (!this.connected) return;
      this.incoming = Buffer.concat([this.incoming, data]);
      while (this.incoming.length >= 4) {
        const length = this.incoming.readUInt32LE(0);
        if (!length || length > 1024 * 1024) { this.destroy(); return; }
        if (this.incoming.length < 4 + length) return;
        let message;
        try { message = JSON.parse(this.incoming.subarray(4, 4 + length).toString('utf8')); }
        catch { this.destroy(); return; }
        this.incoming = this.incoming.subarray(4 + length);
        if (this.keepAlive && this.sender) {
          this.sender.send(\`crx-native-msg-\${this.connectionId}\`, message);
        } else { this.resolveResponse?.(message); }
      }
    };
` +
    source.slice(receiveEnd);
  source = source
    .replace(
      '    d7("send", json);',
      '    // Native payloads must never be logged.'
    )
    .replace(
      '      d7("stderr: %s", data.toString());',
      '      // Native host stderr can contain credential payloads.'
    )
    .replace(
      '    const message = JSON.stringify(json);\n    const buffer = Buffer.alloc(4 + message.length);\n    buffer.writeUInt32LE(message.length, 0);\n    buffer.write(message, 4);',
      `    let message;
    try { message = Buffer.from(JSON.stringify(json), 'utf8'); }
    catch { this.destroy(); return; }
    if (message.length > 64 * 1024 * 1024) { this.destroy(); return; }
    const buffer = Buffer.alloc(4 + message.length);
    buffer.writeUInt32LE(message.length, 0);
    message.copy(buffer, 4);`
    );
  return source;
}
function patchInstalled() {
  require('./patch-extension-side-panel.cjs').patchInstalled();
  require('./patch-extension-browser-apis.cjs').patchInstalled();
  require('./patch-deepmerge.cjs').patchInstalled();
  require('./prepare-project-terminal.cjs').prepareProjectTerminal();
  require('./patch-extension-actions.cjs').patchInstalled();
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of ['dist/cjs/index.js', 'dist/esm/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file))
        fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
  }
  require('./patch-native-boundaries.cjs').patchInstalled();
  require('./patch-native-host-errors.cjs').patchInstalled();
  require('./patch-extension-transport.cjs').patchInstalled();
  require('./patch-extension-updates.cjs').patchInstalled();
  require('./patch-extension-router.cjs').patchInstalled();
  require('./patch-extension-webextension-alias.cjs').patchInstalled();
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

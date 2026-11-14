// Preserve bounded failure reasons without exposing host paths or payloads.
const fs = require('fs');
const path = require('path');
function patchSource(source) {
  if (source.includes('// Kudium: native host failure reasons v1'))
    return source;
  const replace = (before, after) => {
    if (!source.includes(before))
      throw new Error(
        'Native host failure patch needs dependency review: ' +
          before.slice(0, 80)
      );
    source = source.replace(before, after);
  };
  replace(
    '  destroy() {\n    if (this.closed) return;\n    this.closed = true;',
    `  // Kudium: native host failure reasons v1
  destroy(reason = "Native host disconnected") {
    if (this.closed) return;
    this.disconnectError = reason;
    this.closed = true;`
  );
  replace(
    '    this.rejectResponse?.(new Error("Native host disconnected"));',
    '    this.rejectResponse?.(new Error(this.disconnectError));'
  );
  replace(
    '      this.sender.send(`crx-native-msg-${this.connectionId}-disconnect`);',
    `      if (!this.sender.isDestroyed?.()) {
        try { this.sender.send(\`crx-native-msg-\${this.connectionId}-disconnect\`, { message: this.disconnectError }); }
        catch { /* The requesting renderer may have already gone away. */ }
      }`
  );
  replace(
    '      d7("launch: unable to find %s for %s", application, extensionId);\n      this.destroy();',
    '      this.destroy("Specified native messaging host not found");'
  );
  replace(
    '      d7("launch: %s not in allowed origins", extensionId);\n      this.destroy();',
    '      this.destroy("Access to the native messaging host is forbidden");'
  );
  replace(
    '    if (!isFile) {\n      this.destroy();',
    '    if (!isFile) {\n      this.destroy("Native messaging host executable not found");'
  );
  replace(
    `    this.process.on("error", (err) => {
      d7("error: %s", err);
      this.destroy();
    });
    this.process.on("exit", (code) => {
      d7("exited %d", code);
      this.destroy();
    });
    this.connected = true;`,
    `    const child = this.process;
    await new Promise(resolve => {
      child.once("spawn", resolve);
      child.once("error", () => { this.destroy("Failed to start native messaging host"); resolve(); });
      // close follows stdout delivery, including a final response before exit.
      child.once("close", (code, signal) => {
        const reason = signal ? "Native messaging host terminated by signal" :
          code === 0 ? "Native messaging host exited" : "Native messaging host exited with an error";
        this.destroy(reason);
        resolve();
      });
    });
    if (this.closed || !this.authority()) { this.destroy(); return; }
    this.connected = true;`
  );
  source = source.replaceAll(
    'if (!host.connected) throw new Error("Native host unavailable");',
    'if (!host.connected) throw new Error(host.disconnectError || "Native host unavailable");'
  );
  source = source.replaceAll(
    'const timer = setTimeout(() => host.destroy(), 30000);',
    'const timer = setTimeout(() => host.destroy("Native messaging host timed out"), 30000);'
  );
  replace(
    'if (!length || length > 1024 * 1024) { this.destroy(); return; }',
    'if (!length || length > 1024 * 1024) { this.destroy("Invalid native messaging response length"); return; }'
  );
  replace(
    'catch { this.destroy(); return; }\n        this.incoming =',
    'catch { this.destroy("Invalid native messaging response JSON"); return; }\n        this.incoming ='
  );
  return source;
}
function patchInstalled() {
  const root = path.resolve(__dirname, '../..');
  for (const tree of ['node_modules', 'release/app/node_modules']) {
    for (const entry of ['dist/cjs/index.js', 'dist/esm/index.mjs']) {
      const file = path.join(root, tree, 'electron-chrome-extensions', entry);
      if (fs.existsSync(file))
        fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
    }
  }
}
module.exports = { patchSource, patchInstalled };
if (require.main === module) patchInstalled();

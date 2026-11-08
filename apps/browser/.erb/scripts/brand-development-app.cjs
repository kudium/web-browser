/* Give the macOS Electron development host the same public identity as builds. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
if (process.platform === 'darwin') {
  const binary = require('electron');
  const contents = path.resolve(path.dirname(binary), '..');
  const plist = path.join(contents, 'Info.plist');
  const buddy = '/usr/libexec/PlistBuddy';
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    try {
      execFileSync(buddy, ['-c', `Set :${key} Kudium Browser`, plist]);
    } catch {
      execFileSync(buddy, ['-c', `Add :${key} string Kudium Browser`, plist]);
    }
  }
  const icon = execFileSync(buddy, ['-c', 'Print :CFBundleIconFile', plist], {
    encoding: 'utf8',
  }).trim();
  fs.copyFileSync(
    path.resolve(__dirname, '../../assets/icon.icns'),
    path.join(
      contents,
      'Resources',
      icon.endsWith('.icns') ? icon : `${icon}.icns`
    )
  );
}

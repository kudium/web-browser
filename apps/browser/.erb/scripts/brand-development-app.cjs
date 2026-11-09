/* Run macOS development builds from a named app bundle, not Electron.app. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const productName = 'Kudium Browser';
const bundle = path.resolve(__dirname, '../dll', `${productName}.app`);

function developmentElectronPath() {
  return process.platform === 'darwin'
    ? path.join(bundle, 'Contents', 'MacOS', path.basename(require('electron')))
    : require('electron');
}

function prepareDevelopmentApp() {
  if (process.platform !== 'darwin') return;
  const binary = require('electron');
  const original = path.resolve(path.dirname(binary), '../..');
  // This generated copy is Git-ignored; npm's Electron installation stays intact.
  fs.mkdirSync(path.dirname(bundle), { recursive: true });
  fs.rmSync(bundle, { recursive: true, force: true });
  execFileSync('/bin/cp', ['-cR', original, bundle]);
  const contents = path.join(bundle, 'Contents');
  const plist = path.join(contents, 'Info.plist');
  const buddy = '/usr/libexec/PlistBuddy';
  const executable = execFileSync(buddy, ['-c', 'Print :CFBundleExecutable', plist], {
    encoding: 'utf8',
  }).trim();
  // Electron detects development mode from its executable name. Renaming it
  // makes app.isPackaged true and selects packaged assets and update behavior.
  for (const [key, value] of [
    ['CFBundleName', productName],
    ['CFBundleDisplayName', productName],
    ['CFBundleExecutable', executable],
    ['CFBundleIdentifier', 'com.kudium.kudiumbrowser.development'],
  ]) {
    try {
      execFileSync(buddy, ['-c', `Set :${key} ${value}`, plist]);
    } catch {
      execFileSync(buddy, ['-c', `Add :${key} string ${value}`, plist]);
    }
  }
  const icon = execFileSync(buddy, ['-c', 'Print :CFBundleIconFile', plist], {
    encoding: 'utf8',
  }).trim();
  fs.copyFileSync(
    path.resolve(__dirname, '../../assets/icon.icns'),
    path.join(contents, 'Resources', icon.endsWith('.icns') ? icon : `${icon}.icns`)
  );
  // Keep Electron's JIT entitlements and helper signatures in the local bundle.
  execFileSync('/usr/bin/codesign', [
    '--force', '--sign', '-', '--preserve-metadata=entitlements,flags,runtime', bundle,
  ]);
  execFileSync(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', bundle]
  );
}

module.exports = { developmentElectronPath, prepareDevelopmentApp };
if (require.main === module) prepareDevelopmentApp();

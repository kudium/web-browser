/** Read-only check of the packaged app's Apple capabilities; no credential access. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
if (process.platform !== 'darwin' || !process.argv[2]) {
  console.error('Usage on macOS: node check-apple-capabilities.cjs /path/to/Kudium.app');
  process.exit(2);
}
const bundle = path.resolve(process.argv[2]);
if (!fs.statSync(bundle).isDirectory() || !bundle.endsWith('.app')) {
  console.error('Choose a packaged .app bundle.');
  process.exit(2);
}
const inspect = spawnSync('codesign', ['-d', '--entitlements', ':-', bundle], { encoding: 'utf8' });
if (inspect.status !== 0) {
  console.error('Unable to inspect this app signature.');
  process.exit(1);
}
const parsed = spawnSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: inspect.stdout, encoding: 'utf8' });
if (parsed.status !== 0) {
  console.error('The app has no readable signing entitlements.');
  process.exit(1);
}
const entitlements = JSON.parse(parsed.stdout);
const containers = entitlements['com.apple.developer.icloud-container-identifiers'];
const services = entitlements['com.apple.developer.icloud-services'];
const cloudKit = Array.isArray(containers) && containers.length > 0 && Array.isArray(services) && services.includes('CloudKit');
const passwords = entitlements['com.apple.developer.web-browser.public-key-credential'] === true;
const signed = spawnSync('codesign', ['--verify', '--deep', '--strict', bundle], { encoding: 'utf8' }).status === 0;
console.log(JSON.stringify({ signatureValid: signed, cloudKitConfigured: cloudKit, browserCredentialEntitlement: passwords, provisioningProfilePresent: fs.existsSync(path.join(bundle, 'Contents', 'embedded.provisionprofile')), note: 'Signing configuration only; Apple approval and real two-Mac acceptance still require verification.' }, null, 2));
process.exitCode = signed && cloudKit && passwords ? 0 : 1;

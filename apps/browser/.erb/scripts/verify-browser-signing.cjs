// Verify an approved packaged build without exposing the provisioning profile.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const bundle = process.argv[2];
if (
  !bundle ||
  !fs.existsSync(path.join(bundle, 'Contents/embedded.provisionprofile'))
) {
  throw new Error(
    'Supply a TouchBox.app containing the approved provisioning profile'
  );
}
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], {
  stdio: 'inherit',
});
const xml = execFileSync(
  '/usr/bin/codesign',
  ['-d', '--entitlements', ':-', bundle],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
);
const entitlements = JSON.parse(
  execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: xml,
    encoding: 'utf8',
  })
);
if (
  entitlements['com.apple.application-identifier'] !==
    '79VCL28M9P.com.kudium.touchbox' ||
  entitlements['com.apple.developer.team-identifier'] !== '79VCL28M9P' ||
  entitlements['com.apple.developer.web-browser.public-key-credential'] !== true
) {
  throw new Error(
    'Main executable lacks the expected Kudium browser capability'
  );
}
console.log(
  'Signature and main executable capability verified. Native passkey and helper tests are still required.'
);

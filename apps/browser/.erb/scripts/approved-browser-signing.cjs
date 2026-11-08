// Opt-in electron-builder override. Use only after Apple's capability grant.
// The provisioning profile must authorize the managed browser entitlement.
const fs = require('fs');
const profile = process.env.KUDIUMBROWSER_BROWSER_PROVISIONING_PROFILE;
if (!profile || !fs.existsSync(profile)) {
  throw new Error(
    'Set KUDIUMBROWSER_BROWSER_PROVISIONING_PROFILE to the approved Kudium provisioning profile'
  );
}
module.exports = {
  mac: {
    entitlements: 'assets/entitlements.browser.mac.plist',
    entitlementsInherit: 'assets/entitlements.mac.plist',
    provisioningProfile: profile,
  },
};

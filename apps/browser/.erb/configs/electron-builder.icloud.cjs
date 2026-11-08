/** Explicit provisioned CloudKit integration package; ordinary releases do not use it. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
if (process.env.RELEASE_SIGNING_REQUIRED !== 'true') throw new Error('Require signed/notarized packaging for iCloud integration.');
const base = require('./electron-builder.web.cjs');
if (process.platform !== 'darwin' || process.env.KUDIUM_ICLOUD_INTEGRATION !== 'true')
  throw new Error('Use an explicit macOS iCloud integration build.');
const profile = process.env.KUDIUM_ICLOUD_PROFILE;
if (!profile || !fs.existsSync(profile)) throw new Error('Supply the Kudium CloudKit provisioning profile.');
const decoded = spawnSync('security', ['cms', '-D', '-i', path.resolve(profile)], { encoding: 'utf8' });
const json = spawnSync('plutil', ['-convert', 'json', '-o', '-', '-'], { encoding: 'utf8', input: decoded.stdout });
if (decoded.status !== 0 || json.status !== 0) throw new Error('Cannot verify the iCloud provisioning profile.');
const info = JSON.parse(json.stdout);
const entitlements = info.Entitlements || {};
const containers = entitlements['com.apple.developer.icloud-container-identifiers'];
const services = entitlements['com.apple.developer.icloud-services'];
const environment = entitlements['com.apple.developer.icloud-container-environment'];
const expiresAt = new Date(info.ExpirationDate).getTime();
const identifier = entitlements['com.apple.application-identifier'] || entitlements['application-identifier'];
if (identifier !== '79VCL28M9P.com.kudium.kudiumbrowser' ||
    !Array.isArray(containers) || !containers.includes('iCloud.com.kudium.kudiumbrowser') ||
    !Array.isArray(services) || !services.includes('CloudKit') ||
    !(environment === 'Production' || (Array.isArray(environment) && environment.includes('Production'))) ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now())
  throw new Error('The profile does not authorize the production Kudium CloudKit container.');
if (!fs.existsSync(path.resolve('assets/native/kudium-cloudkit-bridge.node')))
  throw new Error('Build the universal CloudKit native module before packaging.');
module.exports = { ...base, forceCodeSigning: true,
  mac: { ...base.mac, identity: 'Developer ID Application: Kudium LTD (79VCL28M9P)', provisioningProfile: path.resolve(profile),
    entitlements: 'assets/entitlements.mac.icloud.plist', entitlementsInherit: 'assets/entitlements.mac.plist' } };

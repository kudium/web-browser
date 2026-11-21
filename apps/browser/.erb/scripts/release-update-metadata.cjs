const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

function updateMetadata(platform, arch, channel) {
  if (!['darwin', 'win32', 'linux'].includes(platform) ||
      !['arm64', 'x64'].includes(arch) ||
      !['stable', 'beta'].includes(channel)) {
    throw new Error('Invalid release update target');
  }
  return {
    provider: 'generic',
    url: `https://browser.kudium.com/updates/${channel}/${platform}/${arch}`,
    channel: channel === 'stable' ? 'latest' : 'beta',
    useMultipleRangeRequest: false,
    updaterCacheDirName: 'kudium-browser-updater',
  };
}

function verifyUpdateMetadata(resources, platform, arch, channel) {
  const actual = yaml.load(fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8'));
  const expected = updateMetadata(platform, arch, channel);
  for (const key of ['provider', 'url', 'channel', 'useMultipleRangeRequest']) {
    if (actual?.[key] !== expected[key]) {
      throw new Error(`Invalid packaged update metadata: ${key}`);
    }
  }
}

exports.updateMetadata = updateMetadata;
exports.verifyUpdateMetadata = verifyUpdateMetadata;
exports.default = async (context) => {
  await require('./check-packaged-dependencies.cjs').default(context);
  // --dir skips Electron Builder's updater file generation. Write it before
  // signing; the notarized app is reused unchanged for ZIP/DMG packaging.
  if (process.env.RELEASE_SIGNING_REQUIRED !== 'true') return;
  const platform = context.electronPlatformName;
  const arch = require('builder-util').Arch[context.arch];
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const channel = process.env.RELEASE_CHANNEL || 'stable';
  fs.writeFileSync(path.join(resources, 'app-update.yml'), yaml.dump(updateMetadata(platform, arch, channel)));
  verifyUpdateMetadata(resources, platform, arch, channel);
};

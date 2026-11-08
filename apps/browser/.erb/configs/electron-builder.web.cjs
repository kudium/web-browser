/** Explicit web-service release build; ordinary builds retain the GitHub feed. */
const { build } = require('../../package.json');
const origin = 'https://browser.kudium.com';
const releaseChannel = process.env.RELEASE_CHANNEL || 'stable';
if (!['stable', 'beta'].includes(releaseChannel))
  throw new Error('Invalid RELEASE_CHANNEL');
const signed = process.env.RELEASE_SIGNING_REQUIRED === 'true';
const publishFor = (platform) => ({
  provider: 'generic',
  url: `${origin}/updates/${releaseChannel}/${platform}/\${arch}`,
  channel: releaseChannel === 'stable' ? 'latest' : 'beta',
  useMultipleRangeRequest: false,
});
module.exports = {
  ...build,
  publish: null,
  artifactName: 'Kudium-Browser-${version}-${arch}.${ext}',
  forceCodeSigning: signed,
  afterSign: signed ? build.afterSign : null,
  mac: { ...build.mac, target: ['dmg', 'zip'], publish: publishFor('darwin') },
  win: { ...build.win, publish: publishFor('win32') },
  linux: { ...build.linux, publish: publishFor('linux') },
};

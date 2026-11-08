/** Explicit web-service release build; ordinary builds retain the GitHub feed. */
const { build } = require('../../package.json');
const origin = 'https://webbrowser.kudium.com';
const publishFor = (platform) => ({
  provider: 'generic',
  url: `${origin}/updates/stable/${platform}/\${arch}`,
  channel: 'latest',
  useMultipleRangeRequest: false,
});
module.exports = {
  ...build,
  publish: null,
  mac: { ...build.mac, publish: publishFor('darwin') },
  win: { ...build.win, publish: publishFor('win32') },
  linux: { ...build.linux, publish: publishFor('linux') },
};

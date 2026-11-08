const { notarize } = require('@electron/notarize');

exports.default = async function notarizeMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (process.env.CI !== 'true') {
    console.warn('Skipping notarizing step. Packaging is not running in CI');
    return;
  }

  const required = ['APPLE_ID', 'APPLE_ID_PASS', 'APPLE_TEAM_ID'];
  if (required.some((name) => !process.env[name]?.trim()))
    throw new Error(
      'CI macOS releases require APPLE_ID, APPLE_ID_PASS and APPLE_TEAM_ID for notarization.'
    );

  const appName = context.packager.appInfo.productFilename;

  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASS,
    teamId: process.env.APPLE_TEAM_ID,
  });
};

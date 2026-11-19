const { notarize } = require('@electron/notarize');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

exports.default = async function notarizeMacos(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CI !== 'true' && process.env.RELEASE_SIGNING_REQUIRED !== 'true') {
    console.warn('Skipping notarizing step for an unsigned local build');
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const queue = require('./notarization-queue.cjs');
  const operation = context.finalizeNotarization ? queue.finalize
    : process.env.RELEASE_DEFER_NOTARIZATION === 'true' ? queue.submit : notarize;
  if (process.env.APPLE_API_KEY?.trim()) {
    if (!process.env.APPLE_API_KEY_ID || !process.env.APPLE_API_ISSUER)
      throw new Error(
        'API notarization requires APPLE_API_KEY_ID and APPLE_API_ISSUER'
      );
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'kudium-notarize-')
    );
    const key = path.join(
      directory,
      `AuthKey_${process.env.APPLE_API_KEY_ID}.p8`
    );
    try {
      await fs.writeFile(key, process.env.APPLE_API_KEY, { mode: 0o600 });
      await operation({
        appPath,
        appleApiKey: key,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
    return;
  }
  const required = ['APPLE_ID', 'APPLE_ID_PASS', 'APPLE_TEAM_ID'];
  if (required.some((name) => !process.env[name]?.trim()))
    throw new Error(
      'Signed macOS releases require Apple API credentials or APPLE_ID, APPLE_ID_PASS and APPLE_TEAM_ID for notarization.'
    );
  await operation({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASS,
    teamId: process.env.APPLE_TEAM_ID,
  });
};

if (require.main === module) {
  const appPath = path.resolve(process.argv[2] || '');
  if (!appPath.endsWith('.app')) throw new Error('Supply the signed application path');
  exports.default({ electronPlatformName: 'darwin', appOutDir: path.dirname(appPath),
    packager: { appInfo: { productFilename: path.basename(appPath, '.app') } }, finalizeNotarization: true })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

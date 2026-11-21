const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const metadata = require('../apps/browser/.erb/scripts/release-update-metadata.cjs');

test('signed directory builds include usable metadata for both architectures and channels', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-update-metadata-'));
  const dependencies = require('../apps/browser/.erb/scripts/check-packaged-dependencies.cjs');
  const original = dependencies.default;
  const signing = process.env.RELEASE_SIGNING_REQUIRED;
  const releaseChannel = process.env.RELEASE_CHANNEL;
  dependencies.default = async () => {};
  try {
    process.env.RELEASE_SIGNING_REQUIRED = 'true';
    for (const channel of ['stable', 'beta']) {
      process.env.RELEASE_CHANNEL = channel;
      for (const [arch, builderArch] of [['x64', 1], ['arm64', 3]]) {
        await metadata.default({
          electronPlatformName: 'darwin', arch: builderArch,
          appOutDir: directory, targets: [{ name: 'dir' }],
          packager: { getResourcesDir: () => directory },
        });
        metadata.verifyUpdateMetadata(directory, 'darwin', arch, channel);
        assert.throws(() => metadata.verifyUpdateMetadata(directory, 'darwin', arch === 'x64' ? 'arm64' : 'x64', channel), /url/);
        assert.throws(() => metadata.verifyUpdateMetadata(directory, 'darwin', arch, channel === 'stable' ? 'beta' : 'stable'), /url/);
      }
    }
    fs.unlinkSync(path.join(directory, 'app-update.yml'));
    assert.throws(() => metadata.verifyUpdateMetadata(directory, 'darwin', 'arm64', 'stable'), /ENOENT/);
    process.env.RELEASE_SIGNING_REQUIRED = 'false';
    await metadata.default({});
    assert.equal(fs.existsSync(path.join(directory, 'app-update.yml')), false);
  } finally {
    dependencies.default = original;
    for (const [key, value] of [['RELEASE_SIGNING_REQUIRED', signing], ['RELEASE_CHANNEL', releaseChannel]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/* Check the artifact itself before signing, not the development node_modules. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');

function verifyPackagedDependencies(resources, platform, arch) {
  const archive = path.join(resources, 'app.asar');
  const metadata = JSON.parse(
    asar.extractFile(archive, 'package.json').toString()
  );
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-package-deps-'))
  );
  try {
    asar.extractAll(archive, directory);
    const { resolve } = createRequire(path.join(directory, 'package.json'));
    Object.keys(metadata.dependencies || {}).forEach((name) => {
      let entry;
      try {
        entry = resolve(name);
      } catch {
        throw new Error(`Packaged runtime dependency is missing: ${name}`);
      }
      if (!entry.startsWith(path.join(directory, 'node_modules') + path.sep))
        throw new Error(
          `Runtime dependency resolved outside the package: ${name}`
        );
    });
    if (metadata.dependencies?.['node-pty']) {
      const unpacked = path.join(
        resources,
        'app.asar.unpacked/node_modules/node-pty'
      );
      const candidates = ['build/Release', `prebuilds/${platform}-${arch}`];
      const addons =
        platform === 'win32'
          ? ['conpty.node', 'conpty_console_list.node']
          : ['pty.node'];
      const nativeDirectory = candidates
        .map((p) => path.join(unpacked, p))
        .find((p) => addons.every((file) => fs.existsSync(path.join(p, file))));
      if (!nativeDirectory)
        throw new Error(
          'Packaged node-pty native addon is missing or not unpacked'
        );
      if (platform !== 'win32') {
        const helper = path.join(nativeDirectory, 'spawn-helper');
        try {
          fs.accessSync(helper, fs.constants.X_OK);
        } catch {
          throw new Error(
            'Packaged node-pty spawn-helper is missing or not executable'
          );
        }
      }
      if (platform === 'darwin') {
        const target = arch === 'x64' ? 'x86_64' : arch;
        ['pty.node', 'spawn-helper'].forEach((file) => {
          const architectures = execFileSync(
            '/usr/bin/lipo',
            ['-archs', path.join(nativeDirectory, file)],
            { encoding: 'utf8' }
          )
            .trim()
            .split(/\s+/);
          if (!architectures.includes(target))
            throw new Error(
              `Packaged node-pty ${file} does not support ${arch}`
            );
        });
      }
    }
    console.log(`Verified packaged runtime dependencies (${platform}/${arch})`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

exports.verifyPackagedDependencies = verifyPackagedDependencies;
exports.default = async (context) => {
  const platform = context.electronPlatformName;
  const resources =
    platform === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app/Contents/Resources`
        )
      : path.join(context.appOutDir, 'resources');
  const arch = require('builder-util').Arch[context.arch];
  verifyPackagedDependencies(resources, platform, arch);
};

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform === 'darwin') {
  const output = path.resolve('assets/native/touchbox-password-auth');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const run = (args) => {
    const result = spawnSync('xcrun', args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error('Native password authentication could not be built.');
      process.exit(1);
    }
  };
  try {
    ['arm64', 'x86_64'].forEach((arch) =>
      run([
        'swiftc',
        '-O',
        '-target',
        `${arch}-apple-macos12.0`,
        '-framework',
        'LocalAuthentication',
        'native/password-manager/auth.swift',
        '-o',
        `${output}.${arch}`,
      ])
    );
    run([
      'lipo',
      '-create',
      `${output}.arm64`,
      `${output}.x86_64`,
      '-output',
      output,
    ]);
  } finally {
    ['arm64', 'x86_64'].forEach((arch) => {
      if (fs.existsSync(`${output}.${arch}`))
        fs.unlinkSync(`${output}.${arch}`);
    });
  }
}

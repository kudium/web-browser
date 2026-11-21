import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import metadata from '../../apps/browser/.erb/scripts/release-update-metadata.cjs';

export function verifySignedApp(app, arch, expectedVersion) {
  const version = execFileSync('/usr/libexec/PlistBuddy', [
    '-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents/Info.plist'),
  ], { encoding: 'utf8' }).trim();
  if (version !== expectedVersion) throw new Error('Installer app version differs from release filename');
  metadata.verifyUpdateMetadata(path.join(app, 'Contents/Resources'), 'darwin', arch,
    version.includes('-beta.') ? 'beta' : 'stable');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
  if (result.status !== 0 ||
      !result.stderr.includes('Authority=Developer ID Application: Kudium LTD (79VCL28M9P)') ||
      !result.stderr.includes('TeamIdentifier=79VCL28M9P') ||
      !result.stderr.includes('runtime')) {
    throw new Error('Release must be signed by Kudium Developer ID with hardened runtime');
  }
  execFileSync('/usr/bin/xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
  execFileSync('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app], { stdio: 'inherit' });
}

async function appIn(directory) {
  const apps = (await fs.readdir(directory)).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one app in installer');
  return path.join(directory, apps[0]);
}

export async function verifyMacRelease(build) {
  const files = await fs.readdir(build);
  const archives = files.filter(name => name.endsWith('.zip'));
  const images = files.filter(name => name.endsWith('.dmg'));
  if (archives.length !== 1 || images.length !== 1) throw new Error('Expected one macOS update ZIP and one DMG');
  const match = archives[0].match(/^Kudium-Browser-(\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?)-(arm64|x64)\.zip$/);
  if (!match) throw new Error('Update ZIP must identify its release version and target architecture');
  const [, version, arch] = match;
  if (images[0] !== archives[0].replace(/\.zip$/, '.dmg')) throw new Error('ZIP and DMG release targets differ');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kudium-release-check-'));
  const extracted = path.join(directory, 'zip');
  const mounted = path.join(directory, 'dmg');
  let attached = false;
  try {
    await fs.mkdir(extracted);
    await fs.mkdir(mounted);
    execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(build, archives[0]), extracted]);
    const zipApp = await appIn(extracted);
    verifySignedApp(zipApp, arch, version);
    console.log('Update ZIP contains correct update metadata and a valid signed, notarized and stapled app.');
    execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mounted, path.join(build, images[0])], { stdio: 'inherit' });
    attached = true;
    const dmgApp = await appIn(mounted);
    verifySignedApp(dmgApp, arch, version);
    const resource = 'Contents/Resources/app-update.yml';
    const [zipMetadata, dmgMetadata] = await Promise.all([
      fs.readFile(path.join(zipApp, resource)), fs.readFile(path.join(dmgApp, resource)),
    ]);
    if (!zipMetadata.equals(dmgMetadata)) throw new Error('ZIP and DMG updater configurations differ');
    console.log('DMG contains matching update metadata and a valid signed, notarized and stapled app.');
  } finally {
    // Never recursively delete a mounted filesystem if detachment fails.
    if (attached) execFileSync('/usr/bin/hdiutil', ['detach', mounted], { stdio: 'inherit' });
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyMacRelease(path.resolve(process.argv[2] || 'apps/browser/release/build'));
}

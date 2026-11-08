/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { generateKeyPairSync } from 'crypto';
import {
  extensionKeyId,
  prepareExtensionPackage,
} from '../main/extensionPackage';

jest.mock('electron-chrome-web-store', () => ({
  downloadExtension: jest.fn(),
}));

it('owns a bounded package copy, reviews actual permissions and rejects changed or added files', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kudiumbrowser-package-unit-')
  );
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  const key = generateKeyPairSync('rsa', { modulusLength: 1024 })
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');
  const manifest = {
    manifest_version: 3,
    name: 'Package fixture',
    version: '1.0',
    key,
    permissions: ['storage'],
    optional_permissions: ['tabs'],
  };
  await fs.writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify(manifest)
  );
  await fs.writeFile(path.join(source, 'script.js'), 'original');
  const prepared = await prepareExtensionPackage(
    extensionKeyId(key),
    path.join(root, 'cache'),
    root,
    () => {},
    source
  );
  try {
    expect(prepared.permissions).toEqual(['storage', 'Optional: tabs']);
    await fs.writeFile(path.join(source, 'script.js'), 'source-changed');
    await expect(prepared.validate()).resolves.toBeUndefined();
    await fs.writeFile(path.join(prepared.path(), 'added.js'), 'added');
    await expect(prepared.validate()).rejects.toThrow('changed after review');
    await fs.unlink(path.join(prepared.path(), 'added.js'));
    await fs.writeFile(path.join(prepared.path(), 'script.js'), 'changed');
    await expect(prepared.validate()).rejects.toThrow('changed after review');
  } finally {
    await prepared.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('rejects a package with another identity and removes rejected staging data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kudiumbrowser-package-id-'));
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Wrong',
      version: '1.0',
      key: 'd3Jvbmc=',
    })
  );
  try {
    await expect(
      prepareExtensionPackage(
        'a'.repeat(32),
        path.join(root, 'cache'),
        root,
        () => {},
        source
      )
    ).rejects.toThrow('identity');
    expect(await fs.readdir(root)).toEqual(['source']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('rejects symlinks and revoked ownership before committing a package', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kudiumbrowser-package-revoke-')
  );
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  const key = generateKeyPairSync('rsa', { modulusLength: 1024 })
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');
  await fs.writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify({ manifest_version: 3, name: 'Fixture', version: '1', key })
  );
  let allowed = true;
  const current = () => {
    if (!allowed) throw new Error('Revoked');
  };
  const prepared = await prepareExtensionPackage(
    extensionKeyId(key),
    path.join(root, 'cache'),
    root,
    current,
    source
  );
  try {
    allowed = false;
    await expect(prepared.commit()).rejects.toThrow('Revoked');
    expect(await fs.readdir(root)).not.toContain('cache');
  } finally {
    await prepared.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});

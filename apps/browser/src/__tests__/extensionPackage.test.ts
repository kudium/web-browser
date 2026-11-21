/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { generateKeyPairSync } from 'crypto';
import { downloadExtension } from 'electron-chrome-web-store';
import {
  extensionKeyId,
  prepareExtensionPackage,
} from '../main/extensionPackage';

jest.mock('electron-chrome-web-store', () => ({
  downloadExtension: jest.fn(),
}));

it('isolates repeated downloads of the same version and preserves the existing cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kudium-package-repeat-'));
  const cache = path.join(root, 'cache');
  const key = generateKeyPairSync('rsa', { modulusLength: 1024 })
    .publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const id = extensionKeyId(key);
  const old = path.join(cache, id, '2.1.12_0');
  await fs.mkdir(old, { recursive: true });
  await fs.writeFile(path.join(old, 'keep.txt'), 'installed package');
  const roots: string[] = [];
  const downloader = jest.mocked(downloadExtension);
  downloader.mockImplementation(async (_id, downloadCache) => {
    roots.push(downloadCache);
    const staging = path.join(downloadCache, id, 'incoming');
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'Muse fixture', version: '2.1.12', key,
    }));
    const destination = path.join(downloadCache, id, '2.1.12_0');
    await fs.rename(staging, destination);
    return destination;
  });
  try {
    const attempts = await Promise.all([
      prepareExtensionPackage(id, cache, root, () => {}),
      prepareExtensionPackage(id, cache, root, () => {}),
    ]);
    try {
      expect(new Set(roots).size).toBe(2);
      for (const downloadCache of roots) {
        expect(downloadCache).not.toBe(cache);
        await expect(fs.stat(downloadCache)).rejects.toMatchObject({ code: 'ENOENT' });
      }
      for (const prepared of attempts) {
        await prepared.validate();
        await prepared.commit();
      }
      expect(attempts[0].path()).not.toBe(attempts[1].path());
      expect(await fs.readFile(path.join(old, 'keep.txt'), 'utf8')).toBe('installed package');
    } finally {
      await Promise.all(attempts.map((prepared) => prepared.dispose()));
    }
    downloader.mockRejectedValueOnce(new Error('Download failed'));
    await expect(prepareExtensionPackage(id, cache, root, () => {})).rejects.toThrow('Download failed');
    expect(await fs.readdir(root)).toEqual(['cache']);
  } finally {
    downloader.mockReset();
    await fs.rm(root, { recursive: true, force: true });
  }
});

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
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kudiumbrowser-package-id-')
  );
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

it('reviews the copied default-locale name and rejects locale traversal or changed translations', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kudiumbrowser-package-locale-')
  );
  const source = path.join(root, 'source');
  await fs.mkdir(path.join(source, '_locales', 'en'), { recursive: true });
  const key = generateKeyPairSync('rsa', { modulusLength: 1024 })
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');
  const manifest = {
    manifest_version: 3,
    name: '__MSG_extName__',
    default_locale: 'en',
    version: '1',
    key,
  };
  await fs.writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify(manifest)
  );
  await fs.writeFile(
    path.join(source, '_locales', 'en', 'messages.json'),
    JSON.stringify({ extname: { message: 'Localized fixture' } })
  );
  const prepared = await prepareExtensionPackage(
    extensionKeyId(key),
    path.join(root, 'cache'),
    root,
    () => {},
    source
  );
  try {
    expect(prepared.displayName).toBe('Localized fixture');
    expect(prepared.manifest.name).toBe('__MSG_extName__');
    await fs.writeFile(
      path.join(source, '_locales', 'en', 'messages.json'),
      '{}'
    );
    await expect(prepared.validate()).resolves.toBeUndefined();
    await fs.writeFile(
      path.join(prepared.path(), '_locales', 'en', 'messages.json'),
      '{}'
    );
    await expect(prepared.validate()).rejects.toThrow('changed after review');
    await fs.writeFile(
      path.join(source, 'manifest.json'),
      JSON.stringify({ ...manifest, default_locale: '../../escape' })
    );
    await expect(
      prepareExtensionPackage(
        extensionKeyId(key),
        path.join(root, 'cache'),
        root,
        () => {},
        source
      )
    ).rejects.toThrow('localized name');
  } finally {
    await prepared.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});

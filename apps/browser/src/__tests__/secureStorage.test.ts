/* eslint-disable jest/no-conditional-expect -- POSIX permissions are not represented by Windows file modes. */
/** @jest-environment node */
/* eslint-disable no-bitwise */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalSecureStorage } from '../main/secureStorage';
import fixtures from './fixtures/storage-migration-v1.json';

let root: string;
const legacy = (value: string) => Buffer.from(`os:${value}`);
const payload = (file: keyof typeof fixtures.payloads) => {
  const value = fixtures.payloads[file];
  return typeof value === 'string' ? value : JSON.stringify(value);
};
function backend() {
  return {
    isAsyncEncryptionAvailable: jest.fn(async () => true),
    getSelectedStorageBackend: () => 'keychain',
    encryptStringAsync: jest.fn(async (value: string) => legacy(value)),
    decryptStringAsync: jest.fn(async (value: Buffer) => {
      if (!value.toString().startsWith('os:'))
        throw new Error('Invalid OS ciphertext');
      return { result: value.toString().slice(3), shouldReEncrypt: false };
    }),
  };
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-secure-storage-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('uses async OS APIs once to protect a key, then authenticates local ciphertext across restarts', async () => {
  const osStorage = backend();
  const storage = new LocalSecureStorage(root, osStorage);
  expect(storage.isEncryptionAvailable()).toBe(false);
  await Promise.all([storage.initialize(), storage.initialize()]);
  const ciphertext = storage.encryptString('private fact 🔐');
  expect(ciphertext.toString()).not.toContain('private fact');
  expect(storage.encryptString('private fact 🔐')).not.toEqual(ciphertext);
  expect(storage.decryptString(ciphertext)).toBe('private fact 🔐');
  expect(osStorage.encryptStringAsync).toHaveBeenCalledTimes(1);
  storage.dispose();
  expect(() => storage.decryptString(ciphertext)).toThrow();
  const restarted = new LocalSecureStorage(root, osStorage);
  await restarted.initialize();
  expect(restarted.decryptString(ciphertext)).toBe('private fact 🔐');
  const tampered = Buffer.from(ciphertext);
  tampered[tampered.length - 1] ^= 1;
  expect(() => restarted.decryptString(tampered)).toThrow();
  if (process.platform !== 'win32')
    expect(
      fs.statSync(path.join(root, 'secure-storage/key.json')).mode & 0o777
    ).toBe(0o600);
});

test('migrates every legacy store and embedded secret without altering other JSON fields', async () => {
  fs.mkdirSync(path.join(root, 'password-manager'));
  const binaries = [
    'ai-checkpoint.bin',
    'ai-conversations.bin',
    'ai-tasks.bin',
    'password-manager/os-key',
  ];
  binaries.forEach((file) =>
    fs.writeFileSync(
      path.join(root, file),
      legacy(payload(file as keyof typeof fixtures.payloads))
    )
  );
  fs.writeFileSync(
    path.join(root, 'ai-settings.json'),
    JSON.stringify({
      endpoint: 'https://example.com',
      model: 'test',
      key: legacy('provider-key').toString('base64'),
    })
  );
  fs.writeFileSync(
    path.join(root, 'password-manager/vault.json'),
    JSON.stringify({
      version: 2,
      ciphertext: 'master-password-encrypted-record',
      summary: { osEncrypted: legacy('{"items":[]}').toString('base64') },
    })
  );
  const storage = new LocalSecureStorage(root, backend());
  await storage.initialize();
  binaries.forEach((file) => {
    expect(storage.decryptString(fs.readFileSync(path.join(root, file)))).toBe(
      payload(file as keyof typeof fixtures.payloads)
    );
    if (process.platform !== 'win32')
      expect(fs.statSync(path.join(root, file)).mode & 0o777).toBe(0o600);
  });
  const settings = JSON.parse(
    fs.readFileSync(path.join(root, 'ai-settings.json'), 'utf8')
  );
  expect(settings.endpoint).toBe('https://example.com');
  expect(storage.decryptString(Buffer.from(settings.key, 'base64'))).toBe(
    'provider-key'
  );
  const vault = JSON.parse(
    fs.readFileSync(path.join(root, 'password-manager/vault.json'), 'utf8')
  );
  expect(vault.ciphertext).toBe('master-password-encrypted-record');
  expect(
    storage.decryptString(Buffer.from(vault.summary.osEncrypted, 'base64'))
  ).toBe('{"items":[]}');
  const osStorage = backend();
  await new LocalSecureStorage(root, osStorage).initialize();
  expect(osStorage.decryptStringAsync).toHaveBeenCalledTimes(1); // only the wrapped key
});

test.each([false, 'basic_text'])(
  'does not write keys or migrate files without secure OS encryption (%s)',
  async (availability) => {
    const osStorage = backend();
    if (availability === false)
      osStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    else osStorage.getSelectedStorageBackend = () => 'basic_text';
    const file = path.join(root, 'ai-tasks.bin');
    fs.writeFileSync(file, legacy('saved tasks'));
    const storage = new LocalSecureStorage(root, osStorage);
    await storage.initialize();
    expect(storage.isEncryptionAvailable()).toBe(false);
    expect(fs.readFileSync(file)).toEqual(legacy('saved tasks'));
    expect(fs.existsSync(path.join(root, 'secure-storage'))).toBe(false);
  }
);

test('preserves an unreadable legacy file and isolates it from healthy stores', async () => {
  const file = path.join(root, 'ai-conversations.bin');
  fs.writeFileSync(file, 'unreadable ciphertext');
  const storage = new LocalSecureStorage(root, backend());
  await storage.initialize();
  expect(storage.isEncryptionAvailable()).toBe(true);
  expect(storage.isFileAvailable(file)).toBe(false);
  expect(storage.recoveryFailures()).toEqual(['ai-conversations.bin']);
  expect(fs.readFileSync(file, 'utf8')).toBe('unreadable ciphertext');
});

test('never replaces an unreadable existing data key', async () => {
  const file = path.join(root, 'secure-storage/key.json');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      osEncrypted: Buffer.from('broken key').toString('base64'),
    })
  );
  const original = fs.readFileSync(file);
  const storage = new LocalSecureStorage(root, backend());
  await expect(storage.initialize()).rejects.toThrow();
  expect(fs.readFileSync(file)).toEqual(original);
  expect(storage.isEncryptionAvailable()).toBe(false);
});

test('recovers after an interrupted migration using the already committed key', async () => {
  const first = path.join(root, 'ai-checkpoint.bin');
  const second = path.join(root, 'ai-conversations.bin');
  fs.writeFileSync(first, legacy(payload('ai-checkpoint.bin')));
  fs.writeFileSync(second, legacy(payload('ai-conversations.bin')));
  const rename = fs.renameSync;
  const failure = jest
    .spyOn(fs, 'renameSync')
    .mockImplementation((source, target) => {
      if (target === second) throw new Error('Disk write failed');
      rename(source, target);
    });
  try {
    const interrupted = new LocalSecureStorage(root, backend());
    await interrupted.initialize();
    expect(interrupted.isFileAvailable(second)).toBe(false);
    expect(fs.readFileSync(second)).toEqual(
      legacy(payload('ai-conversations.bin'))
    );
  } finally {
    failure.mockRestore();
  }
  const recovered = new LocalSecureStorage(root, backend());
  await recovered.initialize();
  expect(recovered.decryptString(fs.readFileSync(first))).toBe(
    payload('ai-checkpoint.bin')
  );
  expect(recovered.decryptString(fs.readFileSync(second))).toBe(
    payload('ai-conversations.bin')
  );
});

test('rewraps a rotated OS key without changing the local data key', async () => {
  const initial = new LocalSecureStorage(root, backend());
  await initial.initialize();
  const ciphertext = initial.encryptString('existing encrypted data');
  initial.dispose();
  const osStorage = backend();
  osStorage.decryptStringAsync.mockImplementation(async (value) => ({
    result: value.toString().slice(3),
    shouldReEncrypt: true,
  }));
  const rotated = new LocalSecureStorage(root, osStorage);
  await rotated.initialize();
  expect(osStorage.encryptStringAsync).toHaveBeenCalledTimes(1);
  expect(rotated.decryptString(ciphertext)).toBe('existing encrypted data');
});

test('recovers ciphertext from an earlier app identity using a separate decryptor', async () => {
  const file = path.join(root, 'ai-tasks.bin');
  fs.writeFileSync(file, 'historical-app-ciphertext');
  const recovery = jest.fn(async () => '[]');
  const storage = new LocalSecureStorage(root, {
    ...backend(),
    decryptLegacyStringAsync: recovery,
  });
  await storage.initialize();
  expect(recovery).toHaveBeenCalledWith(
    Buffer.from('historical-app-ciphertext')
  );
  expect(storage.isFileAvailable(file)).toBe(true);
  expect(storage.decryptString(fs.readFileSync(file))).toBe('[]');
});

test('an unrecoverable checkpoint cannot be deleted by incidental save or load operations', async () => {
  const { AICheckpointStore } = await import('../main/aiCheckpoint');
  const file = path.join(root, 'ai-checkpoint.bin');
  fs.writeFileSync(file, 'unreadable legacy checkpoint');
  const storage = new LocalSecureStorage(root, backend());
  await storage.initialize();
  const store = new AICheckpointStore(file, storage);
  expect(store.load()).toBeUndefined();
  store.save(undefined);
  expect(fs.readFileSync(file, 'utf8')).toBe('unreadable legacy checkpoint');
});

test('unknown local encryption versions are preserved without trying OS identity fallbacks', async () => {
  const file = path.join(root, 'ai-tasks.bin');
  fs.writeFileSync(file, 'KUDIUM-LOCAL-AES-GCM-v99\0unknown ciphertext');
  const osStorage = backend();
  const recovery = jest.fn(async () => '[]');
  const storage = new LocalSecureStorage(root, {
    ...osStorage,
    decryptLegacyStringAsync: recovery,
  });
  await storage.initialize();
  expect(storage.isFileAvailable(file)).toBe(false);
  expect(osStorage.decryptStringAsync).not.toHaveBeenCalled();
  expect(recovery).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, 'utf8')).toContain('v99');
});

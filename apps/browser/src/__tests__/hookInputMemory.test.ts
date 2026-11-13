/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hookInputMemory } from '../main/hookInputMemory';
let mockDirectory: string;
let mockAvailable = true;
jest.mock('electron', () => ({ app: { getPath: () => mockDirectory } }));
jest.mock('../main/localStorage', () => {
  const crypto = require('crypto');
  const key = crypto.randomBytes(32);
  return {
    safeStorage: {
      isEncryptionAvailable: () => mockAvailable,
      isFileAvailable: () => true,
      getSelectedStorageBackend: () => 'keychain',
      encryptString: (value: string) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
          cipher.update(value, 'utf8'),
          cipher.final(),
        ]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      },
      decryptString: (value: Buffer) => {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          value.subarray(0, 12)
        );
        decipher.setAuthTag(value.subarray(12, 28));
        return Buffer.concat([
          decipher.update(value.subarray(28)),
          decipher.final(),
        ]).toString('utf8');
      },
    },
  };
});
const binding = {
  profile: 'default',
  scope: 'space',
  origin: 'https://example.com',
  hookId: 'hook',
  actionId: 'action',
  source: 'Original script',
};
const fields = [{ key: 'email', label: 'Email', type: 'email' as const }];
beforeEach(() => {
  mockDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-memory-'));
  mockAvailable = true;
});
afterEach(() => fs.rmSync(mockDirectory, { recursive: true, force: true }));
it('persists only opted-in answers encrypted and scopes them to source, hook, action, site, space and profile', () => {
  hookInputMemory(binding).save(fields, { email: 'private@example.com' }, [
    'email',
  ]);
  expect(hookInputMemory(binding).load(fields)).toEqual({
    email: 'private@example.com',
  });
  const file = path.join(
    mockDirectory,
    'hook-inputs',
    fs.readdirSync(path.join(mockDirectory, 'hook-inputs'))[0]
  );
  expect(
    fs.readFileSync(file).includes(Buffer.from('private@example.com'))
  ).toBe(false);
  for (const patch of [
    { profile: 'other' },
    { scope: 'other' },
    { origin: 'https://other.com' },
    { hookId: 'other' },
    { actionId: 'other' },
    { source: 'Modified script' },
  ])
    expect(hookInputMemory({ ...binding, ...patch }).load(fields)).toEqual({});
  expect(
    hookInputMemory(binding).load([{ ...fields[0], type: 'text' }])
  ).toEqual({});
  if (process.platform !== 'win32')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});
it('forgets unchecked answers and never stores password fields or falls back to plaintext', () => {
  const password = [{ key: 'password', type: 'password' as const }];
  hookInputMemory(binding).save(password, { password: 'SECRET' }, ['password']);
  expect(hookInputMemory(binding).load(password)).toEqual({});
  hookInputMemory(binding).save(fields, { email: 'private@example.com' }, [
    'email',
  ]);
  hookInputMemory(binding).save(fields, { email: 'private@example.com' }, []);
  expect(hookInputMemory(binding).load(fields)).toEqual({});
  mockAvailable = false;
  expect(hookInputMemory(binding).available).toBe(false);
  expect(() =>
    hookInputMemory(binding).save(fields, { email: 'private@example.com' }, [
      'email',
    ])
  ).toThrow('Secure storage');
});
it('rejects swapped encrypted files and preserves corrupt data instead of overwriting it', () => {
  hookInputMemory(binding).save(fields, { email: 'private@example.com' }, [
    'email',
  ]);
  const other = { ...binding, scope: 'other' };
  hookInputMemory(other).save(fields, { email: 'other@example.com' }, [
    'email',
  ]);
  const files = fs
    .readdirSync(path.join(mockDirectory, 'hook-inputs'))
    .map((name) => path.join(mockDirectory, 'hook-inputs', name));
  const first = fs.readFileSync(files[0]),
    second = fs.readFileSync(files[1]);
  fs.writeFileSync(files[0], second);
  fs.writeFileSync(files[1], first);
  expect(() => hookInputMemory(binding).load(fields)).toThrow(
    'could not be read'
  );
  fs.writeFileSync(files[0], 'corrupt');
  fs.writeFileSync(files[1], 'corrupt');
  expect(() =>
    hookInputMemory(binding).save(fields, { email: 'new@example.com' }, [
      'email',
    ])
  ).toThrow();
  expect(fs.readFileSync(files[0], 'utf8')).toBe('corrupt');
});

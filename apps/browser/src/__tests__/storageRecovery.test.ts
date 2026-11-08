/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { archiveUnreadableStorage } from '../main/storageRecovery';
import { LocalSecureStorage } from '../main/secureStorage';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-recovery-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const write = (file: string, value: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
};
it('backs up failed records and the journal, retaining healthy records and the live key', () => {
  write('ai-settings.json', 'unreadable');
  write('ai-tasks.bin', 'healthy');
  write('secure-storage/key.json', 'wrapped-key');
  write('secure-storage/migration-journal.json', 'journal');
  const backup = archiveUnreadableStorage(root, ['ai-settings.json']);
  expect(fs.readFileSync(path.join(backup, 'ai-settings.json'), 'utf8')).toBe(
    'unreadable'
  );
  expect(
    fs.readFileSync(path.join(backup, 'secure-storage/key.json'), 'utf8')
  ).toBe('wrapped-key');
  expect(
    fs.readFileSync(
      path.join(backup, 'secure-storage/migration-journal.json'),
      'utf8'
    )
  ).toBe('journal');
  expect(fs.existsSync(path.join(root, 'ai-settings.json'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'ai-tasks.bin'), 'utf8')).toBe(
    'healthy'
  );
  expect(
    fs.readFileSync(path.join(root, 'secure-storage/key.json'), 'utf8')
  ).toBe('wrapped-key');
});
it('does not remove anything when backup preparation fails or selection is invalid', () => {
  write('ai-settings.json', 'unreadable');
  expect(() => archiveUnreadableStorage(root, ['../outside'])).toThrow();
  expect(() => archiveUnreadableStorage(root, ['ai-settings.json'])).toThrow();
  expect(fs.readFileSync(path.join(root, 'ai-settings.json'), 'utf8')).toBe(
    'unreadable'
  );
});
it('allows a fresh launch to save again after failed migration records are archived', async () => {
  const backend = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(`os:${value}`),
    decryptStringAsync: async (value: Buffer) => {
      if (!value.toString().startsWith('os:')) throw new Error('Unreadable');
      return { result: value.toString().slice(3), shouldReEncrypt: false };
    },
  };
  write(
    'ai-settings.json',
    JSON.stringify({
      endpoint: 'https://api.openai.com/v1',
      model: 'test',
      key: Buffer.from('unreadable').toString('base64'),
    })
  );
  const storage = new LocalSecureStorage(root, backend);
  await storage.initialize();
  expect(storage.recoveryFailures()).toContain('ai-settings.json');
  archiveUnreadableStorage(root, storage.recoveryFailures());
  storage.dispose();
  const next = new LocalSecureStorage(root, backend);
  await next.initialize();
  expect(next.recoveryFailures()).toEqual([]);
  expect(next.isFileAvailable(path.join(root, 'ai-settings.json'))).toBe(true);
  expect(next.decryptString(next.encryptString('replacement-key'))).toBe(
    'replacement-key'
  );
});

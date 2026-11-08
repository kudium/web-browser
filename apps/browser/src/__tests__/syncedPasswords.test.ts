import fs from 'fs';
import os from 'os';
import path from 'path';
import { PasswordVault } from '../main/passwordManager/vault';
import { validateSyncedLogins } from '../main/sync/passwords';

test('restored passwords do not overwrite local logins or grant AI access', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-password-sync-'));
  try {
    const vault = new PasswordVault(path.join(root, 'vault.json'));
    vault.unlock('test master password', true);
    const record = {
      title: 'Example',
      origin: 'https://example.com',
      username: 'user',
      password: 'local-password',
    };
    vault.importSyncedLogins([record]);
    vault.importSyncedLogins([{ ...record, password: 'remote-password' }]);
    expect(vault.records()).toHaveLength(2);
    expect(vault.records().map((item) => item.password)).toEqual([
      'local-password',
      'remote-password',
    ]);
    expect(vault.records().every((item) => !item.allowAI && !item.scope)).toBe(
      true
    );
    expect(vault.importSyncedLogins([record])).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('synced passwords reject unexpected privileges and insecure origins', () => {
  expect(() =>
    validateSyncedLogins([
      {
        title: 'Bad',
        origin: 'https://example.com',
        username: 'u',
        password: 'secret',
        allowAI: true,
      },
    ])
  ).toThrow('Invalid synced password');
  expect(() =>
    validateSyncedLogins([
      {
        title: 'Bad',
        origin: 'http://example.com',
        username: 'u',
        password: 'secret',
      },
    ])
  ).toThrow('Invalid password website');
});

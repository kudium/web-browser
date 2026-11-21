/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PasswordVault } from '../main/passwordManager/vault';
import {
  autoLoginMetadata,
  AutoLoginMetadataCache,
} from '../main/passwordManager/autoLoginMetadata';
import type { VaultItem } from '../browser/passwordManager';
const origin = 'https://example.com';
const record: VaultItem = {
  id: 'login',
  title: 'Example',
  kind: 'login',
  origin,
  username: 'fixture',
  password: 'fixture-secret',
  notes: 'private notes',
  fields: [],
  allowAI: false,
};
it('projects only menu metadata and applies scope overrides and hidden accounts', () => {
  const metadata = autoLoginMetadata(
    [record, { ...record, id: 'scoped', scope: 'group:other' }],
    [
      { recordId: 'login', scope: 'group:hidden', hidden: true, patch: {} },
      {
        recordId: 'login',
        scope: 'group:business',
        patch: { username: 'business', password: 'business-secret' },
      },
    ],
  );
  expect(JSON.stringify(metadata)).not.toMatch(
    /fixture-secret|private notes|business-secret/,
  );
  const cache = new AutoLoginMetadataCache(metadata);
  expect(cache.accounts(origin).map((item) => item.id)).toEqual(['login']);
  expect(cache.accounts(origin, 'group:hidden')).toEqual([]);
  expect(cache.accounts(origin, 'group:business')[0].username).toBe('business');
  expect(cache.accounts(origin, 'group:other')).toHaveLength(2);
  expect(cache.accounts('https://other.example')).toEqual([]);
});
it('serves locked menus without disk reads or unlocking, reloads metadata asynchronously, and updates settings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-login-index-'));
  const file = path.join(root, 'vault.json');
  const vault = new PasswordVault(file);
  try {
    vault.unlock('disposable master', true);
    vault.save(record);
    vault.lock();
    const disk = jest.spyOn(fs, 'readFileSync');
    const unlock = jest.spyOn(vault, 'unlock');
    for (let i = 0; i < 100; i++)
      expect(vault.autoLoginMenuState(origin).accounts[0].id).toBe('login');
    expect(disk).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    disk.mockRestore();
    unlock.mockRestore();
    const restarted = new PasswordVault(file);
    await restarted.prepareAutoLoginMetadata();
    expect(restarted.autoLoginMenuState(origin).accounts[0].username).toBe(
      'fixture',
    );
    expect(restarted.status().locked).toBe(true);
    vault.unlock('disposable master');
    vault.settings(false, false, false);
    vault.lock();
    expect(vault.autoLoginMenuState(origin).enabled).toBe(false);
    expect(vault.autofillAvailability(origin)).toEqual([]);
  } finally {
    jest.restoreAllMocks();
    vault.lock();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('keeps locked status and autofill availability free of file reads and credential access', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-status-index-'));
  const vault = new PasswordVault(path.join(root, 'vault.json'));
  try {
    vault.unlock('disposable master', true);
    vault.save({
      ...record,
      fields: [
        { name: 'email', value: 'private@example.test', secret: false },
        { name: 'password', value: 'private-password', secret: true },
      ],
    });
    vault.lock();
    const disk = jest.spyOn(fs, 'readFileSync');
    const stat = jest.spyOn(fs, 'statSync');
    const exists = jest.spyOn(fs, 'existsSync');
    const unlock = jest.spyOn(vault, 'unlock');
    for (let i = 0; i < 100; i++) {
      expect(vault.status().items[0].id).toBe(record.id);
      expect(vault.autofillAvailability(origin)?.[0].canFillLogin).toBe(true);
      vault.expireLock();
    }
    expect(disk).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(JSON.stringify(vault.autofillAvailability(origin))).not.toMatch(
      /private@example.test|private-password|fixture-secret/,
    );
  } finally {
    jest.restoreAllMocks();
    vault.lock();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

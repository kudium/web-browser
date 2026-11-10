import { randomBytes } from 'crypto';
import {
  defaultSyncSettings,
  validateSyncSettings,
  cloudSyncStatus,
} from '../browser/cloudSync';
import { buildSyncSnapshot } from '../main/sync/snapshot';
import { encryptSyncRecord, decryptSyncRecord } from '../main/sync/encryption';
import { defaultPreferences } from '../browser/preferences';

it('defaults to account sync with all categories and validates saved choices', () => {
  expect(defaultSyncSettings('darwin')).toMatchObject({
    enabled: true,
    provider: 'kudiumbrowser',
    icloud: false,
  });
  expect(defaultSyncSettings('win32').provider).toBe('kudiumbrowser');
  const defaults = defaultSyncSettings();
  expect(() =>
    validateSyncSettings({
      ...defaults,
      categories: { ...defaults.categories, passwords: 'yes' },
    })
  ).toThrow('Invalid');
  expect(() =>
    validateSyncSettings({
      ...defaults,
      enabled: true,
      categories: {
        workspace: false,
        openTabs: false,
        preferences: false,
        notes: false,
        passwords: false,
      },
    })
  ).toThrow('Select at least');
  expect(() =>
    validateSyncSettings({ ...defaults, endpoint: 'http://attacker' })
  ).toThrow('Invalid');
  expect(
    cloudSyncStatus({ ...defaults, enabled: true }, 'darwin')
  ).toMatchObject({
    connected: false,
    state: 'setup-required',
    lastSyncedAt: null,
  });
});
it('exports only selected portable data, excluding login tokens, local paths and private tabs', () => {
  const apps = [
    {
      id: 'app',
      sessionId: 'account',
      name: 'Mail',
      url: 'https://example.com/home',
      extensionInstallTarget: 'SECRET',
      cookies: 'SECRET',
    },
    {
      id: 'private',
      name: 'PRIVATE',
      url: 'https://private.example',
      private: true,
    },
    { id: 'local', name: 'LOCAL', url: 'file:///SECRET' },
    {
      id: 'embedded',
      name: 'EMBEDDED',
      url: 'https://user:SECRET@example.com',
    },
  ].map((app) => ({ icon: '', ...app }));
  const input = {
    settings: { ...defaultSyncSettings(), enabled: true },
    deviceId: 'device',
    apps,
    spaces: [],
    preferences: { ...defaultPreferences, downloadDirectory: '/SECRET' },
    currentUrls: { app: 'https://example.com/current' },
    now: 123,
  };
  const snapshot = buildSyncSnapshot(input);
  const json = JSON.stringify(snapshot);
  expect(json).not.toContain('SECRET');
  expect(json).not.toContain('PRIVATE');
  expect(json).not.toContain('LOCAL');
  expect(json).not.toContain('downloadDirectory');
  expect(json).not.toContain('cloudSync');
  expect(json).not.toContain('permissions');
  expect(snapshot.openTabs).toEqual([
    {
      id: 'app',
      sessionId: 'account',
      spaceId: 'default',
      title: 'Mail',
      url: 'https://example.com/current',
    },
  ]);
  const selected = buildSyncSnapshot({
    ...input,
    settings: {
      ...input.settings,
      categories: { workspace: false, openTabs: true, preferences: false },
    },
  });
  expect(selected.workspace).toBeUndefined();
  expect(selected.preferences).toBeUndefined();
  expect(() =>
    buildSyncSnapshot({
      ...input,
      settings: { ...defaultSyncSettings(), enabled: false },
    })
  ).toThrow('disabled');
  expect(() =>
    buildSyncSnapshot({ ...input, deviceId: '../partition' })
  ).toThrow('ID');
});
it('encrypts with independent nonces and rejects tampering, metadata substitution and wrong keys', () => {
  const key = randomBytes(32);
  const value = { url: 'https://example.com/private', title: '🔐 Private' };
  const record = encryptSyncRecord(value, key, 'record');
  const another = encryptSyncRecord(value, key, 'record');
  expect(record.nonce).not.toBe(another.nonce);
  expect(JSON.stringify(record)).not.toContain('Private');
  expect(decryptSyncRecord(record, key)).toEqual(value);
  expect(() =>
    decryptSyncRecord({ ...record, recordId: 'other' }, key)
  ).toThrow('Unable to decrypt');
  expect(() => decryptSyncRecord({ ...record, keyVersion: 2 }, key)).toThrow(
    'Unable to decrypt'
  );
  expect(() =>
    decryptSyncRecord(
      { ...record, tag: Buffer.alloc(16).toString('base64') },
      key
    )
  ).toThrow('Unable to decrypt');
  expect(() => decryptSyncRecord(record, randomBytes(32))).toThrow(
    'Unable to decrypt'
  );
  expect(() => encryptSyncRecord(value, Buffer.alloc(16), 'record')).toThrow(
    '256-bit'
  );
});

it('preserves legacy provider opt-outs and supports both choices independently', () => {
  const categories = {
    workspace: true,
    openTabs: true,
    preferences: true,
    notes: false,
    passwords: false,
  };
  expect(
    validateSyncSettings({
      enabled: false,
      provider: 'kudiumbrowser',
      categories,
    })
  ).toMatchObject({ enabled: false, icloud: false, categories });
  expect(
    validateSyncSettings({ enabled: true, provider: 'icloud', categories })
  ).toMatchObject({
    enabled: false,
    provider: 'kudiumbrowser',
    icloud: true,
    categories,
  });
  expect(
    validateSyncSettings({ ...defaultSyncSettings(), icloud: true })
  ).toMatchObject({ enabled: true, icloud: true });
  expect(Object.values(defaultSyncSettings().categories).every(Boolean)).toBe(
    true
  );
  expect(() =>
    validateSyncSettings({ ...defaultSyncSettings(), icloud: 'yes' })
  ).toThrow('Invalid');
});

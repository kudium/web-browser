import { AccountSyncClient } from '../main/sync/accountClient';
import { encryptSyncRecord } from '../main/sync/encryption';
import { defaultPreferences } from '../browser/preferences';
import { validateIncomingSnapshot } from '../main/sync/snapshot';

test('opting out while downloading changes prevents the subsequent upload', async () => {
  const key = Buffer.alloc(32, 42);
  const preferences = JSON.parse(JSON.stringify(defaultPreferences));
  preferences.cloudSync = {
    enabled: true,
    provider: 'kudiumbrowser',
    categories: { workspace: true, openTabs: true, preferences: true },
  };
  let release: (value: any) => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = jest.fn(async (path: string) => {
    if (path.includes('account_key_check'))
      return {
        status: 200,
        headers: new Headers(),
        body: {
          envelope: encryptSyncRecord(
            { kind: 'kudium-sync-key', accountId: 'account' },
            key,
            'account_key_check_v1'
          ),
        },
      };
    if (path.includes('changes')) {
      started();
      return new Promise<any>((resolve) => {
        release = resolve;
      });
    }
    throw new Error('Unexpected upload');
  });
  const save = jest.fn();
  const client = new AccountSyncClient({
    load: () => ({
      credential: {
        token: 'private',
        email: 'test@example.com',
        accountId: 'account',
        deviceId: 'one',
        key: key.toString('base64url'),
        enrolled: true,
      },
    }),
    save,
    preferences: () => preferences,
    enable: () => {},
    open: async () => {},
    request,
  });
  client.snapshot({
    apps: [
      {
        id: 'tab',
        sessionId: 'group',
        name: 'Example',
        url: 'https://example.com',
        icon: '',
      },
    ],
    spaces: [],
  });
  const work = client.sync();
  await waiting;
  preferences.cloudSync.categories.workspace = false;
  client.pause();
  release({
    status: 200,
    headers: new Headers(),
    body: { changes: [], cursor: 'cursor', hasMore: false },
  });
  await work;
  expect(request).toHaveBeenCalledTimes(2);
  expect(save).not.toHaveBeenCalled();
});
test('incoming snapshots reject browser hooks and credential-bearing links', () => {
  expect(() =>
    validateIncomingSnapshot({
      version: 1,
      deviceId: 'remote',
      createdAt: 1,
      workspace: {
        spaces: [],
        apps: [
          {
            id: 'tab',
            sessionId: 'group',
            spaceId: 'default',
            name: 'Bad',
            homeUrl: 'https://user:password@example.com',
            favorite: false,
            pinned: true,
            archived: false,
          },
        ],
      },
    })
  ).toThrow('Invalid synced page');
  expect(() =>
    validateIncomingSnapshot({
      version: 1,
      deviceId: 'remote',
      createdAt: 1,
      developer: { before: 'execute me' },
    })
  ).toThrow('Invalid synced data');
});

test.each(['sign-in', 'sign-up'] as const)(
  '%s keeps device approval attached and reuses the pending request',
  async (mode) => {
    const request = jest.fn(async () => ({
      status: 200,
      headers: new Headers(),
      body: {
        device_code: 'private-device-code',
        user_code: 'ABCD1234',
        expires_in: 600,
        interval: 5,
      },
    }));
    const open = jest.fn(async (_url: string) => {});
    const client = new AccountSyncClient({
      load: () => ({}),
      save: jest.fn(),
      preferences: () => defaultPreferences,
      enable: () => {},
      open,
      request,
    });
    await client.connect(mode);
    const url = new URL(open.mock.calls[0][0]);
    expect(url.pathname).toBe(`/${mode}`);
    expect(url.searchParams.get('next')).toBe('/device?user_code=ABCD1234');
    expect(url.toString()).not.toContain('private-device-code');
    expect(client.status()).toMatchObject({
      phase: 'connecting',
      userCode: 'ABCD1234',
    });
    await client.connect();
    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL(open.mock.calls[1][0]).pathname).toBe('/device');
    client.cancel();
    await client.connect(mode);
    expect(request).toHaveBeenCalledTimes(2);
  }
);

test('background password upload stops before writing if the vault locks', async () => {
  const key = Buffer.alloc(32, 42);
  const preferences = {
    ...defaultPreferences,
    cloudSync: {
      ...defaultPreferences.cloudSync,
      enabled: true,
      provider: 'kudiumbrowser' as const,
      categories: {
        ...defaultPreferences.cloudSync.categories,
        passwords: true,
      },
    },
  };
  const request = jest.fn(async (path: string) => ({
    status: 200,
    headers: new Headers(),
    body: path.includes('account_key_check')
      ? {
          envelope: encryptSyncRecord(
            { kind: 'kudium-sync-key', accountId: 'account' },
            key,
            'account_key_check_v1'
          ),
        }
      : { revision: 1 },
  }));
  const client = new AccountSyncClient({
    load: () => ({
      credential: {
        token: 'private',
        email: 'test@example.com',
        accountId: 'account',
        deviceId: 'one',
        key: key.toString('base64url'),
        enrolled: true,
      },
    }),
    save: jest.fn(),
    preferences: () => preferences,
    enable: () => {},
    open: async () => {},
    request,
  });
  await expect(client.syncPasswords([], () => false)).rejects.toThrow('paused');
  expect(request).toHaveBeenCalledTimes(2);
});

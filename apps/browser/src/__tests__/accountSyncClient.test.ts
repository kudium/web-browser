import { AccountSyncClient } from '../main/sync/accountClient';
import { encryptSyncRecord, decryptSyncRecord } from '../main/sync/encryption';
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

function recoveryFixture(request: any) {
  const save = jest.fn();
  const enable = jest.fn();
  const client = new AccountSyncClient({
    load: () => ({ credential: { token: 'fixture-token', email: 'fixture@example.com', accountId: 'account', deviceId: 'device', enrolled: false } }),
    save, enable, preferences: () => JSON.parse(JSON.stringify(defaultPreferences)), open: async () => {}, request,
  });
  return { client, save, enable };
}
const recoveryKey = Buffer.alloc(32, 17);
function recoveryResponse() { return { status: 200, headers: new Headers(), body: { key: recoveryKey.toString('base64url'), managed: true } }; }
function recoveryProof() { return { status: 200, headers: new Headers(), body: { envelope: encryptSyncRecord({ kind: 'kudium-sync-key', accountId: 'account' }, recoveryKey, 'account_key_check_v1') } }; }

test('signed-in managed accounts unlock automatically without asking for a recovery key', async () => {
  const request = jest.fn(async (path: string) => path.endsWith('account-key') ? recoveryResponse() : recoveryProof());
  const { client, save, enable } = recoveryFixture(request);
  await client.autoUnlock();
  expect(client.status().phase).toBe('ready');
  expect(client.status().recoveryKey).toBeUndefined();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ credential: expect.objectContaining({ enrolled: true, key: recoveryKey.toString('base64url') }) }));
  expect(enable).not.toHaveBeenCalled();
  await client.autoUnlock();
  expect(request).toHaveBeenCalledTimes(2);
});

test('older encrypted accounts keep their data and offer recovery when the server needs the old key', async () => {
  const { SyncHTTPError } = await import('../main/sync/transport');
  const request = jest.fn(async () => { throw new SyncHTTPError(409, 'recovery_key_required'); });
  const { client, save } = recoveryFixture(request);
  await client.autoUnlock();
  expect(client.status().phase).toBe('recovery-required');
  expect(client.status().message).toContain('start fresh');
  expect(save).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});

test('managed key responses must decrypt the account proof before being trusted', async () => {
  const wrong = encryptSyncRecord({ kind: 'kudium-sync-key', accountId: 'someone-else' }, recoveryKey, 'account_key_check_v1');
  const { client, save } = recoveryFixture(async (path: string) => path.endsWith('account-key') ? recoveryResponse() : { status: 200, headers: new Headers(), body: { envelope: wrong } });
  await expect(client.recoverAccountKey()).rejects.toThrow('could not unlock');
  expect(client.status().phase).toBe('recovery-required');
  expect(save).not.toHaveBeenCalled();
});

test('reset requires confirmation, preserves sign-in, and provisions a fresh managed key', async () => {
  const request = jest.fn(async (path: string) => path === '/v1/sync/data' ? { status: 200, headers: new Headers(), body: {} } : path.endsWith('account-key') ? recoveryResponse() : recoveryProof());
  const { client, enable } = recoveryFixture(request);
  await expect(client.resetSync(false)).rejects.toThrow('Confirm');
  expect(request).not.toHaveBeenCalled();
  await client.resetSync(true);
  expect(request).toHaveBeenCalledWith('/v1/sync/data', 'fixture-token', undefined, { 'X-Confirm-Delete': 'all-sync-data' }, 'DELETE');
  expect(client.status()).toMatchObject({ phase: 'ready', connected: true });
  expect(client.status().message).toContain('local data was kept');
  expect(enable).not.toHaveBeenCalled();
});

test('failed cloud deletion never provisions a replacement key', async () => {
  const request = jest.fn(async () => { throw new Error('Offline'); });
  const { client } = recoveryFixture(request);
  await expect(client.resetSync(true)).rejects.toThrow('Offline');
  expect(request).toHaveBeenCalledTimes(1);
});

test('a late unlock response cannot restore credentials after disconnecting', async () => {
  let release: (value: any) => void = () => {};
  const response = new Promise<any>(resolve => { release = resolve; });
  const request = jest.fn(async (path: string) => path.endsWith('account-key') ? response : { status: 200, headers: new Headers(), body: {} });
  const { client, save } = recoveryFixture(request);
  const work = client.recoverAccountKey();
  await client.disconnect();
  release(recoveryResponse());
  await work;
  expect(client.status()).toMatchObject({ connected: false, phase: 'off' });
  expect(save).toHaveBeenLastCalledWith({});
});

test('cloud reset keeps the local workspace and uploads it on the next sync', async () => {
  const preferences = JSON.parse(JSON.stringify(defaultPreferences));
  preferences.cloudSync = { ...preferences.cloudSync, provider: 'kudiumbrowser', enabled: false, categories: { ...preferences.cloudSync.categories, workspace: true, openTabs: true } };
  const apps = [{ id: 'local-tab', sessionId: 'local-group', name: 'Keep this tab', url: 'https://example.com', icon: '' }];
  const originalApps = JSON.parse(JSON.stringify(apps));
  const originalPreferences = JSON.parse(JSON.stringify(preferences));
  let uploaded: any;
  const request = jest.fn(async (path: string, _token?: unknown, body?: any, _headers?: unknown, method?: string) => {
    if (path === '/v1/sync/data') return { status: 200, headers: new Headers(), body: {} };
    if (path.endsWith('account-key')) return recoveryResponse();
    if (path.includes('account_key_check')) return recoveryProof();
    if (path.startsWith('/v1/sync/changes')) return { status: 200, headers: new Headers(), body: { changes: [], hasMore: false, cursor: 'fresh-cursor' } };
    if (method === 'PUT') { uploaded = decryptSyncRecord(body, recoveryKey); return { status: 200, headers: new Headers(), body: { revision: 1 } }; }
    throw new Error('Unexpected request');
  });
  const client = new AccountSyncClient({ load: () => ({ credential: { token: 'fixture-token', email: 'fixture@example.com', accountId: 'account', deviceId: 'device', enrolled: false } }), save: jest.fn(), preferences: () => preferences, enable: () => { preferences.cloudSync.enabled = true; }, open: async () => {}, request });
  client.snapshot({ apps, spaces: [] });
  await client.resetSync(true);
  expect(apps).toEqual(originalApps);
  expect(preferences).toEqual(originalPreferences);
  expect(uploaded).toBeUndefined();
  await client.enable({});
  await client.sync(true);
  expect(uploaded.workspace.apps).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'local-tab', homeUrl: 'https://example.com/' })]));
  expect(apps).toEqual(originalApps);
});

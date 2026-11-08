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

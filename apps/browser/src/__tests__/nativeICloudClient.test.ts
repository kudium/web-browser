/** @jest-environment node */
import { nativeICloudClient } from '../main/sync/nativeICloudClient';
import { defaultPreferences } from '../browser/preferences';

it('enrolls two native devices, transfers encrypted organization and passwords, and stops when disabled', async () => {
  const records = new Map<string, any>();
  let account = 'apple-test-account';
  const native = {
    request: jest.fn(async (input: string) => {
      const value = JSON.parse(input);
      if (value.operation === 'account')
        return JSON.stringify({ accountId: account });
      if (value.accountId !== account) throw new Error('Account changed');
      if (value.operation === 'list')
        return JSON.stringify({ records: [...records.values()] });
      const old = records.get(value.recordId);
      if (value.operation === 'get')
        return JSON.stringify(old || { missing: true, revision: 0 });
      if (value.revision !== (old?.revision || 0))
        return JSON.stringify({ conflict: true, revision: old?.revision || 0 });
      const next = {
        recordId: value.recordId,
        revision: value.revision + 1,
        deleted: value.operation === 'remove',
        ...(value.envelope ? { envelope: value.envelope } : {}),
      };
      records.set(value.recordId, next);
      return JSON.stringify(next);
    }),
  };
  const device = () => {
    let saved: any = {};
    const preferences = structuredClone(defaultPreferences);
    preferences.cloudSync = {
      enabled: false,
      provider: 'icloud',
      categories: {
        workspace: true,
        openTabs: true,
        preferences: true,
        passwords: true,
      },
    };
    const client = nativeICloudClient(
      {
        load: () => saved,
        save: (value) => {
          saved = structuredClone(value);
        },
        preferences: () => preferences,
        enable: () => {
          preferences.cloudSync.enabled = true;
        },
      },
      native
    );
    return { client, preferences };
  };
  const a = device();
  const b = device();
  await a.client.connect();
  expect(a.client.status().phase).toBe('key-required');
  const key = a.client.status().recoveryKey;
  await a.client.enable({ savedRecoveryKey: true });
  a.client.snapshot({
    spaces: [{ id: 'work', name: 'Work', color: 'blue', folders: [] }],
    apps: [
      {
        id: 'tab',
        sessionId: 'group',
        spaceId: 'work',
        name: 'Example',
        url: 'https://example.com',
        icon: '',
      },
    ],
  });
  await a.client.sync();
  expect(a.client.status().phase).toBe('ready');
  await b.client.connect();
  expect(b.client.status().phase).toBe('recovery-required');
  await b.client.enable({ recoveryKey: key });
  b.client.snapshot({ apps: [], spaces: [] });
  await b.client.sync();
  const restored = b.client.restore(b.client.status().remote[0].recordId);
  expect(restored.apps[0].url).toBe('https://example.com/');
  expect(restored.apps[0].sessionId).not.toBe('group');
  const login = {
    title: 'Test login',
    origin: 'https://example.com',
    username: 'user',
    password: 'synthetic-password',
  };
  await a.client.syncPasswords([login]);
  await b.client.sync(true);
  expect(
    await b.client.restorePasswords(
      b.client.status().passwordDevices![0].recordId
    )
  ).toEqual([login]);
  expect(JSON.stringify([...records.values()])).not.toContain(
    'synthetic-password'
  );
  b.preferences.cloudSync.enabled = false;
  b.client.pause();
  const before = native.request.mock.calls.length;
  await b.client.sync();
  expect(native.request.mock.calls).toHaveLength(before);
  account = 'different-apple-account';
  await expect(a.client.syncPasswords([login])).rejects.toThrow(
    'account changed'
  );
});

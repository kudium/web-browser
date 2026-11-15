import {
  personalDataForSync,
  validateSyncedPersonalData
} from '../main/sync/personalData';
import { AccountSyncClient } from '../main/sync/accountClient';
import { encryptSyncRecord, decryptSyncRecord } from '../main/sync/encryption';
import { SyncHTTPError } from '../main/sync/transport';
import { defaultPreferences } from '../browser/preferences';
const item: any = {
  id: 'one',
  title: 'Saved form',
  kind: 'profile',
  scope: 'group',
  origin: 'https://example.com',
  username: '',
  password: '',
  fields: [{ name: 'name', value: 'Alex', secret: false }],
  allowAI: true
};
test('exports group records without AI access grants and rejects invalid documents', () => {
  expect(personalDataForSync([item])[0]).toEqual(
    expect.objectContaining({ scope: 'group' })
  );
  expect(personalDataForSync([item])[0]).not.toHaveProperty('allowAI');
  expect(() =>
    validateSyncedPersonalData([
      {
        ...personalDataForSync([item])[0],
        document: { name: 'bad', mime: 'text/html', content: '', text: '' }
      }
    ])
  ).toThrow();
});
test('uploads chunks before committing a manifest and respects opt-out', async () => {
  const key = Buffer.alloc(32, 42);
  const preferences = JSON.parse(JSON.stringify(defaultPreferences));
  preferences.cloudSync.categories.personalData = true;
  const rows = new Map<string, any>();
  let revision = 0;
  let revokeDuringUpload = false;
  const request = jest.fn(
    async (
      path: string,
      _token?: string,
      body?: unknown,
      _headers?: Record<string, string>,
      method?: string
    ) => {
      const id = path.split('/').pop()!;
      if (id === 'account_key_check_v1')
        return {
          status: 200,
          headers: new Headers(),
          body: {
            envelope: encryptSyncRecord(
              { kind: 'kudium-sync-key', accountId: 'account' },
              key,
              id
            )
          }
        };
      if (method === 'PUT') {
        const envelope = body;
        rows.set(id, { revision: ++revision, envelope });
        if (revokeDuringUpload && id.startsWith('personalblob_'))
          preferences.cloudSync.categories.personalData = false;
        return { status: 200, headers: new Headers(), body: { revision } };
      }
      if (!rows.has(id)) throw new SyncHTTPError(404, 'record_not_found');
      return { status: 200, headers: new Headers(), body: rows.get(id) };
    }
  );
  const client = new AccountSyncClient({
    load: () => ({
      credential: {
        token: 'private',
        email: 'test@example.com',
        accountId: 'account',
        deviceId: 'desktop',
        key: key.toString('base64url'),
        enrolled: true
      }
    }),
    save: () => {},
    preferences: () => preferences,
    enable: () => {},
    open: async () => {},
    request
  });
  await client.syncPersonalData(personalDataForSync([item]), () => true);
  const manifest: any = decryptSyncRecord(
    rows.get('personal_desktop').envelope,
    key
  );
  expect(manifest.chunks).toHaveLength(1);
  expect(rows.has(manifest.chunks[0])).toBe(true);
  expect(
    [...rows.values()].map((row) => JSON.stringify(row)).join('')
  ).not.toContain('Alex');
  const count = request.mock.calls.length;
  preferences.cloudSync.categories.personalData = false;
  await expect(
    client.syncPersonalData(personalDataForSync([item]), () => true)
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(count);
  preferences.cloudSync.categories.personalData = true;
  revokeDuringUpload = true;
  const previousRevision = rows.get('personal_desktop').revision;
  await expect(
    client.syncPersonalData(
      personalDataForSync([{ ...item, title: 'Changed' }]),
      () => true
    )
  ).rejects.toThrow('paused');
  expect(rows.get('personal_desktop').revision).toBe(previousRevision);
});

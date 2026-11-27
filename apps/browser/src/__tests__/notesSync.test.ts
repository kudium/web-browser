/** @jest-environment node */
import { AccountSyncClient } from '../main/sync/accountClient';
import { encryptSyncRecord, decryptSyncRecord } from '../main/sync/encryption';
import { defaultPreferences } from '../browser/preferences';

test('backs up notes using encrypted records and respects category opt-out', async () => {
  const key = Buffer.alloc(32, 42);
  const preferences = JSON.parse(JSON.stringify(defaultPreferences));
  preferences.cloudSync = {
    enabled: true,
    provider: 'kudiumbrowser',
    categories: {
      workspace: true,
      openTabs: true,
      preferences: true,
      notes: true,
      passwords: false,
    },
  };
  let stored: any;
  const request = jest.fn(async (url, token, body) => {
    if (url.includes('account_key_check'))
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
    if (body) {
      stored = body;
      return { status: 200, headers: new Headers(), body: {} };
    }
    return {
      status: 200,
      headers: new Headers(),
      body: { revision: 1, envelope: stored },
    };
  });
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
  const notes = [
    { id: 'n', title: 'Plan', notes: 'Private **notes**', scope: 'group:a', todo: {items:[{id:'task',title:'Private task',today:'2026-11-26'}]} },
  ];
  await client.syncNotes(notes, () => true);
  expect(stored.recordId).toBe('notes_one');
  expect(JSON.stringify(stored)).not.toContain('Private');
  expect(decryptSyncRecord(stored, key)).toMatchObject({ items: notes });
  expect(await client.restoreNotes('notes_one')).toEqual(notes);
  preferences.cloudSync.categories.notes = false;
  await expect(client.syncNotes(notes, () => true)).rejects.toThrow();
  await expect(client.restoreNotes('notes_one')).rejects.toThrow();
});

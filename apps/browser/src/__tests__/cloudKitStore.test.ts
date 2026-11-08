import { CloudKitEncryptedStore } from '../main/sync/cloudKitStore';
import { encryptSyncRecord } from '../main/sync/encryption';

it('uploads ciphertext only, validates reads, and retains deletion revisions', async () => {
  let record: any;
  const native = {
    request: jest.fn(async (input: string) => {
      const value = JSON.parse(input);
      if (value.operation === 'account')
        return JSON.stringify({ accountId: 'apple-account' });
      if (value.operation === 'put' || value.operation === 'remove')
        record = {
          recordId: value.recordId,
          revision: value.revision + 1,
          deleted: value.operation === 'remove',
          ...(value.envelope ? { envelope: value.envelope } : {}),
        };
      return JSON.stringify(record || { missing: true, revision: 0 });
    }),
  };
  const store = new CloudKitEncryptedStore(native);
  const encrypted = encryptSyncRecord(
    { password: 'synthetic-secret' },
    Buffer.alloc(32, 1),
    'device_one'
  );
  await store.put('apple-account', encrypted, 0);
  expect(JSON.stringify(native.request.mock.calls)).not.toContain(
    'synthetic-secret'
  );
  expect((await store.get('apple-account', 'device_one'))?.envelope).toEqual(
    encrypted
  );
  await store.remove('apple-account', 'device_one', 1);
  expect(await store.get('apple-account', 'device_one')).toEqual({
    recordId: 'device_one',
    revision: 2,
    deleted: true,
  });
});
it('rejects account changes during download before returning data', async () => {
  let accounts = 0;
  const store = new CloudKitEncryptedStore({
    request: async (input) => {
      if (JSON.parse(input).operation !== 'account')
        return JSON.stringify({ missing: true, revision: 0 });
      accounts += 1;
      return JSON.stringify({ accountId: accounts === 1 ? 'first' : 'second' });
    },
  });
  await expect(store.get('first', 'device_one')).rejects.toThrow(
    'account changed during sync'
  );
});
it('rejects plaintext envelopes without contacting the native service', async () => {
  const native = { request: jest.fn() };
  const store = new CloudKitEncryptedStore(native);
  await expect(
    store.put(
      'apple-account',
      { recordId: 'device_one', password: 'plaintext' } as any,
      0
    )
  ).rejects.toThrow('Invalid encrypted CloudKit envelope');
  expect(native.request).not.toHaveBeenCalled();
});

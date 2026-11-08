/** @jest-environment node */
import { MIGRATED_STORAGE_FILES } from '../main/storageMigration';
import {
  validateStoragePayload,
  readStorageContainer,
  replaceStorageCiphertext,
} from '../main/storageSchemas';
import fixtures from './fixtures/storage-migration-v1.json';

test.each(MIGRATED_STORAGE_FILES)(
  'accepts the frozen schema-1 fixture without changing it: %s',
  (relative) => {
    const value = fixtures.payloads[relative];
    const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
    expect(() => validateStoragePayload(relative, plaintext)).not.toThrow();
    expect(typeof value === 'string' ? value : JSON.stringify(value)).toBe(
      plaintext
    );
  }
);
test('rejects future schema/container versions rather than guessing a converter', () => {
  expect(() =>
    validateStoragePayload(
      'ai-conversations.bin',
      JSON.stringify({ schemaVersion: 2, selectedId: '', chats: [] })
    )
  ).toThrow('Unsupported');
  expect(() =>
    readStorageContainer('ai-settings.json', Buffer.from('{"schemaVersion":2}'))
  ).toThrow('Unsupported');
  expect(() =>
    readStorageContainer(
      'password-manager/vault.json',
      Buffer.from('{"version":3}')
    )
  ).toThrow('Unsupported');
});
test('blocks a conversation upgrade that would discard records, including duplicate IDs and truncated histories', () => {
  const chats = JSON.parse(
    JSON.stringify(fixtures.payloads['ai-conversations.bin'])
  );
  chats.chats.push({ ...chats.chats[0] });
  expect(() =>
    validateStoragePayload('ai-conversations.bin', JSON.stringify(chats))
  ).toThrow('discard');
  chats.chats.pop();
  chats.chats[0].history = Array(101).fill({
    type: 'user',
    text: 'Synthetic history',
  });
  expect(() =>
    validateStoragePayload('ai-conversations.bin', JSON.stringify(chats))
  ).toThrow('discard');
});
test('preserves unrelated vault fields and unknown optional data while replacing only ciphertext', () => {
  const original = {
    version: 2,
    ciphertext: 'MASTER-PASSWORD-ENCRYPTED-BODY',
    futureField: { keep: ['all', 'values'] },
    summary: {
      osEncrypted: Buffer.from('old').toString('base64'),
      futureFlag: true,
    },
  };
  const output = JSON.parse(
    replaceStorageCiphertext(
      'password-manager/vault.json',
      Buffer.from(JSON.stringify(original)),
      Buffer.from('new')
    ).toString()
  );
  expect(output.ciphertext).toBe(original.ciphertext);
  expect(output.futureField).toEqual(original.futureField);
  expect(output.summary.futureFlag).toBe(true);
  expect(Buffer.from(output.summary.osEncrypted, 'base64').toString()).toBe(
    'new'
  );
});

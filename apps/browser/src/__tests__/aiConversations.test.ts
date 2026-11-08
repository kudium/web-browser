import fs from 'fs';
import os from 'os';
import path from 'path';
import type { safeStorage } from 'electron';
import { AIConversationStore } from '../main/aiConversations';

const storage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (text: string) =>
    Buffer.from(Buffer.from(text).toString('base64')),
  decryptString: (data: Buffer) =>
    Buffer.from(data.toString(), 'base64').toString(),
} as unknown as typeof safeStorage;
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-chats-test-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
it.each([true, false])(
  'preserves private-data status %s across restart, including an empty history',
  (privateData) => {
    const file = path.join(root, 'chats.bin');
    const store = new AIConversationStore(file, storage);
    store.current().privateData = privateData;
    store.save();
    expect(new AIConversationStore(file, storage).current().privateData).toBe(
      privateData
    );
  }
);
it.each([true, false])(
  'does not classify ordinary legacy history as saved-data disclosure when nonempty is %s',
  (nonempty) => {
    const file = path.join(root, 'chats.bin');
    const store = new AIConversationStore(file, storage);
    if (nonempty)
      store.current().history.push({ type: 'message', text: 'Legacy reply' });
    delete store.current().privateData;
    store.save();
    expect(new AIConversationStore(file, storage).current().privateData).toBe(
      false
    );
  }
);
it('isolates histories, drafts, and checkpoint state, and restores the selected chat securely', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, storage);
  const a = store.current().id;
  store
    .current()
    .history.push(
      { type: 'user', text: 'Alpha private task' },
      { type: 'message', text: 'Alpha answer' }
    );
  store.current().draft = 'Alpha draft';
  store.current().checkpoint = {
    messages: [{ role: 'user', content: 'Alpha' }],
    step: 1,
    endpoint: 'https://example.com',
    expires: Date.now() + 60000,
  };
  store.save();
  store.create('work');
  const b = store.current().id;
  expect(store.current().history).toEqual([]);
  expect(store.current().checkpoint).toBeUndefined();
  store.current().history.push({ type: 'user', text: 'Beta task' });
  store.current().draft = 'Beta draft';
  store.save();
  store.select(a);
  expect(store.current().draft).toBe('Alpha draft');
  expect(
    store.snapshot().history.some((event) => event.text.includes('Beta'))
  ).toBe(false);
  expect(store.current().checkpoint).toBeDefined();
  expect(fs.readFileSync(file).toString()).not.toContain('Alpha private task');
  const restored = new AIConversationStore(file, storage);
  expect(restored.current().id).toBe(a);
  expect(restored.current().checkpoint).toBeDefined();
  restored.select(b);
  expect(restored.current().draft).toBe('Beta draft');
  expect(restored.current().checkpoint).toBeUndefined();
});
it('keeps sensitive chat data in memory when encryption is unavailable', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, {
    ...storage,
    isEncryptionAvailable: () => false,
  } as typeof safeStorage);
  store.current().history.push({ type: 'user', text: 'Private draft' });
  store.save();
  expect(fs.existsSync(file)).toBe(false);
  expect(store.snapshot().storageNotice).toContain('secure local storage');
  expect(store.snapshot().history).toHaveLength(1);
});
it('preserves chat recovery data and reports failed saves without dropping current work', () => {
  const file = path.join(root, 'chats.bin');
  fs.writeFileSync(file, 'corrupt encrypted fixture');
  const store = new AIConversationStore(file, storage);
  expect(fs.readFileSync(`${file}.recovery`, 'utf8')).toBe(
    'corrupt encrypted fixture'
  );
  store.current().history.push({ type: 'user', text: 'New work' });
  const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  store.save();
  rename.mockRestore();
  expect(store.snapshot().storageNotice).toContain('Could not save');
  expect(store.snapshot().history[0].text).toBe('New work');
});
it('deletion affects only the selected chat and always leaves a usable context', () => {
  const store = new AIConversationStore(path.join(root, 'chats.bin'), storage);
  const a = store.current().id;
  store.create();
  const b = store.current().id;
  store.delete(a);
  expect(store.snapshot().conversations.map((chat) => chat.id)).toEqual([b]);
  store.delete(b);
  expect(store.snapshot().conversations).toHaveLength(1);
  expect(store.current().id).not.toBe(b);
});

it('preserves generated titles and user renames across messages and restart', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, storage);
  const { id } = store.current();
  store
    .current()
    .history.push({ type: 'user', text: 'Investigate the slow checkout flow' });
  store.save();
  store.rename(id, 'Checkout performance', 'ai');
  store.current().history.push({ type: 'user', text: 'Another request' });
  store.save();
  expect(store.current().title).toBe('Checkout performance');
  store.rename(id, 'My checkout investigation');
  store.rename(id, 'Late AI suggestion', 'ai');
  expect(new AIConversationStore(file, storage).current().title).toBe(
    'My checkout investigation'
  );
  expect(() => store.rename(id, '   ')).toThrow('chat name');
  expect(() => store.rename(id, 'x'.repeat(71))).toThrow('chat name');
});

it('keeps newest-created chat order stable through selection, draft saves, renaming, and restart', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, storage);
  const first = store.current().id;
  store.create();
  const second = store.current().id;
  store.create();
  const third = store.current().id;
  const order = () => store.snapshot().conversations.map((chat) => chat.id);
  expect(order()).toEqual([third, second, first]);
  store.select(first);
  store.current().draft = 'Continue the oldest chat';
  store.save();
  store.rename(first, 'Renamed oldest chat');
  expect(order()).toEqual([third, second, first]);
  expect(
    new AIConversationStore(file, storage)
      .snapshot()
      .conversations.map((chat) => chat.id)
  ).toEqual([third, second, first]);
});

it('persists manual chat order independently of selection and deletes attached metadata with its chat', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, storage);
  const a = store.current().id;
  store.current().history.push({
    type: 'user',
    text: 'Review',
    attachments: [{ id: 'file', name: 'notes.txt', kind: 'document' }],
    contexts: [{ id: 'page', name: 'Example', kind: 'tab' }],
  });
  store.create();
  const b = store.current().id;
  store.create();
  const c = store.current().id;
  store.reorder(a, c);
  expect(store.snapshot().conversations.map((chat) => chat.id)).toEqual([
    a,
    c,
    b,
  ]);
  store.reorder(a, null);
  store.select(a);
  expect(
    new AIConversationStore(file, storage)
      .snapshot()
      .conversations.map((chat) => chat.id)
  ).toEqual([c, b, a]);
  expect(
    new AIConversationStore(file, storage).snapshot().history[0]
  ).toHaveProperty('attachments');
  store.delete(a);
  expect(store.find(a)).toBeUndefined();
  expect(new AIConversationStore(file, storage).find(a)).toBeUndefined();
});

it('persists the chat recipient across restart and isolates it between chats', () => {
  const file = path.join(root, 'chats.bin');
  const store = new AIConversationStore(file, storage);
  const first = store.current().id;
  store.current().privateRecipient = 'provider/model/credential-fingerprint';
  store.save();
  const restored = new AIConversationStore(file, storage);
  expect(restored.current().privateRecipient).toBe(
    'provider/model/credential-fingerprint'
  );
  restored.create();
  expect(restored.current().privateRecipient).toBeUndefined();
  restored.select(first);
  expect(restored.current().privateRecipient).toBe(
    'provider/model/credential-fingerprint'
  );
});

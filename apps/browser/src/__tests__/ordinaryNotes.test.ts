/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { VaultItem } from '../browser/passwordManager';
import { safeStorage } from '../main/localStorage';
import { ordinaryNotesStorage } from '../main/passwordManager/ordinaryNotes';

jest.mock('../main/localStorage', () => {
  const crypto = jest.requireActual('crypto');
  const key = Buffer.alloc(32, 42);
  return {
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'os_crypt',
      encryptString: (text: string) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const data = Buffer.concat([
          cipher.update(text, 'utf8'),
          cipher.final(),
        ]);
        return Buffer.concat([iv, cipher.getAuthTag(), data]);
      },
      decryptString: jest.fn((value: Buffer) => {
        const cipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          value.subarray(0, 12)
        );
        cipher.setAuthTag(value.subarray(12, 28));
        return Buffer.concat([
          cipher.update(value.subarray(28)),
          cipher.final(),
        ]).toString('utf8');
      }),
    },
  };
});
const note: VaultItem = {
  id: 'one',
  title: 'Meeting',
  notes: 'Private note content',
  kind: 'note',
  sensitive: false,
  allowAI: false,
  fields: [],
  origin: '',
  username: '',
  password: '',
};
test('title browsing does not decrypt note bodies and edits do not rewrite other notes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ordinary-notes-'));
  try {
    const file = path.join(root, 'notes.bin');
    const storage = ordinaryNotesStorage(file);
    storage.save([note, { ...note, id: 'two', title: 'Other note' }]);
    const paths = fs.readdirSync(`${file}.data`);
    const before = new Map(
      paths.map((name) => [
        name,
        fs.readFileSync(path.join(`${file}.data`, name)),
      ])
    );
    expect(
      fs.readFileSync(file).includes(Buffer.from('Private note content'))
    ).toBe(false);
    const reopened = ordinaryNotesStorage(file);
    (safeStorage.decryptString as jest.Mock).mockClear();
    expect(reopened.summaries?.()).toHaveLength(2);
    expect(safeStorage.decryptString).toHaveBeenCalledTimes(1);
    expect(reopened.get?.('one')?.notes).toBe(note.notes);
    expect(safeStorage.decryptString).toHaveBeenCalledTimes(2);
    reopened.upsert?.({ ...note, notes: 'Updated' });
    const remaining = fs.readdirSync(`${file}.data`);
    expect(remaining).toHaveLength(2);
    const untouched = paths.filter((name) => remaining.includes(name));
    expect(untouched).toHaveLength(1);
    expect(fs.readFileSync(path.join(`${file}.data`, untouched[0]))).toEqual(
      before.get(untouched[0])
    );
    expect(ordinaryNotesStorage(file).get?.('one')?.notes).toBe('Updated');
    expect(() => reopened.upsert?.({ ...note, sensitive: true })).toThrow(
      'protected vault'
    );
    expect(reopened.get?.('one')?.notes).toBe('Updated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unread state survives restart and read-only changes persist without changing content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unread-notes-'));
  try {
    const file = path.join(root, 'notes.bin');
    const storage = ordinaryNotesStorage(file);
    storage.upsert!({ ...note, asRead: false });
    const restarted = ordinaryNotesStorage(file);
    expect(restarted.summaries!()[0].asRead).toBe(false);
    const opened = restarted.get!(note.id)!;
    restarted.upsert!({ ...opened, asRead: true });
    const read = ordinaryNotesStorage(file);
    expect(read.summaries!()[0].asRead).toBe(true);
    expect(read.get!(note.id)!.notes).toBe(note.notes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PasswordVault } from '../main/passwordManager/vault';
import { validateSyncedNotes } from '../browser/notes';
import { encryptSyncRecord, decryptSyncRecord } from '../main/sync/encryption';
import type { VaultItem } from '../browser/passwordManager';

let directory: string;
let vault: PasswordVault;
const credential = 'notes test encryption credential';
const note: VaultItem = {
  id: 'note',
  kind: 'note',
  title: 'Release plan',
  notes: `# Release\n\`\`\`js\nconsole.log("secret plan");\n\`\`\`\n${'x'.repeat(
    3000
  )}`,
  origin: '',
  username: '',
  password: '',
  fields: [],
  allowAI: true,
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-'));
  vault = new PasswordVault(path.join(directory, 'vault.json'));
  vault.unlock(credential, true);
  vault.settings(true, true, true);
});
afterEach(() => {
  vault.lock();
  fs.rmSync(directory, { recursive: true, force: true });
});
test('persists encrypted Markdown and returns titles before paged reads', () => {
  vault.save(note);
  expect(
    fs.readFileSync(path.join(directory, 'vault.json'), 'utf8')
  ).not.toContain('secret plan');
  expect(vault.noteSummaries()[0]).not.toHaveProperty('notes');
  expect(vault.search('Release')[0]).toMatchObject({
    title: 'Release plan',
    excerpt: '',
  });
  expect(vault.readSafe('note').notes).toHaveLength(2000);
  expect(vault.readSafe('note').nextOffset).toBe(2000);
  vault.lock();
  vault.unlock(credential);
  expect(vault.edit('note').notes).toBe(note.notes);
});
test('moves notes and enforces group boundaries', () => {
  vault.save(note);
  vault.moveNote('note', 'group:a');
  expect(() => vault.readSafe('note', 'group:b')).toThrow();
  expect(vault.readSafe('note', 'group:a').title).toBe(note.title);
  vault.moveNote('note');
  expect(vault.edit('note').scope).toBeUndefined();
});
test('restores without overwriting, deduplicates and disables AI', () => {
  vault.save(note);
  const backup = [
    {
      id: 'remote',
      title: 'Meeting',
      notes: 'Markdown **notes**',
      scope: 'group:a',
    },
  ];
  expect(vault.importNotes(backup)).toBe(1);
  expect(vault.importNotes(backup)).toBe(0);
  const summary = vault
    .noteSummaries()
    .find((item) => item.title === 'Meeting')!;
  expect(summary.allowAI).toBe(false);
  expect(() => vault.readSafe(summary.id, summary.scope)).toThrow();
  expect(vault.edit('note').notes).toBe(note.notes);
});
test('validates bounded backups and encrypts note content', () => {
  const backup = [{ id: 'n', title: 'Note', notes: 'Hello' }];
  expect(validateSyncedNotes(backup)).toHaveLength(1);
  expect(() => validateSyncedNotes([...backup, ...backup])).toThrow();
  expect(() =>
    validateSyncedNotes([{ ...backup[0], allowAI: true }])
  ).toThrow();
  expect(() =>
    validateSyncedNotes([{ ...backup[0], notes: 'x'.repeat(100001) }])
  ).toThrow();
  const key = Buffer.alloc(32, 42);
  const envelope = encryptSyncRecord(backup, key, 'notes_device');
  expect(JSON.stringify(envelope)).not.toContain('Hello');
  expect(decryptSyncRecord(envelope, key)).toEqual(backup);
});

test('ordinary notes work before vault creation and remain accessible after vault lock', () => {
  let ordinary: VaultItem[] = [];
  const storage = {
    load: () => ordinary,
    save: (items: VaultItem[]) => {
      ordinary = items;
    },
  };
  const current = new PasswordVault(
    path.join(directory, 'ordinary-test.json'),
    Date.now,
    undefined,
    undefined,
    undefined,
    storage
  );
  current.save({ ...note, sensitive: false });
  expect(current.status().initialized).toBe(false);
  expect(current.edit(note.id).notes).toBe(note.notes);
  expect(current.search('Release')[0].title).toBe(note.title);
  expect(current.readSafe(note.id).notes).toHaveLength(2000);
  current.moveNote(note.id, 'group:a');
  expect(() => current.edit(note.id, 'group:b')).toThrow();
  expect(current.edit(note.id, 'group:a').notes).toBe(note.notes);
  current.unlock(credential, true);
  current.settings(true, true, true);
  current.save(
    { ...current.edit(note.id, 'group:a'), sensitive: true },
    'group:a'
  );
  expect(ordinary).toHaveLength(0);
  current.lock();
  expect(current.noteSummaries()[0].sensitive).toBe(true);
  expect(() => current.edit(note.id, 'group:a')).toThrow();
  current.unlock(credential);
  current.save(
    { ...current.edit(note.id, 'group:a'), sensitive: false },
    'group:a'
  );
  current.lock();
  expect(current.edit(note.id, 'group:a').notes).toBe(note.notes);
  expect(current.noteSummaries()[0].sensitive).toBe(false);
  current.removeOrdinaryNoteScope('group:a', 'move');
  expect(current.edit(note.id).scope).toBeUndefined();
});

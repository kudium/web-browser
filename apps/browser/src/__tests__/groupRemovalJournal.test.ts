/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GroupRemovalJournal, removalSteps } from '../main/groupRemovalJournal';
import { PasswordVault } from '../main/passwordManager/vault';
import type { IApp } from '../types';

const intent = {
  group: 'work',
  space: 'default',
  ids: ['one'],
  profiles: ['profile'],
  scope: 'group:work',
};
const item = {
  id: 'one',
  sessionId: 'work',
  sessionProfileId: 'profile',
} as IApp;
let folder: string;
let filename: string;
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'removal-journal-'));
  filename = path.join(folder, 'journal.json');
});
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

it('retains completed steps across reload and refuses a different approved target', () => {
  const first = new GroupRemovalJournal(filename);
  let operation = first.begin(intent);
  operation = first.advance(operation);
  const resumed = new GroupRemovalJournal(filename);
  expect(resumed.begin(intent).next).toBe(1);
  expect(resumed.blocks(item)).toBe(true);
  expect(resumed.blocks({ ...item, id: 'other', sessionId: 'other' })).toBe(
    true
  );
  expect(() =>
    resumed.begin({
      ...intent,
      group: 'other',
      ids: ['other'],
      scope: 'group:other',
    })
  ).toThrow('pending group cleanup');
  expect(() => resumed.begin({ ...intent, ids: ['replacement'] })).toThrow(
    'changed since cleanup'
  );
  while (operation.next < removalSteps(operation).length)
    operation = resumed.advance(operation);
  const completed = new GroupRemovalJournal(filename);
  expect(completed.removed('one')).toBe(true);
  expect(completed.blocksScope('group:work')).toBe(false);
  expect(completed.blocks({ ...item, id: 'fresh' })).toBe(false);
});

it('keeps group-scope vault writes blocked through pending cleanup', () => {
  const journal = new GroupRemovalJournal(filename);
  let operation = journal.begin(intent);
  const vault = new PasswordVault(
    path.join(folder, 'vault.json'),
    Date.now,
    undefined,
    (scope) => {
      if (journal.blocksScope(scope)) throw new Error('Cleanup pending');
    }
  );
  vault.unlock('synthetic vault credential', true);
  const record = {
    id: '',
    title: 'Fixture',
    kind: 'knowledge' as const,
    origin: '',
    username: '',
    password: '',
    fields: [],
    allowAI: false,
  };
  expect(() => vault.save(record, 'group:work')).toThrow('Cleanup pending');
  expect(() => vault.save(record, 'group:other')).not.toThrow();
  while (operation.next < removalSteps(operation).length)
    operation = journal.advance(operation);
  expect(() => vault.save(record, 'group:work')).not.toThrow();
  vault.lock();
});

it('does not activate an invalid journal or overwrite its original bytes', () => {
  fs.writeFileSync(filename, '{"version":1,"operations":[{"id":"bad"}]}');
  const original = fs.readFileSync(filename);
  expect(() => new GroupRemovalJournal(filename)).toThrow('invalid');
  expect(fs.readFileSync(filename)).toEqual(original);
});

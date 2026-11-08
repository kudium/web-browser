/** @jest-environment node */
/* eslint-disable no-bitwise */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  StorageMigration,
  readMigrationJournal,
  storageDigest,
} from '../main/storageMigration';
import { exportStorageRecovery } from '../../.erb/scripts/storage-recovery';

let directory: string;
let profile: string;
let active: string;
const keyId = storageDigest(Buffer.from('unit-test-key-identifier'));
const source = Buffer.from('OPAQUE-ORIGINAL-CIPHERTEXT');
const target = Buffer.from('OPAQUE-VERIFIED-TARGET-CIPHERTEXT');
const validate = async (_relative: string, before: Buffer, after: Buffer) => {
  expect(before).toEqual(source);
  expect(after).toEqual(target);
};
beforeEach(() => {
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-migration-journal-')
  );
  profile = path.join(directory, 'profile');
  fs.mkdirSync(path.join(profile, 'secure-storage'), { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'secure-storage/key.json'),
    'OPAQUE-WRAPPED-KEY'
  );
  active = path.join(profile, 'ai-tasks.bin');
  fs.writeFileSync(active, source);
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function retained(section: string, relative: string) {
  return path.join(
    profile,
    'secure-storage',
    'migrations',
    readMigrationJournal(profile)!.transactionId,
    section,
    relative
  );
}

test('stages before commit, retains ciphertext and wrapped key, and confirms launches without pruning', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  expect(fs.readFileSync(active)).toEqual(source);
  expect(fs.readFileSync(retained('backup', 'ai-tasks.bin'))).toEqual(source);
  expect(
    fs.readFileSync(retained('backup', 'secure-storage/key.json')).toString()
  ).toBe('OPAQUE-WRAPPED-KEY');
  expect(fs.statSync(retained('backup', 'ai-tasks.bin')).mode & 0o777).toBe(
    0o600
  );
  expect(await migration.commit(validate)).toEqual([]);
  expect(fs.readFileSync(active)).toEqual(target);
  expect(readMigrationJournal(profile)!.state).toBe('complete');
  const first = randomUUID();
  migration.confirmLaunch(first);
  migration.confirmLaunch(first);
  migration.confirmLaunch(randomUUID());
  migration.confirmLaunch(randomUUID());
  expect(readMigrationJournal(profile)!.confirmedLaunches).toHaveLength(2);
  expect(fs.existsSync(retained('backup', 'ai-tasks.bin'))).toBe(true);
});

test('resumes a staged transaction in a fresh instance', async () => {
  new StorageMigration(profile, keyId).stage('ai-tasks.bin', source, target);
  expect(await new StorageMigration(profile, keyId).commit(validate)).toEqual(
    []
  );
  expect(fs.readFileSync(active)).toEqual(target);
});

test('recovers a crash after installing the target but before writing its receipt', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  const rename = fs.renameSync;
  let installed = false;
  let injected = false;
  const fault = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === active) installed = true;
    if (
      installed &&
      !injected &&
      to === path.join(profile, 'secure-storage/migration-journal.json')
    ) {
      injected = true;
      throw new Error('Simulated interruption');
    }
    rename(from, to);
  });
  try {
    expect(await migration.commit(validate)).toEqual(['ai-tasks.bin']);
  } finally {
    fault.mockRestore();
  }
  expect(fs.readFileSync(active)).toEqual(target);
  expect(await new StorageMigration(profile, keyId).commit(validate)).toEqual(
    []
  );
  expect(readMigrationJournal(profile)!.state).toBe('complete');
});

test('a failed commit preserves originals and can retry', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  const rename = fs.renameSync;
  const failure = jest
    .spyOn(fs, 'renameSync')
    .mockImplementation((from, to) => {
      if (to === active) throw new Error('Disk full');
      rename(from, to);
    });
  try {
    expect(await migration.commit(validate)).toEqual(['ai-tasks.bin']);
  } finally {
    failure.mockRestore();
  }
  expect(fs.readFileSync(active)).toEqual(source);
  expect(await new StorageMigration(profile, keyId).commit(validate)).toEqual(
    []
  );
});

test('never overwrites data changed by a concurrent writer', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  fs.writeFileSync(active, 'NEWER-USER-CIPHERTEXT');
  expect(await migration.commit(validate)).toEqual(['ai-tasks.bin']);
  expect(fs.readFileSync(active, 'utf8')).toBe('NEWER-USER-CIPHERTEXT');
  expect(fs.readFileSync(retained('backup', 'ai-tasks.bin'))).toEqual(source);
});

test.each(['backup', 'staged'])(
  'rejects tampered %s data before replacing the active file',
  async (section) => {
    const migration = new StorageMigration(profile, keyId);
    migration.stage('ai-tasks.bin', source, target);
    fs.writeFileSync(retained(section, 'ai-tasks.bin'), 'TAMPERED');
    expect(await migration.commit(validate)).toEqual(['ai-tasks.bin']);
    expect(fs.readFileSync(active)).toEqual(source);
  }
);

test('requires a verified recovery key and rejects a different active data key', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  expect(
    () =>
      new StorageMigration(profile, storageDigest(Buffer.from('different key')))
  ).toThrow('different data key');
  fs.writeFileSync(retained('backup', 'secure-storage/key.json'), 'BROKEN');
  await expect(migration.commit(validate)).rejects.toThrow(
    'key recovery backup'
  );
  expect(fs.readFileSync(active)).toEqual(source);
});

test('exports originals to a separate directory without overwriting newer work', async () => {
  const migration = new StorageMigration(profile, keyId);
  migration.stage('ai-tasks.bin', source, target);
  await migration.commit(validate);
  const output = path.join(directory, 'recovery-copy');
  expect(exportStorageRecovery(profile, output)).toBe(2);
  expect(fs.readFileSync(path.join(output, 'ai-tasks.bin'))).toEqual(source);
  expect(fs.readFileSync(active)).toEqual(target);
  expect(() => exportStorageRecovery(profile, output)).toThrow('nonexistent');
  expect(() =>
    exportStorageRecovery(profile, path.join(profile, 'recovery'))
  ).toThrow('outside');
});

test('unknown journal versions and traversal records fail closed', () => {
  new StorageMigration(profile, keyId).stage('ai-tasks.bin', source, target);
  const file = path.join(profile, 'secure-storage/migration-journal.json');
  const journal = readMigrationJournal(profile)!;
  fs.writeFileSync(file, JSON.stringify({ ...journal, version: 99 }));
  expect(() => new StorageMigration(profile, keyId)).toThrow('Unsupported');
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...journal,
      entries: { '../outside': journal.entries['ai-tasks.bin'] },
    })
  );
  expect(() => new StorageMigration(profile, keyId)).toThrow('Invalid');
  expect(fs.readFileSync(active)).toEqual(source);
});

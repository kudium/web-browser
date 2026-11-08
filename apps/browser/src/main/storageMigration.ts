/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { atomicStorageWrite, readStorageFile } from './storageFiles';

export const STORAGE_MIGRATION_ID = 'os-ciphertext-to-local-aes-gcm-v1';
export const MIGRATED_STORAGE_FILES = [
  'ai-checkpoint.bin',
  'ai-conversations.bin',
  'ai-tasks.bin',
  'password-manager/os-key',
  'ai-settings.json',
  'password-manager/vault.json',
] as const;
export type MigratedStorageFile = (typeof MIGRATED_STORAGE_FILES)[number];
export const storageDigest = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');
interface Entry {
  sourceHash: string;
  targetHash?: string;
  state: 'backed-up' | 'staged' | 'committed' | 'blocked';
}
export interface StorageMigrationJournal {
  version: 1;
  migrationId: typeof STORAGE_MIGRATION_ID;
  transactionId: string;
  keyId: string;
  keyBackupHash: string;
  createdAt: string;
  state: 'preparing' | 'committing' | 'complete' | 'blocked';
  entries: Partial<Record<MigratedStorageFile, Entry>>;
  confirmedLaunches: string[];
}
const hashPattern = /^[a-f0-9]{64}$/;
const transactionPattern = /^[a-f0-9-]{36}$/;

export function readMigrationJournal(
  profile: string
): StorageMigrationJournal | undefined {
  const file = path.join(profile, 'secure-storage', 'migration-journal.json');
  if (!fs.existsSync(file)) return undefined;
  const journal = JSON.parse(
    readStorageFile(file, 1024 * 1024).toString('utf8')
  );
  if (
    journal.version !== 1 ||
    journal.migrationId !== STORAGE_MIGRATION_ID ||
    !transactionPattern.test(journal.transactionId) ||
    !hashPattern.test(journal.keyId) ||
    !hashPattern.test(journal.keyBackupHash) ||
    !['preparing', 'committing', 'complete', 'blocked'].includes(
      journal.state
    ) ||
    !journal.entries ||
    Array.isArray(journal.entries) ||
    typeof journal.entries !== 'object' ||
    !Array.isArray(journal.confirmedLaunches) ||
    journal.confirmedLaunches.length > 2 ||
    journal.confirmedLaunches.some(
      (id: unknown) => typeof id !== 'string' || !transactionPattern.test(id)
    )
  )
    throw new Error('Unsupported or invalid storage migration journal.');
  for (const [relative, value] of Object.entries(journal.entries) as [
    string,
    Entry
  ][]) {
    if (
      !(MIGRATED_STORAGE_FILES as readonly string[]).includes(relative) ||
      !value ||
      !hashPattern.test(value.sourceHash) ||
      !['backed-up', 'staged', 'committed', 'blocked'].includes(value.state) ||
      (value.targetHash !== undefined && !hashPattern.test(value.targetHash)) ||
      (['staged', 'committed'].includes(value.state) && !value.targetHash)
    )
      throw new Error('Invalid storage migration record.');
  }
  return journal;
}

/**
 * Encrypted originals and staged replacements survive crashes; no plaintext is
 * written.
 */
export class StorageMigration {
  private journal?: StorageMigrationJournal;

  constructor(private profile: string, private keyId: string) {
    this.journal = readMigrationJournal(profile);
    if (this.journal && this.journal.keyId !== keyId)
      throw new Error('Storage migration belongs to a different data key.');
  }

  private location(section: 'backup' | 'staged', relative: string) {
    return path.join(
      this.profile,
      'secure-storage',
      'migrations',
      this.journal!.transactionId,
      section,
      relative
    );
  }

  private persist() {
    const bytes = JSON.stringify(this.journal);
    // Keep a receipt with each retained transaction as well as the current pointer.
    atomicStorageWrite(
      path.join(
        this.profile,
        'secure-storage',
        'migrations',
        this.journal!.transactionId,
        'journal.json'
      ),
      bytes
    );
    atomicStorageWrite(
      path.join(this.profile, 'secure-storage', 'migration-journal.json'),
      bytes
    );
  }

  private begin() {
    if (this.journal && this.journal.state !== 'complete') return;
    const key = readStorageFile(
      path.join(this.profile, 'secure-storage', 'key.json')
    );
    this.journal = {
      version: 1,
      migrationId: STORAGE_MIGRATION_ID,
      transactionId: randomUUID(),
      keyId: this.keyId,
      keyBackupHash: storageDigest(key),
      createdAt: new Date().toISOString(),
      state: 'preparing',
      entries: {},
      confirmedLaunches: [],
    };
    atomicStorageWrite(
      this.location('backup', 'secure-storage/key.json'),
      key,
      true
    );
    this.persist();
  }

  preserve(relative: MigratedStorageFile, source: Buffer) {
    this.begin();
    const sourceHash = storageDigest(source);
    const existing = this.journal!.entries[relative];
    if (existing) {
      if (existing.sourceHash !== sourceHash)
        throw new Error('Storage changed while its migration was pending.');
      if (
        storageDigest(readStorageFile(this.location('backup', relative))) !==
        sourceHash
      )
        throw new Error('Storage recovery backup did not verify.');
      return;
    }
    const backup = this.location('backup', relative);
    if (fs.existsSync(backup)) {
      if (storageDigest(readStorageFile(backup)) !== sourceHash)
        throw new Error(
          'Storage recovery backup already contains different data.'
        );
    } else atomicStorageWrite(backup, source, true);
    this.journal!.entries[relative] = { sourceHash, state: 'backed-up' };
    this.persist();
  }

  stage(relative: MigratedStorageFile, source: Buffer, target: Buffer) {
    this.preserve(relative, source);
    const file = this.location('staged', relative);
    atomicStorageWrite(file, target);
    const targetHash = storageDigest(target);
    if (storageDigest(readStorageFile(file)) !== targetHash)
      throw new Error('Staged storage did not verify.');
    this.journal!.entries[relative] = {
      sourceHash: storageDigest(source),
      targetHash,
      state: 'staged',
    };
    this.persist();
  }

  block(relative: MigratedStorageFile) {
    if (!this.journal?.entries[relative]) return;
    this.journal.entries[relative]!.state = 'blocked';
    this.journal.state = 'blocked';
    this.persist();
  }

  async commit(
    validate: (
      relative: MigratedStorageFile,
      source: Buffer,
      target: Buffer
    ) => Promise<void>
  ) {
    const failed: MigratedStorageFile[] = [];
    if (!this.journal || this.journal.state === 'complete') return failed;
    if (
      storageDigest(
        readStorageFile(this.location('backup', 'secure-storage/key.json'))
      ) !== this.journal.keyBackupHash
    )
      throw new Error('Wrapped key recovery backup did not verify.');
    this.journal.state = 'committing';
    this.persist();
    for (const [relative, entry] of Object.entries(this.journal.entries) as [
      MigratedStorageFile,
      Entry
    ][]) {
      if (entry.state === 'committed') continue;
      if (!entry.targetHash) {
        failed.push(relative);
        continue;
      }
      try {
        const source = readStorageFile(this.location('backup', relative));
        const target = readStorageFile(this.location('staged', relative));
        if (
          storageDigest(source) !== entry.sourceHash ||
          storageDigest(target) !== entry.targetHash
        )
          throw new Error('Migration files did not verify.');
        await validate(relative, source, target);
        const file = path.join(this.profile, relative);
        const currentHash = storageDigest(readStorageFile(file));
        if (
          currentHash !== entry.sourceHash &&
          currentHash !== entry.targetHash
        )
          throw new Error('Active storage changed during migration.');
        if (currentHash !== entry.targetHash) atomicStorageWrite(file, target);
        if (storageDigest(readStorageFile(file)) !== entry.targetHash)
          throw new Error('Committed storage did not verify.');
        entry.state = 'committed';
        this.persist();
      } catch {
        failed.push(relative);
        this.block(relative);
      }
    }
    this.journal.state = failed.length ? 'blocked' : 'complete';
    this.persist();
    return failed;
  }

  confirmLaunch(id: string) {
    if (
      !this.journal ||
      this.journal.state !== 'complete' ||
      this.journal.confirmedLaunches.includes(id)
    )
      return;
    if (this.journal.confirmedLaunches.length < 2) {
      this.journal.confirmedLaunches.push(id);
      this.persist();
    }
    // Retention is deliberately explicit: confirmation never deletes backups.
  }
}

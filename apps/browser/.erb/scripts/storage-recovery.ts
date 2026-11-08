/* eslint-disable no-restricted-syntax */
import fs from 'fs';
import path from 'path';
import {
  readMigrationJournal,
  storageDigest,
  MIGRATED_STORAGE_FILES,
} from '../../src/main/storageMigration';
import {
  readStorageFile,
  atomicStorageWrite,
} from '../../src/main/storageFiles';

/** Export to a new directory; never overwrite a live profile or newer user work. */
export function exportStorageRecovery(profile: string, output: string) {
  const destinationParent = fs.realpathSync(path.dirname(path.resolve(output)));
  const outputRelative = path.relative(
    fs.realpathSync(profile),
    path.join(destinationParent, path.basename(output))
  );
  if (
    !outputRelative.startsWith(`..${path.sep}`) &&
    outputRelative !== '..' &&
    !path.isAbsolute(outputRelative)
  )
    throw new Error('Recovery output must be outside the active profile.');
  if (fs.existsSync(output))
    throw new Error('Recovery output must be a new, nonexistent directory.');
  const journal = readMigrationJournal(profile);
  if (!journal) throw new Error('No journaled storage migration was found.');
  const backup = path.join(
    profile,
    'secure-storage',
    'migrations',
    journal.transactionId,
    'backup'
  );
  const files = [
    'secure-storage/key.json',
    ...MIGRATED_STORAGE_FILES.filter((relative) => journal.entries[relative]),
  ];
  // Verify all originals before creating any output.
  const records = files.map((relative) => {
    const bytes = readStorageFile(path.join(backup, relative));
    const expected =
      relative === 'secure-storage/key.json'
        ? journal.keyBackupHash
        : journal.entries[relative as (typeof MIGRATED_STORAGE_FILES)[number]]!
            .sourceHash;
    if (storageDigest(bytes) !== expected)
      throw new Error('Recovery originals did not verify.');
    return { relative, bytes };
  });
  fs.mkdirSync(output, { recursive: false, mode: 0o700 });
  for (const { relative, bytes } of records)
    atomicStorageWrite(path.join(output, relative), bytes, true);
  atomicStorageWrite(
    path.join(output, 'recovery-manifest.json'),
    JSON.stringify({
      version: 1,
      transactionId: journal.transactionId,
      migrationId: journal.migrationId,
      snapshotAt: journal.createdAt,
      files: records.map(({ relative }) => relative),
      warning:
        'Pre-migration encrypted snapshot only. Keep the current profile. Newer edits are not included. Use a copy for recovery; this is not an automatic downgrade.',
    }),
    true
  );
  return records.length;
}

if (require.main === module) {
  const [operation, profileArg, outputArg] = process.argv.slice(2);
  try {
    if (!profileArg || !['inspect', 'export'].includes(operation))
      throw new Error(
        'Usage: storage-recovery.ts inspect PROFILE | export PROFILE NEW_OUTPUT'
      );
    const profile = path.resolve(profileArg);
    if (operation === 'export') {
      if (!outputArg)
        throw new Error('Supply a new recovery output directory.');
      console.log(
        `Exported ${exportStorageRecovery(
          profile,
          path.resolve(outputArg)
        )} verified encrypted originals; active profile unchanged.`
      );
    } else {
      const journal = readMigrationJournal(profile);
      console.log(
        JSON.stringify(
          journal
            ? {
                migrationId: journal.migrationId,
                transactionId: journal.transactionId,
                state: journal.state,
                createdAt: journal.createdAt,
                confirmedLaunches: journal.confirmedLaunches.length,
                records: Object.entries(journal.entries).map(
                  ([file, entry]) => ({ file, state: entry!.state })
                ),
              }
            : { state: 'no-journaled-migration' },
          null,
          2
        )
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Storage recovery failed.'
    );
    process.exitCode = 1;
  }
}

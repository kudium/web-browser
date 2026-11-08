import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { MIGRATED_STORAGE_FILES, storageDigest } from './storageMigration';

/** Preserve encrypted originals before removing only confirmed unreadable files. */
export function archiveUnreadableStorage(root: string, failures: string[]) {
  if (
    !failures.length ||
    failures.some(
      (file) => !(MIGRATED_STORAGE_FILES as readonly string[]).includes(file)
    )
  )
    throw new Error('No verified storage recovery files were selected.');
  const files = [...new Set(failures)];
  if (fs.existsSync(path.join(root, 'secure-storage/migration-journal.json')))
    files.push('secure-storage/migration-journal.json');
  // Keep the wrapping key alongside the records, without removing the live key.
  const backups = [...files, 'secure-storage/key.json'];
  const destination = path.join(
    root,
    'secure-storage',
    'recovery',
    randomUUID()
  );
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const originals = backups.map((file) => ({
    file,
    bytes: fs.readFileSync(path.join(root, file)),
  }));
  originals.forEach(({ file, bytes }) => {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    if (storageDigest(fs.readFileSync(target)) !== storageDigest(bytes))
      throw new Error(
        'Recovery backup could not be verified. No saved files were removed.'
      );
  });
  // Check every source before any removal; newer user edits must never be discarded.
  originals.forEach(({ file, bytes }) => {
    if (
      storageDigest(fs.readFileSync(path.join(root, file))) !==
      storageDigest(bytes)
    )
      throw new Error('Saved data changed during recovery. Try again.');
  });
  files.forEach((file) => fs.unlinkSync(path.join(root, file)));
  return destination;
}

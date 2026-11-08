import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { safeStorage } from './localStorage';
import { writePrivateFile } from './privateFile';

const validToken = (token: string) => /^[a-f0-9-]{36}$/i.test(token);
const directory = () => path.join(app.getPath('userData'), 'browser-imports');

/** Only internal migration records are stored; cookies and OS keys stay out. */
export function saveMigrationJob(record: { token: string }) {
  if (!validToken(record.token)) throw new Error('Invalid import identifier.');
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      'Secure storage is unavailable. Restore secure storage before importing so restart recovery can be saved.'
    );
  const text = JSON.stringify(record);
  if (Buffer.byteLength(text) > 16 * 1024 * 1024)
    throw new Error('Import recovery data exceeds its storage limit.');
  fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const envelope = JSON.stringify({
    version: 1,
    encrypted: safeStorage.encryptString(text).toString('base64'),
  });
  writePrivateFile(path.join(directory(), `${record.token}.json`), envelope, {
    durable: true,
  });
}

export function loadMigrationJobs(): unknown[] {
  if (!fs.existsSync(directory())) return [];
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      'Secure storage is unavailable. Your saved import recovery data has been preserved.'
    );
  return fs
    .readdirSync(directory())
    .filter((name) => name.endsWith('.json') && validToken(name.slice(0, -5)))
    .slice(0, 100)
    .map((name) => {
      const file = path.join(directory(), name);
      if (fs.statSync(file).size > 24 * 1024 * 1024)
        throw new Error('Import recovery file exceeds its storage limit.');
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (envelope.version !== 1 || typeof envelope.encrypted !== 'string')
        throw new Error('Unsupported import recovery data.');
      const record = JSON.parse(
        safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
      );
      if (record.token !== name.slice(0, -5))
        throw new Error('Invalid import recovery identifier.');
      return record;
    });
}

export function removeMigrationJob(token: string) {
  if (!validToken(token)) throw new Error('Invalid import identifier.');
  fs.rmSync(path.join(directory(), `${token}.json`), { force: true });
}

/* eslint-disable no-restricted-syntax */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const MAX_STORAGE_FILE_BYTES = 128 * 1024 * 1024;
export function readStorageFile(
  file: string,
  maximum = MAX_STORAGE_FILE_BYTES
) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
    throw new Error('Invalid or oversized storage file.');
  return fs.readFileSync(file);
}

export function atomicStorageWrite(
  file: string,
  data: Buffer | string,
  createOnly = false
) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (createOnly) fs.linkSync(temporary, file);
    else fs.renameSync(temporary, file);
    if (process.platform !== 'win32') {
      for (const directory of [
        path.dirname(file),
        path.dirname(path.dirname(file)),
      ]) {
        const directoryDescriptor = fs.openSync(directory, 'r');
        try {
          fs.fsyncSync(directoryDescriptor);
        } finally {
          fs.closeSync(directoryDescriptor);
        }
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

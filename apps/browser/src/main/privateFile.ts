import fs from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

/** Write private connection settings atomically, with owner-only permissions. */
export function writePrivateFile(
  filename: string,
  text: string,
  options: { durable?: boolean } = {}
) {
  const temporary = `${filename}.touchbox-${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, text);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
    if (options.durable) {
      // Windows cannot sync directory handles; flush the renamed file instead.
      const directory =
        process.platform === 'win32'
          ? fs.openSync(filename, 'r+')
          : fs.openSync(path.dirname(filename), 'r');
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

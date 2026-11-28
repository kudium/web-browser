import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

const execute = promisify(execFile);

function directoryField(value: string | undefined) {
  if (!value) return undefined;
  const bytes = Buffer.from(value, 'utf8');
  const decoded: number[] = [];
  const escapes: Record<string, number> = {
    b: 8,
    f: 12,
    r: 13,
    n: 10,
    t: 9,
    '\\': 92,
  };
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 92 && index + 1 < bytes.length) {
      const next = String.fromCharCode(bytes[index + 1]);
      if (escapes[next] !== undefined) {
        decoded.push(escapes[next]);
        index += 1;
        continue;
      }
      const hex = bytes.subarray(index + 2, index + 4).toString('ascii');
      if (next === 'x' && /^[a-f\d]{2}$/i.test(hex)) {
        decoded.push(parseInt(hex, 16));
        index += 3;
        continue;
      }
    }
    // lsof's caret representation is ambiguous with literal filename text.
    if (
      bytes[index] === 94 &&
      /[@A-Z[\]\\^_?]/.test(String.fromCharCode(bytes[index + 1]))
    )
      return undefined;
    decoded.push(bytes[index]);
  }
  return Buffer.from(decoded).toString('utf8');
}

/** Read the shell's directory without parsing terminal output or running shell code. */
export async function projectTerminalDirectory(
  pid: number
): Promise<string | undefined> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    if (process.platform === 'linux')
      return await fs.promises.readlink(`/proc/${pid}/cwd`);
    if (process.platform === 'darwin') {
      const { stdout } = await execute(
        '/usr/sbin/lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn0'],
        { encoding: 'utf8', timeout: 500, maxBuffer: 8192 }
      );
      return directoryField(
        stdout
          .split('\0')
          .find((field) => field.startsWith('n'))
          ?.slice(1)
      );
    }
  } catch {
    // The process may have exited or the bounded probe may be unavailable.
  }
  return undefined;
}

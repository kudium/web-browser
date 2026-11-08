import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);
export async function openSystemTerminal(folder: string) {
  try {
    if (process.platform === 'darwin')
      await run('/usr/bin/open', ['-a', 'Terminal', folder]);
    else if (process.platform === 'win32') await run('wt.exe', ['-d', folder]);
    else
      await new Promise<void>((resolve, reject) => {
        const child = spawn('x-terminal-emulator', [], {
          cwd: folder,
          detached: true,
          stdio: 'ignore',
        });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
  } catch {
    throw new Error(
      'Could not open the system terminal. Check that a terminal is installed.'
    );
  }
}

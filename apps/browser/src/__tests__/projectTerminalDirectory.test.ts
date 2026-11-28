/** @jest-environment node */
import { spawn as spawnProcess } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { projectTerminalDirectory } from '../main/projectTerminalDirectory';

it('ignores invalid process identities', async () => {
  for (const pid of [0, -1, NaN, Infinity, 1.5])
    expect(await projectTerminalDirectory(pid)).toBeUndefined();
});

(['darwin', 'linux'].includes(process.platform) ? it : it.skip)(
  'reads the actual directory after a shell changes it, including spaces and newlines',
  async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'shell-directory-'))
    );
    const directory = path.join(root, 'child folder\nsecond\\n é東京');
    fs.mkdirSync(directory);
    const child = spawnProcess(
      '/bin/sh',
      ['-c', 'cd "$1"; printf ready; read ignored', 'sh', directory],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    try {
      await once(child.stdout, 'data');
      expect(await projectTerminalDirectory(child.pid!)).toBe(directory);
    } finally {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

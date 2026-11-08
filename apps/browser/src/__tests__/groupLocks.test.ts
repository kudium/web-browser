/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GroupLockService } from '../main/groupLocks';

jest.mock('../main/localStorage', () => ({
  safeStorage: jest.requireMock('electron').safeStorage,
}));

jest.mock('electron', () => ({ app: {}, ipcMain: {}, powerMonitor: {} }));
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-group-lock-test-')
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const create = (authenticate = jest.fn().mockResolvedValue(undefined)) =>
  new GroupLockService(path.join(root, 'locks.json'), authenticate);
it('persists protection but only grants per-group access in memory for the browser session', async () => {
  const auth = jest.fn().mockResolvedValue(undefined);
  const locks = create(auth);
  await locks.change('protect', 'work');
  await locks.change('protect', 'personal');
  expect(locks.locked('work')).toBe(true);
  await locks.change('unlock', 'work');
  await locks.change('unlock', 'work');
  expect(auth).toHaveBeenCalledTimes(1);
  expect(locks.locked('personal')).toBe(true);
  expect(create().locked('work')).toBe(true);
  expect(
    JSON.parse(fs.readFileSync(path.join(root, 'locks.json'), 'utf8'))
  ).toEqual({ version: 1, groups: ['work', 'personal'] });
  locks.revoke();
  expect(locks.locked('work')).toBe(true);
});
it('rejects cancellation and cannot remove protection without authentication', async () => {
  const locks = create(jest.fn().mockRejectedValue(new Error('Cancelled')));
  await locks.change('protect', 'work');
  await expect(locks.change('unlock', 'work')).rejects.toThrow('Cancelled');
  await expect(locks.change('unprotect', 'work')).rejects.toThrow('Cancelled');
  expect(locks.locked('work')).toBe(true);
});
it('revokes in-flight authentication when the OS locks or the requesting window closes', async () => {
  let finish: () => void = () => {};
  const locks = create(
    jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    )
  );
  await locks.change('protect', 'work');
  const pending = locks.change('unlock', 'work');
  locks.revoke();
  finish();
  await expect(pending).rejects.toThrow('locked during authentication');
  const closed = locks.change('unlock', 'work', () => false);
  finish();
  await expect(closed).rejects.toThrow();
  expect(locks.locked('work')).toBe(true);
});
it('deduplicates concurrent prompts and supports explicit relocking and removing protection', async () => {
  let finish: () => void = () => {};
  const auth = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const locks = create(auth);
  await locks.change('protect', 'work');
  const first = locks.change('unlock', 'work');
  const second = locks.change('unlock', 'work');
  finish();
  await Promise.all([first, second]);
  expect(auth).toHaveBeenCalledTimes(1);
  await locks.change('unprotect', 'work');
  expect(locks.snapshot().protected).toEqual([]);
  await locks.change('protect', 'work');
  expect(locks.locked('work')).toBe(true);
});
it('recovers a conservative lock set without dropping the latest protected group, and fails closed without a valid backup', async () => {
  const locks = create();
  await locks.change('protect', 'work');
  await locks.change('protect', 'personal');
  const file = path.join(root, 'locks.json');
  fs.writeFileSync(file, 'broken');
  const recovered = create();
  expect(recovered.locked('work')).toBe(true);
  expect(recovered.locked('personal')).toBe(true);
  fs.writeFileSync(`${file}.backup`, 'broken');
  const unavailable = create();
  expect(unavailable.locked('any-group')).toBe(true);
  await expect(unavailable.change('unlock', 'work')).rejects.toThrow(
    'could not be recovered'
  );
});

it('a revoked caller cannot protect or relock a group', async () => {
  const locks = create();
  await expect(
    locks.change('protect', 'new-group', () => false)
  ).rejects.toThrow('revoked');
  expect(locks.snapshot().protected).toEqual([]);
  await locks.change('protect', 'work');
  await locks.change('unlock', 'work');
  await expect(locks.change('lock', 'work', () => false)).rejects.toThrow(
    'revoked'
  );
  expect(locks.locked('work')).toBe(false);
});

/** @jest-environment node */
import fs from 'fs';
import { execFile } from 'child_process';
import {
  authenticateOS,
  revokeOSAuthentication,
} from '../main/passwordManager/authentication';

jest.mock('electron', () => ({
  app: { getAppPath: () => '/test', isPackaged: true },
}));
jest.mock('../main/localStorage', () => ({
  safeStorage: { isEncryptionAvailable: () => true },
}));
jest.mock('child_process', () => ({ execFile: jest.fn() }));

const execute = execFile as unknown as jest.Mock;
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const resourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const prompts = () =>
  execute.mock.calls.filter((call) => call[1][0] !== '--check');

beforeEach(() => {
  revokeOSAuthentication();
  execute.mockReset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  Object.defineProperty(process, 'resourcesPath', {
    value: '/test/resources',
    configurable: true,
  });
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  execute.mockImplementation((_file, _args, _options, done) =>
    done(null, '', '')
  );
});
afterEach(() => {
  revokeOSAuthentication();
  Object.defineProperty(process, 'platform', platform);
  if (resourcesPath)
    Object.defineProperty(process, 'resourcesPath', resourcesPath);
  else Reflect.deleteProperty(process, 'resourcesPath');
  jest.restoreAllMocks();
});

it('reuses one successful Personal Data check for repeated and concurrent requests', async () => {
  await Promise.all([authenticateOS(), authenticateOS(), authenticateOS()]);
  await authenticateOS();
  expect(prompts()).toHaveLength(1);
});

it('requires a fresh check after the session is revoked', async () => {
  await authenticateOS();
  revokeOSAuthentication();
  await authenticateOS();
  expect(prompts()).toHaveLength(2);
});

it('does not remember a cancelled or failed authentication', async () => {
  execute.mockImplementation((_file, args, _options, done) =>
    done(args[0] === '--check' ? null : new Error('Cancelled'), '', '')
  );
  await expect(authenticateOS()).rejects.toThrow('cancelled');
  execute.mockImplementation((_file, _args, _options, done) =>
    done(null, '', '')
  );
  await authenticateOS();
  expect(prompts()).toHaveLength(2);
});

it('rejects a prompt completed after locking and does not unlock the new session', async () => {
  let finish = () => {};
  let start = () => {};
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  execute.mockImplementation((_file, args, _options, done) => {
    if (args[0] === '--check') done(null, '', '');
    else {
      finish = () => done(null, '', '');
      start();
    }
  });
  const pending = authenticateOS();
  await started;
  expect(prompts()).toHaveLength(1);
  revokeOSAuthentication();
  finish();
  await expect(pending).rejects.toThrow('locked during authentication');
  execute.mockImplementation((_file, _args, _options, done) =>
    done(null, '', '')
  );
  await authenticateOS();
  expect(prompts()).toHaveLength(2);
});

it('keeps protected group checks separate from Personal Data session authentication', async () => {
  await authenticateOS('group');
  await authenticateOS();
  await authenticateOS('group');
  await authenticateOS();
  expect(prompts().map((call) => call[1])).toEqual([
    ['--group'],
    [],
    ['--group'],
  ]);
});

import fs from 'node:fs/promises';
import { notarize } from '@electron/notarize';

jest.mock('@electron/notarize', () => ({ notarize: jest.fn() }));
const hook = require('../../.erb/scripts/notarize.js').default;

const originalEnvironment = process.env;
const context = {
  electronPlatformName: 'darwin',
  appOutDir: '/release fixture',
  packager: { appInfo: { productFilename: 'Kudium Browser' } },
};
beforeEach(() => {
  process.env = { ...originalEnvironment, CI: 'true' };
  delete process.env.APPLE_API_KEY;
  delete process.env.APPLE_API_KEY_ID;
  delete process.env.APPLE_API_ISSUER;
  delete process.env.APPLE_ID;
  delete process.env.APPLE_ID_PASS;
  delete process.env.APPLE_TEAM_ID;
  jest.clearAllMocks();
});
afterEach(() => {
  process.env = originalEnvironment;
});

it('fails CI releases when any required credential is missing or empty', async () => {
  await expect(hook(context)).rejects.toThrow('APPLE_TEAM_ID');
  process.env.APPLE_ID = 'release@example.test';
  process.env.APPLE_ID_PASS = 'dummy-test-password';
  process.env.APPLE_TEAM_ID = '   ';
  await expect(hook(context)).rejects.toThrow('notarization');
  expect(notarize).not.toHaveBeenCalled();
});
it('uses the supported notarytool credential fields and propagates submission failure', async () => {
  Object.assign(process.env, {
    APPLE_ID: 'release@example.test',
    APPLE_ID_PASS: 'dummy-test-password',
    APPLE_TEAM_ID: 'TESTTEAM01',
  });
  await hook(context);
  expect(notarize).toHaveBeenCalledWith({
    appPath: '/release fixture/Kudium Browser.app',
    appleId: 'release@example.test',
    appleIdPassword: 'dummy-test-password',
    teamId: 'TESTTEAM01',
  });
  (notarize as jest.Mock).mockRejectedValueOnce(
    new Error('Submission rejected')
  );
  await expect(hook(context)).rejects.toThrow('Submission rejected');
});
it('allows explicit local builds and ignores other platforms', async () => {
  process.env.CI = 'false';
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await hook(context);
    process.env.CI = 'true';
    await hook({ ...context, electronPlatformName: 'linux' });
    expect(notarize).not.toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});

it('uses a protected temporary API key and removes it after success or failure', async () => {
  Object.assign(process.env, {
    APPLE_API_KEY: 'dummy-api-key',
    APPLE_API_KEY_ID: 'DUMMYKEY01',
    APPLE_API_ISSUER: 'dummy-issuer',
  });
  let keyPath = '';
  const submission = async (options: { appleApiKey: string }) => {
    keyPath = options.appleApiKey;
    expect(await fs.readFile(keyPath, 'utf8')).toBe('dummy-api-key');
    expect((await fs.stat(keyPath)).mode & 0o777).toBe(0o600);
  };
  (notarize as jest.Mock).mockImplementationOnce(submission);
  await hook(context);
  await expect(fs.stat(keyPath)).rejects.toThrow();
  (notarize as jest.Mock).mockImplementationOnce(async (options) => {
    await submission(options);
    throw new Error('API submission rejected');
  });
  await expect(hook(context)).rejects.toThrow('API submission rejected');
  await expect(fs.stat(keyPath)).rejects.toThrow();
});
it('rejects incomplete API credentials before submission', async () => {
  process.env.APPLE_API_KEY = 'dummy-api-key';
  await expect(hook(context)).rejects.toThrow('APPLE_API_KEY_ID');
  expect(notarize).not.toHaveBeenCalled();
});

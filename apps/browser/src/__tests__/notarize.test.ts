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

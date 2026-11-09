import path from 'path';
import { explainSecureStorage } from '../main/storageWelcome';

const showBrowserDialog = jest.fn();
const readFileSync = jest.fn();
const writeFileSync = jest.fn();
jest.mock('electron', () => ({
  app: { getPath: () => '/profile' },
}));
jest.mock('../main/dialogs', () => ({
  showBrowserDialog: (...args: unknown[]) => showBrowserDialog(...args),
}));
jest.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => readFileSync(...args),
  writeFileSync: (...args: unknown[]) => writeFileSync(...args),
}));
jest.mock('child_process', () => ({
  spawnSync: () => ({ status: 0, stderr: 'trusted-signature' }),
}));
const originalPlatform = process.platform;
const window = { isDestroyed: () => false } as any;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  readFileSync.mockImplementation(() => {
    throw new Error('missing');
  });
});
afterAll(() =>
  Object.defineProperty(process, 'platform', { value: originalPlatform })
);
test('declining does not save consent', async () => {
  showBrowserDialog.mockResolvedValue({ response: 1 });
  expect(await explainSecureStorage(window)).toBe(false);
  expect(writeFileSync).not.toHaveBeenCalled();
});
test('accepting remembers identity', async () => {
  showBrowserDialog.mockResolvedValue({ response: 0 });
  expect(await explainSecureStorage(window)).toBe(true);
  expect(showBrowserDialog).toHaveBeenCalledWith(
    window,
    expect.objectContaining({
      message: 'Enable secure storage',
      buttons: ['Enable secure storage', 'Not now'],
      cancelId: 1,
    })
  );
  expect(writeFileSync).toHaveBeenCalledWith(
    path.join('/profile', 'secure-storage-consent.json'),
    JSON.stringify({ identity: 'trusted-signature' }),
    { mode: 0o600 }
  );
});
test('same identity skips explanation but changed identity asks again', async () => {
  readFileSync.mockReturnValue(
    JSON.stringify({ identity: 'trusted-signature' })
  );
  expect(await explainSecureStorage(window)).toBe(true);
  expect(showBrowserDialog).not.toHaveBeenCalled();
  readFileSync.mockReturnValue(JSON.stringify({ identity: 'older' }));
  showBrowserDialog.mockResolvedValue({ response: 1 });
  expect(await explainSecureStorage(window)).toBe(false);
  expect(showBrowserDialog).toHaveBeenCalledTimes(1);
});

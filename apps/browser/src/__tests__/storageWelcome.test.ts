import path from 'path';
import { explainSecureStorage } from '../main/storageWelcome';

const showMessageBox = jest.fn();
const readFileSync = jest.fn();
const writeFileSync = jest.fn();
jest.mock('electron', () => ({
  app: { getPath: () => '/profile' },
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBox(...args) },
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
  showMessageBox.mockResolvedValue({ response: 1 });
  expect(await explainSecureStorage(window)).toBe(false);
  expect(writeFileSync).not.toHaveBeenCalled();
});
test('accepting remembers identity', async () => {
  showMessageBox.mockResolvedValue({ response: 0 });
  expect(await explainSecureStorage(window)).toBe(true);
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
  expect(showMessageBox).not.toHaveBeenCalled();
  readFileSync.mockReturnValue(JSON.stringify({ identity: 'older' }));
  showMessageBox.mockResolvedValue({ response: 1 });
  expect(await explainSecureStorage(window)).toBe(false);
  expect(showMessageBox).toHaveBeenCalledTimes(1);
});

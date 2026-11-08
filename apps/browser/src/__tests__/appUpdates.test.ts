import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import { startAppUpdates } from '../main/appUpdates';

jest.mock('electron', () => ({ app: { isPackaged: true } }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('electron-updater', () => ({
  autoUpdater: { on: jest.fn(), checkForUpdatesAndNotify: jest.fn() },
}));
jest.mock('electron-log', () => ({
  transports: { file: {} },
  info: jest.fn(),
  warn: jest.fn(),
}));

it('skips development and directory builds, handles failed checks and starts only once', async () => {
  const resources = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: '/packaged/resources',
  });
  try {
    (app as any).isPackaged = false;
    expect(await startAppUpdates()).toBe(false);
    (app as any).isPackaged = true;
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(await startAppUpdates()).toBe(false);
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (autoUpdater.checkForUpdatesAndNotify as jest.Mock).mockRejectedValueOnce(
      new Error('Network unavailable')
    );
    expect(await startAppUpdates()).toBe(false);
    expect(await startAppUpdates()).toBe(false);
    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
    const errorListener = (autoUpdater.on as jest.Mock).mock.calls[0][1];
    expect(() => errorListener(new Error('Update error event'))).not.toThrow();
  } finally {
    if (resources) Object.defineProperty(process, 'resourcesPath', resources);
    else delete (process as any).resourcesPath;
  }
});

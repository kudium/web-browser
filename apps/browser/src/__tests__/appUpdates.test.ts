/** @jest-environment node */
import { EventEmitter } from 'events';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { app, ipcMain, webContents } from 'electron';
import { registerAppUpdates, startAppUpdates } from '../main/appUpdates';
import { onBrowserPreferencesChanged } from '../main/preferences';

jest.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '1.0.1',
    on: jest.fn(),
    once: jest.fn(),
  },
  ipcMain: { handle: jest.fn() },
  webContents: { getAllWebContents: jest.fn(() => []) },
}));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({
    automaticallyDownloadUpdates: true,
    automaticallyInstallUpdates: true,
  }),
  onBrowserPreferencesChanged: jest.fn(() => jest.fn()),
}));
jest.mock('electron-updater', () => ({
  autoUpdater: {
    on: jest.fn(),
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
  },
}));
jest.mock('electron-log', () => ({
  transports: { file: {} },
  info: jest.fn(),
  warn: jest.fn(),
}));

function sender() {
  return Object.assign(new EventEmitter(), {
    mainFrame: {},
    getURL: () => 'file:///app.html',
    isDestroyed: () => false,
    send: jest.fn(),
  });
}

it('guards privileged IPC, skips development, starts once and sends status only to app windows', async () => {
  const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: '/resources',
  });
  try {
    const owner = sender();
    const website = sender();
    registerAppUpdates((contents) => contents === (owner as any));
    const handler = (ipcMain.handle as jest.Mock).mock.calls[0][1];
    await expect(
      handler({ sender: website, senderFrame: website.mainFrame }, 'install')
    ).rejects.toThrow('access changed');
    await expect(
      handler({ sender: owner, senderFrame: {} }, 'install')
    ).rejects.toThrow('access changed');
    const event = { sender: owner, senderFrame: owner.mainFrame };
    await expect(handler(event, 'nonsense')).rejects.toThrow(
      'Unknown update action'
    );
    (app as any).isPackaged = false;
    expect(await startAppUpdates()).toBe(false);
    (app as any).isPackaged = true;
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(await startAppUpdates()).toBe(false);
    expect((await handler(event, 'get')).status).toBe('unavailable');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (webContents.getAllWebContents as jest.Mock).mockReturnValue([
      owner,
      website,
    ]);
    (autoUpdater.checkForUpdates as jest.Mock).mockRejectedValueOnce(
      new Error('offline')
    );
    expect(await startAppUpdates()).toBe(false);
    expect(await startAppUpdates()).toBe(false);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(owner.send).toHaveBeenCalled();
    expect(website.send).not.toHaveBeenCalled();
    expect(onBrowserPreferencesChanged).toHaveBeenCalledTimes(1);
    let finishCheck: () => void = () => {};
    (autoUpdater.checkForUpdates as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCheck = resolve;
        })
    );
    const checking = handler(event, 'check');
    await Promise.resolve();
    owner.emit(
      'did-start-navigation',
      {},
      'file:///replaced.html',
      false,
      true
    );
    finishCheck();
    await expect(checking).rejects.toThrow('access changed');
    expect(owner.listenerCount('did-start-navigation')).toBe(0);
    const dispose = (app.once as jest.Mock).mock.calls.find(
      ([name]) => name === 'will-quit'
    )[1];
    dispose();
  } finally {
    if (original) Object.defineProperty(process, 'resourcesPath', original);
    else delete (process as any).resourcesPath;
  }
});

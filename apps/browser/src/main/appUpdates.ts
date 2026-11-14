import fs from 'fs';
import path from 'path';
import { app, ipcMain, webContents, WebContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import type { AppUpdateState } from '../browser/appUpdates';
import { AppUpdateController } from './appUpdateController';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';
import { watchIPCRequest } from './ipcRequestBinding';

let controller: AppUpdateController | undefined;
let trusted = (_contents: WebContents) => false;
const unavailable = (): AppUpdateState => ({
  status: 'unavailable',
  currentVersion: app.getVersion(),
  message: 'Updates are available in installed release builds.',
});

export function registerAppUpdates(
  isTrusted: (contents: WebContents) => boolean
) {
  trusted = isTrusted;
  ipcMain.handle('browser-app-updates', async (event, action: unknown) => {
    const request = watchIPCRequest(event, trusted);
    try {
      if (
        typeof action !== 'string' ||
        !['get', 'check', 'download', 'install'].includes(action)
      )
        throw new Error('Unknown update action.');
      if (!controller) return unavailable();
      let result = controller.get();
      if (action === 'check') result = await controller.check();
      else if (action === 'download') result = await controller.download();
      else if (action === 'install') result = controller.install();
      if (action !== 'install') request.assert();
      return result;
    } finally {
      request.dispose();
    }
  });
}

export async function startAppUpdates() {
  if (controller || !app.isPackaged) return false;
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    log.info(
      'Automatic updates unavailable: this build has no update metadata.'
    );
    return false;
  }
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  // Changing updater channels can enable downgrades in electron-updater.
  // Browser releases always advance versions, including beta graduation.
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('error', (error) => log.warn('Update service error', error));
  controller = new AppUpdateController(
    autoUpdater,
    app.getVersion(),
    getBrowserPreferences,
    (state) => {
      webContents.getAllWebContents().forEach((contents) => {
        if (!contents.isDestroyed() && trusted(contents))
          contents.send('browser-app-updates-changed', state);
      });
    }
  );
  const unsubscribe = onBrowserPreferencesChanged(() =>
    controller?.applyPreferences()
  );
  const timer = setInterval(() => {
    controller?.check();
  }, 4 * 60 * 60 * 1000);
  timer.unref();
  app.on('before-quit', (event) => {
    if (
      controller?.get().status === 'ready' &&
      getBrowserPreferences().automaticallyInstallUpdates
    ) {
      // Hold a normal quit while macOS stages its downloaded archive. The next
      // quit initiated by the installer passes through without restarting.
      try {
        if (controller.installOnQuit()) event.preventDefault();
      } catch (error) {
        event.preventDefault();
        log.warn('Unable to install update on quit', error);
      }
    }
  });
  app.once('will-quit', () => {
    clearInterval(timer);
    unsubscribe();
  });
  await controller.check();
  return controller.get().status !== 'error';
}

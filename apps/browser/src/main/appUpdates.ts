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
      const result =
        action === 'check'
          ? await controller.check()
          : action === 'download'
          ? await controller.download()
          : action === 'install'
          ? controller.install()
          : controller.get();
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
  autoUpdater.on('error', (error) => log.warn('Update service error', error));
  controller = new AppUpdateController(
    autoUpdater,
    app.getVersion(),
    getBrowserPreferences,
    (state) => {
      for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed() && trusted(contents))
          contents.send('browser-app-updates-changed', state);
      }
    }
  );
  const unsubscribe = onBrowserPreferencesChanged(() =>
    controller?.applyPreferences()
  );
  const timer = setInterval(() => void controller?.check(), 4 * 60 * 60 * 1000);
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

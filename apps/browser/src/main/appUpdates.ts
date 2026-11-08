import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

let started = false;
export async function startAppUpdates() {
  if (started || !app.isPackaged) return false;
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    log.info(
      'Automatic updates unavailable: this build has no update metadata.'
    );
    return false;
  }
  started = true;
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.on('error', (error) => log.warn('Update service error', error));
  try {
    await autoUpdater.checkForUpdatesAndNotify();
    return true;
  } catch (error) {
    log.warn('Unable to check for updates', error);
    return false;
  }
}

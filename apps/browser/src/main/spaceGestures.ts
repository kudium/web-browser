import { app, ipcMain, BrowserWindow, IpcMainEvent } from 'electron';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import type { SpaceWheelEvent } from '../browser/contracts';

/** macOS phase boundaries distinguish finger swipes from inertial scrolling. */
export function registerSpaceGestures(window: BrowserWindow) {
  let stop: (() => void) | undefined;
  if (process.platform === 'darwin') {
    const candidates = [
      path.join(
        process.resourcesPath,
        'assets/native/kudium-space-gestures.node'
      ),
      path.join(app.getAppPath(), 'assets/native/kudium-space-gestures.node'),
      path.resolve(__dirname, '../../assets/native/kudium-space-gestures.node'),
    ];
    const file = candidates.find((candidate) => fs.existsSync(candidate));
    if (file) {
      try {
        const native = createRequire(__filename)(file) as {
          start(
            handle: Buffer,
            callback: (event: SpaceWheelEvent) => void
          ): () => void;
        };
        stop = native.start(window.getNativeWindowHandle(), (event) => {
          if (!window.isDestroyed() && !window.webContents.isDestroyed())
            window.webContents.send('browser-space-wheel', event);
        });
      } catch (error) {
        console.error('Native space gestures unavailable:', error);
      }
    }
  }
  const ready = (event: IpcMainEvent) => {
    if (
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame
    )
      event.sender.send('browser-space-wheel', { available: Boolean(stop) });
  };
  ipcMain.on('browser-observe-space-wheel', ready);
  return () => {
    ipcMain.removeListener('browser-observe-space-wheel', ready);
    stop?.();
    stop = undefined;
  };
}

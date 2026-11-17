import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron';
import log from 'electron-log';
import type { NewWindowParams } from '../types';
import {
  MAIN_WINDOW,
  SETTINGS_WINDOW,
  ADD_APP_WINDOW,
} from '../utils/constant';

export function registerWindowCommands(
  mainIpc: IpcMain,
  windows: Partial<Record<string, BrowserWindow | null>>,
  create: (params: NewWindowParams) => Promise<unknown>
) {
  const sourceWindow = (event: IpcMainEvent) =>
    Object.values(windows).find(
      (window) =>
        window &&
        !window.isDestroyed() &&
        window.webContents === event.sender &&
        event.senderFrame === window.webContents.mainFrame
    );
  mainIpc.on('ipc-create-window', (event, payload: unknown) => {
    if (!sourceWindow(event) || !Array.isArray(payload) || payload.length !== 1)
      return;
    const request = payload[0];
    if (!request || typeof request !== 'object') return;
    const presets: Record<string, NewWindowParams> = {
      main: MAIN_WINDOW,
      settings: SETTINGS_WINDOW,
      'add-app': ADD_APP_WINDOW,
      downloads: {
        view: 'downloads',
        isChild: true,
        options: { width: 520, height: 720 },
      },
      'task-manager': {
        view: 'task-manager',
        options: { width: 900, height: 640, minWidth: 560, minHeight: 420 },
      },
    };
    if (
      typeof request.view !== 'string' ||
      !Object.prototype.hasOwnProperty.call(presets, request.view)
    )
      return;
    if (
      request.intent !== undefined &&
      request.intent !== 'edit' &&
      request.intent !== 'new-session'
    )
      return;
    // Renderer options never override main-owned security/window configuration.
    const preset = presets[request.view];
    create({
      ...preset,
      options: { ...preset.options, ...(request.view === 'task-manager' ? { parent: sourceWindow(event) || undefined } : {}) },
      ...(request.view === 'add-app' ? { intent: request.intent } : {}),
    }).catch((error) => log.warn('Unable to open app window', error));
  });
  mainIpc.on('ipc-close-window', (event) => {
    sourceWindow(event)?.close();
  });
}

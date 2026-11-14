import type { IpcMain, IpcMainEvent, BrowserWindow } from 'electron';
import { EVENT_KEY } from './constant';

export const eventBus = {
  /**
   * Add this to the main.ts to enable communication between 2 browserWindows
   *
   * @param ipcMain Typeof Electron.IpcMain
   * @param windowsList Typeof Partial<Record<View, BrowserWindow | null>>
   */
  registerOnMain(
    mainIpc: IpcMain,
    windowsList: Partial<Record<string, BrowserWindow | null>>
  ) {
    mainIpc.on('ipc-event-bus', (event: IpcMainEvent, content: unknown) => {
      const source = Object.values(windowsList).find(
        (win) => win && !win.isDestroyed() && win.webContents === event.sender
      );
      if (
        !source ||
        event.senderFrame !== source.webContents.mainFrame ||
        !Array.isArray(content) ||
        content.length !== 1
      )
        return;
      const record = content[0];
      if (!record || typeof record !== 'object' || Array.isArray(record))
        return;
      const names = Object.keys(record);
      if (names.length !== 1 || !Object.values(EVENT_KEY).includes(names[0]))
        return;
      try {
        if (JSON.stringify(content).length > 262144) return;
      } catch {
        return;
      }
      Object.values(windowsList).forEach((win) => {
        if (
          win &&
          !win.isDestroyed() &&
          ((source.webContents.session?.isPersistent?.() !== false &&
            win.webContents.session?.isPersistent?.() !== false) ||
            source.webContents.session === win.webContents.session)
        )
          win.webContents.send('ipc-event-bus', content);
      });
    });
  },

  /**
   * Event Listener
   *
   * @param eventName
   * @param callback
   */
  on<T>(eventName: string, callback: (data: T) => void) {
    return window.electron.ipcRenderer.on(
      'ipc-event-bus',
      (...contents: any[]) => {
        const content = contents[0];
        if (
          content?.[0] &&
          Object.prototype.hasOwnProperty.call(content[0], eventName)
        ) {
          callback(content[0][eventName] as T);
        }
      }
    );
  },

  /**
   * Event Broadcaster
   *
   * @param eventName
   * @param data
   */
  dispatch<T>(eventName: string, data?: T) {
    const content = [
      {
        [eventName]: data,
      },
    ];
    window.electron.ipcRenderer.sendMessage('ipc-event-bus', content);
  },
};

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  WebContents,
  IpcMainInvokeEvent,
} from 'electron';
import path from 'path';
import { NativeTooltip, validateTooltip } from './nativeTooltip';
import type { NativeTooltipRequest } from '../browser/nativeUi';
import { parseNativeMenu } from './nativeMenu';
import { isAssistantPanelOf } from './windowNavigation';
import { showBrowserDialog } from './dialogs';
import { NativeMenuItem, NativePrompt } from '../browser/nativeUi';
import { loadLocalIcon } from './localImage';

export function registerNativeUi(
  isTrusted: (contents: WebContents) => boolean
) {
  const pendingMenus = new Map<WebContents, () => void>();
  const pendingIcons = new WeakSet<WebContents>();
  const ownerOf = (event: IpcMainInvokeEvent) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (
      !owner ||
      owner.isDestroyed() ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrusted(event.sender)
    )
      throw new Error('Untrusted native UI request');
    const focused = BrowserWindow.getFocusedWindow();
    return focused && isAssistantPanelOf(focused.webContents, event.sender)
      ? focused
      : owner;
  };
  const stillTrusted = (event: IpcMainInvokeEvent, owner: BrowserWindow) => {
    try {
      const requester = BrowserWindow.fromWebContents(event.sender);
      return (
        !!requester &&
        !requester.isDestroyed() &&
        !owner.isDestroyed() &&
        event.senderFrame === event.sender.mainFrame &&
        isTrusted(event.sender) &&
        (requester === owner ||
          isAssistantPanelOf(owner.webContents, event.sender))
      );
    } catch {
      return false;
    }
  };
  const watchRequest = (event: IpcMainInvokeEvent, owner: BrowserWindow) => {
    let live = true;
    const invalidate = () => {
      live = false;
    };
    const navigating = (
      _event: unknown,
      _url: string,
      inPage: boolean,
      mainFrame: boolean
    ) => {
      if (mainFrame && !inPage) invalidate();
    };
    owner.once('closed', invalidate);
    event.sender.once('destroyed', invalidate);
    event.sender.on('did-start-navigation', navigating);
    return {
      active: () => live && stillTrusted(event, owner),
      dispose: () => {
        owner.removeListener('closed', invalidate);
        event.sender.removeListener('destroyed', invalidate);
        event.sender.removeListener('did-start-navigation', navigating);
      },
    };
  };
  const tooltips = new WeakMap<BrowserWindow, NativeTooltip>();
  ipcMain.handle(
    'browser-native-tooltip',
    (event, request: NativeTooltipRequest) => {
      const owner = ownerOf(event);
      validateTooltip(request);
      let tooltip = tooltips.get(owner);
      if (!tooltip) {
        tooltip = new NativeTooltip(owner);
        tooltips.set(owner, tooltip);
      }
      return tooltip.update(request);
    }
  );
  ipcMain.handle('browser-native-menu', (event, items: unknown) => {
    const owner = ownerOf(event);
    return new Promise<string | null>((resolve) => {
      const entries = parseNativeMenu(items);
      let settled = false;
      let cancel: () => void;
      let navigating: (
        _event: unknown,
        _url: string,
        inPage: boolean,
        mainFrame: boolean
      ) => void;
      const finish = (id: string | null) => {
        if (settled) return;
        settled = true;
        owner.removeListener('closed', cancel);
        event.sender.removeListener('destroyed', cancel);
        event.sender.removeListener('did-start-navigation', navigating);
        if (pendingMenus.get(event.sender) === cancel)
          pendingMenus.delete(event.sender);
        resolve(stillTrusted(event, owner) ? id : null);
      };
      const compile = (parts: NativeMenuItem[]): MenuItemConstructorOptions[] =>
        parts.map((item) =>
          item.type === 'separator'
            ? { type: 'separator' }
            : {
                label: item.label,
                type: item.type,
                checked: item.checked,
                role: item.role,
                enabled: item.enabled,
                submenu: item.submenu ? compile(item.submenu) : undefined,
                click: item.role
                  ? undefined
                  : () =>
                      finish(
                        item.enabled !== false && !item.submenu
                          ? item.id || null
                          : null
                      ),
              }
        );
      const menu = Menu.buildFromTemplate(compile(entries));
      cancel = () => {
        finish(null);
        if (!owner.isDestroyed()) {
          try {
            menu.closePopup(owner);
          } catch {
            /* Native menu may already be closing. */
          }
        }
      };
      navigating = (
        _event: unknown,
        _url: string,
        inPage: boolean,
        mainFrame: boolean
      ) => {
        if (mainFrame && !inPage) cancel();
      };
      pendingMenus.get(event.sender)?.();
      pendingMenus.set(event.sender, cancel);
      owner.once('closed', cancel);
      event.sender.once('destroyed', cancel);
      event.sender.on('did-start-navigation', navigating);
      try {
        menu.popup({ window: owner, callback: () => finish(null) });
      } catch {
        cancel();
      }
    });
  });
  ipcMain.handle(
    'browser-native-confirm',
    async (event, prompt: NativePrompt) => {
      const owner = ownerOf(event);
      if (
        !prompt ||
        [prompt.message, prompt.detail, prompt.confirm].some(
          (value) => typeof value !== 'string' || value.length > 1000
        )
      )
        throw new Error('Invalid prompt');
      const request = watchRequest(event, owner);
      try {
        const answer = await showBrowserDialog(owner, {
          message: prompt.message,
          detail: prompt.detail,
          buttons: ['Cancel', prompt.confirm],
          defaultId: 0,
          cancelId: 0,
        });
        return request.active() && answer.response === 1;
      } finally {
        request.dispose();
      }
    }
  );
  ipcMain.handle('browser-emoji-picker', (event) => {
    ownerOf(event);
    if (process.platform === 'darwin') app.showEmojiPanel();
  });
  ipcMain.handle('browser-space-icon', async (event) => {
    const owner = ownerOf(event);
    if (pendingIcons.has(event.sender))
      throw new Error('An icon picker is already open.');
    pendingIcons.add(event.sender);
    const request = watchRequest(event, owner);
    try {
      const selected = await dialog.showOpenDialog(owner, {
        title: 'Choose an icon',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'icns'] },
        ],
      });
      if (!request.active() || selected.canceled) return null;
      const filename = selected.filePaths[0];
      if (typeof filename !== 'string' || !path.isAbsolute(filename))
        throw new Error('Choose a valid image file.');
      const icon = await loadLocalIcon(filename, () => {
        if (!request.active()) throw new Error('Icon request expired.');
      });
      if (!request.active()) return null;
      if (icon.isEmpty()) throw new Error('This image could not be opened.');
      return icon.resize({ width: 32, height: 32 }).toDataURL();
    } finally {
      pendingIcons.delete(event.sender);
      request.dispose();
    }
  });
}

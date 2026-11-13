import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { validAppTheme } from '../utils/appTheme';
import type { AppTheme } from '../utils/appTheme';
const windows = new Map<
  BrowserWindow,
  {
    producer: boolean;
    source?: () => BrowserWindow | undefined;
    theme?: AppTheme;
  }
>();
let registered = false;
/** Browser-owned surfaces use the same resolved theme as their host chrome. */
export function getAppTheme(window: BrowserWindow): AppTheme | undefined {
  return themeFor(window);
}
function themeFor(
  window: BrowserWindow,
  seen = new Set<BrowserWindow>()
): AppTheme | undefined {
  if (seen.has(window) || window.isDestroyed()) return undefined;
  seen.add(window);
  const binding = windows.get(window);
  if (binding?.producer) return binding.theme;
  const source = binding?.source?.();
  return source ? themeFor(source, seen) : undefined;
}
export function refreshAppThemes() {
  windows.forEach((_binding, window) => {
    if (!window.isDestroyed())
      window.webContents.send('app-theme-changed', themeFor(window));
  });
}
/** Only browser chrome produces a theme. Child windows inherit their owning browser's result. */
export function registerAppThemeWindow(
  window: BrowserWindow,
  options: { producer?: boolean; source?: () => BrowserWindow | undefined }
) {
  windows.set(window, {
    producer: options.producer === true,
    source: options.source,
  });
  window.once('closed', () => {
    windows.delete(window);
    refreshAppThemes();
  });
  if (registered) return;
  registered = true;
  ipcMain.handle('app-theme', (event, input: unknown) => {
    const owner = [...windows.keys()].find(
      (candidate) =>
        !candidate.isDestroyed() && candidate.webContents === event.sender
    );
    if (!owner || event.senderFrame !== event.sender.mainFrame)
      throw new Error('Untrusted app theme request.');
    const request = input as { action?: string; theme?: unknown };
    if (request?.action === 'get') return themeFor(owner);
    if (
      request?.action !== 'publish' ||
      !windows.get(owner)?.producer ||
      !validAppTheme(request.theme)
    )
      throw new Error('Invalid app theme update.');
    const { spaceId, primary, frame, contrast } = request.theme;
    windows.get(owner)!.theme = { spaceId, primary, frame, contrast };
    refreshAppThemes();
    return themeFor(owner);
  });
}

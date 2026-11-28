import { randomUUID } from 'crypto';
import { app, session } from 'electron';
import type { BrowserWindow, Session, DownloadItem } from 'electron';
import { markPrivateSession } from './privateSessions';
import { clearPrivateDownloads } from './downloads';

type Family = { windows: Set<BrowserWindow>; downloads: Set<DownloadItem> };
const families = new WeakMap<Session, Family>();
let createShell: ((target: Session) => Promise<BrowserWindow>) | undefined;

/** Private browsing uses the ordinary browser shell and temporary workspace. */
export function configurePrivateWindowFactory(
  factory: (target: Session) => Promise<BrowserWindow>
) {
  createShell = factory;
}
export function createPrivateSession() {
  const target = session.fromPartition(`kudium-private-${randomUUID()}`, {
    cache: false,
  });
  markPrivateSession(target);
  const family: Family = { windows: new Set(), downloads: new Set() };
  families.set(target, family);
  target.on('will-download', (_event, item) => {
    family.downloads.add(item);
    item.once('done', () => family.downloads.delete(item));
  });
  return target;
}
export function attachPrivateWindow(window: BrowserWindow, target: Session) {
  const family = families.get(target);
  if (!family) throw new Error('Unknown private browsing session.');
  const contents = window.webContents;
  family.windows.add(window);
  window.once('closed', () => {
    family.windows.delete(window);
    if (family.windows.size) return;
    family.downloads.forEach((item) => item.cancel());
    family.downloads.clear();
    clearPrivateDownloads(target);
    const clear = () => {
      Promise.allSettled([
        target.clearStorageData(),
        target.clearCache(),
        target.clearAuthCache(),
        target.closeAllConnections(),
      ]).catch(() => {});
    };
    // A closed window can still have native contents finishing destruction.
    if (contents.isDestroyed()) clear();
    else contents.once('destroyed', clear);
  });
}
export async function createPrivateWindow() {
  await app.whenReady();
  if (!createShell) throw new Error('Browser shell is not ready.');
  return createShell(createPrivateSession());
}

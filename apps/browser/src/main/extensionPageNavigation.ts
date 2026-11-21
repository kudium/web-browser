import type { BrowserWindow } from 'electron';

/** tabs.create resolves at creation, not at the remote page's load event. */
export function navigateExtensionPage(
  popup: BrowserWindow,
  url: string,
  options: {
    active?: boolean;
    assertAccess: () => void;
    reportError: (error: unknown) => Promise<unknown>;
  },
) {
  options.assertAccess();
  if (popup.isDestroyed()) throw new Error('Extension window is unavailable');
  if (options.active === false) popup.showInactive();
  else {
    popup.show();
    popup.webContents.focus();
  }
  const check = () => {
    try {
      options.assertAccess();
      return !popup.isDestroyed();
    } catch {
      if (!popup.isDestroyed()) popup.destroy();
      return false;
    }
  };
  void popup
    .loadURL(url)
    .then(() => {
      check();
    })
    .catch((error) => {
      if (!check()) return;
      // Redirects and user navigation may replace a pending load normally.
      if (error?.code === 'ERR_ABORTED' || error?.errno === -3) return;
      void options.reportError(error).catch(() => {});
    });
}

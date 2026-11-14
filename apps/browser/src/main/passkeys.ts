import { app, BrowserWindow, dialog, session, webContents } from 'electron';
import type { Session, SelectWebauthnAccountDetails } from 'electron';

type BrowserPasskeyApp = typeof app & {
  isBrowserPasskeySupported?: () => boolean;
};

/** Only the patched runtime exposes the browser API, not Associated Domains. */
export function configureBrowserPasskeys(): boolean {
  if (process.platform !== 'darwin') return false;
  const supported = (app as BrowserPasskeyApp).isBrowserPasskeySupported;
  if (!supported || !supported.call(app)) return false;
  app.configureWebAuthn({ platformPasskeys: true });
  return true;
}

const registered = new WeakSet<Session>();

/** Chromium has already checked the RP and frame before emitting this event. */
export async function selectPasskeyAccount(
  details: SelectWebauthnAccountDetails,
  callback: (credentialId?: string | null) => void
) {
  const frame = details.frame;
  const contents = frame ? webContents.fromFrame(frame) : undefined;
  const parent =
    contents &&
    (BrowserWindow.fromWebContents(contents) ||
      BrowserWindow.getAllWindows().find((window) =>
        window.contentView.children.some(
          (view) => 'webContents' in view && view.webContents === contents
        )
      ));
  if (
    !frame ||
    frame.isDestroyed() ||
    !contents ||
    !parent ||
    parent.isDestroyed()
  ) {
    callback();
    return;
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  // A hash change or an unrelated iframe does not replace the requesting
  // document. Cancel when that frame, an ancestor, or the top page navigates.
  const navigating = (
    details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    _url: string,
    legacySameDocument: boolean,
    legacyMainFrame: boolean
  ) => {
    if (details?.isSameDocument ?? legacySameDocument) return;
    if (frame.isDestroyed() || (details?.isMainFrame ?? legacyMainFrame)) {
      cancel();
      return;
    }
    const target = details?.frame;
    if (!target) {
      cancel();
      return;
    }
    for (
      let ancestor: Electron.WebFrameMain | null = frame;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (
        ancestor === target ||
        ancestor.frameTreeNodeId === target.frameTreeNodeId
      ) {
        cancel();
        return;
      }
    }
  };
  contents.on('did-start-navigation', navigating);
  contents.once('destroyed', cancel);
  contents.once('render-process-gone', cancel);
  parent.once('closed', cancel);
  let selected: string | undefined;
  try {
    const accounts = details.accounts;
    if (!accounts.length) return;
    const result = await dialog.showMessageBox(parent, {
      type: 'question',
      title: 'Sign in with a passkey',
      message: `Choose an account for ${details.relyingPartyId}`,
      buttons: [
        'Cancel',
        ...accounts.map(
          (account, index) =>
            account.displayName || account.name || `Account ${index + 1}`
        ),
      ],
      cancelId: 0,
      defaultId: 0,
      noLink: true,
      signal: controller.signal,
    });
    if (!controller.signal.aborted && !frame.isDestroyed()) {
      selected = accounts[result.response - 1]?.credentialId;
    }
  } finally {
    contents.removeListener('did-start-navigation', navigating);
    contents.removeListener('destroyed', cancel);
    contents.removeListener('render-process-gone', cancel);
    parent.removeListener('closed', cancel);
    callback(selected);
  }
}

export function registerPasskeySession(target: Session) {
  if (registered.has(target)) return;
  registered.add(target);
  target.on('select-webauthn-account', (_event, details, callback) => {
    // The selection function always consumes the callback, including on errors.
    void selectPasskeyAccount(details, callback).catch(() => {});
  });
}

/** Register before creating views so every persistent login profile is covered. */
export function registerPasskeys() {
  registerPasskeySession(session.defaultSession);
  app.on('session-created', registerPasskeySession);
  return configureBrowserPasskeys();
}

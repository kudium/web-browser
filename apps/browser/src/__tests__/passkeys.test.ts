import { EventEmitter } from 'events';
import { app, BrowserWindow, dialog, webContents } from 'electron';
import {
  configureBrowserPasskeys,
  registerPasskeySession,
  selectPasskeyAccount,
} from '../main/passkeys';

jest.mock('electron', () => ({
  app: { configureWebAuthn: jest.fn() },
  BrowserWindow: { fromWebContents: jest.fn(), getAllWindows: jest.fn() },
  dialog: { showMessageBox: jest.fn() },
  webContents: { fromFrame: jest.fn() },
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  delete (app as any).isBrowserPasskeySupported;
  jest.clearAllMocks();
});

it('only enables native passkeys with a runtime that verifies browser capability', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  expect(configureBrowserPasskeys()).toBe(false);
  (app as any).isBrowserPasskeySupported = () => false;
  expect(configureBrowserPasskeys()).toBe(false);
  expect(app.configureWebAuthn).not.toHaveBeenCalled();
  (app as any).isBrowserPasskeySupported = () => true;
  expect(configureBrowserPasskeys()).toBe(true);
  expect(app.configureWebAuthn).toHaveBeenCalledWith({
    platformPasskeys: true,
  });
});

it('does not invoke macOS APIs on other platforms', () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  (app as any).isBrowserPasskeySupported = jest.fn(() => true);
  expect(configureBrowserPasskeys()).toBe(false);
  expect((app as any).isBrowserPasskeySupported).not.toHaveBeenCalled();
});

function request() {
  const contents = new EventEmitter();
  const parent = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  });
  (webContents.fromFrame as jest.Mock).mockReturnValue(contents);
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(parent);
  return {
    contents,
    parent,
    details: {
      relyingPartyId: 'example.com',
      frame: { isDestroyed: () => false } as any,
      accounts: [
        { credentialId: 'first', name: 'alice' },
        { credentialId: 'second', displayName: 'Bob' },
      ],
    },
    callback: jest.fn(),
  };
}

it('maps the selected account to its credential and removes lifecycle listeners', async () => {
  const r = request();
  (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 2 });
  await selectPasskeyAccount(r.details, r.callback);
  expect(r.callback.mock.calls).toEqual([['second']]);
  expect(r.contents.listenerCount('did-start-navigation')).toBe(0);
  expect(r.parent.listenerCount('closed')).toBe(0);
});

it('cancels account selection on navigation even if the dialog returns an account', async () => {
  const r = request();
  (dialog.showMessageBox as jest.Mock).mockImplementation(
    async (_parent, options) => {
      r.contents.emit('did-start-navigation');
      expect(options.signal.aborted).toBe(true);
      return { response: 1 };
    }
  );
  await selectPasskeyAccount(r.details, r.callback);
  expect(r.callback.mock.calls).toEqual([[undefined]]);
});

it('cancels once when the picker fails', async () => {
  const r = request();
  (dialog.showMessageBox as jest.Mock).mockRejectedValue(new Error('closed'));
  await expect(selectPasskeyAccount(r.details, r.callback)).rejects.toThrow(
    'closed'
  );
  expect(r.callback.mock.calls).toEqual([[undefined]]);
});

it('cancels selection if the website renderer crashes and releases its listeners', async () => {
  const r = request();
  (dialog.showMessageBox as jest.Mock).mockImplementation(
    async (_parent, options) => {
      r.contents.emit('render-process-gone');
      expect(options.signal.aborted).toBe(true);
      return { response: 1 };
    }
  );
  await selectPasskeyAccount(r.details, r.callback);
  expect(r.callback.mock.calls).toEqual([[undefined]]);
  expect(r.contents.listenerCount('render-process-gone')).toBe(0);
});

it('keeps the picker open for same-document navigation and unrelated subframes', async () => {
  const r = request();
  r.details.frame.frameTreeNodeId = 10;
  (dialog.showMessageBox as jest.Mock).mockImplementation(
    async (_parent, options) => {
      r.contents.emit('did-start-navigation', {
        isSameDocument: true,
        isMainFrame: true,
      });
      r.contents.emit('did-start-navigation', {
        isSameDocument: false,
        isMainFrame: false,
        frame: { frameTreeNodeId: 20 },
      });
      expect(options.signal.aborted).toBe(false);
      return { response: 1 };
    }
  );
  await selectPasskeyAccount(r.details, r.callback);
  expect(r.callback.mock.calls).toEqual([['first']]);
});

it.each(['requesting frame', 'ancestor', 'main page'])(
  'cancels when the %s replaces the requesting document',
  async (target) => {
    const r = request();
    const ancestor = { frameTreeNodeId: 9, parent: null };
    Object.assign(r.details.frame, { frameTreeNodeId: 10, parent: ancestor });
    (dialog.showMessageBox as jest.Mock).mockImplementation(
      async (_parent, options) => {
        r.contents.emit('did-start-navigation', {
          isSameDocument: false,
          isMainFrame: target === 'main page',
          frame: target === 'requesting frame' ? r.details.frame : ancestor,
        });
        expect(options.signal.aborted).toBe(true);
        return { response: 1 };
      }
    );
    await selectPasskeyAccount(r.details, r.callback);
    expect(r.callback.mock.calls).toEqual([[undefined]]);
  }
);

it('cancels requests without an owning frame', async () => {
  const r = request();
  await selectPasskeyAccount({ ...r.details, frame: null }, r.callback);
  expect(r.callback).toHaveBeenCalledTimes(1);
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
});

it('registers each session only once', () => {
  const target = new EventEmitter();
  registerPasskeySession(target as any);
  registerPasskeySession(target as any);
  expect(target.listenerCount('select-webauthn-account')).toBe(1);
});

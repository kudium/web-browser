import { EventEmitter } from 'events';
import {
  app,
  ipcMain,
  BrowserWindow,
  Menu,
  dialog,
  nativeImage,
} from 'electron';
import { showBrowserDialog } from '../main/dialogs';
import { registerNativeUi } from '../main/nativeUi';
import { loadLocalIcon } from '../main/localImage';

jest.mock('../main/localImage', () => ({ loadLocalIcon: jest.fn() }));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('electron', () => ({
  app: { showEmojiPanel: jest.fn() },
  ipcMain: { handle: jest.fn() },
  BrowserWindow: { fromWebContents: jest.fn(), getFocusedWindow: jest.fn() },
  Menu: {
    buildFromTemplate: jest.fn(() => ({
      popup: jest.fn(),
      closePopup: jest.fn(),
    })),
  },
  dialog: { showMessageBox: jest.fn(), showOpenDialog: jest.fn() },
  nativeImage: { createFromPath: jest.fn() },
}));
it('uses OS menu templates, rejects untrusted requests and confirms account changes', async () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  registerNativeUi((contents) => contents === sender);
  const handler = (name: string) =>
    (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === name
    )[1];
  const event = { sender, senderFrame: sender.mainFrame };
  const promise = handler('browser-native-menu')(event, [
    { id: 'rename', label: 'Rename app' },
    { type: 'separator' },
    { label: 'Move to Space', submenu: [{ id: 'work', label: 'Work' }] },
  ]);
  const template = (Menu.buildFromTemplate as jest.Mock).mock.calls[0][0];
  expect(template[2].submenu[0].label).toBe('Work');
  template[0].click();
  expect(await promise).toBe('rename');
  expect(() =>
    handler('browser-native-menu')({ ...event, senderFrame: {} }, [])
  ).toThrow('Untrusted');
  expect(() =>
    handler('browser-native-tooltip')(
      { ...event, senderFrame: {} },
      { id: 'chat' }
    )
  ).toThrow('Untrusted');
  expect(() =>
    handler('browser-native-tooltip')(event, { id: 'chat', label: 'Chat' })
  ).toThrow('Invalid tooltip');
  await expect(
    handler('browser-native-menu')(event, [{ label: 42 }])
  ).rejects.toThrow('Invalid menu label');
  (showBrowserDialog as jest.Mock)
    .mockResolvedValueOnce({ response: 0 })
    .mockResolvedValueOnce({ response: 1 });
  const prompt = {
    message: 'Move this tab to Work?',
    detail: 'The page uses the other account.',
    confirm: 'Move tab',
  };
  expect(await handler('browser-native-confirm')(event, prompt)).toBe(false);
  expect(await handler('browser-native-confirm')(event, prompt)).toBe(true);
});

it('opens the system emoji panel only for trusted main-frame requests', () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(
    Object.assign(new EventEmitter(), { isDestroyed: () => false })
  );
  registerNativeUi((contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([channel]) => channel === 'browser-emoji-picker')
    .at(-1)[1];
  expect(() => handler({ sender, senderFrame: {} })).toThrow('Untrusted');
  handler({ sender, senderFrame: sender.mainFrame });
  expect(app.showEmojiPanel).toHaveBeenCalledTimes(
    process.platform === 'darwin' ? 1 : 0
  );
});

it('cancels replaced and navigated menus, ignores stale selection, and cleans listeners', async () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  registerNativeUi((contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([channel]) => channel === 'browser-native-menu')
    .at(-1)[1];
  const event = { sender, senderFrame: sender.mainFrame };
  const first = handler(event, [{ id: 'first', label: 'First' }]);
  const firstTemplate = (Menu.buildFromTemplate as jest.Mock).mock.calls.at(
    -1
  )[0];
  const second = handler(event, [{ id: 'second', label: 'Second' }]);
  expect(await first).toBeNull();
  firstTemplate[0].click();
  expect(sender.listenerCount('did-start-navigation')).toBe(1);
  sender.emit('did-start-navigation', {}, 'https://example.com/#x', true, true);
  expect(sender.listenerCount('did-start-navigation')).toBe(1);
  sender.emit('did-start-navigation', {}, 'https://example.com', false, true);
  expect(await second).toBeNull();
  expect(sender.listenerCount('did-start-navigation')).toBe(0);
  expect(sender.listenerCount('destroyed')).toBe(0);
  expect(owner.listenerCount('closed')).toBe(0);
  const third = handler(event, [{ id: 'third', label: 'Third' }]);
  owner.emit('closed');
  expect(await third).toBeNull();
  expect(owner.listenerCount('closed')).toBe(0);
});

it('does not return late confirmation or image selection after the requester closes', async () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  let closed = false;
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => closed,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  registerNativeUi((contents) => contents === sender);
  const handler = (name: string) =>
    (ipcMain.handle as jest.Mock).mock.calls
      .filter(([channel]) => channel === name)
      .at(-1)[1];
  const event = { sender, senderFrame: sender.mainFrame };
  let confirm: (value: any) => void = () => {};
  (showBrowserDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      })
  );
  const pending = handler('browser-native-confirm')(event, {
    message: 'Move?',
    detail: 'Different group',
    confirm: 'Move',
  });
  closed = true;
  confirm({ response: 1 });
  expect(await pending).toBe(false);
  closed = false;
  let choose: (value: any) => void = () => {};
  (dialog.showOpenDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      })
  );
  const picking = handler('browser-space-icon')(event);
  closed = true;
  choose({ canceled: false, filePaths: ['/tmp/image.png'] });
  expect(await picking).toBeNull();
  expect(nativeImage.createFromPath).not.toHaveBeenCalled();
});

it('invalidates pending confirmation on document navigation even if the frame object survives', async () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  registerNativeUi((contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([channel]) => channel === 'browser-native-confirm')
    .at(-1)[1];
  let finish: (value: any) => void = () => {};
  (showBrowserDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = handler(
    { sender, senderFrame: sender.mainFrame },
    { message: 'Move?', detail: '', confirm: 'Move' }
  );
  sender.emit('did-start-navigation', {}, 'file:///new-document', false, true);
  finish({ response: 1 });
  expect(await pending).toBe(false);
  expect(sender.listenerCount('did-start-navigation')).toBe(0);
  expect(owner.listenerCount('closed')).toBe(0);
});

it('validates selected image paths, file type and size before decoding and resizes valid icons', async () => {
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} }) as any;
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  registerNativeUi((contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([channel]) => channel === 'browser-space-icon')
    .at(-1)[1];
  const event = { sender, senderFrame: sender.mainFrame };
  const load = loadLocalIcon as jest.Mock;
  load.mockReset();
  (nativeImage.createFromPath as jest.Mock).mockClear();
  const resize = jest.fn(() => ({
    toDataURL: () => 'data:image/png;base64,valid',
  }));
  load.mockResolvedValue({ isEmpty: () => false, resize });
  try {
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: [],
    });
    await expect(handler(event)).rejects.toThrow('valid image file');
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['relative.png'],
    });
    await expect(handler(event)).rejects.toThrow('valid image file');
    load.mockRejectedValueOnce(new Error('Choose a regular image file.'));
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/image.png'],
    });
    await expect(handler(event)).rejects.toThrow('image file');
    load.mockRejectedValueOnce(new Error('Choose an image smaller than 5 MB.'));
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/image.png'],
    });
    await expect(handler(event)).rejects.toThrow('smaller than 5 MB');
    expect(nativeImage.createFromPath).not.toHaveBeenCalled();
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/image.png'],
    });
    expect(await handler(event)).toBe('data:image/png;base64,valid');
    expect(resize).toHaveBeenCalledWith({ width: 32, height: 32 });
    expect(sender.listenerCount('did-start-navigation')).toBe(0);
    expect(owner.listenerCount('closed')).toBe(0);
  } finally {
    load.mockReset();
  }
});

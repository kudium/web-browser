import { EventEmitter } from 'events';
import {
  app as electronApp,
  ipcMain,
  Menu,
  WebContentsView,
  BrowserWindow,
} from 'electron';
import fs from 'fs';
import { flushHistory, closeHistoryPersistence } from '../main/history';
import { getSiteSettings, updateSiteSettings } from '../main/siteSettings';
import { applyExtensions, releaseExtensionOwner } from '../main/extensions';
import { registerBrowser } from '../main/browser';
import { showBrowserDialog } from '../main/dialogs';
import { inspectDiscardCandidate } from '../main/tabDiscard';
import { bindDownloadSource } from '../main/downloads';
import { registerAI } from '../main/ai';

jest.mock('../main/faviconDecoder', () => ({
  FaviconDecoder: jest.fn(() => ({
    decode: jest.fn().mockResolvedValue('data:image/png;base64,cached'),
    clear: jest.fn(),
  })),
}));

jest.mock('../main/localStorage', () => ({
  safeStorage: jest.requireMock('electron').safeStorage,
}));

jest.mock('../main/ai', () => ({ registerAI: jest.fn(() => jest.fn()) }));
jest.mock('../main/pageCapture', () => ({
  registerPageCapture: jest.fn(() => jest.fn()),
}));
jest.mock('../main/spaceGestures', () => ({
  registerSpaceGestures: jest.fn(() => jest.fn()),
}));

jest.mock('../main/dialogs', () => ({
  ...jest.requireActual('../main/dialogs'),
  showBrowserDialog: jest.fn(),
}));

jest.mock('../main/tabDiscard', () => ({
  inspectDiscardCandidate: jest.fn().mockResolvedValue({ x: 10, y: 20 }),
}));

jest.mock('../main/siteSettings', () => {
  const actual = jest.requireActual('../main/siteSettings');
  const sites = new Map();
  return {
    ...actual,
    getSiteSettings: jest.fn(
      (profile, origin) =>
        sites.get(`${profile}:${origin}`) || { permissions: {}, muted: false }
    ),
    updateSiteSettings: jest.fn((profile, origin, patch) =>
      sites.set(`${profile}:${origin}`, {
        ...(sites.get(`${profile}:${origin}`) || {
          permissions: {},
          muted: false,
        }),
        ...patch,
      })
    ),
  };
});

jest.mock('../main/preferences', () => ({
  enablePagePinchZoom: jest.fn(),
  applyBrowserPreferences: jest.fn(),
  getBrowserPreferences: () => ({
    shortcuts: jest.requireActual('../browser/shortcuts').defaultShortcuts,
    advanced: jest.requireActual('../browser/advancedPreferences')
      .defaultAdvanced,
    discardInactiveTabs: true,
    discardAfterMinutes: 15,
    defaultFontSize: 16,
    allowPopups: true,
    permissions: 'ask',
  }),
}));

jest.mock('../main/downloads', () => ({
  bindDownloadSource: jest.fn(),
  trackDownloads: jest.fn(),
  hasActiveDownloads: jest.fn(() => false),
  downloadMenu: jest.fn(() => []),
}));

jest.mock('../main/extensions', () => ({
  releaseExtensionOwner: jest.fn(),
  installedExtensionOrigins: () => ['chrome-extension://protected'],
  configureExtensionStore: jest.fn(),
  applyExtensions: jest.fn().mockResolvedValue(undefined),
  extensionMenu: jest.fn(() => []),
  getExtensionProfile: jest.fn(),
  setActiveExtensionProfile: jest.fn(),
  setExtensionInstallTarget: jest.fn(),
}));

jest.mock('electron', () => {
  const { EventEmitter: Emitter } = jest.requireActual('events');
  const filesystem = jest.requireActual('fs');
  const directory = filesystem.mkdtempSync(
    `${jest.requireActual('os').tmpdir()}/kudiumbrowser-browser-test-`
  );
  return {
    app: Object.assign(new Emitter(), { getPath: () => directory }),
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => false,
        resize: () => ({ toDataURL: () => 'data:image/png;base64,cached' }),
      }),
    },
    ipcMain: Object.assign(new Emitter(), {
      handle: jest.fn(),
      removeHandler: jest.fn(),
    }),
    dialog: { showMessageBox: jest.fn() },
    Menu: { buildFromTemplate: jest.fn(() => ({ popup: jest.fn() })) },
    BrowserWindow: jest.fn().mockImplementation((options) =>
      Object.assign(new Emitter(), {
        options,
        isDestroyed: () => false,
        show: jest.fn(),
        showInactive: jest.fn(),
        destroy: jest.fn(),
        close: jest.fn(),
        webContents: {
          session: options.webPreferences.session,
          loadURL: jest.fn().mockResolvedValue(undefined),
          focus: jest.fn(),
        },
        loadURL: jest.fn().mockResolvedValue(undefined),
      })
    ),
    WebContentsView: jest.fn().mockImplementation((options) => ({
      options,
      setBorderRadius: jest.fn(),
      setVisible: jest.fn(),
      setBounds: jest.fn(),
      webContents: Object.assign(new Emitter(), {
        isDestroyed: () => false,
        isDevToolsOpened: () => false,
        executeJavaScript: jest.fn().mockResolvedValue(undefined),
        getURL: () => 'https://example.com',
        getTitle: () => 'Example',
        isLoading: jest.fn(() => false),
        isAudioMuted: jest.fn(() => false),
        isCurrentlyAudible: jest.fn(() => true),
        setAudioMuted: jest.fn(),
        getUserAgent: () => 'Chrome/140 Electron/45',
        setUserAgent: jest.fn(),
        setWindowOpenHandler: jest.fn(),
        reload: jest.fn(),
        session: {
          setUserAgent: jest.fn(),
          clearData: jest.fn().mockResolvedValue(undefined),
          setPermissionRequestHandler: jest.fn(),
          setPermissionCheckHandler: jest.fn(),
          fetch: jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            body: new (jest.requireActual('stream/web').ReadableStream)({
              start(controller: any) {
                controller.enqueue(
                  Buffer.from(
                    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVR4nO3OIQEAAAgDsOckJ/0gxs3E/JKdqxIQEBAQEBAQEBAQEBAQEGgHHuoPNHkTKkJmAAAAAElFTkSuQmCC',
                    'base64'
                  )
                );
                controller.close();
              },
            }),
          }),
        },
        navigationHistory: {
          getAllEntries: () => [
            { url: 'https://example.com', title: 'Example' },
          ],
          getActiveIndex: () => 0,
          restore: jest.fn().mockResolvedValue(undefined),
          canGoBack: () => false,
          canGoForward: () => false,
        },
        loadURL: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
      }),
    })),
  };
});

Object.assign(BrowserWindow, {
  getAllWindows: () => [],
  fromWebContents: () => undefined,
});
it.each([false, true])(
  'keeps the browser attached while storage is pending (closed: %s)',
  async (closeBeforeReady) => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      webContents: Object.assign(new EventEmitter(), {
        send: jest.fn(),
        isFocused: jest.fn(() => false),
        isDestroyed: jest.fn(() => false),
        focus: jest.fn(),
        mainFrame: {},
      }),
      contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
    });
    let ready!: () => void;
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const ai = registerAI as jest.Mock;
    ai.mockClear();
    const timer = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: jest.fn() } as any);
    const dispose = registerBrowser(window as any, pending);
    expect(ai).not.toHaveBeenCalled();
    // Browser IPC is installed immediately, without waiting for encrypted AI.
    expect(ipcMain.listenerCount('browser-sync')).toBeGreaterThan(0);
    if (closeBeforeReady) dispose();
    ready();
    await pending;
    expect(ai).toHaveBeenCalledTimes(closeBeforeReady ? 0 : 1);
    dispose();
    timer.mockRestore();
  }
);
afterAll(async () => {
  await flushHistory();
  await closeHistoryPersistence();
  fs.rmSync(electronApp.getPath('userData'), { recursive: true, force: true });
});

it('restores lazily, isolates groups, retains visited hidden views and closes removed views', async () => {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: Object.assign(new EventEmitter(), {
      send: jest.fn(),
      isFocused: jest.fn(() => false),
      isDestroyed: jest.fn(() => false),
      focus: jest.fn(),
      mainFrame: {},
    }),
    contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
  });
  const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
  const timer = jest
    .spyOn(global, 'setInterval')
    .mockReturnValue({ unref: jest.fn() } as any);
  registerBrowser(window as any);
  const shortcutEvent = { preventDefault: jest.fn() };
  window.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyDown',
    key: 's',
    code: 'KeyS',
    meta: process.platform === 'darwin',
    control: process.platform !== 'darwin',
  });
  expect(shortcutEvent.preventDefault).toHaveBeenCalled();
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'sidebar-or-save'
  );
  window.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyDown',
    key: 'i',
    code: 'KeyI',
    meta: process.platform === 'darwin',
    control: process.platform !== 'darwin',
  });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'ai-sidebar'
  );
  for (const shift of [false, true]) {
    window.webContents.emit('before-input-event', shortcutEvent, {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      control: true,
      shift,
    });
    expect(window.webContents.send).toHaveBeenLastCalledWith(
      'browser-shortcut',
      shift ? 'tab-switcher-previous' : 'tab-switcher-next'
    );
  }
  window.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlLeft',
    control: false,
  });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'tab-switcher-commit'
  );
  window.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyDown',
    key: 'Escape',
  });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'tab-switcher-cancel'
  );
  const apps = ['one', 'two', 'three'].map((id) => ({
    id,
    name: id,
    icon: '',
    url: 'https://example.com',
    sessionId: id === 'two' ? 'two' : 'one',
  }));
  const emit = (
    sender = window.webContents,
    list = apps,
    visibleIds = ['one'],
    focusedId: string | undefined = undefined
  ) =>
    ipcMain.emit(
      'browser-sync',
      {
        sender,
        senderFrame: window.webContents.mainFrame,
      },
      {
        apps: list,
        focusedId,
        visible: visibleIds.map((id) => ({
          id,
          x: 76,
          y: 48,
          width: 800,
          height: 600,
        })),
      }
    );
  emit({} as any);
  expect(WebContentsView).not.toHaveBeenCalled();
  emit();
  expect(WebContentsView).toHaveBeenCalledTimes(1);
  expect(applyExtensions).toHaveBeenCalledTimes(1);
  const first = (WebContentsView as unknown as jest.Mock).mock.results[0].value;
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(first.webContents.loadURL).toHaveBeenCalledTimes(1);
  emit();
  expect(WebContentsView).toHaveBeenCalledTimes(1);
  first.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    control: true,
    shift: true,
  });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'tab-switcher-previous'
  );
  first.webContents.emit('before-input-event', shortcutEvent, {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlRight',
    control: false,
  });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-shortcut',
    'tab-switcher-commit'
  );
  first.webContents.emit('dom-ready');
  expect(first.setVisible).toHaveBeenLastCalledWith(true);
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-state',
    expect.objectContaining({ initialLoading: false })
  );
  // Both split panes load on demand.
  emit(window.webContents, apps, ['two', 'three']);
  expect(WebContentsView).toHaveBeenCalledTimes(3);
  emit();
  expect(first.webContents.loadURL).toHaveBeenCalledTimes(1);
  const views = (WebContentsView as unknown as jest.Mock).mock.results.map(
    (result) => result.value
  );
  expect(views.map((view) => view.options.webPreferences.partition)).toEqual([
    'persist:kudiumbrowser-one',
    'persist:kudiumbrowser-two',
    'persist:kudiumbrowser-one',
  ]);
  expect(views[0].setBounds).toHaveBeenCalledWith({
    x: 76,
    y: 48,
    width: 800,
    height: 600,
  });
  expect(views[1].setVisible).toHaveBeenCalledWith(false);
  emit();
  expect(WebContentsView).toHaveBeenCalledTimes(3);
  const popup = views[0].webContents.setWindowOpenHandler.mock.calls[0][0]({
    url: 'https://example.com/login',
  });
  expect(popup.action).toBe('allow');
  expect(popup.outlivesOpener).toBe(true);
  expect(popup.createWindow).toEqual(expect.any(Function));
  const allocatedContents = { id: 'chromium-child' };
  popup.createWindow({ webContents: allocatedContents, webPreferences: {} });
  expect(WebContentsView).toHaveBeenLastCalledWith(
    expect.objectContaining({
      webContents: allocatedContents,
      webPreferences: expect.objectContaining({
        session: views[0].webContents.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      }),
    })
  );
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-tab-request',
    expect.objectContaining({
      action: 'create',
      app: expect.objectContaining({
        url: 'https://example.com/login',
        name: 'example.com',
        icon: '',
        customName: undefined,
        sessionId: apps[0].sessionId,
        favorite: false,
        pinned: false,
      }),
    })
  );
  const open = views[0].webContents.setWindowOpenHandler.mock.calls[0][0];
  const background = open({
    url: 'https://other.example/page',
    disposition: 'background-tab',
  });
  expect(background.action).toBe('allow');
  background.createWindow({ webPreferences: {} });
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-tab-request',
    expect.objectContaining({
      background: true,
      app: expect.objectContaining({
        url: 'https://other.example/page',
        name: 'other.example',
        icon: '',
      }),
    })
  );
  const tabRequestCount = window.webContents.send.mock.calls.length;
  expect(
    open({ url: 'invalid-scheme:example', disposition: 'foreground-tab' })
  ).toEqual({ action: 'deny' });
  expect(window.webContents.send.mock.calls).toHaveLength(tabRequestCount);
  const early = open({ url: 'about:blank', disposition: 'foreground-tab' });
  const earlyContents = early.createWindow({ webPreferences: {} });
  const earlyRequest = [...window.webContents.send.mock.calls]
    .reverse()
    .find(
      ([channel, request]) =>
        channel === 'browser-tab-request' && request.action === 'create'
    )[1];
  const earlyView = (WebContentsView as unknown as jest.Mock).mock.results.at(
    -1
  )?.value;
  expect(bindDownloadSource).toHaveBeenCalledWith(
    earlyContents,
    JSON.stringify(['one', earlyRequest.app.id])
  );
  const preventDefault = jest.fn();
  earlyContents.emit('close', { preventDefault });
  expect(preventDefault).toHaveBeenCalled();
  expect(window.contentView.removeChildView).toHaveBeenCalledWith(earlyView);
  expect(earlyContents.listenerCount('page-favicon-updated')).toBe(0);
  expect(earlyContents.close).toHaveBeenCalledTimes(1);
  // Electron destroys asynchronously after close; release developer-page state.
  earlyContents.emit('destroyed');
  expect(earlyContents.listenerCount('destroyed')).toBe(0);
  const beforeLateAck = (WebContentsView as unknown as jest.Mock).mock.calls
    .length;
  emit(window.webContents, [...apps, earlyRequest.app], [earlyRequest.app.id]);
  expect(WebContentsView).toHaveBeenCalledTimes(beforeLateAck);
  expect(window.webContents.send).toHaveBeenCalledWith('browser-tab-request', {
    action: 'close',
    id: earlyRequest.app.id,
  });
  emit();
  AbortSignal.timeout = jest.fn(() => new AbortController().signal);
  views[0].webContents.emit('page-favicon-updated', {}, [
    'https://example.com/favicon.ico',
  ]);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-state',
    expect.objectContaining({
      id: 'one',
      icon: 'data:image/png;base64,cached',
      title: 'Example',
    })
  );
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    { id: 'one', action: 'menu' }
  );
  expect(Menu.buildFromTemplate).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Extensions' }),
      expect.objectContaining({ label: 'Downloads' }),
    ])
  );
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    { id: 'one', action: 'extensions' }
  );
  expect(Menu.buildFromTemplate).toHaveBeenLastCalledWith([]);
  const extensionMenuCount = (Menu.buildFromTemplate as jest.Mock).mock.calls
    .length;
  ipcMain.emit(
    'browser-command',
    { sender: {} },
    { id: 'one', action: 'extensions' }
  );
  expect(Menu.buildFromTemplate).toHaveBeenLastCalledWith([]);
  expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(extensionMenuCount);
  const checkPermission =
    views[0].webContents.session.setPermissionCheckHandler.mock.calls[0][0];
  const requestPermission =
    views[0].webContents.session.setPermissionRequestHandler.mock.calls[0][0];
  updateSiteSettings('one', 'https://example.com', {
    permissions: { geolocation: 'block' },
  });
  const permissionCallback = jest.fn();
  await requestPermission(
    views[0].webContents,
    'geolocation',
    permissionCallback,
    { requestingUrl: 'https://example.com/path' }
  );
  expect(permissionCallback).toHaveBeenLastCalledWith(false);
  updateSiteSettings('one', 'https://example.com', {
    permissions: { geolocation: 'allow' },
  });
  await requestPermission(
    views[0].webContents,
    'geolocation',
    permissionCallback,
    { requestingUrl: 'https://example.com/path' }
  );
  expect(permissionCallback).toHaveBeenLastCalledWith(true);
  expect(checkPermission(null, 'geolocation', 'https://example.com')).toBe(
    true
  );
  expect(checkPermission(null, 'geolocation', 'https://other.example')).toBe(
    false
  );
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    { id: 'one', action: 'settings' }
  );
  const siteMenu = (Menu.buildFromTemplate as jest.Mock).mock.calls.at(-1)[0];
  expect(siteMenu).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Connection uses HTTPS' }),
      expect.objectContaining({ label: 'Permissions' }),
      expect.objectContaining({ label: 'Mute Site' }),
    ])
  );
  const location = siteMenu
    .find((entry: any) => entry.label === 'Permissions')
    .submenu.find((entry: any) => entry.label === 'Location');
  location.submenu.find((entry: any) => entry.label === 'Block').click();
  expect(
    getSiteSettings('one', 'https://example.com').permissions.geolocation
  ).toBe('block');
  siteMenu.find((entry: any) => entry.label === 'Mute Site').click();
  expect(views[0].webContents.setAudioMuted).toHaveBeenCalledWith(true);
  expect(getSiteSettings('one', 'https://example.com').muted).toBe(true);
  views[0].webContents.emit('media-started-playing');
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-state',
    expect.objectContaining({ id: 'one', mediaPlaying: true, audible: true })
  );
  views[0].webContents.emit('media-paused');
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-state',
    expect.objectContaining({ mediaPlaying: false })
  );
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    {
      id: 'one',
      action: 'set-permission',
      url: 'https://example.com',
      permission: 'geolocation',
      choice: 'allow',
    }
  );
  expect(
    getSiteSettings('one', 'https://example.com').permissions.geolocation
  ).toBe('allow');
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    {
      id: 'one',
      action: 'set-permission',
      url: 'https://old.example',
      permission: 'geolocation',
      choice: 'block',
    }
  );
  expect(
    getSiteSettings('one', 'https://example.com').permissions.geolocation
  ).toBe('allow');
  ipcMain.emit(
    'browser-command',
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    { id: 'one', action: 'reset-permissions', url: 'https://example.com' }
  );
  expect(getSiteSettings('one', 'https://example.com').permissions).toEqual({});
  views[0].webContents.isLoading.mockReturnValue(true);
  views[0].webContents.emit('did-start-loading');
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-state',
    expect.objectContaining({ id: 'one', loading: true })
  );
  views[0].webContents.isLoading.mockReturnValue(false);
  views[0].webContents.emit('did-stop-loading');
  expect(window.webContents.send).toHaveBeenLastCalledWith(
    'browser-state',
    expect.objectContaining({ id: 'one', loading: false })
  );
  const createExtensionTab = (applyExtensions as jest.Mock).mock.calls[0][4]
    .createTab;
  const [auxiliaryContents, auxiliaryWindow] = await createExtensionTab({
    url: 'https://outside.example/help',
  });
  expect(BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({
      parent: window,
      webPreferences: expect.objectContaining({
        session: views[0].webContents.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      }),
    })
  );
  expect(auxiliaryContents.session).toBe(views[0].webContents.session);
  expect(auxiliaryContents.session).not.toBe(views[1].webContents.session);
  expect(auxiliaryWindow.loadURL).toHaveBeenCalledWith(
    'https://outside.example/help'
  );
  expect(auxiliaryWindow.show).toHaveBeenCalled();
  expect(auxiliaryContents.focus).toHaveBeenCalled();
  await expect(
    createExtensionTab({ url: ['javascript', 'alert(1)'].join(':') })
  ).rejects.toThrow('unsupported page address');
  // Long-idle hidden pages unload, while audible pages and the focused page stay.
  views[1].webContents.isCurrentlyAudible.mockReturnValue(false);
  views[1].webContents.close.mockImplementation(() =>
    views[1].webContents.emit('destroyed')
  );
  clock.mockReturnValue(16 * 60000);
  (timer.mock.calls[0][0] as () => void)();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.resolve();
  expect(inspectDiscardCandidate).toHaveBeenCalledWith(views[1].webContents);
  expect(views[1].webContents.close).toHaveBeenCalledWith({
    waitForBeforeUnload: true,
  });
  expect(views[0].webContents.close).not.toHaveBeenCalled();
  expect(views[2].webContents.close).not.toHaveBeenCalled();
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-state',
    expect.objectContaining({ id: 'two', discarded: true })
  );
  emit(window.webContents, apps, ['two']);
  const resumed = (WebContentsView as unknown as jest.Mock).mock.results.at(
    -1
  )!.value;
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(resumed.webContents.navigationHistory.restore).toHaveBeenCalledWith({
    entries: [{ url: 'https://example.com', title: 'Example' }],
    index: 0,
  });
  resumed.webContents.emit('did-finish-load');
  expect(resumed.webContents.executeJavaScript).toHaveBeenCalledWith(
    'window.scrollTo(10, 20)'
  );
  emit();
  const unopened = {
    ...apps[1],
    id: 'unopened',
    url: 'https://old.example',
    sessionId: 'old',
  };
  const count = (WebContentsView as unknown as jest.Mock).mock.calls.length;
  emit(window.webContents, [...apps, unopened]);
  expect(WebContentsView).toHaveBeenCalledTimes(count);
  const updated = { ...unopened, url: 'https://new.example', sessionId: 'new' };
  emit(window.webContents, [...apps, updated], []);
  expect(WebContentsView).toHaveBeenCalledTimes(count);
  emit(window.webContents, [...apps, updated], [], 'unopened');
  const focusedView = (WebContentsView as unknown as jest.Mock).mock.results.at(
    -1
  )!.value;
  expect(focusedView.options.webPreferences.partition).toBe(
    'persist:kudiumbrowser-new'
  );
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(focusedView.webContents.loadURL).toHaveBeenCalledWith(
    'https://new.example'
  );
  emit(window.webContents, apps.slice(0, 1));
  expect(views[1].webContents.close).toHaveBeenCalled();
  window.emit('closed');
  expect(releaseExtensionOwner).toHaveBeenCalledWith(window);
  expect(views[0].webContents.close).toHaveBeenCalled();
  expect(ipcMain.listenerCount('browser-sync')).toBe(0);
  timer.mockRestore();
  clock.mockRestore();
});

it.each(['same', 'cancel', 'closed', 'moved', 'frame', 'moved-during-clear'])(
  'applies delayed clear-site-data consent only to its live original tab (%s)',
  async (scenario) => {
    let closed = false;
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => closed,
      webContents: Object.assign(new EventEmitter(), {
        send: jest.fn(),
        isFocused: jest.fn(() => false),
        isDestroyed: jest.fn(() => false),
        focus: jest.fn(),
        mainFrame: {},
      }),
      contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
    });
    const timer = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: jest.fn() } as any);
    registerBrowser(window as any);
    const app = {
      id: 'consent',
      name: 'Consent',
      icon: '',
      url: 'https://example.com',
      sessionId: 'original',
    };
    const sync = (item = app) =>
      ipcMain.emit(
        'browser-sync',
        {
          sender: window.webContents,
          senderFrame: window.webContents.mainFrame,
        },
        {
          apps: [item],
          visible: [{ id: item.id, x: 0, y: 0, width: 600, height: 400 }],
          focusedId: item.id,
        }
      );
    sync();
    const original = (WebContentsView as unknown as jest.Mock).mock.results.at(
      -1
    )!.value.webContents;
    let finishClear: () => void = () => {};
    if (scenario === 'moved-during-clear')
      original.session.clearData.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishClear = resolve;
          })
      );
    let finish: (answer: any) => void = () => {};
    (showBrowserDialog as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    ipcMain.emit(
      'browser-command',
      { sender: window.webContents, senderFrame: window.webContents.mainFrame },
      { id: app.id, action: 'clear-data' }
    );
    if (scenario === 'closed') closed = true;
    if (scenario === 'moved') sync({ ...app, sessionId: 'other' });
    if (scenario === 'frame') window.webContents.mainFrame = {};
    finish({ response: scenario === 'cancel' ? 0 : 1 });
    await Promise.resolve();
    if (scenario === 'moved-during-clear') {
      sync({ ...app, sessionId: 'other' });
      finishClear();
    }
    await Promise.resolve();
    expect(original.session.clearData.mock.calls).toEqual(
      ['same', 'moved-during-clear'].includes(scenario)
        ? [
            [
              {
                dataTypes: [
                  'cookies',
                  'localStorage',
                  'indexedDB',
                  'serviceWorkers',
                ],
                excludeOrigins: ['chrome-extension://protected'],
              },
            ],
          ]
        : []
    );
    expect(original.reload).toHaveBeenCalledTimes(scenario === 'same' ? 1 : 0);
    const replacement = scenario.startsWith('moved')
      ? (WebContentsView as unknown as jest.Mock).mock.results.at(-1)!.value
          .webContents
      : undefined;
    expect(replacement?.session.clearData.mock.calls || []).toEqual([]);
    expect(replacement?.reload.mock.calls || []).toEqual([]);
    window.emit('closed');
    timer.mockRestore();
  }
);

it.each(['navigation', 'removal', 'window', 'empty-list'])(
  'cancels pending favicon transport on %s',
  async (scenario) => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      webContents: Object.assign(new EventEmitter(), {
        send: jest.fn(),
        isFocused: jest.fn(() => false),
        isDestroyed: jest.fn(() => false),
        focus: jest.fn(),
        mainFrame: {},
      }),
      contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
    });
    const timer = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: jest.fn() } as any);
    const dispose = registerBrowser(window as any);
    const item = {
      id: 'favicon-tab',
      name: 'Fixture',
      icon: '',
      url: 'https://example.com',
      sessionId: 'fixture',
    };
    const sync = (apps: (typeof item)[]) =>
      ipcMain.emit(
        'browser-sync',
        {
          sender: window.webContents,
          senderFrame: window.webContents.mainFrame,
        },
        {
          apps,
          visible: apps.map((app) => ({
            id: app.id,
            x: 0,
            y: 0,
            width: 600,
            height: 400,
          })),
          focusedId: apps[0]?.id,
        }
      );
    sync([item]);
    const contents = (WebContentsView as unknown as jest.Mock).mock.results.at(
      -1
    )!.value.webContents;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const decoder = jest.requireMock('../main/faviconDecoder').FaviconDecoder.mock.results.at(-1).value;
    const decodedBeforeRequest = decoder.decode.mock.calls.length;
    let signal: AbortSignal | undefined;
    contents.session.fetch.mockImplementationOnce(
      (_address: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          signal.addEventListener('abort', () => reject(signal!.reason), {
            once: true,
          });
        })
    );
    contents.emit('page-favicon-updated', {}, [
      'https://example.com/favicon.png',
    ]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(signal?.aborted).toBe(false);
    contents.emit('did-start-navigation', {}, item.url, true, true);
    expect(signal?.aborted).toBe(false);
    if (scenario === 'navigation') {
      contents.emit('did-start-navigation', {}, item.url, false, true);
    } else if (scenario === 'removal') sync([]);
    else if (scenario === 'empty-list')
      contents.emit('page-favicon-updated', {}, []);
    else window.emit('closed');
    expect(signal?.aborted).toBe(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // Empty candidate lists trigger the root favicon fallback after cancellation.
    expect(decoder.decode).toHaveBeenCalledTimes(
      decodedBeforeRequest + (scenario === 'empty-list' ? 1 : 0)
    );
    dispose();
    timer.mockRestore();
  }
);

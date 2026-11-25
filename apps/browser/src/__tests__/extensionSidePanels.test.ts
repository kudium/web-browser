import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'events';
import {
  attachExtensionSidePanels,
  extensionPanelURL,
  extensionActiveTab,
} from '../main/extensionSidePanels';

let mockRoot: string;
const mockHosts = new Map<any, any>();
const mockViews: any[] = [];
jest.mock('../main/sidebarPanels', () => ({
  sidebarPanelsFor: (window: any) => mockHosts.get(window),
  sidebarPanelHostFor: (window: any) => mockHosts.get(window),
}));
jest.mock('electron', () => ({
  app: { getPath: () => mockRoot },
  WebContentsView: jest.fn().mockImplementation((options) => {
    const view = {
      webPreferences: options.webPreferences,
      webContents: Object.assign(new (require('events').EventEmitter)(), {
        setWindowOpenHandler: jest.fn(),
        loadURL: jest.fn(() => Promise.resolve()),
      }),
    };
    mockViews.push(view);
    return view;
  }),
}));

function fixture(extraHandlers: Array<[string, any]> = [], manage?: any) {
  const extension = {
    id: 'a'.repeat(32),
    name: 'Panel fixture',
    path: path.join(mockRoot, 'extension'),
    manifest: {
      permissions: ['sidePanel'],
      side_panel: { default_path: 'panel.html' },
    },
  };
  fs.mkdirSync(extension.path);
  for (const file of ['panel.html', 'alternate.html'])
    fs.writeFileSync(path.join(extension.path, file), '<title>Panel</title>');
  const window = { id: 1, isDestroyed: () => false, webContents: {} };
  const tab1 = { id: 10 },
    tab2 = { id: 11 };
  let active = tab1;
  const providers = new Map<string, any>();
  const host = {
    register: (provider: any) => providers.set(provider.info.id, provider),
    remove: (id: string) => providers.delete(id),
    activate: jest.fn(),
    close: jest.fn(),
    state: jest.fn(() => ({ activeId: undefined })),
    activeSession: undefined as any,
  };
  mockHosts.set(window, host);
  let loaded = true;
  const extensions = Object.assign(new EventEmitter(), {
    getAllExtensions: () => (loaded ? [extension] : []),
    getExtension: (id: string) =>
      loaded && id === extension.id ? extension : undefined,
  });
  const store = Object.assign(new EventEmitter(), {
    windows: new Set([window]),
    getTabById: (id: number) => [tab1, tab2].find((tab) => tab.id === id),
    getWindowById: (id: number) => (id === window.id ? window : undefined),
    getCurrentWindow: () => window,
    getActiveTabFromWindow: () => active,
    tabToWindow: new WeakMap<any, any>([
      [tab1, window],
      [tab2, window],
    ]),
    createTab: jest.fn(() => Promise.resolve(tab1)),
  });
  const originalActivate = jest.fn();
  const handlers = new Map<string, any>([
    ['browserAction.activate', { callback: originalActivate }],
    ...extraHandlers,
  ]);
  const router = {
    handlers,
    sendEvent: jest.fn(),
    apiHandler: () => (name: string, callback: any, options: any) =>
      handlers.set(name, { callback, options }),
  };
  const profileSession = { extensions };
  host.activeSession = profileSession;
  const api = Object.assign(new EventEmitter(), {
    ctx: { session: profileSession, store, router },
  });
  attachExtensionSidePanels(api as any, 'profile-a', manage);
  const event = { extension, sender: {}, type: 'service-worker' };
  const call = (name: string, options?: any) =>
    handlers.get(`sidePanel.${name}`).callback(event, options);
  const click = () =>
    handlers
      .get('browserAction.activate')
      .callback(
        { type: 'frame', sender: window.webContents },
        { extensionId: extension.id, tabId: 10, eventType: 'click' },
      );
  return {
    extension,
    window,
    store,
    router,
    event,
    call,
    click,
    providers,
    host,
    originalActivate,
    profileSession,
    api,
    unload: () => {
      loaded = false;
      extensions.emit('extension-unloaded', {}, extension);
    },
    setTab: (tabId: number) => {
      active = tabId === 10 ? tab1 : tab2;
      store.emit('active-tab-changed', active, window);
    },
  };
}

beforeEach(() => {
  mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-panels-test-'));
  mockHosts.clear();
  mockViews.length = 0;
});
afterEach(() => fs.rmSync(mockRoot, { recursive: true, force: true }));

test('frame and worker API handlers require sidePanel permission and validate profile targets', () => {
  const f = fixture();
  for (const [name, handler] of f.router.handlers)
    if (name.startsWith('sidePanel.'))
      expect(handler.options.permission).toBe('sidePanel');
  expect(f.call('getOptions')).toEqual({ enabled: true, path: 'panel.html' });
  expect(() => f.call('setOptions', { tabId: 999, enabled: true })).toThrow(
    /Unknown/,
  );
  expect(() => f.call('open', { windowId: 999 })).toThrow(
    /outside this profile/,
  );
  expect(() => f.call('open', { windowId: 1, tabId: 10 })).toThrow(
    /Specify one/,
  );
  expect(() => f.call('open', { windowId: 1 })).toThrow(/user gesture/);
  expect(() => f.call('getOptions', { tabId: '10' })).toThrow(/Invalid/);
  f.extension.manifest.permissions = [];
  expect(() => f.call('setOptions', { enabled: true })).toThrow(
    /missing sidePanel permission/,
  );
});

test('panel paths cannot escape the loaded package through URLs or symlinks', () => {
  const { extension } = fixture();
  fs.writeFileSync(path.join(mockRoot, 'outside.html'), 'private');
  fs.symlinkSync(
    path.join(mockRoot, 'outside.html'),
    path.join(extension.path, 'escape.html'),
  );
  for (const resource of [
    'https://example.com/',
    `chrome-extension://${'b'.repeat(32)}/panel.html`,
    'file:///private',
    'escape.html',
    '%2f..%2foutside.html',
  ])
    expect(() => extensionPanelURL(extension as any, resource)).toThrow();
  expect(extensionPanelURL(extension as any, 'panel.html?mode=sidebar')).toBe(
    `chrome-extension://${extension.id}/panel.html?mode=sidebar`,
  );
});

test('tab-scoped settings follow the active tab and disabling a tab hides its panels', () => {
  const f = fixture();
  f.call('setOptions', { tabId: 11, path: 'alternate.html' });
  let available = [...f.providers.values()].filter((provider) =>
    provider.available(),
  );
  expect(available).toHaveLength(1);
  expect(available[0].contentKey).toContain('/panel.html');
  f.setTab(11);
  available = [...f.providers.values()].filter((provider) =>
    provider.available(),
  );
  expect(available).toHaveLength(1);
  expect(available[0].contentKey).toContain('/alternate.html');
  f.call('setOptions', { tabId: 11, enabled: false });
  expect(
    [...f.providers.values()].filter((provider) => provider.available()),
  ).toHaveLength(0);
  f.setTab(10);
  expect(
    [...f.providers.values()].filter((provider) => provider.available()),
  ).toHaveLength(1);
  f.host.activeSession = {};
  expect(
    [...f.providers.values()].filter((provider) => provider.available()),
  ).toHaveLength(0);
});

test('toolbar action behavior opens the shared host and its view retains profile isolation', () => {
  const f = fixture();
  f.call('setPanelBehavior', { openPanelOnActionClick: true });
  f.click();
  expect(f.host.activate).toHaveBeenCalled();
  expect(f.originalActivate).not.toHaveBeenCalled();
  const provider = [...f.providers.values()].find((item) => item.available());
  const view = provider.createView();
  expect(view.webPreferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  expect(view.webPreferences.session).toBe(f.profileSession);
  expect(view.webContents.loadURL).toHaveBeenCalledWith(
    `chrome-extension://${f.extension.id}/panel.html`,
  );
  const popup = view.webContents.setWindowOpenHandler.mock.calls[0][0];
  expect(popup({ url: 'file:///private' })).toEqual({ action: 'deny' });
  expect(f.store.createTab).not.toHaveBeenCalled();
  popup({ url: 'https://example.com/' });
  expect(f.store.createTab).toHaveBeenCalledWith({
    url: 'https://example.com/',
    windowId: 1,
  });
  f.call('open', { windowId: 1 });
  expect(f.host.activate).toHaveBeenCalledTimes(2);
});

test('extension unloading destroys its registrations', () => {
  const f = fixture();
  expect(f.providers.size).toBeGreaterThan(0);
  f.unload();
  expect(f.providers.size).toBe(0);
});

test('authentication windows without sidebar hosts do not abort tab creation or refresh', () => {
  const f = fixture();
  const popup = { id: 42, isDestroyed: () => false, webContents: {} };
  f.store.windows.add(popup);
  expect(() => f.store.emit('window-added', popup)).not.toThrow();
  expect(() => f.store.emit('tab-added', { id: 43 })).not.toThrow();
  expect(f.providers.size).toBe(1);
  expect([...f.providers.values()][0].info.id).toContain(':1:');
});

test('tab creation follows the active tab when groups share an extension profile', () => {
  const f = fixture();
  expect(extensionActiveTab(f.api as any, 1)?.id).toBe(10);
  f.setTab(11);
  expect(extensionActiveTab(f.api as any, 1)?.id).toBe(11);
  expect(extensionActiveTab(f.api as any, 999)).toBeUndefined();
});

test('sidebar API requests use the logical owning window instead of an unrelated focused window', () => {
  const create = jest.fn((_event, options) => options);
  const query = jest.fn((_event, options) => options);
  const f = fixture([
    ['tabs.create', { callback: create }],
    ['tabs.query', { callback: query }],
    ['windows.getCurrent', { callback: () => ({ id: 999 }) }],
    ['windows.get', { callback: (_event: any, id: number) => ({ id }) }],
  ]);
  const view = [...f.providers.values()][0].createView();
  const event = { ...f.event, type: 'frame', sender: view.webContents };
  expect(
    f.router.handlers
      .get('tabs.create')
      .callback(event, { url: 'https://example.com/' }),
  ).toMatchObject({ windowId: 1 });
  expect(
    f.router.handlers
      .get('tabs.query')
      .callback(event, { currentWindow: true, active: true }),
  ).toEqual({ currentWindow: false, active: true, windowId: 1 });
  expect(f.router.handlers.get('windows.getCurrent').callback(event)).toEqual({
    id: 1,
  });
  expect(f.router.handlers.get('windows.getCurrent').callback(f.event)).toEqual(
    { id: 999 },
  );
});


test('management uses the existing extension control with its logical owner and current tab', () => {
  const manage = jest.fn(), f = fixture([], manage);
  [...f.providers.values()][0].manage();
  expect(manage).toHaveBeenCalledWith(f.window, expect.objectContaining({ id: 10 }), f.extension.id);
  f.setTab(11);
  [...f.providers.values()][0].manage();
  expect(manage).toHaveBeenLastCalledWith(f.window, expect.objectContaining({ id: 11 }), f.extension.id);
});

import { EventEmitter } from 'events';
import fs from 'fs';
import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import { defaultPreferences } from '../browser/preferences';
import { showBrowserDialog } from '../main/dialogs';
import { getExtensionProfile } from '../main/extensions';
import {
  applyBrowserPreferences,
  getBrowserPreferences,
  updateBrowserPreferences,
  validatePreferences,
  registerPreferences,
  onBrowserPreferencesChanged,
} from '../main/preferences';

jest.mock('../main/extensions', () => ({
  configureExtensionToolbar: jest.fn(),
  extensionMenu: () => [],
  getExtensionProfiles: () => [],
  getExtensionProfile: jest.fn(),
  installedExtensionOrigins: () => ['chrome-extension://safe'],
}));

it('validates and persists compact group and folder-preview preferences', () => {
  expect(() =>
    validatePreferences({ tabDisplayMode: 'floating' } as any)
  ).toThrow('Invalid preference');
  expect(() =>
    validatePreferences({ folderHoverPreviews: 'yes' } as any)
  ).toThrow('Invalid preference');
  updateBrowserPreferences({
    tabDisplayMode: 'click',
    folderHoverPreviews: false,
  });
  expect(getBrowserPreferences()).toEqual(
    expect.objectContaining({
      tabDisplayMode: 'click',
      folderHoverPreviews: false,
    })
  );
  updateBrowserPreferences({
    tabDisplayMode: 'horizontal',
    folderHoverPreviews: true,
  });
});

it('validates and persists address bar placement and extension visibility', () => {
  expect(() =>
    validatePreferences({ addressBarPlacement: 'floating' } as any)
  ).toThrow('Invalid preference');
  expect(() =>
    validatePreferences({ addressBarExtensionsExpanded: 'yes' } as any)
  ).toThrow('Invalid preference');
  updateBrowserPreferences({
    addressBarPlacement: 'header',
    addressBarExtensionsExpanded: false,
  });
  expect(getBrowserPreferences()).toEqual(
    expect.objectContaining({
      addressBarPlacement: 'header',
      addressBarExtensionsExpanded: false,
    })
  );
  updateBrowserPreferences({
    addressBarPlacement: 'sidebar',
    addressBarExtensionsExpanded: true,
  });
});

it('validates and persists explicit extension pin order, including hide-all and reset', () => {
  expect(
    validatePreferences({ extensionToolbarOrder: ['b', 'a', 'b'] })
  ).toEqual({ extensionToolbarOrder: ['b', 'a'] });
  expect(() =>
    validatePreferences({ extensionToolbarOrder: ['../escape'] })
  ).toThrow('Invalid extension');
  expect(() =>
    validatePreferences({ extensionToolbarOrder: Array(257).fill('a') })
  ).toThrow('Invalid extension');
  updateBrowserPreferences({ extensionToolbarOrder: [] });
  expect(getBrowserPreferences().extensionToolbarOrder).toEqual([]);
  updateBrowserPreferences({ extensionToolbarOrder: ['b', 'a'] });
  expect(getBrowserPreferences().extensionToolbarOrder).toEqual(['b', 'a']);
  updateBrowserPreferences({ extensionToolbarOrder: null });
  expect(getBrowserPreferences().extensionToolbarOrder).toBeNull();
});
jest.mock('fs', () => {
  let saved = '{}';
  return {
    readFileSync: () => saved,
    writeFileSync: (_file: string, value: string) => {
      saved = value;
    },
    mkdirSync: jest.fn(),
    renameSync: jest.fn(),
  };
});
jest.mock('../main/dialogs', () => ({
  ...jest.requireActual('../main/dialogs'),
  showBrowserDialog: jest.fn(),
}));
jest.mock('electron', () => ({
  app: { getPath: () => '/preferences-test' },
  session: {
    defaultSession: { availableSpellCheckerLanguages: ['en-US', 'fr'] },
  },
  dialog: {
    showErrorBox: jest.fn(),
    showMessageBox: jest.fn(),
    showOpenDialog: jest.fn(),
  },
  ipcMain: { handle: jest.fn() },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
    fromWebContents: jest.fn(),
  },
}));
it('persists validated preferences and applies live settings to existing views', () => {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    setZoomFactor: jest.fn(),
    getURL: () => 'https://example.com',
    session: {
      setSpellCheckerEnabled: jest.fn(),
      setSpellCheckerLanguages: jest.fn(),
    },
  });
  applyBrowserPreferences(contents as any);
  updateBrowserPreferences({
    searchEngine: 'google',
    zoom: 1.25,
    spellcheck: false,
    spellcheckLanguage: 'fr',
    permissions: 'block',
  });
  expect(contents.setZoomFactor).toHaveBeenLastCalledWith(1.25);
  expect(contents.session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(
    false
  );
  expect(contents.session.setSpellCheckerLanguages).toHaveBeenLastCalledWith([
    'fr',
  ]);
  expect(getBrowserPreferences()).toMatchObject({
    searchEngine: 'google',
    permissions: 'block',
  });
  expect(() => validatePreferences({ zoom: 99 })).toThrow();
  expect(() => validatePreferences({ permissions: 'allow' } as any)).toThrow();
  expect(() =>
    validatePreferences({ downloadDirectory: '/arbitrary' })
  ).toThrow();
  expect(() =>
    validatePreferences({ spellcheckLanguage: 'unsupported' })
  ).toThrow();
  contents.emit('destroyed');
  contents.setZoomFactor.mockClear();
  updateBrowserPreferences({ zoom: 1 });
  expect(contents.setZoomFactor).not.toHaveBeenCalled();
});

it('requires confirmation and keeps extension origins when clearing one profile', async () => {
  const owner = {} as any;
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    getURL: () => 'file:///trusted/index.html',
    isDestroyed: () => false,
  }) as any;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  const clearData = jest.fn().mockResolvedValue(undefined);
  const profile = { id: 'a', name: 'Account A', owner, session: { clearData } };
  (getExtensionProfile as jest.Mock).mockImplementation((id) =>
    id === 'a' ? profile : undefined
  );
  registerPreferences(undefined, (sender) => sender === contents);
  const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
    (call) => call[0] === 'browser-preference-action'
  )[1];
  const event = { sender: contents, senderFrame: contents.mainFrame };
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  await handler(event, 'clear-data', 'a');
  expect(clearData).not.toHaveBeenCalled();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 1 });
  await handler(event, 'clear-data', 'a');
  expect(clearData).toHaveBeenCalledWith({
    dataTypes: ['cookies', 'localStorage', 'indexedDB', 'serviceWorkers'],
    excludeOrigins: ['chrome-extension://safe'],
  });
  await expect(
    handler({ ...event, senderFrame: {} }, 'clear-data', 'a')
  ).rejects.toThrow('Untrusted');
});

it('persists custom engines and rejects deleting the active default without a replacement', () => {
  const custom = {
    id: 'custom-search',
    name: 'Custom Search',
    url: 'https://example.com/search?q=%s',
  };
  updateBrowserPreferences({
    searchEngines: [custom],
    searchEngine: custom.id,
  });
  expect(getBrowserPreferences().searchEngines).toEqual([custom]);
  expect(getBrowserPreferences().searchEngine).toBe(custom.id);
  expect(() =>
    updateBrowserPreferences({ searchEngines: [{ ...custom, id: 'another' }] })
  ).toThrow('default search engine');
  expect(getBrowserPreferences().searchEngine).toBe(custom.id);
});

it('validates and persists custom sleeping-tab preferences', () => {
  const patch = {
    discardAfterMinutes: 47,
    keepPinnedTabsAwake: true,
    keepFavoriteTabsAwake: true,
    discardExcludedSites: ['https://Example.com/path'],
  };
  updateBrowserPreferences(patch);
  expect(getBrowserPreferences()).toMatchObject({
    ...patch,
    discardExcludedSites: ['example.com'],
  });
  [0, -1, 1441, 1.5, NaN].forEach((discardAfterMinutes) => {
    expect(() => validatePreferences({ discardAfterMinutes })).toThrow();
  });
  expect(() =>
    validatePreferences({
      discardExcludedSites: ['https://user:password@example.com'],
    })
  ).toThrow();
});

it('persists sync consent and category selections without claiming a cloud connection', () => {
  updateBrowserPreferences({
    cloudSync: {
      enabled: true,
      provider: 'icloud',
      categories: { workspace: true, openTabs: false, preferences: true },
    },
  });
  expect(getBrowserPreferences().cloudSync).toEqual({
    enabled: true,
    provider: 'icloud',
    categories: { workspace: true, openTabs: false, preferences: true },
  });
  expect(() =>
    validatePreferences({
      cloudSync: {
        enabled: true,
        provider: 'icloud',
        categories: { workspace: false, openTabs: false, preferences: false },
      },
    })
  ).toThrow('Select at least');
});

it('broadcasts preference changes only to live trusted app windows', () => {
  const sender = { mainFrame: {}, send: jest.fn() } as any;
  const external = { send: jest.fn() } as any;
  const closed = { send: jest.fn() } as any;
  (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([
    { webContents: sender, isDestroyed: () => false },
    { webContents: external, isDestroyed: () => false },
    { webContents: closed, isDestroyed: () => true },
  ]);
  registerPreferences(
    undefined,
    (contents) => contents === sender || contents === closed
  );
  try {
    updateBrowserPreferences({ showExtensionIcons: false });
    expect(sender.send).toHaveBeenCalledWith(
      'browser-preferences-changed',
      expect.objectContaining({ showExtensionIcons: false })
    );
    expect(external.send).not.toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
  } finally {
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);
  }
});

it('keeps concurrent edits when a directory picker completes and rejects late closed-owner results', async () => {
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: {},
    getURL: () => 'file:///trusted/index.html',
    isDestroyed: () => false,
  }) as any;
  const owner = {};
  let available = true;
  (BrowserWindow.fromWebContents as jest.Mock).mockImplementation(() =>
    available ? owner : null
  );
  registerPreferences(undefined, (contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([name]) => name === 'browser-preference-action')
    .at(-1)[1];
  const event = { sender, senderFrame: sender.mainFrame };
  let finish: (value: any) => void = () => {};
  (dialog.showOpenDialog as jest.Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const picking = handler(event, 'choose-download-directory');
  updateBrowserPreferences({ showExtensionIcons: true });
  finish({ canceled: false, filePaths: ['/chosen-downloads'] });
  expect(await picking).toMatchObject({
    downloadDirectory: '/chosen-downloads',
    showExtensionIcons: true,
  });
  const closing = handler(event, 'choose-download-directory');
  available = false;
  finish({ canceled: false, filePaths: ['/stale-downloads'] });
  await expect(closing).rejects.toThrow('Untrusted');
  expect(getBrowserPreferences().downloadDirectory).toBe('/chosen-downloads');
});

it('rejects late destructive consent when its profile has been released', async () => {
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: {},
    getURL: () => 'file:///trusted/index.html',
    isDestroyed: () => false,
  }) as any;
  const owner = {};
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  const profile = {
    id: 'late',
    name: 'Late',
    owner,
    session: { clearData: jest.fn() },
  };
  (getExtensionProfile as jest.Mock).mockReturnValue(profile);
  registerPreferences(undefined, (contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .filter(([name]) => name === 'browser-preference-action')
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
    'clear-data',
    'late'
  );
  (getExtensionProfile as jest.Mock).mockReturnValue(undefined);
  finish({ response: 1 });
  await expect(pending).rejects.toThrow('no longer available');
  expect(profile.session.clearData).not.toHaveBeenCalled();
});

it('reads once per data directory and protects nested snapshots and defaults', () => {
  const location = jest.spyOn(app, 'getPath').mockReturnValue('/cache-owned');
  const read = jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
  try {
    const first = getBrowserPreferences();
    for (let index = 0; index < 100; index += 1)
      expect(getBrowserPreferences()).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    expect(() => {
      (first as any).permissions = 'block';
    }).toThrow(TypeError);
    expect(() => first.advanced.siteRules.push({} as any)).toThrow(TypeError);
    expect(() => {
      first.cloudSync.categories.preferences = true;
    }).toThrow(TypeError);
    expect(Object.isFrozen(defaultPreferences.advanced)).toBe(false);
    location.mockReturnValue('/cache-another');
    expect(getBrowserPreferences()).not.toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    read.mockRestore();
    location.mockRestore();
  }
});

it('publishes persisted changes before listeners and detaches mutable patches', () => {
  const location = jest.spyOn(app, 'getPath').mockReturnValue('/cache-publish');
  const read = jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
  const original = getBrowserPreferences();
  const observed: string[] = [];
  const stop = onBrowserPreferencesChanged(() => {
    observed.push(getBrowserPreferences().permissions);
  });
  try {
    const order = ['safe'];
    const updated = updateBrowserPreferences({
      permissions: 'block',
      extensionToolbarOrder: order,
    });
    order.push('later');
    expect(updated).toBe(getBrowserPreferences());
    expect(observed).toEqual(['block']);
    expect(updated.extensionToolbarOrder).toEqual(['safe']);
    expect(original.permissions).toBe('ask');
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    read.mockRestore();
    location.mockRestore();
  }
});

it('keeps the saved snapshot and suppresses notifications after a failed rename', () => {
  const location = jest.spyOn(app, 'getPath').mockReturnValue('/cache-failure');
  const read = jest
    .spyOn(fs, 'readFileSync')
    .mockReturnValue('{"permissions":"block"}');
  const original = getBrowserPreferences();
  const notified = jest.fn();
  const stop = onBrowserPreferencesChanged(notified);
  (fs.renameSync as jest.Mock).mockImplementationOnce(() => {
    throw new Error('disk unavailable');
  });
  try {
    expect(() => updateBrowserPreferences({ permissions: 'ask' })).toThrow(
      'disk unavailable'
    );
    expect(getBrowserPreferences()).toBe(original);
    expect(getBrowserPreferences().permissions).toBe('block');
    expect(notified).not.toHaveBeenCalled();
  } finally {
    stop();
    read.mockRestore();
    location.mockRestore();
  }
});

it('caches missing or malformed defaults and replaces them on a successful save', () => {
  const location = jest.spyOn(app, 'getPath').mockReturnValue('/cache-missing');
  const read = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    throw new Error('ENOENT');
  });
  try {
    expect(getBrowserPreferences().permissions).toBe('ask');
    expect(getBrowserPreferences().permissions).toBe('ask');
    expect(read).toHaveBeenCalledTimes(1);
    updateBrowserPreferences({ permissions: 'block' });
    expect(getBrowserPreferences().permissions).toBe('block');
    location.mockReturnValue('/cache-malformed');
    read.mockReturnValue('{bad');
    expect(getBrowserPreferences().permissions).toBe('ask');
    expect(getBrowserPreferences().permissions).toBe('ask');
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    read.mockRestore();
    location.mockRestore();
  }
});

import { EventEmitter } from 'events';
import fs from 'fs';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import {
  installChromeWebStore,
  updateExtensions,
} from 'electron-chrome-web-store';
import { showBrowserDialog } from '../main/dialogs';
import * as extensionPackage from '../main/extensionPackage';
import {
  applyExtensions,
  configureExtensionStore,
  extensionAllowed,
  extensionMenu,
  setExtensionInstallTarget,
  getExtensionProfile,
  releaseExtensionOwner,
  getExtensionProfiles,
  updateInstalledExtensions,
  extensionRemoteAuthority,
  storeExtensionId,
  installStoreExtension,
} from '../main/extensions';

jest.mock('../main/dialogs', () => ({
  ...jest.requireActual('../main/dialogs'),
  showBrowserDialog: jest.fn(),
}));
jest.mock('electron', () => ({
  app: { getPath: () => '/extension-test' },
  session: { defaultSession: {} },
  dialog: { showMessageBox: jest.fn(), showErrorBox: jest.fn() },
}));
jest.mock('electron-chrome-extensions', () => ({
  ElectronChromeExtensions: Object.assign(jest.fn(), {
    handleCRXProtocol: jest.fn(),
  }),
}));
jest.mock('electron-chrome-web-store', () => ({
  installChromeWebStore: jest.fn(() => Promise.resolve()),
  updateExtensions: jest.fn(),
}));
jest.mock('fs', () => {
  let saved = '[]';
  return {
    readFileSync: jest.fn(() => saved),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn((_file: string, value: string) => {
      saved = value;
    }),
    renameSync: jest.fn(),
  };
});

it('detaches closed window callbacks, denies late consent and reuses the group engine on reopening', async () => {
  const owner = { id: 50 } as any;
  const reopened = { id: 51 } as any;
  const browserSession = {
    extensions: Object.assign(new EventEmitter(), {
      getAllExtensions: () => [],
      loadExtension: jest.fn(),
      removeExtension: jest.fn(),
    }),
    serviceWorkers: new EventEmitter(),
  } as any;
  const createTab = jest.fn();
  const timer = jest
    .spyOn(global, 'setInterval')
    .mockReturnValue({ unref: jest.fn() } as any);
  await applyExtensions(browserSession, 'lifecycle', 'Lifecycle', owner, {
    createTab,
  });
  timer.mockRestore();
  const engine = (
    ElectronChromeExtensions as unknown as jest.Mock
  ).mock.calls.find(([options]) => options.session === browserSession)![0];
  const { beforeInstall } = (
    installChromeWebStore as jest.Mock
  ).mock.calls.find(([options]) => options.session === browserSession)![0];
  let answer!: (value: { response: number }) => void;
  await expect(
    beforeInstall({ id: 'late', localizedName: 'Late', manifest: {} })
  ).resolves.toEqual({ action: 'deny' });
  releaseExtensionOwner(owner);
  expect(getExtensionProfile('lifecycle')).toBeUndefined();
  expect(() => engine.createTab({})).toThrow('unavailable');
  const engineCount = (ElectronChromeExtensions as unknown as jest.Mock).mock
    .calls.length;
  const newCreateTab = jest.fn();
  await applyExtensions(browserSession, 'lifecycle', 'Reopened', reopened, {
    createTab: newCreateTab,
  });
  expect(
    (ElectronChromeExtensions as unknown as jest.Mock).mock.calls
  ).toHaveLength(engineCount);
  releaseExtensionOwner(owner);
  engine.createTab({ url: 'https://example.com' });
  expect(newCreateTab).toHaveBeenCalledTimes(1);
  expect(createTab).not.toHaveBeenCalled();
  expect(getExtensionProfile('lifecycle')?.owner).toBe(reopened);
  releaseExtensionOwner(reopened);
});

it.each([
  'approved',
  'declined',
  'owner restored',
  'package changed',
  'load failed',
  'identity changed',
])(
  'owns update permissions, immutable package and rollback: %s',
  async (scenario) => {
    getExtensionProfiles().forEach((profile) =>
      releaseExtensionOwner(profile.owner)
    );
    const id = 'a'.repeat(32);
    const mainFrame = {};
    const contents = { mainFrame, isDestroyed: () => false };
    const owner = {
      id: 200,
      webContents: contents,
      isDestroyed: () => false,
    } as any;
    const old = { id, path: '/fixture/old', version: '1', name: 'Old' };
    const loaded = new Map([[id, old]]);
    const extensions = Object.assign(new EventEmitter(), {
      getAllExtensions: () => [...loaded.values()],
      getExtension: (key: string) => loaded.get(key),
      removeExtension: jest.fn((key: string) => loaded.delete(key)),
      loadExtension: jest.fn(async (filename: string) => {
        if (filename === '/fixture/new' && scenario === 'load failed')
          throw new Error('Native load failed');
        const extension = {
          ...old,
          id:
            filename === '/fixture/new' && scenario === 'identity changed'
              ? 'b'.repeat(32)
              : id,
          path: filename,
        };
        loaded.set(extension.id, extension);
        extensions.emit('extension-loaded', {}, extension);
        return extension;
      }),
    });
    const target = { extensions, serviceWorkers: new EventEmitter() } as any;
    const profileId = `update-${scenario}`;
    fs.writeFileSync(
      '/extension-test/extensions.json',
      JSON.stringify([
        {
          id,
          path: old.path,
          name: 'Old',
          enabled: true,
          scope: 'selected',
          profiles: [profileId],
          excluded: [],
        },
      ])
    );
    await applyExtensions(target, profileId, 'Update profile', owner);
    expect(
      extensionRemoteAuthority(
        { sender: contents, senderFrame: mainFrame } as any,
        target
      )
    ).toBe(true);
    expect(
      extensionRemoteAuthority(
        { sender: contents, senderFrame: {} } as any,
        target
      )
    ).toBe(false);
    expect(
      extensionRemoteAuthority(
        { sender: contents, senderFrame: mainFrame } as any,
        {} as any
      )
    ).toBe(false);
    const prepared = {
      manifest: { version: '2', name: 'Updated' },
      permissions: ['storage', 'https://new-destination.example/*'],
      validate: jest.fn(async () => {
        if (scenario === 'package changed') throw new Error('Package changed');
      }),
      commit: jest.fn(async () => '/fixture/new'),
      path: () => '/fixture/new',
      retain: jest.fn(),
      dispose: jest.fn(async () => {}),
    };
    const preparation = jest
      .spyOn(extensionPackage, 'prepareExtensionPackage')
      .mockResolvedValue(prepared as any);
    (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
      if (scenario === 'owner restored') {
        releaseExtensionOwner(owner);
        await applyExtensions(target, profileId, 'Update profile', owner);
      }
      return { response: scenario === 'declined' ? 0 : 1 };
    });
    (updateExtensions as jest.Mock).mockImplementationOnce(
      async (_session, applyUpdate) => {
        await applyUpdate(
          { id, version: '2', extension: old },
          '/fixture/download'
        );
      }
    );
    try {
      const failure = await updateInstalledExtensions().then(
        () => undefined,
        (error: unknown) => error
      );
      expect(Boolean(failure)).toBe(
        [
          'owner restored',
          'package changed',
          'load failed',
          'identity changed',
        ].includes(scenario)
      );
      expect(showBrowserDialog).toHaveBeenLastCalledWith(
        owner,
        expect.objectContaining({
          permissions: prepared.permissions,
          defaultId: 0,
        })
      );
      const updateCalls: Record<string, string[]> = {
        approved: ['/fixture/new'],
        'load failed': ['/fixture/new', '/fixture/old'],
        'identity changed': ['/fixture/new', '/fixture/old'],
      };
      expect(
        extensions.loadExtension.mock.calls.map(([filename]) => filename)
      ).toEqual(updateCalls[scenario] || []);
      expect(prepared.retain).toHaveBeenCalledTimes(
        scenario === 'approved' ? 1 : 0
      );
      expect(loaded.get(id)?.path).toBe(
        scenario === 'approved' ? '/fixture/new' : '/fixture/old'
      );
      expect(loaded.has('b'.repeat(32))).toBe(false);
      const policy = JSON.parse(
        fs.readFileSync('/extension-test/extensions.json', 'utf8')
      );
      expect(policy.map((entry: any) => entry.id)).toEqual([id]);
      expect(policy[0].path).toBe(
        scenario === 'approved' ? '/fixture/new' : old.path
      );
      expect(prepared.dispose).toHaveBeenCalled();
    } finally {
      preparation.mockRestore();
      releaseExtensionOwner(owner);
    }
  }
);

it('respects global exclusions, selected profiles and disabled extensions', () => {
  const policy = {
    enabled: true,
    scope: 'all' as const,
    profiles: [],
    excluded: ['b'],
  };
  expect(extensionAllowed(policy, 'a')).toBe(true);
  expect(extensionAllowed(policy, 'b')).toBe(false);
  expect(extensionAllowed({ ...policy, enabled: false }, 'a')).toBe(false);
  expect(
    extensionAllowed({ ...policy, scope: 'selected', profiles: ['b'] }, 'b')
  ).toBe(true);
  expect(
    extensionAllowed({ ...policy, scope: 'selected', profiles: ['b'] }, 'a')
  ).toBe(false);
});

it('rejects malformed catalog policies without losing healthy siblings or widening access', () => {
  const valid = {
    id: 'healthy',
    path: '/healthy',
    name: 'Healthy',
    enabled: true,
    scope: 'selected',
    profiles: ['a'],
    excluded: [],
  };
  (fs.readFileSync as jest.Mock).mockReturnValueOnce(
    JSON.stringify([
      null,
      valid,
      { ...valid, id: 'bad-scope', name: 'Bad scope', scope: '' },
      { ...valid, id: 'bad-grant', name: 'Bad grant', enabled: 'true' },
      {
        ...valid,
        id: 'bad-exclusion',
        name: 'Bad exclusion',
        scope: 'all',
        excluded: 'a',
      },
      { ...valid, id: 'bad-profile', name: 'Bad profile', profiles: [42] },
      { ...valid, id: 'healthy', name: 'Duplicate', scope: 'all' },
      {
        ...valid,
        id: 'legacy',
        name: 'Legacy',
        scope: undefined,
        profiles: undefined,
        excluded: undefined,
      },
    ])
  );
  const menu = extensionMenu({ id: 1 } as any);
  expect(menu.some((item) => item.label === 'Healthy')).toBe(true);
  expect(menu.some((item) => item.label === 'Legacy')).toBe(true);
  expect(menu.some((item) => item.label?.startsWith('Bad'))).toBe(false);
  expect(menu.some((item) => item.label === 'Duplicate')).toBe(false);
  const healthy = menu.find((item) => item.label === 'Healthy')!;
  expect(
    (healthy.submenu as any[]).find(
      (item) => item.label === 'All Groups (including New Groups)'
    ).checked
  ).toBe(false);
  (fs.readFileSync as jest.Mock).mockReturnValueOnce('{broken');
  expect(
    extensionMenu({ id: 1 } as any).some(
      (item) => item.label === 'No extensions installed'
    )
  ).toBe(true);
});

it('requires install consent, persists per-app scope and exposes worker failures', async () => {
  const extensions = Object.assign(new EventEmitter(), {
    getAllExtensions: () => [{ id: 'test', path: '/test' }],
    loadExtension: jest.fn(),
  });
  const serviceWorkers = new EventEmitter();
  const timer = jest
    .spyOn(global, 'setInterval')
    .mockReturnValue({ unref: jest.fn() } as any);
  const owner = { id: 1, isDestroyed: () => false } as any;
  await applyExtensions(
    { extensions, serviceWorkers } as any,
    'a',
    'Account A',
    owner
  );
  timer.mockRestore();
  const options = (installChromeWebStore as jest.Mock).mock.calls.find(
    ([storeConfig]) => storeConfig.session.extensions === extensions
  )![0];
  const details = {
    id: 'test',
    localizedName: 'Test',
    manifest: { permissions: ['storage'] },
  };
  expect(await options.beforeInstall(details)).toEqual({ action: 'deny' });
  expect(await options.beforeInstall(details)).toEqual({ action: 'deny' });
  extensions.emit(
    'extension-loaded',
    {},
    { id: 'test', path: '/test', name: 'Test' }
  );
  const entry = extensionMenu(owner).find((item) => item.label === 'Test')!;
  const submenu = entry.submenu as any[];
  expect(
    submenu.find((item) => item.label === 'All Groups (including New Groups)')
      .checked
  ).toBe(false);
  expect(
    submenu.find((item) => item.label === 'Group Access').submenu[0].checked
  ).toBe(true);
  const storeExtensions = Object.assign(new EventEmitter(), {
    getAllExtensions: () => [],
    loadExtension: jest.fn(() => Promise.resolve()),
    removeExtension: jest.fn(),
  });
  const storeTimer = jest
    .spyOn(global, 'setInterval')
    .mockReturnValue({ unref: jest.fn() } as any);
  await applyExtensions(
    { extensions: storeExtensions, serviceWorkers: new EventEmitter() } as any,
    'store',
    'Chrome Web Store',
    owner
  );
  storeTimer.mockRestore();
  setExtensionInstallTarget('store', 'a');
  const storeOptions = (installChromeWebStore as jest.Mock).mock.calls.find(
    ([storeConfig]) => storeConfig.session.extensions === storeExtensions
  )![0];
  await expect(
    storeOptions.beforeInstall({ ...details, id: 'targeted' })
  ).resolves.toEqual({ action: 'deny' });
  // Approved installs load in the target session; fallback store loading is denied.
  extensions.emit(
    'extension-loaded',
    {},
    { id: 'targeted', path: '/targeted', name: 'Targeted' }
  );
  const targetEntry = extensionMenu(owner).find(
    (item) => item.label === 'Targeted'
  )!;
  const access = (targetEntry.submenu as any[]).find(
    (item) => item.label === 'Group Access'
  ).submenu;
  expect(access.find((item: any) => item.label === 'Account A').checked).toBe(
    true
  );
  expect(
    access.find((item: any) => item.label === 'Chrome Web Store').checked
  ).toBe(false);
  const handlers = new Map<string, (...args: any[]) => any>();
  const storeFrame = { origin: 'https://chromewebstore.google.com' };
  const storeContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    mainFrame: storeFrame,
    session: getExtensionProfile('store')!.session,
    getURL: (): string => 'https://chromewebstore.google.com/',
    send: jest.fn(),
    ipc: {
      handle: (channel: string, handler: any) => handlers.set(channel, handler),
    },
  });
  configureExtensionStore(storeContents as any, 'store');
  Object.assign(owner, { isDestroyed: () => false });
  expect(
    extensionMenu(owner, storeContents as any).some(
      (item) => item.label === 'Install this extension…'
    )
  ).toBe(false);
  const originalURL = storeContents.getURL;
  storeContents.getURL = () =>
    `https://chromewebstore.google.com/detail/fixture/${'a'.repeat(32)}`;
  expect(
    extensionMenu(owner, storeContents as any).some(
      (item) => item.label === 'Install this extension…'
    )
  ).toBe(true);
  const otherOwner = { id: 999, isDestroyed: () => false } as any;
  expect(
    extensionMenu(otherOwner, storeContents as any).some(
      (item) => item.label === 'Install this extension…'
    )
  ).toBe(false);
  await expect(
    installStoreExtension(storeContents as any, otherOwner)
  ).rejects.toThrow('no longer available');
  storeContents.getURL = originalURL;
  await expect(
    installStoreExtension(storeContents as any, owner)
  ).rejects.toThrow('detail page');

  const status = handlers.get('chromeWebstore.getExtensionStatus')!;
  const storeEvent = {
    sender: storeContents,
    senderFrame: storeFrame,
  };
  Object.assign(extensions, { getExtension: () => undefined });
  const stalledPreparation = jest
    .spyOn(extensionPackage, 'prepareExtensionPackage')
    .mockImplementationOnce(() => new Promise<never>(() => {}));
  jest.useFakeTimers();
  try {
    const stalled = handlers.get('chromeWebstore.beginInstall')!(storeEvent, {
      id: 'a'.repeat(32),
    });
    await jest.advanceTimersByTimeAsync(120000);
    await expect(stalled).resolves.toEqual({
      result: 'install_error',
      message:
        'Extension could not be installed. Try again or review local extension settings.',
    });
    expect(storeContents.listenerCount('did-start-navigation')).toBe(0);
  } finally {
    jest.useRealTimers();
    stalledPreparation.mockRestore();
  }
  expect(status(storeEvent, 'targeted', '{"manifest_version":3}')).toBe(
    'enabled'
  );
  expect(status(storeEvent, 'unknown', '{"manifest_version":3}')).toBe(
    'installable'
  );
  expect(status(storeEvent, 'targeted', null)).toBe('enabled');
  expect(status(storeEvent, 'targeted')).toBe('enabled');
  expect(status(storeEvent, 'unknown', null)).toBe('installable');
  expect(() => status(storeEvent, 'unknown', false)).toThrow(
    'Invalid extension store request'
  );
  expect(() => status(storeEvent, 'unknown', 'null')).toThrow(
    'Invalid extension manifest'
  );

  expect(() =>
    status({ senderFrame: { origin: 'https://example.com' } }, 'targeted', '{}')
  ).toThrow('Untrusted');
  const uninstall = handlers.get('chrome.management.uninstall')!;
  expect(() =>
    status(
      { ...storeEvent, senderFrame: { ...storeFrame } },
      'targeted',
      '{"manifest_version":3}'
    )
  ).toThrow('Untrusted');
  expect(() => status(storeEvent, 'targeted', '[]')).toThrow('Invalid');
  expect(() =>
    status(storeEvent, 'targeted', 'x'.repeat(1024 * 1024 + 1))
  ).toThrow('Invalid');
  let approve!: (value: { response: number }) => void;
  (showBrowserDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve;
      })
  );
  const moved = uninstall(storeEvent, 'targeted');
  setExtensionInstallTarget('store', 'store');
  setExtensionInstallTarget('store', 'a');
  approve({ response: 1 });
  await expect(moved).resolves.toBe('user_cancelled');
  (showBrowserDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve;
      })
  );
  const navigated = uninstall(storeEvent, 'targeted');
  storeContents.emit(
    'did-start-navigation',
    {},
    storeContents.getURL(),
    false,
    true
  );
  approve({ response: 1 });
  await expect(navigated).resolves.toBe('user_cancelled');
  expect(storeContents.listenerCount('did-start-navigation')).toBe(0);
  (showBrowserDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve;
      })
  );
  const queued = uninstall(storeEvent, 'targeted');
  approve({ response: 1 });
  queueMicrotask(() => {
    setExtensionInstallTarget('store', 'store');
    setExtensionInstallTarget('store', 'a');
  });
  await expect(queued).rejects.toThrow('access changed');
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  await expect(uninstall(storeEvent, 'targeted')).rejects.toThrow('Disk full');
  await expect(uninstall(storeEvent, 'targeted')).resolves.toBe('success');
  serviceWorkers.emit(
    'console-message',
    {},
    {
      level: 3,
      sourceUrl: 'chrome-extension://test/background.js',
      message: 'Unsupported API',
    }
  );
  const errors = (
    extensionMenu(owner).find((item) => item.label === 'Test')!.submenu as any[]
  ).find((item) => item.label === 'View Errors in Account A…');
  errors.click();
  expect(showBrowserDialog).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({
      message: 'Test · Account A',
      technicalDetail: 'Unsupported API',
    })
  );
});

it('accepts only exact secure store detail URLs for the native install action', async () => {
  const id = 'a'.repeat(32);
  expect(
    storeExtensionId(
      `https://chromewebstore.google.com/detail/name/${id}?hl=en`
    )
  ).toBe(id);
  expect(
    storeExtensionId(`https://chromewebstore.google.com/detail/${id}`)
  ).toBe(id);
  [
    `http://chromewebstore.google.com/detail/${id}`,
    `https://chromewebstore.google.com.evil.test/detail/${id}`,
    `https://chromewebstore.google.com:444/detail/${id}`,
    `https://chromewebstore.google.com/detail/name/${id}/extra`,
    `https://chromewebstore.google.com/detail/${'z'.repeat(32)}`,
    'https://chromewebstore.google.com/',
    'invalid',
  ].forEach((url) => expect(storeExtensionId(url)).toBeUndefined());
  await expect(installStoreExtension({} as any, {} as any)).rejects.toThrow(
    'no longer available'
  );
});

import { EventEmitter } from 'events';
import fs from 'fs';
import { applyExtensions, extensionMenu } from '../main/extensions';

jest.mock('electron', () => ({
  app: { getPath: () => '/extension-startup' },
  session: { defaultSession: {} },
}));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('electron-chrome-extensions', () => ({
  ElectronChromeExtensions: Object.assign(jest.fn(), {
    handleCRXProtocol: jest.fn(),
  }),
}));
jest.mock('electron-chrome-web-store', () => ({
  installChromeWebStore: jest.fn(() => Promise.resolve()),
  updateExtensions: jest.fn(),
}));
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: () =>
    JSON.stringify([
      {
        id: 'test',
        path: '/test',
        name: 'Test',
        enabled: true,
        scope: 'all',
        profiles: [],
        excluded: [],
      },
      {
        id: 'broken',
        path: '/broken',
        name: 'Broken',
        enabled: true,
        scope: 'all',
        profiles: [],
        excluded: [],
      },
    ]),
}));

test('concurrent startup loads each extension once per group with no overlap and preserves failures', async () => {
  let activeLoads = 0;
  let peakLoads = 0;
  const owner = { id: 1 } as any;
  const createSession = () => {
    const loaded: { id: string; path: string }[] = [];
    const events = new EventEmitter();
    const extensions = Object.assign(events, {
      getAllExtensions: jest.fn(() => loaded),
      loadExtension: jest.fn(async (path: string) => {
        activeLoads += 1;
        peakLoads = Math.max(peakLoads, activeLoads);
        await Promise.resolve();
        activeLoads -= 1;
        if (path === '/broken') throw new Error('Invalid manifest');
        loaded.push({ id: 'test', path });
        events.emit('extension-loaded', {}, { id: 'test', path, name: 'Test' });
      }),
    });
    return { extensions, serviceWorkers: new EventEmitter() };
  };
  const first = createSession();
  const second = createSession();
  const timer = jest
    .spyOn(global, 'setInterval')
    .mockReturnValue({ unref: jest.fn() } as any);
  try {
    await Promise.all([
      applyExtensions(first as any, 'first', 'First', owner),
      applyExtensions(second as any, 'second', 'Second', owner),
      applyExtensions(first as any, 'first', 'First', owner),
    ]);
    expect(peakLoads).toBe(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(first.extensions.getAllExtensions).toHaveBeenCalledTimes(1);
    expect(second.extensions.getAllExtensions).toHaveBeenCalledTimes(1);
    expect(first.extensions.loadExtension.mock.calls).toEqual([
      ['/test'],
      ['/broken'],
    ]);
    expect(second.extensions.loadExtension.mock.calls).toEqual([
      ['/test'],
      ['/broken'],
    ]);
    const broken = extensionMenu(owner).find(
      (entry) => entry.label === 'Broken'
    )!;
    expect(broken.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'View Errors in First…' }),
        expect.objectContaining({ label: 'View Errors in Second…' }),
      ])
    );
  } finally {
    timer.mockRestore();
  }
});

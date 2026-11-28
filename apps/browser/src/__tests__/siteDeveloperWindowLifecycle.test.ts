/** @jest-environment node */
import { EventEmitter } from 'events';

const mockIPC = new EventEmitter();
const mockWindows: any[] = [];
jest.mock('../main/siteDeveloper', () => ({ onDeveloperStateChanged: () => () => {} }));
jest.mock('../main/appTheme', () => ({ registerAppThemeWindow: jest.fn() }));
jest.mock('../main/preferences', () => ({ getBrowserPreferences: () => ({}), onBrowserPreferencesChanged: () => () => {} }));
jest.mock('../main/browserRequests', () => ({ isBrowserCommand: () => false }));
jest.mock('../main/util', () => ({ resolveHtmlPath: () => 'https://fixture.invalid/editor' }));
jest.mock('../main/windowNavigation', () => ({ protectWindowNavigation: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: () => { throw new Error('No saved size'); } }));
jest.mock('electron', () => {
  const BrowserWindow = Object.assign(jest.fn().mockImplementation(() => {
    let destroyed = false;
    let rejectLoad!: (error: Error) => void;
    const contents = { send: jest.fn(), mainFrame: {} };
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => destroyed,
      isMinimized: () => false,
      setVibrancy: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      close: jest.fn(() => {
        if (destroyed) throw new TypeError('Object has been destroyed');
        destroyed = true;
        window.emit('closed');
      }),
      destroy: jest.fn(() => { window.close(); }),
      loadURL: jest.fn(() => new Promise((_resolve, reject) => { rejectLoad = reject; })),
      rejectLoad: () => rejectLoad(new Error('Navigation aborted')),
      loseNativeObjects: () => { destroyed = true; },
    });
    Object.defineProperty(window, 'webContents', { get: () => {
      if (destroyed) throw new TypeError('Object has been destroyed');
      return contents;
    } });
    mockWindows.push(window);
    return window;
  }), { fromWebContents: () => undefined });
  return { BrowserWindow, ipcMain: mockIPC, app: { getPath: () => '/tmp' }, nativeTheme: new (require('events').EventEmitter)(), shell: {} };
});
const { registerSiteDeveloperWindows } = require('../main/siteDeveloperWindow') as typeof import('../main/siteDeveloperWindow');
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => { mockWindows.length = 0; mockIPC.removeAllListeners(); });

it.each(['user-close', 'host-dispose', 'native-destroyed'])(
  'ignores editor load failures, IPC and ready callbacks after %s', async scenario => {
    const target = { profile: 'fixture', groupId: 'fixture', state: { origin: 'https://example.com', available: true } };
    const manager = registerSiteDeveloperWindows(() => target as any, jest.fn(), jest.fn());
    manager.open({ sender: {} } as any, 'tab', target.state.origin);
    const window = mockWindows[0];
    const sender = window.webContents;
    const receive = mockIPC.listeners('site-developer-command')[0];
    if (scenario === 'user-close') window.close();
    else if (scenario === 'host-dispose') manager.dispose();
    else { window.loseNativeObjects(); manager.dispose(); }
    expect(() => receive({ sender, senderFrame: sender.mainFrame }, 'get')).not.toThrow();
    expect(() => window.emit('ready-to-show')).not.toThrow();
    window.rejectLoad();
    await flush();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalledTimes(scenario === 'native-destroyed' ? 0 : 1);
    if (scenario === 'native-destroyed') window.emit('closed');
    expect(mockIPC.listenerCount('site-developer-command')).toBe(0);
    expect(() => manager.dispose()).not.toThrow();
  },
);

import { EventEmitter } from 'events';
import { session } from 'electron';
import {
  createPrivateSession,
  attachPrivateWindow,
  configurePrivateWindowFactory,
  createPrivateWindow,
} from '../main/privateBrowsing';
import { isPrivateSession } from '../main/privateSessions';

jest.mock('../main/downloads', () => ({ clearPrivateDownloads: jest.fn() }));

jest.mock('electron', () => ({
  app: { whenReady: async () => {} },
  session: { fromPartition: jest.fn() },
}));
function target() {
  const store = Object.assign(new EventEmitter(), {
    clearStorageData: jest.fn(async () => {}),
    clearCache: jest.fn(async () => {}),
    clearAuthCache: jest.fn(async () => {}),
    closeAllConnections: jest.fn(async () => {}),
  });
  (session.fromPartition as jest.Mock).mockReturnValue(store);
  return { store, created: createPrivateSession() };
}
it('uses a nonpersistent session and delegates UI creation to the existing shell', async () => {
  const { created } = target();
  const shell = {} as any;
  const factory = jest.fn(async () => shell);
  configurePrivateWindowFactory(factory);
  expect(await createPrivateWindow()).toBe(shell);
  expect(factory).toHaveBeenCalledWith(created);
  expect(isPrivateSession(created)).toBe(true);
  expect((session.fromPartition as jest.Mock).mock.calls[0][0]).not.toMatch(
    /^persist:/
  );
});
it('cleans up only after the last related shell window closes', () => {
  const { created, store } = target();
  const first = Object.assign(new EventEmitter(), { webContents: { isDestroyed: () => true } });
  const second = Object.assign(new EventEmitter(), { webContents: { isDestroyed: () => true } });
  attachPrivateWindow(first as any, created);
  attachPrivateWindow(second as any, created);
  first.emit('closed');
  expect(store.clearStorageData).not.toHaveBeenCalled();
  second.emit('closed');
  expect(store.clearStorageData).toHaveBeenCalledTimes(1);
  expect(store.clearCache).toHaveBeenCalledTimes(1);
});

it('waits for native contents destruction before clearing the closed private session', () => {
  const { created, store } = target();
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  attachPrivateWindow(window as any, created);
  Object.defineProperty(window, 'webContents', { get: () => { throw new TypeError('Object has been destroyed'); } });
  expect(() => window.emit('closed')).not.toThrow();
  expect(store.clearStorageData).not.toHaveBeenCalled();
  contents.emit('destroyed');
  expect(store.clearStorageData).toHaveBeenCalledTimes(1);
  contents.emit('destroyed');
  expect(store.clearStorageData).toHaveBeenCalledTimes(1);
});

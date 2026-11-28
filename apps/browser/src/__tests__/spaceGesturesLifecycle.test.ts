/** @jest-environment node */
import { EventEmitter } from 'events';
const mockIPC = new EventEmitter();
jest.mock('electron', () => ({ app: { getAppPath: () => '/tmp' }, ipcMain: mockIPC }));
jest.mock('fs', () => ({ existsSync: () => false }));
const { registerSpaceGestures } = require('../main/spaceGestures') as typeof import('../main/spaceGestures');

it('ignores readiness probes after native window destruction and removes its IPC listener', () => {
  const resources = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: '/tmp' });
  let destroyed = false;
  const contents = { isDestroyed: () => destroyed, mainFrame: {}, send: jest.fn() };
  const window = { isDestroyed: () => destroyed, get webContents() {
    if (destroyed) throw new TypeError('Object has been destroyed');
    return contents;
  } };
  try {
    const stop = registerSpaceGestures(window as any);
    const receive = mockIPC.listeners('browser-observe-space-wheel')[0];
    const event = { sender: contents, senderFrame: contents.mainFrame };
    mockIPC.emit('browser-observe-space-wheel', event);
    expect(contents.send).toHaveBeenCalledTimes(1);
    mockIPC.emit('browser-observe-space-wheel', { ...event, senderFrame: {} });
    expect(contents.send).toHaveBeenCalledTimes(1);
    destroyed = true;
    expect(() => mockIPC.emit('browser-observe-space-wheel', event)).not.toThrow();
    expect(contents.send).toHaveBeenCalledTimes(1);
    stop(); stop();
    expect(mockIPC.listenerCount('browser-observe-space-wheel')).toBe(0);
    expect(() => receive(event)).not.toThrow();
  } finally {
    mockIPC.removeAllListeners();
    if (resources) Object.defineProperty(process, 'resourcesPath', resources);
    else delete (process as any).resourcesPath;
  }
});

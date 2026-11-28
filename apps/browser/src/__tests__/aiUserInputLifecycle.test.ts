/** @jest-environment node */
import { EventEmitter } from 'events';

const mockIPC = new EventEmitter();
const mockWindows: any[] = [];
jest.mock('fs', () => ({ mkdirSync: jest.fn(), writeFileSync: jest.fn(), rmSync: jest.fn() }));
jest.mock('electron', () => ({
  app: { whenReady: async () => {}, getPath: () => '/tmp' },
  ipcMain: mockIPC,
  BrowserWindow: jest.fn().mockImplementation(() => {
    let destroyed = false;
    let rejectLoad!: (error: Error) => void;
    const contents = { mainFrame: {}, setWindowOpenHandler: jest.fn(), on: jest.fn() };
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => destroyed,
      show: jest.fn(),
      close: jest.fn(() => {
        if (destroyed) throw new TypeError('Object has been destroyed');
        destroyed = true;
        window.emit('closed');
      }),
      loadURL: jest.fn(() => new Promise((_resolve, reject) => { rejectLoad = reject; })),
      rejectLoad: () => rejectLoad(new Error('Navigation aborted')),
    });
    Object.defineProperty(window, 'webContents', { get: () => {
      if (destroyed) throw new TypeError('Object has been destroyed');
      return contents;
    } });
    mockWindows.push(window);
    return window;
  }),
}));

const { requestAIInput } = require('../main/aiUserInput') as typeof import('../main/aiUserInput');

beforeEach(() => { mockWindows.length = 0; mockIPC.removeAllListeners(); });
const request = { title: 'Input', reason: 'Provide an answer' };
const flush = () => new Promise(resolve => setImmediate(resolve));

it('ignores a late navigation failure and IPC after the user closes the input window', async () => {
  const answer = requestAIInput({} as never, request, new AbortController().signal);
  await flush();
  const window = mockWindows[0];
  const channel = mockIPC.eventNames()[0];
  const receive = mockIPC.listeners(channel)[0];
  const sender = window.webContents;
  window.close();
  await expect(answer).resolves.toBeNull();
  expect(() => receive({ sender, senderFrame: sender.mainFrame }, { answer: 'stale' })).not.toThrow();
  window.rejectLoad();
  window.emit('ready-to-show');
  await flush();
  expect(window.close).toHaveBeenCalledTimes(1);
  expect(window.show).not.toHaveBeenCalled();
  expect(mockIPC.eventNames()).toEqual([]);
});

it('settles an aborted request once, even when the window load subsequently fails', async () => {
  const controller = new AbortController();
  const answer = requestAIInput({} as never, request, controller.signal);
  const rejected = expect(answer).rejects.toThrow('Input request stopped');
  await flush();
  const window = mockWindows[0];
  controller.abort();
  await rejected;
  window.rejectLoad();
  await flush();
  expect(window.close).toHaveBeenCalledTimes(1);
  expect(mockIPC.eventNames()).toEqual([]);
});

it('does not load or show an already aborted private-input request', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(requestAIInput({} as never, request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockWindows).toHaveLength(0);
  expect(mockIPC.eventNames()).toEqual([]);
});

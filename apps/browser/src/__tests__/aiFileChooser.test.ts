import { EventEmitter } from 'events';
import { attachAIChooser } from '../main/aiFileChooser';

Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
  configurable: true,
  value() {
    if (this.aborted) throw new Error('Stopped.');
  },
});

let contents: any;
let send: jest.Mock;
let info: any;
beforeEach(() => {
  contents = { debugger: new EventEmitter() };
  info = {
    connected: true,
    tag: 'INPUT',
    type: 'file',
    disabled: false,
    multiple: false,
    directory: false,
    files: [],
  };
  send = jest.fn(async (method, params) => {
    if (method === 'Page.createIsolatedWorld')
      return { executionContextId: 22 };
    if (method === 'DOM.resolveNode')
      return { object: { objectId: 'file-node' } };
    if (method === 'Runtime.callFunctionOn')
      return { result: { value: { ...info } } };
    if (method === 'DOM.setFileInputFiles')
      info.files = [{ name: 'test.txt', size: 4 }];
    return {};
  });
});
const open = () => {
  contents.debugger.emit('message', {}, 'Page.fileChooserOpened', {
    frameId: 'frame',
    backendNodeId: 17,
    mode: 'selectSingle',
  });
  return Promise.resolve();
};

it('sets only the captured node and verifies selection in an isolated world', async () => {
  const selected = await attachAIChooser(
    contents,
    send,
    'frame',
    new AbortController().signal,
    ['/test.txt'],
    open,
    async () => {}
  );
  expect(selected).toEqual([{ name: 'test.txt', size: 4 }]);
  expect(send).toHaveBeenCalledWith('DOM.resolveNode', {
    backendNodeId: 17,
    executionContextId: 22,
  });
  expect(send).toHaveBeenCalledWith('DOM.setFileInputFiles', {
    backendNodeId: 17,
    files: ['/test.txt'],
  });
  expect(send).toHaveBeenCalledWith('Runtime.releaseObject', {
    objectId: 'file-node',
  });
  expect(send).toHaveBeenLastCalledWith('Page.setInterceptFileChooserDialog', {
    enabled: false,
  });
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('refuses disconnected inputs before selection and releases interception', async () => {
  info.connected = false;
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      open,
      async () => {}
    )
  ).rejects.toThrow('input changed');
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
  expect(contents.debugger.listenerCount('message')).toBe(0);
  expect(send).toHaveBeenLastCalledWith('Page.setInterceptFileChooserDialog', {
    enabled: false,
  });
});

it('rechecks constraints after asynchronous file validation', async () => {
  let checks = 0;
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      open,
      async () => {
        checks += 1;
        if (checks === 2) info.disabled = true;
      }
    )
  ).rejects.toThrow('input changed');
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
});

it('refuses a replaced frame before selection', async () => {
  const trigger = async () => {
    await open();
    contents.debugger.emit('message', {}, 'Page.frameNavigated', {
      frame: { id: 'frame' },
    });
  };
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      trigger,
      async () => {}
    )
  ).rejects.toThrow('document changed');
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
});

it('Stop cancels a pending chooser without changing any file selection', async () => {
  const controller = new AbortController();
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      controller.signal,
      ['/test.txt'],
      async () => {
        controller.abort();
      },
      async () => {}
    )
  ).rejects.toThrow('Stopped');
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('refuses duplicate chooser events and does not select an unrelated frame input', async () => {
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      async () => {
        contents.debugger.emit('message', {}, 'Page.fileChooserOpened', {
          frameId: 'other',
          backendNodeId: 99,
          mode: 'selectSingle',
        });
        await open();
        await open();
      },
      async () => {}
    )
  ).rejects.toThrow();
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('pauses the chooser deadline while a website dialog awaits a response', async () => {
  jest.useFakeTimers();
  let changed: ((pending: boolean) => void) | undefined;
  let resume!: () => void;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const dispose = jest.fn();
  let triggered = false;
  const result = attachAIChooser(
    contents,
    send,
    'frame',
    new AbortController().signal,
    ['/test.txt'],
    async () => {
      triggered = true;
      changed!(true);
      await paused;
      await open();
    },
    async () => {},
    {
      onChange: (listener) => {
        changed = listener;
        return dispose;
      },
    }
  );
  try {
    // Allow the bounded setup chain to reach the suspended trigger.
    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < 10 && !triggered; i += 1) await Promise.resolve();
    expect(triggered).toBe(true);
    jest.advanceTimersByTime(6000);
    changed!(false);
    resume();
    await expect(result).resolves.toEqual([{ name: 'test.txt', size: 4 }]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(contents.debugger.listenerCount('message')).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

it('refuses a chooser opened before the approved trigger and never clicks or selects', async () => {
  const trigger = jest.fn(open);
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      trigger,
      async () => {
        await open();
      }
    )
  ).rejects.toThrow('before the approved button action');
  expect(trigger).not.toHaveBeenCalled();
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('ends a pending picker promptly when its frame detaches', async () => {
  await expect(
    attachAIChooser(
      contents,
      send,
      'frame',
      new AbortController().signal,
      ['/test.txt'],
      async () => {
        contents.debugger.emit('message', {}, 'Page.frameDetached', {
          frameId: 'frame',
        });
      },
      async () => {}
    )
  ).rejects.toThrow('Chooser document changed');
  expect(
    send.mock.calls.some(([method]) => method === 'DOM.setFileInputFiles')
  ).toBe(false);
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

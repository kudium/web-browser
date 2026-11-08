import { EventEmitter } from 'events';
import {
  AI_PROTOCOL_TIMEOUT,
  observeAIPointer,
  reportAIPointer,
  settleAIProtocol,
  withAIProtocol,
} from '../main/aiProtocol';

function controller() {
  const value = new AbortController();
  Object.assign(value.signal, {
    throwIfAborted: () => {
      if (value.signal.aborted) throw new Error('Stopped.');
    },
  });
  return value;
}

function contents() {
  let attached = false;
  const debuggerAPI = Object.assign(new EventEmitter(), {
    isAttached: jest.fn(() => attached),
    attach: jest.fn(() => {
      attached = true;
    }),
    detach: jest.fn(() => {
      attached = false;
    }),
    sendCommand: jest.fn().mockResolvedValue({ ok: true }),
  });
  return { debugger: debuggerAPI, isDestroyed: jest.fn(() => false) } as any;
}

it('does not take over another debugger', async () => {
  const page = contents();
  page.debugger.attach();
  await expect(
    withAIProtocol(page, controller().signal, async () => true)
  ).rejects.toThrow('being debugged');
  expect(page.debugger.detach).not.toHaveBeenCalled();
});

it('releases its debugger on success and provider failure', async () => {
  const page = contents();
  await expect(
    withAIProtocol(page, controller().signal, (send) =>
      send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 20 })
    )
  ).resolves.toEqual({ ok: true });
  expect(page.debugger.detach).toHaveBeenCalledTimes(1);
  page.debugger.sendCommand.mockRejectedValue(new Error('Protocol error'));
  await expect(
    withAIProtocol(page, controller().signal, (send) =>
      send('Page.captureScreenshot')
    )
  ).rejects.toThrow('Protocol error');
  expect(page.debugger.detach).toHaveBeenCalledTimes(2);
});

it('detaches on Stop and rejects further commands', async () => {
  const page = contents();
  const cancellation = controller();
  await expect(
    withAIProtocol(page, cancellation.signal, async (send) => {
      await send('Input.dispatchMouseEvent');
      cancellation.abort();
      await send('Input.dispatchMouseEvent');
    })
  ).rejects.toThrow();
  expect(page.debugger.sendCommand).toHaveBeenCalledTimes(1);
  expect(page.debugger.isAttached()).toBe(false);
});

afterEach(() => jest.useRealTimers());

it('releases root and child keys on Stop without repeating text or commands', async () => {
  const page = contents();
  const cancellation = controller();
  await expect(
    withAIProtocol(page, cancellation.signal, async (send) => {
      const press = (session?: string) =>
        send(
          'Input.dispatchKeyEvent',
          {
            type: 'keyDown',
            key: 'a',
            code: 'KeyA',
            windowsVirtualKeyCode: 65,
            text: 'a',
            unmodifiedText: 'a',
            modifiers: 8,
            commands: ['selectAll'],
          },
          session
        );
      await press();
      await press('child-session');
      cancellation.abort();
    })
  ).rejects.toThrow();
  const releases = page.debugger.sendCommand.mock.calls.filter(
    ([method, value]: any[]) =>
      method === 'Input.dispatchKeyEvent' && value.type === 'keyUp'
  );
  expect(releases).toEqual(
    ['child-session', undefined].map((session) => [
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 0,
      },
      session,
    ])
  );
  expect(page.debugger.isAttached()).toBe(false);
});

it('does not repeat an acknowledged key release on normal completion', async () => {
  const page = contents();
  await withAIProtocol(page, controller().signal, async (send) => {
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
    });
  });
  expect(page.debugger.sendCommand).toHaveBeenCalledTimes(2);
});

it('releases a key whose down acknowledgement stalls and bounds stalled cleanup', async () => {
  jest.useFakeTimers();
  const page = contents();
  page.debugger.sendCommand.mockImplementation(() => new Promise(() => {}));
  const cancellation = controller();
  const failure = withAIProtocol(page, cancellation.signal, (send) =>
    send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Shift',
      code: 'ShiftLeft',
    })
  ).catch((error) => error);
  await Promise.resolve();
  cancellation.abort();
  const settled = settleAIProtocol(page);
  expect(page.debugger.sendCommand).toHaveBeenLastCalledWith(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', modifiers: 0 },
    undefined
  );
  expect(page.debugger.isAttached()).toBe(true);
  await jest.advanceTimersByTimeAsync(250);
  await settled;
  expect(((await failure) as Error).message).toContain('Stopped');
  expect(page.debugger.isAttached()).toBe(false);
});

it('releases held keys on action timeout', async () => {
  jest.useFakeTimers();
  const page = contents();
  const failure = withAIProtocol(page, controller().signal, async (send) => {
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Tab',
      code: 'Tab',
    });
    return new Promise(() => {});
  }).catch((error) => error);
  await jest.advanceTimersByTimeAsync(AI_PROTOCOL_TIMEOUT);
  expect(((await failure) as Error).message).toContain('timed out');
  expect(page.debugger.sendCommand).toHaveBeenLastCalledWith(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 0 },
    undefined
  );
});

it('bounds the handback wait when pointer cleanup never acknowledges', async () => {
  jest.useFakeTimers();
  const page = contents();
  const cancellation = controller();
  let ready!: () => void;
  const pressed = new Promise<void>((resolve) => {
    ready = resolve;
  });
  page.debugger.sendCommand.mockImplementation((method: string) =>
    method === 'Input.cancelDragging'
      ? new Promise(() => {})
      : Promise.resolve({})
  );
  const pending = withAIProtocol(page, cancellation.signal, async (send) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 10,
      y: 20,
      button: 'left',
    });
    ready();
    return new Promise(() => {});
  });
  const failure = pending.catch((error) => error);
  await pressed;
  cancellation.abort();
  let settled = false;
  const handback = settleAIProtocol(page).then(() => {
    settled = true;
    return undefined;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  jest.advanceTimersByTime(250);
  await handback;
  expect(page.debugger.isAttached()).toBe(false);
  expect(((await failure) as Error).message).toContain('Stopped');
});

it('Stop releases even an unresponsive protocol command', async () => {
  const page = contents();
  page.debugger.sendCommand.mockImplementation(() => new Promise(() => {}));
  const cancellation = controller();
  const pending = withAIProtocol(page, cancellation.signal, (send) =>
    send('Page.captureScreenshot')
  );
  await Promise.resolve();
  cancellation.abort();
  await expect(pending).rejects.toThrow('Stopped');
  expect(page.debugger.isAttached()).toBe(false);
});

it('times out a stalled group and rejects late commands', async () => {
  jest.useFakeTimers();
  const page = contents();
  let later: any;
  const pending = withAIProtocol(page, controller().signal, async (send) => {
    later = send;
    return new Promise(() => {});
  });
  const failure = pending.catch((error) => error);
  await jest.advanceTimersByTimeAsync(AI_PROTOCOL_TIMEOUT);
  expect(((await failure) as Error).message).toContain('timed out');
  await expect(later('Input.dispatchMouseEvent')).rejects.toThrow('ended');
  expect(page.debugger.sendCommand).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('does not detach a replacement debugger after disconnection', async () => {
  const page = contents();
  const pending = withAIProtocol(
    page,
    controller().signal,
    async () => new Promise(() => {})
  );
  const failure = pending.catch((error) => error);
  await Promise.resolve();
  page.debugger.emit('detach', {}, 'replaced_with_devtools');
  page.debugger.attach();
  expect(((await failure) as Error).message).toContain('disconnected');
  expect(page.debugger.detach).not.toHaveBeenCalled();
  expect(page.debugger.isAttached()).toBe(true);
});

it('cancels dragging and releases a held pointer on Stop before detaching', async () => {
  const page = contents();
  const cancellation = controller();
  await expect(
    withAIProtocol(page, cancellation.signal, async (send) => {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 10,
        y: 20,
        button: 'left',
      });
      cancellation.abort();
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 100,
        y: 100,
      });
    })
  ).rejects.toThrow();
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.cancelDragging',
    undefined,
    undefined
  );
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.dispatchMouseEvent',
    expect.objectContaining({
      type: 'mouseReleased',
      x: 10,
      y: 20,
      buttons: 0,
      clickCount: 0,
    }),
    undefined
  );
  expect(page.debugger.isAttached()).toBe(false);
});

it('releases a held pointer in its owning iframe group on Stop', async () => {
  const page = contents();
  const cancellation = controller();
  await expect(
    withAIProtocol(page, cancellation.signal, async (send) => {
      await send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x: 15, y: 25, button: 'left' },
        'iframe-session'
      );
      cancellation.abort();
    })
  ).rejects.toThrow();
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.cancelDragging',
    undefined,
    'iframe-session'
  );
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.dispatchMouseEvent',
    expect.objectContaining({ type: 'mouseReleased', x: 15, y: 25 }),
    'iframe-session'
  );
});

it('acknowledges root/child intercepted-drag cleanup before detaching', async () => {
  const page = contents();
  const cancellation = controller();
  let abortStarted!: () => void;
  const aborted = new Promise<void>((resolve) => {
    abortStarted = resolve;
  });
  let release!: () => void;
  const acknowledgement = new Promise((resolve) => {
    release = () => resolve({});
  });
  page.debugger.sendCommand.mockImplementation((method: string) =>
    method === 'Input.cancelDragging' ? acknowledgement : Promise.resolve({})
  );
  const pending = withAIProtocol(page, cancellation.signal, async (send) => {
    await send('Input.setInterceptDrags', { enabled: true });
    await send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: 10, y: 20, button: 'left' },
      'child-session'
    );
    cancellation.abort();
    abortStarted();
    return new Promise(() => {});
  });
  const failure = pending.catch((error) => error);
  await aborted;
  let handedBack = false;
  const handback = settleAIProtocol(page).then(() => {
    handedBack = true;
    return undefined;
  });
  await Promise.resolve();
  expect(handedBack).toBe(false);
  expect(page.debugger.detach).not.toHaveBeenCalled();
  release();
  await handback;
  expect(handedBack).toBe(true);
  await expect(settleAIProtocol(page)).resolves.toBeUndefined();
  expect(((await failure) as Error).message).toContain('Stopped');
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.dispatchDragEvent',
    {
      type: 'dragCancel',
      x: 10,
      y: 20,
      data: { items: [], dragOperationsMask: 0 },
    },
    'child-session'
  );
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.cancelDragging',
    undefined,
    undefined
  );
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.setInterceptDrags',
    { enabled: false },
    undefined
  );
  expect(page.debugger.detach).toHaveBeenCalledTimes(1);
});

it('retains child drag cancellation after interception is disabled while the pointer is held', async () => {
  const page = contents();
  await expect(
    withAIProtocol(page, controller().signal, async (send) => {
      await send('Input.setInterceptDrags', { enabled: true });
      await send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x: 12, y: 24, button: 'left' },
        'child-session'
      );
      await send('Input.setInterceptDrags', { enabled: false });
      throw new Error('Drop target moved');
    })
  ).rejects.toThrow('Drop target moved');
  expect(page.debugger.sendCommand).toHaveBeenCalledWith(
    'Input.dispatchDragEvent',
    {
      type: 'dragCancel',
      x: 12,
      y: 24,
      data: { items: [], dragOperationsMask: 0 },
    },
    'child-session'
  );
  expect(page.debugger.isAttached()).toBe(false);
});

it('reports only trusted top-level pointer input, with isolated observers and cleanup', async () => {
  const page = contents();
  const other = contents();
  const pointer = jest.fn();
  const detach = observeAIPointer(page, pointer);
  const broken = observeAIPointer(page, () => {
    throw new Error('UI unavailable');
  });
  await withAIProtocol(page, controller().signal, async (send) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 10,
      y: 20,
    });
    await send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: 1, y: 2 },
      'child-session'
    );
    await send('Runtime.evaluate', { expression: 'true' });
  });
  expect(pointer).toHaveBeenCalledTimes(1);
  expect(pointer).toHaveBeenLastCalledWith({
    type: 'mouseMoved',
    x: 10,
    y: 20,
  });
  reportAIPointer(other, { type: 'mouseMoved', x: 50, y: 60 });
  reportAIPointer(page, { type: 'mouseMoved', x: NaN, y: 60 });
  expect(pointer).toHaveBeenCalledTimes(1);
  reportAIPointer(page, { type: 'mouseMoved', x: 110, y: 120 });
  expect(pointer).toHaveBeenLastCalledWith({
    type: 'mouseMoved',
    x: 110,
    y: 120,
  });
  detach();
  broken();
  reportAIPointer(page, { type: 'mouseMoved', x: 1, y: 2 });
  expect(pointer).toHaveBeenCalledTimes(2);
});

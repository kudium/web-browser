import { EventEmitter } from 'events';
import { runInNewContext } from 'vm';
import { reportAIPointer, withAIProtocol } from '../main/aiProtocol';
import {
  executeAIFrame,
  executeAIPageProtocol,
  listAIFrames,
  withAIFrame,
} from '../main/aiFrames';

jest.mock('../main/aiProtocol', () => ({
  withAIProtocol: jest.fn(),
  reportAIPointer: jest.fn(),
}));
let page: any;
let send: jest.Mock;
beforeEach(() => {
  jest.mocked(reportAIPointer).mockClear();
  page = {
    debugger: new EventEmitter(),
    getURL: jest.fn(() => 'https://parent.test'),
  };
  send = jest.fn(async (method, _params, session) => {
    if (method === 'Target.setAutoAttach' && !session)
      page.debugger.emit('message', {}, 'Target.attachedToTarget', {
        sessionId: 'child-session',
        targetInfo: {
          type: 'iframe',
          parentFrameId: 'parent',
          targetId: 'child',
        },
      });
    if (method === 'Page.getFrameTree')
      return {
        frameTree: {
          frame: session
            ? { id: 'child', url: 'https://frame.test' }
            : { id: 'parent', url: 'https://parent.test' },
        },
      };
    if (method === 'Page.createIsolatedWorld')
      return { executionContextId: 77 };
    if (method === 'Runtime.evaluate')
      return { result: { value: { observed: true } } };
    return {};
  });
  (withAIProtocol as jest.Mock).mockImplementation((_page, _signal, execute) =>
    execute(send)
  );
});
it('discovers related iframe groups without exposing protocol group IDs', async () => {
  const frames = await listAIFrames(page, new AbortController().signal);
  expect(frames).toContainEqual({
    id: 'child',
    parentId: 'parent',
    url: 'https://frame.test',
    name: '',
  });
  expect(frames.some((frame) => 'sessionId' in frame)).toBe(false);
  expect(page.debugger.listenerCount('message')).toBe(0);
});
it('routes isolated frame programs to the owning renderer group', async () => {
  await expect(
    executeAIFrame(
      page,
      'child',
      'fixedProgram()',
      new AbortController().signal
    )
  ).resolves.toEqual({ observed: true });
  expect(send).toHaveBeenCalledWith(
    'Page.createIsolatedWorld',
    { frameId: 'child', worldName: 'kudiumbrowser-ai-control' },
    'child-session'
  );
  expect(send).toHaveBeenCalledWith(
    'Runtime.evaluate',
    expect.objectContaining({ expression: 'fixedProgram()', contextId: 77 }),
    'child-session'
  );
});
it('rejects removed frame references and removes discovery listeners', async () => {
  await expect(
    executeAIFrame(
      page,
      'missing',
      'fixedProgram()',
      new AbortController().signal
    )
  ).rejects.toThrow('Frame changed');
  expect(page.debugger.listenerCount('message')).toBe(0);
  expect(
    send.mock.calls.some(([method]) => method === 'Runtime.evaluate')
  ).toBe(false);
});

it('routes native input and validated focus to the same owning frame group', async () => {
  await withAIFrame(
    page,
    'child',
    new AbortController().signal,
    async (scopedSend, runProgram) => {
      await runProgram('validatedFocus()');
      await scopedSend('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Enter',
      });
    }
  );
  expect(send).toHaveBeenCalledWith(
    'Input.dispatchKeyEvent',
    { type: 'rawKeyDown', key: 'Enter' },
    'child-session'
  );
  expect(send).toHaveBeenCalledWith(
    'Runtime.evaluate',
    expect.objectContaining({ expression: 'validatedFocus()', contextId: 77 }),
    'child-session'
  );
  expect(page.debugger.listenerCount('message')).toBe(0);
});

it('removes discovery listeners when a protocol race rejects a stalled callback', async () => {
  (withAIProtocol as jest.Mock).mockImplementationOnce(
    (_page, _signal, execute) => {
      execute(() => new Promise(() => {}));
      return Promise.reject(new Error('Stopped.'));
    }
  );
  await expect(
    listAIFrames(page, new AbortController().signal)
  ).rejects.toThrow('Stopped');
  expect(page.debugger.listenerCount('message')).toBe(0);
});

it('checks parent visibility but sends OOP pointer coordinates in the owning group', async () => {
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (method, params, session) => {
    if (method === 'DOM.getFrameOwner') return { backendNodeId: 12 };
    if (method === 'DOM.resolveNode') return { object: { objectId: 'owner' } };
    if (method === 'Runtime.callFunctionOn')
      return { result: { value: { x: 140, y: 90 } } };
    return original(method, params, session);
  });
  await withAIFrame(
    page,
    'child',
    Object.assign(new AbortController().signal, { throwIfAborted: jest.fn() }),
    async (_send, _run, pointer) => {
      await pointer({ x: 40, y: 20 });
    }
  );
  expect(send).toHaveBeenCalledWith(
    'DOM.getFrameOwner',
    { frameId: 'child' },
    undefined
  );
  expect(reportAIPointer).toHaveBeenCalledWith(page, {
    type: 'mouseMoved',
    x: 140,
    y: 90,
  });
  expect(send).toHaveBeenCalledWith(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: 40, y: 20 },
    'child-session'
  );
});

it('resolves an isolated DOM reference without serializing it into page output', async () => {
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (method, params, session) => {
    if (method === 'Runtime.evaluate')
      return { result: { objectId: 'private-node' } };
    return original(method, params, session);
  });
  const reference = await withAIFrame(
    page,
    'child',
    new AbortController().signal,
    async (_send, runProgram) => runProgram('observedNode()', false)
  );
  expect(reference).toEqual({ objectId: 'private-node' });
  expect(send).toHaveBeenCalledWith(
    'Runtime.evaluate',
    expect.objectContaining({ returnByValue: false, contextId: 77 }),
    'child-session'
  );
});

it('validates a frame path without dispatching input before upload approval', async () => {
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (method, params, session) => {
    if (method === 'DOM.getFrameOwner') return { backendNodeId: 12 };
    if (method === 'DOM.resolveNode') return { object: { objectId: 'owner' } };
    if (method === 'Runtime.callFunctionOn')
      return { result: { value: { x: 140, y: 90 } } };
    return original(method, params, session);
  });
  const signal = Object.assign(new AbortController().signal, {
    throwIfAborted: jest.fn(),
  });
  await withAIFrame(page, 'child', signal, async (_send, _run, pointer) =>
    pointer({ x: 40, y: 20 }, undefined, false)
  );
  expect(
    send.mock.calls.some(([method]) => method === 'Input.dispatchMouseEvent')
  ).toBe(false);
});

it('executes adopted main-page programs in the same stable isolated world as frames', async () => {
  const { signal } = new AbortController();
  await expect(
    executeAIPageProtocol(page, 'fixedProgram()', signal)
  ).resolves.toEqual({ observed: true });
  expect(withAIProtocol).toHaveBeenCalledWith(
    page,
    signal,
    expect.any(Function)
  );
  expect(send).toHaveBeenCalledWith('Page.createIsolatedWorld', {
    frameId: 'parent',
    worldName: 'kudiumbrowser-ai-control',
  });
  expect(send).toHaveBeenCalledWith('Runtime.evaluate', {
    expression: 'fixedProgram()',
    contextId: 77,
    returnByValue: true,
    awaitPromise: true,
  });
});

it('rejects protocol page exceptions rather than returning an empty success', async () => {
  send.mockImplementation(async (method) => {
    if (method === 'Page.getFrameTree')
      return { frameTree: { frame: { id: 'parent' } } };
    if (method === 'Page.createIsolatedWorld')
      return { executionContextId: 77 };
    return {
      exceptionDetails: { exception: { description: 'Target changed' } },
    };
  });
  await expect(
    executeAIPageProtocol(page, 'fixedProgram()', new AbortController().signal)
  ).rejects.toThrow('Target changed');
});

it('observes a direct-download initial document only after proving its blank location', async () => {
  page.getURL.mockReturnValue('');
  const baseSend = send.getMockImplementation()!;
  send.mockImplementation((method, params, session) =>
    params?.expression === 'location.href'
      ? Promise.resolve({ result: { value: 'about:blank' } })
      : baseSend(method, params, session)
  );
  await expect(
    executeAIPageProtocol(page, 'fixedProgram()', new AbortController().signal)
  ).resolves.toEqual({ observed: true });
  expect(send).toHaveBeenCalledWith(
    'Runtime.evaluate',
    expect.objectContaining({ expression: 'location.href', contextId: 77 })
  );
});

it('does not dispatch an observation into an unverified initial document', async () => {
  page.getURL.mockReturnValue('');
  send.mockImplementation(async (method) => {
    if (method === 'Page.getFrameTree')
      return { frameTree: { frame: { id: 'parent' } } };
    if (method === 'Page.createIsolatedWorld')
      return { executionContextId: 77 };
    return { result: { value: 'chrome-error://chromewebdata/' } };
  });
  await expect(
    executeAIPageProtocol(page, 'fixedProgram()', new AbortController().signal)
  ).rejects.toThrow('no observable initial blank document');
  expect(
    send.mock.calls.some(
      ([, params]) => params?.expression === 'fixedProgram()'
    )
  ).toBe(false);
});

const ownerMocks = () => {
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (method, params, session) => {
    if (method === 'DOM.getFrameOwner') return { backendNodeId: 12 };
    if (method === 'DOM.resolveNode') return { object: { objectId: 'owner' } };
    if (method === 'Runtime.callFunctionOn')
      return {
        result: {
          value: {
            x: params.arguments[0].value.x + 100,
            y: params.arguments[0].value.y + 70,
          },
        },
      };
    return original(method, params, session);
  });
};

it('reuses owner references while rechecking parent geometry and coverage for every point', async () => {
  ownerMocks();
  await withAIFrame(
    page,
    'child',
    new AbortController().signal,
    async (_send, _run, pointer) => {
      await pointer({ x: 10, y: 10 }, undefined, false);
      await pointer({ x: 20, y: 20 });
      await pointer({ x: 30, y: 30 });
    }
  );
  const calls = (method: string) =>
    send.mock.calls.filter(([name]) => name === method);
  expect(calls('DOM.getFrameOwner')).toHaveLength(1);
  expect(calls('DOM.resolveNode')).toHaveLength(1);
  expect(calls('Runtime.callFunctionOn')).toHaveLength(3);
  expect(calls('Emulation.setFocusEmulationEnabled')).toHaveLength(1);
  expect(calls('Runtime.releaseObject')).toHaveLength(1);
  expect(calls('Runtime.callFunctionOn')[0][1].functionDeclaration).toContain(
    'this.ownerDocument!==document'
  );
  expect(page.debugger.listenerCount('message')).toBe(0);
});

it('ends the frame action when a cached owner document navigates', async () => {
  ownerMocks();
  await expect(
    withAIFrame(
      page,
      'child',
      new AbortController().signal,
      async (_send, _run, pointer) => {
        await pointer({ x: 10, y: 10 });
        page.debugger.emit('message', {}, 'Page.frameNavigated', {
          frame: { id: 'parent' },
        });
        await pointer({ x: 20, y: 20 });
      }
    )
  ).rejects.toThrow('Frame document changed');
  expect(
    send.mock.calls.filter(([method]) => method === 'Input.dispatchMouseEvent')
  ).toHaveLength(1);
  expect(send).toHaveBeenCalledWith(
    'Runtime.releaseObject',
    { objectId: 'owner' },
    undefined
  );
  expect(page.debugger.listenerCount('message')).toBe(0);
});

it('refuses newly covered or disconnected cached owners before the next input', async () => {
  ownerMocks();
  const original = send.getMockImplementation()!;
  let checks = 0;
  send.mockImplementation(async (method, params, session) => {
    if (method === 'Runtime.callFunctionOn') {
      checks += 1;
      if (checks === 2)
        return {
          exceptionDetails: {
            exception: { description: 'Iframe pointer target is covered' },
          },
        };
    }
    return original(method, params, session);
  });
  await expect(
    withAIFrame(
      page,
      'child',
      new AbortController().signal,
      async (_send, _run, pointer) => {
        await pointer({ x: 10, y: 10 });
        await pointer({ x: 20, y: 20 });
      }
    )
  ).rejects.toThrow('covered');
  expect(
    send.mock.calls.filter(([method]) => method === 'Input.dispatchMouseEvent')
  ).toHaveLength(1);
  expect(
    send.mock.calls.filter(([method]) => method === 'Runtime.releaseObject')
  ).toHaveLength(1);
  expect(page.debugger.listenerCount('message')).toBe(0);
});

it.each([
  {
    name: 'nonuniform scale',
    matrix: { a: 0.75, b: 0, c: 0, d: 1.5 },
    width: 159,
    height: 165,
    expected: { x: 49.125, y: 72.5 },
  },
  {
    name: 'rotation',
    matrix: { a: 0, b: 1, c: -1, d: 0 },
    width: 110,
    height: 212,
    expected: { x: 125, y: 75.5 },
  },
  {
    name: 'skew',
    matrix: { a: 1, b: 0, c: 0.5, d: 1 },
    width: 267,
    height: 110,
    expected: { x: 63, y: 65 },
  },
  {
    name: 'reflection',
    matrix: { a: -1, b: 0, c: 0, d: 1 },
    width: 212,
    height: 110,
    expected: { x: 216.5, y: 65 },
  },
])(
  'maps fractional borders and padding through $name',
  async ({ matrix, width, height, expected }) => {
    const document = { elementFromPoint: jest.fn() };
    const owner = {
      isConnected: true,
      ownerDocument: document,
      parentElement: null,
      getRootNode: () => ({}),
      getBoundingClientRect: () => ({
        left: 30,
        top: 50,
        width,
        height,
      }),
    };
    document.elementFromPoint.mockReturnValue(owner);
    const style = {
      transform: `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, 0, 0].join(
        ','
      )})`,
      width: '200px',
      height: '100px',
      borderLeftWidth: '1.5px',
      borderRightWidth: '2.5px',
      borderTopWidth: '2px',
      borderBottomWidth: '2px',
      paddingLeft: '4px',
      paddingRight: '4px',
      paddingTop: '3px',
      paddingBottom: '3px',
      boxSizing: 'content-box',
    };
    let mapped: { x: number; y: number } | undefined;
    const original = send.getMockImplementation()!;
    send.mockImplementation(async (method, params, session) => {
      if (method === 'DOM.getFrameOwner') return { backendNodeId: 12 };
      if (method === 'DOM.resolveNode')
        return { object: { objectId: 'owner' } };
      if (method === 'Runtime.callFunctionOn') {
        const context = {
          getComputedStyle: () => style,
          DOMMatrixReadOnly: jest.fn(() => ({
            ...matrix,
            is2D: true,
          })),
          document,
          innerWidth: 500,
          innerHeight: 400,
          owner,
          point: params.arguments[0].value,
        };
        mapped = runInNewContext(
          `(${params.functionDeclaration}).call(owner, point)`,
          context
        );
        return { result: { value: mapped } };
      }
      return original(method, params, session);
    });
    await withAIFrame(
      page,
      'child',
      new AbortController().signal,
      async (_send, _run, pointer) => pointer({ x: 20, y: 10 })
    );
    expect(mapped).toEqual(expected);
    expect(document.elementFromPoint).toHaveBeenCalledWith(
      expected.x,
      expected.y
    );
    expect(send).toHaveBeenCalledWith(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 20, y: 10 },
      'child-session'
    );
  }
);

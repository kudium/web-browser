/** @jest-environment node */
import vm from 'vm';
import {
  AIScriptRuntime,
  SCRIPT_RUNTIME_RECYCLE_RUNS,
  ScriptRuntimeWindow,
  wrapScriptSource,
} from '../main/aiScriptRuntime';
import { AIScriptAPI } from '../main/aiScriptApi';

afterEach(() => jest.useRealTimers());

/** A stand-in renderer: runs the wrapped script in a bare VM context with only the two bridge globals. */
function fakeWindow(runtime: () => AIScriptRuntime, id = 7) {
  let destroyed = false;
  const listeners: (() => void)[] = [];
  const window: ScriptRuntimeWindow & { loads: number; worlds: number[] } = {
    id,
    loads: 0,
    worlds: [],
    load: jest.fn(async () => {
      window.loads += 1;
    }),
    execute: (code: string, worldId: number) => {
      window.worlds.push(worldId);
      const context = vm.createContext({
        __kudiumCall: (method: string, args: unknown) =>
          runtime()
            .handleCall(id, method, args)
            .then((reply) => {
              if (reply.error) throw new Error(reply.error);
              return reply.value;
            }),
        __kudiumLog: (text: string) => runtime().handleLog(id, text),
        setTimeout,
      });
      return vm.runInContext(code, context);
    },
    destroy: () => {
      destroyed = true;
      listeners.forEach((listener) => listener());
    },
    isDestroyed: () => destroyed,
    onDestroyed: (listener) => listeners.push(listener),
  };
  return window;
}

function harness() {
  const windows: ReturnType<typeof fakeWindow>[] = [];
  let runtime: AIScriptRuntime;
  const createWindow = jest.fn(() => {
    const window = fakeWindow(() => runtime, 7 + windows.length);
    windows.push(window);
    return window;
  });
  runtime = new AIScriptRuntime({ createWindow });
  const dispatch = jest.fn(
    async (
      tool: string,
      args: Record<string, unknown>,
      _signal: AbortSignal
    ): Promise<unknown> => {
    if (tool === 'list_tabs') return [{ id: 't1' }];
    if (tool === 'read_page')
      return { url: 'https://site.test/', snapshotId: 's1', elements: [{ id: 2, label: 'Save' }] };
    if (tool === 'navigate') return { url: String(args.url), title: 'Loaded' };
    return { ok: true, tool };
    }
  );
  const api = () => new AIScriptAPI(dispatch, { scopeTab: () => 't1' });
  return { runtime, createWindow, windows, dispatch, api };
}

it('runs a script against the Page API and returns its value, logs and receipts', async () => {
  const { runtime, dispatch, api, windows } = harness();
  const result = await runtime.run({
    source: `
      const s = await session();
      const page = s.page();
      await page.goto('https://site.test/settings', { waitUntil: 'load' });
      const snap = await page.snapshot();
      log('elements', snap.elements.length);
      await page.click('@2');
      return { title: 'done', tab: s.tabId };
    `,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: api(),
  });
  expect(result.ok).toBe(true);
  expect(result.value).toEqual({ title: 'done', tab: 't1' });
  expect(result.logs).toEqual(['elements 1']);
  expect(result.receipts.map((receipt) => receipt.tool)).toEqual([
    'list_tabs',
    'navigate',
    'read_page',
    'click',
  ]);
  expect(dispatch).toHaveBeenCalledWith(
    'navigate',
    { tabId: 't1', url: 'https://site.test/settings', waitUntil: 'load' },
    expect.any(AbortSignal)
  );
  expect(dispatch).toHaveBeenCalledWith(
    'click',
    { tabId: 't1', elementId: 2, snapshotId: 's1' },
    expect.any(AbortSignal)
  );
  expect(runtime.busy()).toBe(false);
  expect(windows[0].loads).toBe(1);
  expect(windows[0].worlds).toEqual([1000]);
});

it('reports script errors with the engine message and keeps the renderer warm', async () => {
  const { runtime, dispatch, api, windows, createWindow } = harness();
  dispatch.mockRejectedValueOnce(new Error('Stale snapshot. Read the page again.'));
  const first = await runtime.run({
    source: `const s = await session(); return 1;`,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: api(),
  });
  expect(first.ok).toBe(false);
  expect(first.error).toBe('Stale snapshot. Read the page again.');
  expect(first.receipts[0]).toMatchObject({ tool: 'list_tabs', ok: false });
  const second = await runtime.run({
    source: `throw new Error('my own failure')`,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: api(),
  });
  expect(second.error).toBe('my own failure');
  expect(createWindow).toHaveBeenCalledTimes(1);
  // Each run gets its own isolated world in the same warm document: no reload.
  expect(windows[0].loads).toBe(1);
  expect(windows[0].worlds).toEqual([1000, 1001]);
});

it('refuses bridge calls that are not from the live runtime renderer or outside a run', async () => {
  const { runtime, api } = harness();
  await expect(runtime.handleCall(7, 'tabs', {})).resolves.toEqual({ error: 'No active script run.' });
  const result = await runtime.run({
    source: `return await globalThis.__kudiumCall('tabs', {});`,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: api(),
  });
  expect(result.value).toEqual([{ id: 't1' }]);
  await runtime.warm();
  await expect(runtime.handleCall(99, 'tabs', {})).resolves.toEqual({ error: 'No active script run.' });
});

it('destroys the renderer when the budget expires and starts a fresh one next time', async () => {
  jest.useFakeTimers();
  const { runtime, dispatch, api, windows, createWindow } = harness();
  dispatch.mockImplementationOnce(
    (_tool, _args, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      })
  );
  const pending = runtime.run({
    source: `const s = await session(); return 'never';`,
    budgetMs: 1000,
    signal: new AbortController().signal,
    api: api(),
  });
  await jest.advanceTimersByTimeAsync(1000);
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(result.error).toBe('Run budget of 1000 ms exceeded.');
  expect(windows[0].isDestroyed()).toBe(true);
  jest.useRealTimers();
  const next = await runtime.run({
    source: `return 2;`,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: api(),
  });
  expect(next.value).toBe(2);
  expect(createWindow).toHaveBeenCalledTimes(2);
});

it('stops within the lease when Stop fires mid-script', async () => {
  const { runtime, dispatch, api, windows } = harness();
  const control = new AbortController();
  dispatch.mockImplementationOnce(
    (_tool, _args, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
        control.abort(new Error('Stopped.'));
      })
  );
  const result = await runtime.run({
    source: `const s = await session(); return 'never';`,
    budgetMs: 5000,
    signal: control.signal,
    api: api(),
  });
  expect(result.ok).toBe(false);
  expect(result.error).toBe('Stopped.');
  expect(windows[0].isDestroyed()).toBe(true);
});

it('rejects a second concurrent run and recycles the renderer after many runs', async () => {
  const { runtime, api, createWindow } = harness();
  const slow = api();
  const first = runtime.run({
    source: `await new Promise((resolve) => setTimeout(resolve, 20)); return 1;`,
    budgetMs: 5000,
    signal: new AbortController().signal,
    api: slow,
  });
  await expect(
    runtime.run({ source: `return 2;`, budgetMs: 5000, signal: new AbortController().signal, api: api() })
  ).rejects.toThrow('Another script is already running.');
  expect((await first).value).toBe(1);
  for (let index = 0; index < SCRIPT_RUNTIME_RECYCLE_RUNS; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await runtime.run({ source: `return ${index};`, budgetMs: 5000, signal: new AbortController().signal, api: api() });
  }
  expect(createWindow).toHaveBeenCalledTimes(2);
});

it('bounds script output and strips undefined results', () => {
  expect(wrapScriptSource('return undefined;')).toContain('JSON.stringify');
  expect(wrapScriptSource('x')).toContain('async (session, log)');
});

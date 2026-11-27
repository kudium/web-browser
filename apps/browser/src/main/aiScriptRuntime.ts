import { AI_SCRIPT_MAX_OUTPUT } from '../browser/aiRun';
import type { AIScriptAPI } from './aiScriptApi';
import type { AIStepReceipt } from './aiRun';
import { AIRunBudgetError, runWithBudget } from './aiRun';

/**
 * The script sandbox is a hidden, sandboxed Chromium renderer: no Node, no
 * filesystem, a session whose every network request is cancelled, and a
 * document whose CSP allows nothing. The only way out is the Page API bridge
 * exposed by the preload, which the main process answers through the same
 * tool implementations an MCP client calls.
 */
export const SCRIPT_RUNTIME_PARTITION = 'kudium-script-runtime';
export const SCRIPT_RUNTIME_CALL = 'kudium-script-call';
export const SCRIPT_RUNTIME_LOG = 'kudium-script-log';
export const SCRIPT_RUNTIME_DOCUMENT =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>Kudium script runtime</title>'
  );
/**
 * Each run executes in its own isolated world (a fresh realm with no access
 * to any other run's globals) and never navigates; after this many runs the
 * renderer is recycled so world ids and leaked state never accumulate.
 */
export const SCRIPT_RUNTIME_RECYCLE_RUNS = 50;
export const SCRIPT_RUNTIME_WORLD_BASE = 1000;
export const SCRIPT_RUNTIME_MAX_LOGS = 500;
export const SCRIPT_RUNTIME_MAX_LOG_CHARS = 2000;

export const scriptRuntimePreloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
const unwrap = (error) => {
  const message = String((error && error.message) || error);
  return new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
};
const call = (method, args) =>
  ipcRenderer.invoke(${JSON.stringify(SCRIPT_RUNTIME_CALL)}, String(method), args === undefined ? {} : args).then((reply) => {
    // Failures travel as data so Electron never logs them as handler errors.
    if (reply && typeof reply === 'object' && typeof reply.error === 'string') throw new Error(reply.error);
    return reply ? reply.value : undefined;
  }, (error) => {
    throw unwrap(error);
  });
const log = (text) => {
  ipcRenderer.send(${JSON.stringify(SCRIPT_RUNTIME_LOG)}, String(text).slice(0, ${SCRIPT_RUNTIME_MAX_LOG_CHARS}));
};
// One world per run: the bridge is exposed into every world this document will use.
for (let world = ${SCRIPT_RUNTIME_WORLD_BASE}; world < ${SCRIPT_RUNTIME_WORLD_BASE + SCRIPT_RUNTIME_RECYCLE_RUNS}; world += 1) {
  contextBridge.exposeInIsolatedWorld(world, '__kudiumCall', call);
  contextBridge.exposeInIsolatedWorld(world, '__kudiumLog', log);
}
`;

/** Page API surface built inside the sandbox from the two bridge functions. */
export const scriptRuntimePrelude = `
const __call = (method, args) => globalThis.__kudiumCall(method, args);
const log = (...parts) => {
  globalThis.__kudiumLog(parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
};
const __page = (id) => {
  const page = {
    id,
    goto: (url, options = {}) => __call('navigate', { tabId: id, url, waitUntil: options.waitUntil }),
    waitFor: (condition = {}) => __call('wait', { tabId: id, ...condition }),
    waitForEvent: (event, options = {}) => __call('waitEvent', { tabId: id, event, ...options }),
    mouse: {
      click: (target, x, y) => __call('clickAt', { tabId: id, target, x, y }),
      drag: (target, from, to) => __call('dragAt', { tabId: id, target, x: from.x, y: from.y, toX: to.x, toY: to.y }),
      draw: (target, path) => __call('dragAt', { tabId: id, target, path }),
      wheel: (target, deltaX, deltaY) => __call('wheel', { tabId: id, target, deltaX, deltaY }),
    },
    keyboard: {
      type: (target, text) => __call('fill', { tabId: id, target, value: text }),
      press: (target, key) => __call('press', { tabId: id, target, key }),
    },
    drag: (target, to) => __call('drag', { tabId: id, target, to }),
    snapshot: (options = {}) => __call('snapshot', { tabId: id, ...options }),
    find: (label, role) => __call('find', { tabId: id, label, role }),
    click: (target) => __call('click', { tabId: id, target }),
    doubleClick: (target) => __call('doubleClick', { tabId: id, target }),
    hover: (target) => __call('hover', { tabId: id, target }),
    fill: (target, value) =>
      value && typeof value === 'object' && value.savedLogin
        ? __call('fillSaved', { tabId: id, accountId: value.savedLogin })
        : __call('fill', { tabId: id, target, value }),
    press: (target, key) => __call('press', { tabId: id, target, key }),
    select: (target, values) => __call('select', { tabId: id, target, values: Array.isArray(values) ? values : [values] }),
    scroll: (amount) => __call('scroll', { tabId: id, amount }),
    back: () => __call('back', { tabId: id }),
    forward: () => __call('forward', { tabId: id }),
    reload: () => __call('reload', { tabId: id }),
    screenshot: (options = {}) => __call('screenshot', { tabId: id, ...options }),
    console: (options = {}) => __call('console', { tabId: id, ...options }),
    requests: (options = {}) => __call('requests', { tabId: id, ...options }),
    setViewport: (options = {}) => __call('setViewport', { tabId: id, ...options }),
    extract: (request) => __call('extract', { tabId: id, ...request }),
    upload: (target, paths) => __call('upload', { tabId: id, target, paths }),
    dialog: (dialogId, accept, promptText) => __call('dialog', { tabId: id, dialogId, accept, promptText }),
    close: () => __call('closeTab', { tabId: id }),
    select_: undefined,
  };
  delete page.select_;
  return page;
};
async function session() {
  const current = await __call('session', {});
  return {
    tabId: current.tabId,
    tabs: current.tabs,
    page: (id) => __page(id || current.tabId),
    newPage: async (url, options = {}) => {
      const opened = await __call('newPage', { url, tabId: current.tabId, disposable: options.disposable === true });
      return __page(opened.tabId);
    },
    useGroup: (groupId) => __call('useGroup', { groupId }),
    clipboard: { read: () => __call('clipboardRead', {}) },
    selectTab: (id) => __call('selectTab', { tabId: id }),
    handOff: (reason) => __call('handOff', { reason }),
    finish: (options = {}) => __call('finish', options),
  };
}
`;

export function wrapScriptSource(source: string) {
  // The script runs as the body of an async function: top-level await and
  // return both work; import statements do not (nothing to import from).
  return `(async () => {
${scriptRuntimePrelude}
const __value = await (async (session, log) => {
${source}
})(session, log);
if (__value === undefined) return null;
const __text = JSON.stringify(__value);
if (typeof __text !== 'string') return null;
if (__text.length > ${AI_SCRIPT_MAX_OUTPUT}) throw new Error('Script result exceeds 1 MB.');
return JSON.parse(__text);
})()`;
}

export interface ScriptRuntimeWindow {
  readonly id: number;
  load(): Promise<void>;
  /** Run code in the given isolated world of the current document. */
  execute(code: string, worldId: number): Promise<unknown>;
  destroy(): void;
  isDestroyed(): boolean;
  onDestroyed(listener: () => void): void;
}

export interface ScriptRunRequest {
  source: string;
  budgetMs: number;
  signal: AbortSignal;
  api: AIScriptAPI;
  intent?: string;
}

export interface ScriptRunResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  logs: string[];
  receipts: AIStepReceipt[];
  screenshots: { tabId: string; mimeType: string; data: string }[];
  durationMs: number;
  budgetMs: number;
}

interface ActiveRun {
  api: AIScriptAPI;
  logs: string[];
  signal: AbortSignal;
}

export class AIScriptRuntime {
  private window: ScriptRuntimeWindow | undefined;

  private runs = 0;

  private active: ActiveRun | undefined;

  private warming: Promise<ScriptRuntimeWindow> | undefined;

  constructor(
    private readonly options: {
      createWindow: () => ScriptRuntimeWindow;
    }
  ) {}

  /**
   * Called by the IPC bridge: only the live runtime renderer may call in.
   * Resolves { value } or { error } so a failed step is ordinary data.
   */
  async handleCall(
    senderId: number,
    method: unknown,
    args: unknown
  ): Promise<{ value?: unknown; error?: string }> {
    try {
      const { active, window } = this;
      if (!active || !window || window.isDestroyed() || senderId !== window.id)
        throw new Error('No active script run.');
      if (active.signal.aborted) throw new Error('Script run stopped.');
      if (typeof method !== 'string')
        throw new Error('Page API method must be a string.');
      const safeArgs =
        args && typeof args === 'object' && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {};
      return { value: await active.api.invoke(method, safeArgs) };
    } catch (error) {
      return { error: (error as Error).message || 'Page API call failed.' };
    }
  }

  handleLog(senderId: number, text: unknown) {
    const { active, window } = this;
    if (!active || !window || senderId !== window.id) return;
    if (active.logs.length >= SCRIPT_RUNTIME_MAX_LOGS) return;
    active.logs.push(String(text).slice(0, SCRIPT_RUNTIME_MAX_LOG_CHARS));
  }

  busy() {
    return !!this.active;
  }

  /** Start the renderer ahead of the first run so the call budget excludes it. */
  warm(): Promise<ScriptRuntimeWindow> {
    if (this.window && !this.window.isDestroyed())
      return Promise.resolve(this.window);
    if (this.warming) return this.warming;
    const window = this.options.createWindow();
    window.onDestroyed(() => {
      if (this.window === window) this.window = undefined;
    });
    this.warming = window
      .load()
      .then(() => {
        this.window = window;
        this.runs = 0;
        return window;
      })
      .finally(() => {
        this.warming = undefined;
      });
    return this.warming;
  }

  private discard() {
    const { window } = this;
    this.window = undefined;
    if (window && !window.isDestroyed()) window.destroy();
  }

  private running = false;

  async run(request: ScriptRunRequest): Promise<ScriptRunResult> {
    if (this.running) throw new Error('Another script is already running.');
    this.running = true;
    const startedAt = Date.now();
    const logs: string[] = [];
    let value: unknown;
    let error: string | undefined;
    try {
      await runWithBudget(request.signal, request.budgetMs, async (signal) => {
        signal.throwIfAborted();
        if (this.runs >= SCRIPT_RUNTIME_RECYCLE_RUNS) this.discard();
        const window = await this.warm();
        signal.throwIfAborted();
        // A never-used isolated world is a fresh realm: nothing from an earlier
        // script is reachable, and no navigation is paid inside the budget.
        const worldId = SCRIPT_RUNTIME_WORLD_BASE + this.runs;
        this.runs += 1;
        request.api.bind(signal);
        this.active = { api: request.api, logs, signal };
        let stop: () => void = () => {};
        const stopped = new Promise<never>((_resolve, reject) => {
          stop = () => {
            // A stopped script may be mid-await; destroying the renderer is the only reliable halt.
            this.discard();
            reject(signal.reason instanceof Error ? signal.reason : new Error('Stopped.'));
          };
        });
        signal.addEventListener('abort', stop, { once: true });
        try {
          value = await Promise.race([
            window.execute(wrapScriptSource(request.source), worldId),
            stopped,
          ]);
        } finally {
          signal.removeEventListener('abort', stop);
        }
      });
    } catch (reason) {
      error =
        reason instanceof AIRunBudgetError
          ? reason.message
          : (reason as Error).message || 'Script failed.';
      if (request.signal.aborted || /budget/.test(error)) this.discard();
    } finally {
      this.active = undefined;
      this.running = false;
    }
    return {
      ok: !error,
      ...(value !== undefined && value !== null ? { value } : {}),
      ...(error ? { error } : {}),
      logs,
      receipts: request.api.receipts,
      screenshots: request.api.images,
      durationMs: Date.now() - startedAt,
      budgetMs: request.budgetMs,
    };
  }

  dispose() {
    this.discard();
  }
}

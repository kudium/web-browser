import type { AIStepReceipt } from './aiRun';
import { AI_RUN_NESTED_EXCLUDED } from '../browser/aiRun';

export type AIScriptDispatch = (
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) => Promise<unknown>;

export interface AIScriptTarget {
  elementId: number;
  snapshotId?: string;
}

/** Selector forms the Page API accepts for actions. */
export function parseScriptSelector(
  value: unknown
):
  | { kind: 'ref'; elementId: number }
  | { kind: 'label'; label: string; role?: string }
  | { kind: 'selector'; selector: string } {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0)
    return { kind: 'ref', elementId: value };
  if (typeof value !== 'string' || !value.trim())
    throw new Error(
      'A target is required: "@12", "text=Label", "role=button[name=Label]", "css=#id", "xpath=//a" or "href=/path".'
    );
  const text = value.trim();
  const ref = /^@(\d{1,3})$/.exec(text);
  if (ref) return { kind: 'ref', elementId: Number(ref[1]) };
  const label = /^text=(.+)$/s.exec(text);
  if (label) return { kind: 'label', label: label[1] };
  const role = /^role=([a-z]+)\[name=(?:"([^"]*)"|'([^']*)'|([^\]]*))\]$/s.exec(text);
  if (role)
    return { kind: 'label', label: role[2] ?? role[3] ?? role[4], role: role[1] };
  if (/^(css|xpath|href)=\S/.test(text)) {
    if (text.length > 1000) throw new Error('Selector must be at most 1000 characters.');
    return { kind: 'selector', selector: text };
  }
  throw new Error(
    `Unsupported target "${text}". Use "@ref", "text=Label", "role=button[name=Label]", "css=…", "xpath=…" or "href=…".`
  );
}

const string = (value: unknown, name: string, max = 4096) => {
  if (typeof value !== 'string' || !value || value.length > max)
    throw new Error(`${name} must be a string of at most ${max} characters.`);
  return value;
};
const optionalString = (value: unknown, name: string, max = 4096) =>
  value === undefined ? undefined : string(value, name, max);

/**
 * Maps Page API calls from a script onto existing tool calls. The engine keeps
 * every approval, scope and private-data rule; this layer only tracks the
 * latest snapshot per tab so scripts can use @refs, and records receipts.
 */
export class AIScriptAPI {
  private snapshots = new Map<string, string>();

  readonly receipts: AIStepReceipt[] = [];

  readonly images: { tabId: string; mimeType: string; data: string }[] = [];

  private steps = 0;

  private signal: AbortSignal = new AbortController().signal;

  /** The runtime binds its budgeted signal before the script starts. */
  bind(signal: AbortSignal) {
    this.signal = signal;
  }

  constructor(
    private readonly dispatch: AIScriptDispatch,
    private readonly options: {
      scopeTab: () => string | undefined;
      /** Tabs this run opened; finish() closes them unless kept. */
      ownedTabs?: () => string[];
      /** Named sessions from the workspace manifest (`s.page("qa")`): name → open tab id. */
      resolveTab?: (name: string) => Promise<string | undefined>;
      onReceipt?: (receipt: AIStepReceipt) => void;
    }
  ) {}

  private readonly named = new Map<string, string>();

  private tab(args: Record<string, unknown>) {
    const tabId = args.tabId ?? this.options.scopeTab();
    if (typeof tabId !== 'string' || !tabId)
      throw new Error('No tab is selected. Open a page or pass a tab ID.');
    return this.named.get(tabId) ?? tabId;
  }

  /** Resolve a manifest session name once per run; unknown names stay tab ids. */
  private async resolveNamed(args: Record<string, unknown>) {
    const id = args.tabId;
    if (typeof id !== 'string' || !id || this.named.has(id) || !this.options.resolveTab) return;
    if (/^[0-9a-f-]{36}$/i.test(id)) return;
    const resolved = await this.options.resolveTab(id);
    if (resolved) this.named.set(id, resolved);
  }

  private async call(tool: string, args: Record<string, unknown>) {
    if ((AI_RUN_NESTED_EXCLUDED as readonly string[]).includes(tool))
      throw new Error(`${tool} is not available inside a script.`);
    this.steps += 1;
    const receipt: AIStepReceipt = {
      step: this.steps,
      tool,
      durationMs: 0,
      ok: false,
      ...(typeof args.tabId === 'string' ? { tabId: args.tabId } : {}),
    };
    const startedAt = Date.now();
    try {
      this.signal.throwIfAborted();
      const output = await this.dispatch(tool, args, this.signal);
      receipt.durationMs = Date.now() - startedAt;
      receipt.ok = true;
      const value = output as { url?: unknown; pending?: unknown } | undefined;
      if (typeof value?.url === 'string') receipt.url = value.url;
      if (value?.pending === true) receipt.pending = true;
      return output;
    } catch (error) {
      receipt.durationMs = Date.now() - startedAt;
      receipt.error = (error as Error).message;
      throw error;
    } finally {
      this.receipts.push(receipt);
      this.options.onReceipt?.(receipt);
    }
  }

  private remember(tabId: string, output: unknown) {
    const value = output as { snapshotId?: unknown } | undefined;
    if (typeof value?.snapshotId === 'string')
      this.snapshots.set(tabId, value.snapshotId);
    return output;
  }

  private async target(
    tabId: string,
    selector: unknown
  ): Promise<AIScriptTarget> {
    const parsed = parseScriptSelector(selector);
    if (parsed.kind === 'ref') {
      const snapshotId = this.snapshots.get(tabId);
      if (!snapshotId)
        throw new Error('Take page.snapshot() before using an @ref on this tab.');
      return { elementId: parsed.elementId, snapshotId };
    }
    const found = (await this.call(
      'find_element',
      parsed.kind === 'selector'
        ? { tabId, selector: parsed.selector }
        : {
            tabId,
            label: parsed.label,
            ...(parsed.role ? { role: parsed.role } : {}),
          }
    )) as { elementId?: unknown; snapshotId?: unknown };
    this.remember(tabId, found);
    if (typeof found?.elementId !== 'number' || typeof found.snapshotId !== 'string')
      throw new Error(
        `Could not find "${parsed.kind === 'selector' ? parsed.selector : parsed.label}".`
      );
    return { elementId: found.elementId, snapshotId: found.snapshotId };
  }

  async invoke(method: string, args: Record<string, unknown> = {}) {
    await this.resolveNamed(args);
    switch (method) {
      case 'session': {
        const tabs = await this.call('list_tabs', {});
        return { tabId: this.options.scopeTab(), tabs };
      }
      case 'tabs':
        return this.call('list_tabs', {});
      case 'navigate': {
        const tabId = this.tab(args);
        return this.call('navigate', {
          tabId,
          url: string(args.url, 'url'),
          ...(args.waitUntil !== undefined
            ? { waitUntil: string(args.waitUntil, 'waitUntil', 20) }
            : {}),
        });
      }
      case 'wait': {
        const tabId = this.tab(args);
        const condition: Record<string, unknown> = { tabId, format: 'compact' };
        if (args.url !== undefined) condition.url = string(args.url, 'url');
        if (args.label !== undefined) condition.label = string(args.label, 'label', 180);
        if (args.text !== undefined) condition.text = string(args.text, 'text', 1000);
        if (args.selector !== undefined)
          condition.selector = string(args.selector, 'selector', 1000);
        if (args.fn !== undefined) condition.fn = string(args.fn, 'fn', 2000);
        if (args.state !== undefined) condition.state = string(args.state, 'state', 10);
        if (args.loadState !== undefined)
          condition.loadState = string(args.loadState, 'loadState', 20);
        if (args.request !== undefined) condition.request = string(args.request, 'request', 500);
        if (args.timeout !== undefined) condition.timeoutMs = args.timeout;
        if (args.timeoutMs !== undefined) condition.timeoutMs = args.timeoutMs;
        return this.remember(tabId, await this.call('wait_until', condition));
      }
      case 'waitEvent':
        return this.call('wait_event', {
          tabId: this.tab(args),
          event: string(args.event, 'event', 10),
          ...(args.timeout !== undefined ? { timeoutMs: args.timeout } : {}),
        });
      case 'clickAt': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('click_at', { tabId, ...target, x: args.x, y: args.y });
      }
      case 'dragAt': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('drag_at', {
          tabId,
          ...target,
          ...(Array.isArray(args.path)
            ? { path: args.path }
            : { x: args.x, y: args.y, toX: args.toX, toY: args.toY }),
        });
      }
      case 'drag': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        const destination = await this.target(tabId, args.to);
        return this.call('drag', {
          tabId,
          ...target,
          toElementId: destination.elementId,
        });
      }
      case 'wheel': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('wheel', {
          tabId,
          ...target,
          ...(args.deltaX !== undefined ? { deltaX: args.deltaX } : {}),
          ...(args.deltaY !== undefined ? { deltaY: args.deltaY } : {}),
        });
      }
      case 'snapshot': {
        const tabId = this.tab(args);
        return this.remember(
          tabId,
          await this.call('read_page', {
            tabId,
            format: args.format === 'detailed' ? 'detailed' : 'compact',
            ...(args.maxText !== undefined ? { maxText: args.maxText } : {}),
            ...(args.frameId !== undefined
              ? { frameId: string(args.frameId, 'frameId') }
              : {}),
          })
        );
      }
      case 'find': {
        const tabId = this.tab(args);
        return this.remember(
          tabId,
          await this.call('find_element', {
            tabId,
            label: string(args.label, 'label', 1000),
            ...(args.role !== undefined ? { role: string(args.role, 'role', 40) } : {}),
          })
        );
      }
      case 'click':
      case 'doubleClick':
      case 'hover': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        const tool =
          method === 'click' ? 'click' : method === 'hover' ? 'hover' : 'double_click';
        return this.call(tool, { tabId, ...target });
      }
      case 'fill': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('type', {
          tabId,
          ...target,
          text: string(args.value, 'value', 10000),
        });
      }
      case 'fillSaved':
        return this.call('fill_saved_login', {
          tabId: this.tab(args),
          accountId: string(args.accountId, 'accountId', 200),
        });
      case 'press': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('press_key', {
          tabId,
          ...target,
          key: string(args.key, 'key', 60),
        });
      }
      case 'select': {
        const tabId = this.tab(args);
        const target = await this.target(tabId, args.target);
        return this.call('select_options', { tabId, ...target, values: args.values });
      }
      case 'scroll':
        return this.call('scroll', {
          tabId: this.tab(args),
          ...(args.amount !== undefined ? { amount: args.amount } : {}),
        });
      case 'back':
      case 'forward':
      case 'reload':
        return this.call(method, { tabId: this.tab(args) });
      case 'screenshot': {
        const tabId = this.tab(args);
        const image = (await this.call('screenshot', {
          tabId,
          ...(args.imageFormat !== undefined
            ? { imageFormat: string(args.imageFormat, 'imageFormat', 10) }
            : {}),
          ...(args.scale !== undefined ? { scale: args.scale } : {}),
          ...(args.compareTo !== undefined
            ? { compareTo: string(args.compareTo, 'compareTo', 4096) }
            : {}),
          ...(args.threshold !== undefined ? { threshold: args.threshold } : {}),
        })) as {
          data?: unknown;
          mimeType?: unknown;
          comparison?: { diff?: { data: string; mimeType: string } } & Record<string, unknown>;
        };
        if (typeof image?.data !== 'string' || typeof image.mimeType !== 'string')
          throw new Error('Screenshot capture returned no image.');
        this.images.push({ tabId, mimeType: image.mimeType, data: image.data });
        // Images never travel into the script; the client receives them with the result.
        const receipt: Record<string, unknown> = {
          captured: true,
          index: this.images.length - 1,
          mimeType: image.mimeType,
        };
        if (image.comparison) {
          const { diff, ...comparison } = image.comparison;
          if (diff) {
            this.images.push({ tabId, mimeType: diff.mimeType, data: diff.data });
            comparison.diffIndex = this.images.length - 1;
          }
          receipt.comparison = comparison;
        }
        return receipt;
      }
      case 'console':
        return this.call('read_console', {
          tabId: this.tab(args),
          ...(args.since !== undefined ? { since: args.since } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });
      case 'requests':
        return this.call('read_requests', {
          tabId: this.tab(args),
          ...(args.since !== undefined ? { since: args.since } : {}),
          ...(args.filter !== undefined ? { filter: string(args.filter, 'filter', 500) } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });
      case 'setViewport': {
        const { tabId: _ignored, ...viewport } = args;
        return this.call('set_viewport', { tabId: this.tab(args), ...viewport });
      }
      case 'extract':
        return this.call('extract_rows', {
          tabId: this.tab(args),
          selector: args.selector,
          columns: args.columns,
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.frameId !== undefined
            ? { frameId: string(args.frameId, 'frameId') }
            : {}),
        });
      case 'useGroup':
        return this.call('switch_group', { groupId: string(args.groupId, 'groupId', 300) });
      case 'clipboardRead':
        return this.call('read_clipboard', {});
      case 'newPage': {
        const output = (await this.call('new_tab', {
          url: string(args.url, 'url'),
          ...(args.tabId !== undefined ? { tabId: string(args.tabId, 'tabId', 300) } : {}),
          ...(args.disposable === true ? { disposable: true } : {}),
        })) as { tabId?: unknown };
        if (typeof output?.tabId !== 'string')
          throw new Error('The new tab did not report its ID.');
        return output;
      }
      case 'selectTab':
        return this.call('select_tab', { tabId: this.tab(args) });
      case 'closeTab':
        return this.call('close_tab', { tabId: this.tab(args) });
      case 'dialog':
        return this.call('handle_dialog', {
          tabId: this.tab(args),
          dialogId: string(args.dialogId, 'dialogId', 200),
          accept: args.accept === true,
          ...(args.promptText !== undefined
            ? { promptText: string(args.promptText, 'promptText', 10000) }
            : {}),
        });
      case 'upload':
        return this.call('upload_files', {
          tabId: this.tab(args),
          ...(await this.target(this.tab(args), args.target)),
          paths: args.paths,
        });
      case 'handOff':
        return this.call('hand_off', {
          reason: optionalString(args.reason, 'reason', 400) ?? 'The script asked for human help.',
        });
      case 'finish': {
        const keep = new Set(
          Array.isArray(args.keep)
            ? args.keep.filter((id): id is string => typeof id === 'string')
            : []
        );
        const closed: string[] = [];
        const owned = this.options.ownedTabs?.() ?? [];
        for (const tabId of owned) {
          if (keep.has(tabId)) continue;
          // eslint-disable-next-line no-await-in-loop
          await this.call('close_tab', { tabId });
          closed.push(tabId);
        }
        return { finished: true, closed, kept: owned.filter((id) => keep.has(id)) };
      }
      default:
        throw new Error(`Unknown Page API method: ${method}`);
    }
  }
}

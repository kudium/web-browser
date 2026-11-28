import type { BrowserWindow, Extension, Session, WebContents } from 'electron';
import type { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { extensionWorkspaceGroups } from './extensionWorkspaceGroups';
import type { WorkspaceChromeGroup as Group } from './extensionWorkspaceGroups';

interface Event {
  extension?: Extension;
  sender: WebContents;
}
interface Context {
  session: Session;
  router: {
    apiHandler(): (
      name: string,
      callback: (...args: any[]) => any,
      options?: { permission?: string },
    ) => void;
    sendEvent(
      extension: string | undefined,
      name: string,
      ...args: any[]
    ): void;
  };
  store: {
    tabs: Set<WebContents>;
    tabToWindow: WeakMap<WebContents, BrowserWindow>;
    tabDetailsCache: Map<number, any>;
    getTabById(id: number): WebContents | undefined;
    impl: { assignTabDetails?: (details: any, tab: WebContents) => void };
    on(name: string, callback: (...args: any[]) => void): void;
  };
}
const colors = new Set([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]);
const domains = new Set([
  'Accessibility',
  'Animation',
  'Audits',
  'DOM',
  'DOMDebugger',
  'DOMSnapshot',
  'Emulation',
  'Fetch',
  'Input',
  'Inspector',
  'Log',
  'Network',
  'Overlay',
  'Page',
  'Performance',
  'Profiler',
  'Runtime',
  'Security',
]);
function object(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid browser API options');
}
function integer(value: any) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid tab or group ID');
  return value as number;
}

/** APIs remain bound to the authenticated extension router's own profile session. */
export function attachExtensionBrowserAPIs(api: ElectronChromeExtensions) {
  const ctx = (api as unknown as { ctx: Context }).ctx;
  if (!ctx?.store?.tabs || !ctx.router?.apiHandler)
    throw new Error('Extension browser APIs need dependency review');
  const handle = ctx.router.apiHandler();
  const groupEvent = (name: string, info: Group) => {
    for (const extension of ctx.session.extensions.getAllExtensions())
      if (extension.manifest.permissions?.includes('tabGroups'))
        ctx.router.sendEvent(extension.id, name, { ...info });
  };
  const tab = (id: number) => {
    const contents = ctx.store.getTabById(integer(id));
    if (!contents || contents.isDestroyed() || contents.session !== ctx.session)
      throw new Error('Tab is unavailable in this profile');
    return contents;
  };
  const workspaceForMutation = () => {
    const workspace = extensionWorkspaceGroups(ctx.session);
    if (!workspace)
      throw new Error('This extension has no workspace group host');
    return workspace;
  };
  const assign = ctx.store.impl.assignTabDetails;
  ctx.store.impl.assignTabDetails = (details, contents) => {
    assign?.(details, contents);
    const workspace = extensionWorkspaceGroups(ctx.session);
    try {
      details.groupId = workspace ? workspace.tabGroup(contents) : -1;
    } catch {
      details.groupId = -1;
    }
  };
  const changed = (id: number, groupId: number) => {
    const details = ctx.store.tabDetailsCache.get(id);
    if (details) details.groupId = groupId;
    ctx.router.sendEvent(undefined, 'tabs.onUpdated', id, { groupId }, details);
  };
  const workspaceEvents = (before: Group[], after: Group[]) => {
    for (const old of before)
      if (!after.some((info) => info.id === old.id))
        groupEvent('tabGroups.onRemoved', old);
    for (const info of after) {
      const old = before.find((item) => item.id === info.id);
      if (!old) groupEvent('tabGroups.onCreated', info);
      else if (JSON.stringify(old) !== JSON.stringify(info))
        groupEvent('tabGroups.onUpdated', info);
    }
  };
  handle('tabs.group', (_event: Event, options: any) => {
    object(options);
    const ids = Array.isArray(options.tabIds)
      ? options.tabIds
      : [options.tabIds];
    if (!ids.length || ids.length > 1000) throw new Error('Invalid tab IDs');
    const tabs = ids.map(tab);
    const workspace = extensionWorkspaceGroups(ctx.session);
    if (workspace) {
      const before = workspace.query();
      if (
        options.createProperties?.windowId !== undefined &&
        tabs.some(
          (contents: WebContents) =>
            ctx.store.tabToWindow.get(contents)?.id !==
            options.createProperties.windowId,
        )
      )
        throw new Error('Moving tabs between windows is not supported');
      if (options.groupId !== undefined) integer(options.groupId);
      return workspace.group(tabs, options.groupId).then((id) => {
        for (const contents of tabs) changed(contents.id, id);
        workspaceEvents(before, workspace.query());
        return id;
      });
    }
    throw new Error('This extension has no workspace group host');
  });
  handle('tabs.ungroup', (_event: Event, ids: number | number[]) => {
    const tabs = (Array.isArray(ids) ? ids : [ids]).map(tab);
    const workspace = extensionWorkspaceGroups(ctx.session);
    if (workspace) {
      const before = workspace.query();
      return workspace.ungroup(tabs).then(() => {
        for (const contents of tabs)
          changed(contents.id, workspace.tabGroup(contents));
        workspaceEvents(before, workspace.query());
      });
    }
    throw new Error('This extension has no workspace group host');
  });
  handle(
    'tabGroups.get',
    (_event: Event, id: number) => ({
      ...workspaceForMutation().get(integer(id)),
    }),
    {
      permission: 'tabGroups',
    },
  );
  handle(
    'tabGroups.query',
    (_event: Event, options: any = {}) => {
      object(options);
      return (extensionWorkspaceGroups(ctx.session)?.query() || [])
        .filter((info) =>
          ['windowId', 'title', 'color', 'collapsed'].every(
            (key) =>
              options[key] === undefined || options[key] === (info as any)[key],
          ),
        )
        .map((info) => ({ ...info }));
    },
    { permission: 'tabGroups' },
  );
  handle(
    'tabGroups.update',
    (_event: Event, id: number, options: any) => {
      object(options);
      const workspace = workspaceForMutation();
      workspace.get(integer(id));
      if (
        options.title !== undefined &&
        (typeof options.title !== 'string' || options.title.length > 512)
      )
        throw new Error('Invalid group title');
      if (options.color !== undefined && !colors.has(options.color))
        throw new Error('Invalid group color');
      if (
        options.collapsed !== undefined &&
        typeof options.collapsed !== 'boolean'
      )
        throw new Error('Invalid group collapse state');
      return workspace.update(id, options).then((updated) => {
        groupEvent('tabGroups.onUpdated', updated);
        return updated;
      });
    },
    { permission: 'tabGroups' },
  );
  handle(
    'tabGroups.move',
    () => {
      throw new Error('Moving tab groups is not supported');
    },
    { permission: 'tabGroups' },
  );
  const attachments = new Map<
    number,
    { extensionId: string; contents: WebContents }
  >();
  const target = (source: any) => {
    object(source);
    if (
      source.targetId !== undefined ||
      source.extensionId !== undefined ||
      source.sessionId !== undefined
    )
      throw new Error('Only tab debugger targets are supported');
    const contents = tab(source.tabId);
    if (!/^(https?:|about:blank(?:$|#))/.test(contents.getURL()))
      throw new Error('Cannot debug a privileged browser or extension page');
    return contents;
  };
  const owned = (event: Event, source: any) => {
    const contents = target(source);
    if (
      !event.extension ||
      attachments.get(contents.id)?.extensionId !== event.extension.id ||
      !contents.debugger.isAttached()
    )
      throw new Error('Debugger is not attached by this extension');
    return contents;
  };
  handle(
    'debugger.attach',
    (event: Event, source: any, version: string) => {
      const contents = target(source);
      if (!event.extension) throw new Error('Extension identity required');
      const debuggerAPI = contents.debugger;
      if (typeof version !== 'string' || !/^1\.\d+$/.test(version))
        throw new Error('Unsupported debugger protocol version');
      if (attachments.has(contents.id) || contents.debugger.isAttached())
        throw new Error('Another debugger is already attached');
      contents.debugger.attach(version);
      const attachment = { extensionId: event.extension.id, contents };
      attachments.set(contents.id, attachment);
      const message = (
        _event: any,
        method: string,
        params: any,
        sessionId: string,
      ) => {
        if (attachments.get(contents.id) !== attachment) return;
        ctx.router.sendEvent(
          attachment.extensionId,
          'debugger.onEvent',
          { tabId: contents.id, ...(sessionId && { sessionId }) },
          method,
          params,
        );
      };
      const detach = (_event: any, reason: string) => {
        if (attachments.get(contents.id) !== attachment) return;
        attachments.delete(contents.id);
        debuggerAPI.removeListener('message', message);
        debuggerAPI.removeListener('detach', detach);
        contents.removeListener('did-start-navigation', navigating);
        contents.removeListener('destroyed', destroyed);
        ctx.router.sendEvent(
          attachment.extensionId,
          'debugger.onDetach',
          { tabId: contents.id },
          reason === 'target closed' ? 'target_closed' : 'canceled_by_user',
        );
      };
      const navigating = (
        _event: any,
        url: string,
        inPage: boolean,
        mainFrame: boolean,
      ) => {
        if (
          mainFrame &&
          !inPage &&
          !/^(https?:|about:blank(?:$|#))/.test(url) &&
          contents.debugger.isAttached()
        )
          contents.debugger.detach();
      };
      const destroyed = () => detach({}, 'target closed');
      contents.on('did-start-navigation', navigating);
      contents.once('destroyed', destroyed);
      contents.debugger.on('message', message);
      contents.debugger.on('detach', detach);
    },
    { permission: 'debugger' },
  );
  handle(
    'debugger.detach',
    (event: Event, source: any) => owned(event, source).debugger.detach(),
    { permission: 'debugger' },
  );
  handle(
    'debugger.sendCommand',
    (event: Event, source: any, method: string, params: any = {}) => {
      const contents = owned(event, source);
      object(params);
      if (
        typeof method !== 'string' ||
        !/^[A-Za-z]+\.[A-Za-z]+$/.test(method) ||
        !domains.has(method.split('.')[0])
      )
        throw new Error('Debugger command is not supported for a tab target');
      // Evaluate and navigate must not move debugging into browser/extension documents.
      if (
        method === 'Page.navigate' &&
        (typeof params.url !== 'string' || !/^https?:/.test(params.url))
      )
        throw new Error('Debugger navigation requires HTTP(S)');
      return contents.debugger.sendCommand(method, params);
    },
    { permission: 'debugger' },
  );
  handle(
    'debugger.getTargets',
    async () => {
      const results = [];
      for (const contents of ctx.store.tabs) {
        if (
          contents.isDestroyed() ||
          contents.session !== ctx.session ||
          !/^https?:/.test(contents.getURL())
        )
          continue;
        results.push({
          id: String(contents.id),
          tabId: contents.id,
          type: 'page',
          title: contents.getTitle(),
          url: contents.getURL(),
          attached: contents.debugger.isAttached(),
        });
      }
      return results;
    },
    { permission: 'debugger' },
  );
  ctx.session.extensions.on('extension-unloaded', (_event, extension) => {
    for (const { extensionId, contents } of attachments.values())
      if (
        extensionId === extension.id &&
        !contents.isDestroyed() &&
        contents.debugger.isAttached()
      )
        contents.debugger.detach();
  });
  ctx.store.on('tab-removed', (id: number) => {
    const attachment = attachments.get(id);
    if (
      attachment &&
      !attachment.contents.isDestroyed() &&
      attachment.contents.debugger.isAttached()
    )
      attachment.contents.debugger.detach();
  });
}

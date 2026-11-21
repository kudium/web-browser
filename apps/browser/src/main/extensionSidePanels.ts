import {
  app,
  BrowserWindow,
  Session,
  WebContents,
  WebContentsView,
} from 'electron';
import type { Extension, WebFrameMain } from 'electron';
import type { ElectronChromeExtensions } from 'electron-chrome-extensions';
import fs from 'node:fs';
import path from 'node:path';
import { sidebarPanelsFor, sidebarPanelHostFor } from './sidebarPanels';

interface PanelOptions {
  enabled?: boolean;
  path?: string;
  tabId?: number;
}
interface ExtensionEvent {
  extension?: Extension;
  sender: WebContents;
  senderFrame?: WebFrameMain;
  type: string;
}
interface Context {
  session: Session;
  router: {
    apiHandler(): (
      name: string,
      callback: (event: ExtensionEvent, options?: any) => any,
      options?: { permission?: string },
    ) => void;
    sendEvent(extensionId: string, name: string, details: unknown): void;
    handlers: Map<
      string,
      { callback: (event: ExtensionEvent, details: any) => any }
    >;
  };
  store: {
    windows: Set<BrowserWindow>;
    getTabById(id: number): WebContents | undefined;
    getWindowById(id: number): BrowserWindow | undefined;
    getCurrentWindow(): BrowserWindow | undefined;
    createTab(options: { url: string; windowId: number }): Promise<WebContents>;
    getActiveTabFromWindow(window: BrowserWindow): WebContents | undefined;
    tabToWindow: WeakMap<WebContents, BrowserWindow>;
    on(name: string, callback: (...args: any[]) => void): void;
  };
}

/** Resolve the active browser tab in the request's profile/window, not a stale callback tab. */
export function extensionActiveTab(
  api: ElectronChromeExtensions | undefined,
  windowId?: number,
) {
  const ctx = (api as unknown as { ctx: Context } | undefined)?.ctx;
  if (!ctx) return undefined;
  const owner =
    windowId === undefined || windowId === -2
      ? ctx.store.getCurrentWindow()
      : ctx.store.getWindowById(windowId);
  return owner ? ctx.store.getActiveTabFromWindow(owner) : undefined;
}

/** Keep relative panel resources inside the reviewed, loaded extension package. */
export function extensionPanelURL(
  extension: Pick<Extension, 'id' | 'path'>,
  resource: string,
) {
  if (
    typeof resource !== 'string' ||
    !resource ||
    resource.length > 4096 ||
    resource.includes('\\')
  )
    throw new Error('Invalid side panel path');
  const url = new URL(resource, `chrome-extension://${extension.id}/`);
  if (
    url.protocol !== 'chrome-extension:' ||
    url.hostname !== extension.id ||
    url.username ||
    url.password
  )
    throw new Error('Side panel must belong to its extension');
  const root = fs.realpathSync(extension.path);
  const filename = fs.realpathSync(
    path.join(root, decodeURIComponent(url.pathname)),
  );
  if (!filename.startsWith(root + path.sep) || !fs.statSync(filename).isFile())
    throw new Error('Side panel resource is outside the extension package');
  return url.href;
}

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid side panel options');
}
function id(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('Invalid side panel tab or window');
  return value as number;
}

/** The compatibility router already authenticates frame/worker provenance and permissions. */
export function attachExtensionSidePanels(
  api: ElectronChromeExtensions,
  profileId: string,
) {
  const ctx = (api as unknown as { ctx: Context }).ctx;
  if (!ctx?.router?.apiHandler || !ctx.store)
    throw new Error('Extension side panel adapter needs dependency review');
  const handle = ctx.router.apiHandler();
  // Extension pages are not browser tabs, but still have a logical owning
  // window. Preserve that context across pop-out and authentication windows.
  const createTabHandler = ctx.router.handlers.get('tabs.create');
  if (createTabHandler) {
    const original = createTabHandler.callback;
    createTabHandler.callback = (event, options = {}) => {
      object(options);
      const owner = ctx.store.tabToWindow.get(event.sender);
      return original(
        event,
        owner &&
          !owner.isDestroyed() &&
          (options.windowId === undefined || options.windowId === -2)
          ? { ...options, windowId: owner.id }
          : options,
      );
    };
  }
  const currentWindowHandler = ctx.router.handlers.get('windows.getCurrent');
  const queryTabsHandler = ctx.router.handlers.get('tabs.query');
  if (queryTabsHandler) {
    const original = queryTabsHandler.callback;
    queryTabsHandler.callback = (event, options = {}) => {
      object(options);
      const owner = ctx.store.tabToWindow.get(event.sender);
      return original(
        event,
        owner && !owner.isDestroyed() && options.currentWindow === true
          ? { ...options, currentWindow: false, windowId: owner.id }
          : options,
      );
    };
  }
  const getWindowHandler = ctx.router.handlers.get('windows.get');
  if (currentWindowHandler && getWindowHandler) {
    const original = currentWindowHandler.callback;
    currentWindowHandler.callback = (event, options) => {
      const owner = ctx.store.tabToWindow.get(event.sender);
      return owner && !owner.isDestroyed()
        ? getWindowHandler.callback(event, owner.id)
        : original(event, options);
    };
  }
  const globalOptions = new Map<string, PanelOptions>();
  const tabOptions = new Map<string, Map<number, PanelOptions>>();
  const behaviors = new Map<string, boolean>();
  const gestures = new Map<string, number>();
  const registered = new Map<
    string,
    { window: BrowserWindow; panelId: string; extensionId: string }
  >();
  const settingsFile = path.join(
    app.getPath('userData'),
    'extension-side-panels.json',
  );
  type Settings = Record<
    string,
    { options?: PanelOptions; openPanelOnActionClick?: boolean }
  >;
  const readSettings = (): Settings => {
    try {
      if (fs.statSync(settingsFile).size > 2 * 1024 * 1024) return {};
      const value = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  };
  let settings = readSettings();
  const save = (extensionId: string) => {
    // Read current records so other profiles' writes are preserved.
    settings = readSettings();
    settings[`${profileId}:${extensionId}`] = {
      options: globalOptions.get(extensionId),
      openPanelOnActionClick: behaviors.get(extensionId) || false,
    };
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings), {
      mode: 0o600,
    });
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  };
  const loaded = () =>
    ctx.session.extensions
      .getAllExtensions()
      .filter((extension) =>
        extension.manifest.permissions?.includes('sidePanel'),
      );
  const getOptions = (extension: Extension, tabId?: number): PanelOptions => {
    const defaults = extension.manifest.side_panel?.default_path;
    return {
      enabled: true,
      ...(typeof defaults === 'string' && { path: defaults }),
      ...globalOptions.get(extension.id),
      ...(tabId !== undefined && tabOptions.get(extension.id)?.get(tabId)),
      ...(tabId !== undefined && { tabId }),
    };
  };
  const currentOptions = (extension: Extension, window: BrowserWindow) => {
    const tab = ctx.store.getActiveTabFromWindow(window);
    const override = tab && tabOptions.get(extension.id)?.get(tab.id);
    return {
      tab,
      scope: override ? tab!.id : undefined,
      options: getOptions(extension, tab?.id),
    };
  };
  const panelId = (
    extensionId: string,
    window: BrowserWindow,
    scope?: number,
  ) =>
    `extension:${profileId}:${extensionId}:${window.id}:${scope === undefined ? 'global' : scope}`;
  const recordInput = (
    contents: WebContents,
    extensionId: string,
    window: BrowserWindow,
  ) => {
    const record = () =>
      gestures.set(`${extensionId}:${window.id}`, Date.now());
    contents.on('before-mouse-event', (_event, input) => {
      if (input.type === 'mouseDown') record();
    });
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown') record();
    });
  };
  const refresh = () => {
    const wanted = new Set<string>();
    for (const extension of loaded()) {
      for (const window of ctx.store.windows) {
        if (window.isDestroyed()) continue;
        const host = sidebarPanelHostFor(window);
        if (!host) continue;
        const scopes: Array<number | undefined> = [
          undefined,
          ...(tabOptions.get(extension.id)?.keys() || []),
        ];
        for (const scope of scopes) {
          if (
            scope !== undefined &&
            ctx.store.tabToWindow.get(ctx.store.getTabById(scope)!) !== window
          )
            continue;
          const options = getOptions(extension, scope);
          if (!options.path || options.enabled === false) continue;
          let url: string;
          try {
            url = extensionPanelURL(extension, options.path);
          } catch {
            continue;
          }
          const key = panelId(extension.id, window, scope);
          wanted.add(key);
          const details = () => ({
            windowId: window.id,
            ...(scope !== undefined && { tabId: scope }),
            path: options.path,
          });
          host.register({
            info: { id: key, title: extension.name, kind: 'extension', key: `extension:${extension.id}` },
            groupId: `extension:${extension.id}`,
            contentKey: url,
            available: () => {
              const current = currentOptions(extension, window);
              return Boolean(
                host.activeSession === ctx.session &&
                current.tab &&
                current.scope === scope &&
                current.options.enabled !== false,
              );
            },
            createView: () => {
              const view = new WebContentsView({
                webPreferences: {
                  session: ctx.session,
                  sandbox: true,
                  contextIsolation: true,
                  nodeIntegration: false,
                  webSecurity: true,
                },
              });
              ctx.store.tabToWindow.set(view.webContents, window);
              view.webContents.once('destroyed', () =>
                ctx.store.tabToWindow.delete(view.webContents),
              );
              recordInput(view.webContents, extension.id, window);
              const openLink = (destination: string) => {
                try {
                  const link = new URL(destination);
                  if (link.protocol === 'https:' || link.protocol === 'http:')
                    void ctx.store
                      .createTab({ url: link.href, windowId: window.id })
                      .catch(() => {});
                } catch {
                  /* Reject invalid or privileged destinations. */
                }
              };
              view.webContents.setWindowOpenHandler(({ url: destination }) => {
                openLink(destination);
                return { action: 'deny' };
              });
              view.webContents.on('will-navigate', (event, destination) => {
                if (
                  !destination.startsWith(`chrome-extension://${extension.id}/`)
                ) {
                  event.preventDefault();
                  openLink(destination);
                }
              });
              view.webContents.on('will-redirect', (event, destination) => {
                if (
                  !destination.startsWith(`chrome-extension://${extension.id}/`)
                )
                  event.preventDefault();
              });
              void view.webContents.loadURL(url).catch(() => {});
              return view;
            },
            opened: () =>
              ctx.router.sendEvent(
                extension.id,
                'sidePanel.onOpened',
                details(),
              ),
            closed: () =>
              ctx.router.sendEvent(
                extension.id,
                'sidePanel.onClosed',
                details(),
              ),
          });
          registered.set(key, {
            window,
            panelId: key,
            extensionId: extension.id,
          });
        }
      }
    }
    for (const [key, entry] of registered)
      if (!wanted.has(key)) {
        if (!entry.window.isDestroyed())
          sidebarPanelsFor(entry.window).remove(entry.panelId);
        registered.delete(key);
      }
  };
  const extensionFor = (event: ExtensionEvent) => {
    const extension = event.extension;
    if (
      !extension ||
      !ctx.session.extensions.getExtension(extension.id) ||
      !extension.manifest.permissions?.includes('sidePanel')
    )
      throw new Error('Unknown extension or missing sidePanel permission');
    return extension;
  };
  const target = (options: Record<string, unknown>) => {
    if ((options.tabId === undefined) === (options.windowId === undefined))
      throw new Error('Specify one tabId or windowId');
    const tab =
      options.tabId === undefined
        ? undefined
        : ctx.store.getTabById(id(options.tabId));
    const window =
      options.windowId === undefined
        ? tab && ctx.store.tabToWindow.get(tab)
        : ctx.store.getWindowById(id(options.windowId));
    if (!window || window.isDestroyed() || !ctx.store.windows.has(window))
      throw new Error('Side panel target is outside this profile');
    if (tab && ctx.store.getActiveTabFromWindow(window) !== tab)
      throw new Error('Side panel target tab is not active');
    return window;
  };
  const open = (extension: Extension, window: BrowserWindow) => {
    refresh();
    const current = currentOptions(extension, window);
    if (!current.options.path || current.options.enabled === false)
      throw new Error('Side panel is disabled or has no path');
    sidebarPanelsFor(window).activate(
      panelId(extension.id, window, current.scope),
    );
  };
  const apiOptions = { permission: 'sidePanel' };
  handle(
    'sidePanel.getOptions',
    (event, options = {}) => {
      object(options);
      const tabId = options.tabId === undefined ? undefined : id(options.tabId);
      if (tabId !== undefined && !ctx.store.getTabById(tabId))
        throw new Error('Unknown side panel tab');
      return getOptions(extensionFor(event), tabId);
    },
    apiOptions,
  );
  handle(
    'sidePanel.setOptions',
    (event, options) => {
      object(options);
      const extension = extensionFor(event);
      const tabId = options.tabId === undefined ? undefined : id(options.tabId);
      if (tabId !== undefined && !ctx.store.getTabById(tabId))
        throw new Error('Unknown side panel tab');
      if (options.enabled !== undefined && typeof options.enabled !== 'boolean')
        throw new Error('Invalid side panel enabled flag');
      if (options.path !== undefined)
        extensionPanelURL(extension, options.path as string);
      const patch: PanelOptions = {
        ...(options.enabled !== undefined && {
          enabled: options.enabled as boolean,
        }),
        ...(options.path !== undefined && { path: options.path as string }),
      };
      if (tabId === undefined) {
        globalOptions.set(extension.id, {
          ...globalOptions.get(extension.id),
          ...patch,
        });
        save(extension.id);
      } else {
        const tabs =
          tabOptions.get(extension.id) || new Map<number, PanelOptions>();
        tabs.set(tabId, { ...tabs.get(tabId), ...patch });
        tabOptions.set(extension.id, tabs);
      }
      refresh();
    },
    apiOptions,
  );
  handle(
    'sidePanel.getPanelBehavior',
    (event) => ({
      openPanelOnActionClick: behaviors.get(extensionFor(event).id) || false,
    }),
    apiOptions,
  );
  handle(
    'sidePanel.setPanelBehavior',
    (event, options) => {
      object(options);
      if (
        options.openPanelOnActionClick !== undefined &&
        typeof options.openPanelOnActionClick !== 'boolean'
      )
        throw new Error('Invalid side panel behavior');
      const extension = extensionFor(event);
      behaviors.set(extension.id, options.openPanelOnActionClick === true);
      save(extension.id);
    },
    apiOptions,
  );
  handle('sidePanel.getLayout', () => ({ side: 'right' }), apiOptions);
  handle(
    'sidePanel.open',
    (event, options) => {
      object(options);
      const extension = extensionFor(event);
      const window = target(options);
      if (
        Date.now() - (gestures.get(`${extension.id}:${window.id}`) || 0) >
        5000
      )
        throw new Error('sidePanel.open requires a user gesture');
      open(extension, window);
    },
    apiOptions,
  );
  handle(
    'sidePanel.close',
    (event, options) => {
      object(options);
      const extension = extensionFor(event);
      const window = target(options);
      const host = sidebarPanelsFor(window);
      if (
        registered.get(host.state().activeId || '')?.extensionId ===
        extension.id
      )
        host.close();
    },
    apiOptions,
  );
  const activate = ctx.router.handlers.get('browserAction.activate');
  if (!activate)
    throw new Error('Extension toolbar adapter needs dependency review');
  const originalActivate = activate.callback;
  activate.callback = (event, details) => {
    const tab = ctx.store.getTabById(details?.tabId);
    const window = tab && ctx.store.tabToWindow.get(tab);
    const extension = ctx.session.extensions.getExtension(details?.extensionId);
    if (
      !event.extension &&
      event.type === 'frame' &&
      window &&
      event.sender === window.webContents &&
      details?.eventType === 'click' &&
      extension
    ) {
      gestures.set(`${extension.id}:${window.id}`, Date.now());
      if (
        behaviors.get(extension.id) &&
        extension.manifest.permissions?.includes('sidePanel')
      ) {
        open(extension, window);
        return;
      }
    }
    return originalActivate(event, details);
  };
  api.on('browser-action-popup-created', (popup) => {
    if (popup.browserWindow && popup.parent)
      recordInput(
        popup.browserWindow.webContents,
        popup.extensionId,
        popup.parent,
      );
  });
  const restore = (extension: Extension) => {
    const saved = settings?.[`${profileId}:${extension.id}`];
    if (saved?.options && typeof saved.options === 'object') {
      const options: PanelOptions = {};
      if (typeof saved.options.enabled === 'boolean')
        options.enabled = saved.options.enabled;
      if (typeof saved.options.path === 'string') {
        try {
          extensionPanelURL(extension, saved.options.path);
          options.path = saved.options.path;
        } catch {
          /* Discard stale or invalid resources. */
        }
      }
      globalOptions.set(extension.id, options);
    }
    if (typeof saved?.openPanelOnActionClick === 'boolean')
      behaviors.set(extension.id, saved.openPanelOnActionClick);
  };
  ctx.session.extensions.on('extension-loaded', (_event, extension) => {
    restore(extension);
    refresh();
  });
  ctx.session.extensions.on('extension-unloaded', (_event, extension) => {
    globalOptions.delete(extension.id);
    tabOptions.delete(extension.id);
    behaviors.delete(extension.id);
    refresh();
  });
  ctx.store.on('active-tab-changed', refresh);
  ctx.store.on('window-added', refresh);
  ctx.store.on('tab-added', refresh);
  ctx.store.on('tab-removed', (tabId: number) => {
    for (const tabs of tabOptions.values()) tabs.delete(tabId);
    refresh();
  });
  for (const extension of loaded()) restore(extension);
  refresh();
}

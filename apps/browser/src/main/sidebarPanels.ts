import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import type { Session } from 'electron';
import type {
  SidebarPanelInfo,
  SidebarPanelRequest,
  SidebarPanelState,
} from '../browser/sidebarPanels';

export interface SidebarPanelProvider {
  info: SidebarPanelInfo;
  /** Panels in one group can follow the active tab without taking over Chat. */
  groupId?: string;
  contentKey: string;
  available?: () => boolean;
  createView: () => WebContentsView;
  opened?: () => void;
  closed?: () => void;
}

/** Native content is registered by main-process features, never by renderer URLs. */
export class SidebarPanelRegistry {
  private entries = new Map<
    string,
    { provider: SidebarPanelProvider; view?: WebContentsView; shown?: boolean }
  >();
  private suspended = false;
  activeSession?: Session;
  private activeId?: string;
  private preferredGroup?: string;
  private request = 0;
  private error?: string;
  private floating?: {
    window: BrowserWindow;
    id: string;
    view: WebContentsView;
  };
  constructor(private window: BrowserWindow) {}
  state(): SidebarPanelState {
    return {
      panels: [...this.entries.values()]
        .filter(({ provider }) => provider.available?.() !== false)
        .map(({ provider }) => provider.info),
      activeId: this.activeId,
      openRequest: this.request,
      floating: Boolean(this.floating),
      ...(this.error && { error: this.error }),
    };
  }
  private publish() {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed())
      this.window.webContents.send(
        'browser-sidebar-panels-changed',
        this.state(),
      );
  }
  register(provider: SidebarPanelProvider) {
    const old = this.entries.get(provider.info.id);
    if (old?.provider.contentKey === provider.contentKey)
      old.provider = provider;
    else {
      if (old?.view) this.destroyView(old.view);
      this.entries.set(provider.info.id, { provider });
    }
    this.refresh();
  }
  private destroyView(view: WebContentsView) {
    if (this.floating?.view === view) this.dock();
    if (!this.window.isDestroyed())
      this.window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (this.activeId === id) entry.provider.closed?.();
    if (entry.view) this.destroyView(entry.view);
    this.entries.delete(id);
    this.refresh();
  }
  refresh() {
    const current = this.entries.get(this.activeId || '');
    if (!current || current.provider.available?.() === false) {
      this.dock();
      current?.view?.setVisible(false);
      current?.provider.closed?.();
      const next =
        this.preferredGroup &&
        [...this.entries.values()].find(
          ({ provider }) =>
            provider.groupId === this.preferredGroup &&
            provider.available?.() !== false,
        );
      this.activeId = next ? next.provider.info.id : undefined;
      if (next) next.provider.opened?.();
    }
    this.publish();
  }
  activate(id: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.provider.available?.() === false)
      throw new Error('Sidebar panel is unavailable in this tab.');
    if (this.error && entry.view) {
      this.destroyView(entry.view);
      entry.view = undefined;
    }
    if (this.activeId !== id) {
      this.dock();
      const old = this.entries.get(this.activeId || '');
      old?.view?.setVisible(false);
      old?.provider.closed?.();
    }
    this.activeId = id;
    this.preferredGroup = entry.provider.groupId;
    this.error = undefined;
    this.request += 1;
    entry.provider.opened?.();
    this.publish();
  }
  close() {
    this.dock();
    const entry = this.entries.get(this.activeId || '');
    entry?.view?.setVisible(false);
    entry?.provider.closed?.();
    this.activeId = undefined;
    this.preferredGroup = undefined;
    this.error = undefined;
    this.publish();
  }
  setSuspended(value: boolean) {
    this.suspended = value;
    for (const [id, entry] of this.entries)
      entry.view?.setVisible(
        !value &&
          id === this.activeId &&
          (Boolean(entry.shown) || this.floating?.id === id),
      );
  }
  setSession(session?: Session) {
    if (session === this.activeSession) return;
    this.activeSession = session;
    this.refresh();
  }
  layout(
    id: string,
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) {
    const entry = this.entries.get(id);
    if (this.floating?.id === id) return;
    if (
      id !== this.activeId ||
      !entry ||
      entry.provider.available?.() === false
    )
      return;
    if (!bounds) {
      entry.shown = false;
      entry.view?.setVisible(false);
      return;
    }
    if (this.error) return;
    const { width, height } = this.window.getContentBounds();
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(
        Number.isFinite,
      ) ||
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.width < 1 ||
      bounds.height < 1 ||
      bounds.x + bounds.width > width + 1 ||
      bounds.y + bounds.height > height + 1
    )
      return;
    if (!entry.view || entry.view.webContents.isDestroyed()) {
      try {
        entry.view = entry.provider.createView();
        const view = entry.view;
        const failed = () => {
          if (entry.view !== view) return;
          view.setVisible(false);
          entry.shown = false;
          this.error =
            'This sidebar panel could not load. Close it and try again.';
          this.publish();
        };
        view.webContents.on(
          'did-fail-load',
          (_event, _code, _description, _url, mainFrame) => {
            if (mainFrame) failed();
          },
        );
        view.webContents.on('render-process-gone', () => {
          failed();
          this.destroyView(view);
          entry.view = undefined;
        });
        entry.view.setVisible(false);
        this.window.contentView.addChildView(entry.view);
      } catch {
        this.error =
          'Could not open this sidebar panel. Close it and try again.';
        this.publish();
        return;
      }
    }
    entry.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.floor(bounds.width),
      height: Math.floor(bounds.height),
    });
    entry.shown = true;
    entry.view.setVisible(!this.suspended);
  }
  /** Reparent the existing view so extension state/session survive placement changes. */
  undock() {
    if (this.floating) {
      this.floating.window.focus();
      return;
    }
    const id = this.activeId;
    const entry = id && this.entries.get(id);
    if (!id || !entry || entry.provider.available?.() === false || this.error)
      return;
    if (!entry.view) {
      const bounds = this.window.getContentBounds();
      this.layout(id, {
        x: 0,
        y: 0,
        width: Math.min(500, bounds.width),
        height: Math.min(600, bounds.height),
      });
    }
    if (!entry.view) return;
    const view = entry.view;
    const child = new BrowserWindow({
      parent: this.window,
      title: entry.provider.info.title,
      width: 520,
      height: 720,
      minWidth: 320,
      minHeight: 240,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    child.setMenu(null);
    this.window.contentView.removeChildView(view);
    child.contentView.addChildView(view);
    this.floating = { window: child, id, view };
    entry.shown = false;
    const resize = () => {
      if (child.isDestroyed() || this.floating?.window !== child) return;
      const { width, height } = child.getContentBounds();
      view.setBounds({ x: 0, y: 44, width, height: Math.max(1, height - 44) });
      view.setVisible(!this.suspended);
    };
    child.on('resize', resize);
    child.on('close', (event) => {
      if (this.floating?.window !== child) return;
      event.preventDefault();
      this.dock();
    });
    const dockURL = 'https://kudium.invalid/dock-sidebar-panel';
    child.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url === dockURL) this.dock();
    });
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const title = entry.provider.info.title.replace(
      /[&<>"']/g,
      (value) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[value]!,
    );
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>:root{color-scheme:light dark}body{margin:0;font:13px system-ui;background:light-dark(#fff,#202020);color:light-dark(#222,#eee)}header{height:44px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid #8885}span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}a{color:inherit;text-decoration:none;padding:5px 10px;border:1px solid #8887;border-radius:6px}a:hover{background:#8883}</style><header><span>${title}</span><a href="${dockURL}" aria-label="Dock panel back">↙ Dock back</a></header>`;
    resize();
    void child
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .then(() => {
        if (this.floating?.window === child && !child.isDestroyed())
          child.show();
      })
      .catch(() => {
        if (this.floating?.window === child) this.dock();
      });
    this.publish();
  }
  dock() {
    const floating = this.floating;
    if (!floating) return;
    this.floating = undefined;
    if (!floating.window.isDestroyed())
      floating.window.contentView.removeChildView(floating.view);
    if (
      !this.window.isDestroyed() &&
      !floating.view.webContents.isDestroyed()
    ) {
      this.window.contentView.addChildView(floating.view);
      floating.view.setVisible(false);
    }
    if (!floating.window.isDestroyed()) floating.window.destroy();
    this.publish();
  }
  dispose() {
    this.dock();
    for (const entry of this.entries.values())
      if (entry.view) this.destroyView(entry.view);
    this.entries.clear();
  }
}

const hosts = new Map<BrowserWindow, SidebarPanelRegistry>();
let registered = false;
export function registerSidebarPanelWindow(window: BrowserWindow) {
  if (hosts.has(window)) return;
  const registry = new SidebarPanelRegistry(window);
  hosts.set(window, registry);
  window.once('closed', () => {
    registry.dispose();
    hosts.delete(window);
  });
  window.webContents.on('did-finish-load', () => registry.refresh());
  if (registered) return;
  registered = true;
  ipcMain.handle(
    'browser-sidebar-panels',
    (event, request: SidebarPanelRequest) => {
      const owner = [...hosts.keys()].find(
        (host) =>
          !host.isDestroyed() &&
          host.webContents === event.sender &&
          event.senderFrame === host.webContents.mainFrame,
      );
      if (!owner) throw new Error('Untrusted sidebar panel sender');
      const host = hosts.get(owner)!;
      if (!request || typeof request !== 'object')
        throw new Error('Invalid sidebar panel request');
      if (request.action === 'activate' && typeof request.id === 'string')
        host.activate(request.id);
      else if (request.action === 'close') host.close();
      else if (request.action === 'undock') host.undock();
      else if (request.action === 'dock') host.dock();
      else if (
        request.action === 'layout' &&
        typeof request.id === 'string' &&
        (request.bounds === null ||
          (request.bounds && typeof request.bounds === 'object'))
      )
        host.layout(request.id, request.bounds);
      else if (request.action !== 'list')
        throw new Error('Invalid sidebar panel request');
      return host.state();
    },
  );
}
export function sidebarPanelsFor(window: BrowserWindow) {
  const host = hosts.get(window);
  if (!host) throw new Error('This window has no sidebar panel host');
  return host;
}
export function suspendSidebarPanels(
  window: BrowserWindow,
  suspended: boolean,
) {
  hosts.get(window)?.setSuspended(suspended);
}
export function setSidebarPanelSession(
  window: BrowserWindow,
  session?: Session,
) {
  hosts.get(window)?.setSession(session);
}

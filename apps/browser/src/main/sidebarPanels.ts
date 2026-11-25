import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import type { Session } from 'electron';
import { capturePagePNG } from './aiScreenshot';
import { presentSnapshots } from './snapshotPresentation';
import type { BrowserSnapshot } from '../browser/contracts';
import { clipSidebarPanelBounds } from '../browser/sidebarPanels';
import type {
  SidebarPanelInfo,
  SidebarPanelRequest,
  SidebarPanelState,
  SidebarPanelTarget,
  SidebarPanelBounds,
} from '../browser/sidebarPanels';

export interface SidebarPanelProvider {
  info: SidebarPanelInfo;
  /** Panels in one group can follow the active tab without taking over Chat. */
  groupId?: string;
  contentKey: string;
  available?: () => boolean;
  createView: () => WebContentsView;
  manage?: () => void | Promise<unknown>;
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
  private snapshot?: BrowserSnapshot;
  private preparingView?: WebContentsView;
  private captureController?: AbortController;
  private suspensionRevision = 0;
  activeSession?: Session;
  activeGroup?: string;
  private activeId?: string;
  private history: string[] = [];
  private historyIndex = -1;
  private preferredGroup?: string;
  targetGroup?: string;
  private targets: SidebarPanelTarget[] = [];
  private onTarget?: (id?: string) => void;
  private focusedGroup?: string;
  private lastBounds?: SidebarPanelBounds;
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
        .map(({ provider }) => ({ ...provider.info, canManage: !!provider.manage })),
      activeId: this.activeId,
      canGoBack: this.historyTarget(-1) !== undefined,
      canGoForward: this.historyTarget(1) !== undefined,
      openRequest: this.request,
      floating: Boolean(this.floating),
      targets: this.targets,
      targetGroup: this.targetGroup,
      snapshot: this.snapshot?.id === this.activeId && !this.floating ? this.snapshot : undefined,
      ...(this.error && { error: this.error }),
    };
  }
  private remember(id: string) {
    if (this.history[this.historyIndex] === id) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(id);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }
  private historyTarget(direction: -1 | 1) {
    if (!this.activeId && direction === 1) return undefined;
    const start = this.historyIndex + (!this.activeId && direction === -1 ? 0 : direction);
    for (let index = start; index >= 0 && index < this.history.length; index += direction) {
      const entry = this.entries.get(this.history[index]);
      if (entry && entry.provider.available?.() !== false) return index;
    }
    return undefined;
  }
  navigate(direction: -1 | 1) {
    const index = this.historyTarget(direction);
    if (index === undefined) return;
    const previous = this.historyIndex;
    this.historyIndex = index;
    try { this.activate(this.history[index], true, undefined, false); }
    catch (error) { this.historyIndex = previous; throw error; }
  }
  async manage(id: string) {
    const entry = this.entries.get(id);
    if (!entry?.provider.manage || entry.provider.available?.() === false) throw new Error('Panel management is unavailable.');
    await entry.provider.manage();
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
    // Replacing an active document must restore its existing native slot even
    // when the renderer correctly suppresses an unchanged layout message.
    if (old?.shown && old.provider.contentKey !== provider.contentKey &&
      this.activeId === provider.info.id && this.lastBounds)
      this.layout(provider.info.id, this.lastBounds);
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
      if (next) { this.remember(next.provider.info.id); next.provider.opened?.(); }
    }
    this.publish();
  }
  activate(id: string, reveal = true, hookGroupId?: string, recordHistory = true) {
    const entry = this.entries.get(id);
    const hookReveal = Boolean(hookGroupId && entry?.provider.info.kind === 'hook' &&
      entry.provider.groupId === hookGroupId);
    if (hookReveal && this.targetGroup) {
      // Revealing page output must follow navigation, never pin or select a tab.
      this.setTarget(undefined);
    }
    // Keep background results registered without stealing the foreground tab.
    if (hookReveal && entry?.provider.available?.() === false) return;
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
    if (recordHistory) this.remember(id);
    this.preferredGroup = entry.provider.groupId;
    this.error = undefined;
    if (reveal) this.request += 1;
    if (this.lastBounds) this.layout(id, this.lastBounds);
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
    if (this.suspended === value) return;
    this.suspended = value;
    this.captureController?.abort();
    const revision = ++this.suspensionRevision;
    this.preparingView = undefined;
    const entry = this.entries.get(this.activeId || '');
    const view = entry?.view;
    if (value && !this.floating && entry?.shown && view && !view.webContents.isDestroyed()) {
      // Native views sit above HTML dialogs. Paint a captured replacement before
      // hiding the live view, preserving its document and scroll/draft state.
      this.preparingView = view;
      const controller = new AbortController();
      this.captureController = controller;
      void view.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
        .then(image => { if (image.isEmpty?.()) throw new Error('Panel display surface is unavailable.'); return image.toDataURL(); })
        .catch(async () => `data:image/png;base64,${await capturePagePNG(view.webContents, controller.signal)}`)
        .then(async image => {
        if (revision !== this.suspensionRevision || this.floating || entry.view !== view || this.activeId !== entry.provider.info.id) return;
        await presentSnapshots(this.window, [{ id: entry.provider.info.id, ...this.lastBounds!, image }], {
          selector: '.sidebar-panel-snapshot',
          publish: frames => { this.snapshot = frames[0]; this.publish(); },
        });
        if (revision === this.suspensionRevision && entry.view === view) { this.preparingView = undefined; view.setVisible(false); }
      }).catch(() => {
        if (revision === this.suspensionRevision) { this.preparingView = undefined; view.setVisible(false); }
      });
      return;
    }
    for (const [id, item] of this.entries)
      item.view?.setVisible(
        !this.error && item.provider.available?.() !== false && id === this.activeId &&
        (this.floating?.id === id || (!value && Boolean(item.shown))),
      );
    this.snapshot = undefined;
    this.publish();
  }
  setSession(session?: Session, groupId?: string) {
    if (session === this.activeSession && groupId === this.activeGroup) return;
    this.activeSession = session;
    this.activeGroup = groupId;
    this.refresh();
  }
  setTargets(targets: SidebarPanelTarget[], onTarget: (id?: string) => void) {
    const changed = JSON.stringify(targets) !== JSON.stringify(this.targets);
    this.targets = targets;
    this.onTarget = onTarget;
    if (
      this.targetGroup &&
      !targets.some((target) => target.id === this.targetGroup)
    )
      this.targetGroup = undefined;
    onTarget(this.targetGroup);
    if (changed) this.publish();
  }
  setTarget(groupId?: string) {
    if (groupId && !this.targets.some((target) => target.id === groupId))
      throw new Error('Group is unavailable');
    this.targetGroup = groupId;
    this.onTarget?.(groupId);
    this.refresh();
  }
  followFocusedGroup(groupId?: string) {
    const changed = this.focusedGroup !== undefined && this.focusedGroup !== groupId;
    this.focusedGroup = groupId;
    if (changed && this.targetGroup && this.targetGroup !== groupId)
      this.setTarget(undefined);
  }
  layout(id: string, bounds: SidebarPanelBounds | null) {
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
    const clipped = clipSidebarPanelBounds(
      bounds,
      this.window.getContentBounds(),
    );
    if (!clipped) {
      entry.shown = false;
      entry.view?.setVisible(false);
      return;
    }
    this.lastBounds = clipped;
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
    entry.view.setBorderRadius(8);
    entry.view.setBounds(clipped);
    entry.shown = true;
    entry.view.setVisible(!this.suspended || this.preparingView === entry.view);
  }
  /** Reparent the existing view so extension state/session survive placement changes. */
  undock() {
    if (this.floating) {
      this.floating.window.focus();
      return;
    }
    this.captureController?.abort();
    ++this.suspensionRevision;
    this.preparingView = undefined;
    this.snapshot = undefined;
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
    view.setBorderRadius(0);
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
      view.setVisible(!this.error && entry.provider.available?.() !== false);
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
    this.captureController?.abort();
    ++this.suspensionRevision;
    this.preparingView = undefined;
    this.snapshot = undefined;
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
        host.activate(request.id, request.reveal !== false);
      else if (request.action === 'manage' && typeof request.id === 'string') return host.manage(request.id).then(() => host.state());
      else if (request.action === 'back' || request.action === 'forward') host.navigate(request.action === 'back' ? -1 : 1);
      else if (request.action === 'close') host.close();
      else if (
        request.action === 'target' &&
        (request.groupId === undefined || typeof request.groupId === 'string')
      )
        host.setTarget(request.groupId);
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
/** Authentication and extension popup windows need not own a sidebar. */
export function sidebarPanelHostFor(window: BrowserWindow) {
  return hosts.get(window);
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
  groupId?: string,
) {
  hosts.get(window)?.setSession(session, groupId);
}

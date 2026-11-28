import { BrowserWindow, ipcMain, screen } from 'electron';
import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContentsView,
  WebContents,
} from 'electron';
import { randomUUID } from 'crypto';
import { isPrivateSession } from './privateSessions';
import { onWindowClosed } from './windowLifecycle';
import { presentSnapshots, captureNativeViewSnapshots } from './snapshotPresentation';
import type {
  BrowserLayout,
  BrowserState,
  BrowserTabRequest,
} from '../browser/contracts';
import type {
  BrowserWindowKind,
  BrowserWindowRequest,
  BrowserWindowState,
} from '../browser/windows';
import { isBrowserWindowRequest } from '../browser/windows';
import type { IApp } from '../types';
import { groupKey, loginProfileKey } from '../utils/groups';
import { isBrowserLayout } from './browserRequests';
import { getGroupLocks, isGroupLocked } from './groupLocks';

type Host = {
  window: BrowserWindow;
  kind: BrowserWindowKind;
  groups: string[];
  tabs: IApp[];
  layout: BrowserLayout;
  selectedId?: string;
  stamp: number;
  signature?: string;
  stateSignatures: Map<string, string>;
  overlayGeneration?: number;
  pendingOverlay?: BrowserLayout;
};
type Drag = {
  source: number;
  id: string;
  kind: 'tab' | 'group';
  expires: number;
  point: { x: number; y: number };
};
type Runtime = {
  view: (id: string) => WebContentsView | undefined;
  state: (id: string) => BrowserState | undefined;
  snapshotViews?: (id: string, owner: BrowserWindow) => {view: WebContentsView; surface?: 'devtools'}[];
  chrome?: (window: BrowserWindow) => void;
};
const empty = (): BrowserLayout => ({ apps: [], visible: [] });

/** One live page per tab ID; independent window layouts share its native view. */
export class BrowserWindows {
  private hosts = new Map<number, Host>();

  private owners = new Map<string, number>();

  private drags = new Map<string, Drag>();

  private reserved = new Map<string, number>();

  private dismissed = new Set<string>();

  private parents = new Map<string, string>();

  private pending = new Map<string, IApp>();

  private commits = new Set<string>();

  private listeners = new Set<() => void>();

  private runtime?: Runtime;

  private clock = 0;

  private reconciling = false;

  private queued = false;

  private root?: BrowserWindow;

  private readonly create: () => Promise<BrowserWindow>;

  constructor(create: () => Promise<BrowserWindow>) {
    this.create = create;
  }

  private tick() {
    this.clock += 1;
    return this.clock;
  }

  register(
    window: BrowserWindow,
    kind: BrowserWindowKind = 'workspace',
    groups: string[] = [],
    tabs: IApp[] = [],
    selectedId: string | undefined = undefined
  ) {
    if (!this.root || this.root.isDestroyed()) this.root = window;
    const host: Host = {
      window,
      kind,
      groups,
      tabs,
      selectedId,
      layout: empty(),
      stamp: this.tick(),
      stateSignatures: new Map(),
    };
    this.hosts.set(window.id, host);
    const contents = window.webContents;
    const resetStates = () => host.stateSignatures.clear();
    contents.on('did-start-loading', resetStates);
    if (window !== this.root) this.runtime?.chrome?.(window);
    window.on('focus', () => {
      host.stamp = this.tick();
      this.changed();
    });
    window.on('hide', () => this.changed());
    window.on('show', () => this.changed());
    window.on('close', () => {
      if (window === this.root || !this.root || this.root.isDestroyed()) return;
      // Electron must not destroy a group's live pages along with its secondary chrome.
      [...window.contentView.children].forEach((child) => {
        if (
          'webContents' in child &&
          [...this.owners].some(([id]) => this.runtime?.view(id) === child)
        ) {
          window.contentView.removeChildView(child);
          this.root!.contentView.addChildView(child);
        }
      });
    });
    onWindowClosed(window, () => {
      contents.removeListener('did-start-loading', resetStates);
      this.hosts.delete(window.id);
      const removed = [...this.reserved]
        .filter(([, owner]) => owner === window.id)
        .map(([id]) => id);
      removed.forEach((id) => {
        this.reserved.delete(id);
        this.dismissed.add(id);
      });
      host.tabs.forEach((tab) => {
        if (
          ![...this.hosts.values()].some((other) =>
            other.tabs.some((item) => groupKey(item) === groupKey(tab))
          )
        )
          this.parents.delete(groupKey(tab));
      });
      if (removed.length) this.commit([], removed);
      this.changed();
      this.closeHiddenRoot();
    });
    this.changed();
  }

  hasOtherWindows(window: BrowserWindow) {
    return [...this.hosts.values()].some(
      (host) => host.window !== window && !host.window.isDestroyed()
    );
  }

  contains(window: BrowserWindow) {
    return this.hosts.has(window.id);
  }

  isChrome(contents: WebContents) {
    return [...this.hosts.values()].some(
      (host) =>
        !host.window.isDestroyed() && host.window.webContents === contents
    );
  }

  visibleElsewhere(window: BrowserWindow, id: string) {
    return [...this.hosts.values()].some(
      (host) => host.window !== window && this.eligible(host, id)
    );
  }

  private closeHiddenRoot() {
    if (
      this.commits.size === 0 &&
      this.root &&
      !this.root.isDestroyed() &&
      !this.root.isVisible() &&
      this.hosts.size === 1
    )
      this.root.close();
  }

  private commit(tabs: IApp[], remove: string[]) {
    if (!this.root || this.root.isDestroyed()) return;
    const token = randomUUID();
    this.commits.add(token);
    this.root.webContents.send('browser-window-commit', {
      tabs,
      remove,
      token,
    });
  }

  trusted(event: IpcMainEvent | IpcMainInvokeEvent) {
    return [...this.hosts.values()].find(
      (host) =>
        !host.window.isDestroyed() &&
        host.window.webContents === event.sender &&
        event.senderFrame === host.window.webContents.mainFrame
    )?.window;
  }

  allows(window: BrowserWindow, id: string) {
    const host = this.hosts.get(window.id);
    const tab = this.allTabs().find((item) => item.id === id);
    const parent = tab && this.parents.get(groupKey(tab));
    if (
      !host ||
      !tab ||
      isGroupLocked(tab) ||
      (parent && getGroupLocks().locked(parent))
    )
      return false;
    if (host.kind === 'workspace')
      return !this.reserved.has(id) && !this.dismissed.has(id);
    if (host.kind === 'temporary')
      return host.tabs.some((item) => item.id === id);
    return host.groups.includes(groupKey(tab));
  }

  private allTabs() {
    const tabs = new Map<string, IApp>();
    const primary = this.root && this.hosts.get(this.root.id);
    primary?.layout.apps.forEach((tab) => {
      if (!this.reserved.has(tab.id) && !this.dismissed.has(tab.id))
        tabs.set(tab.id, tab);
    });
    this.hosts.forEach((host) =>
      host.layout.apps.forEach((tab) => {
        if (
          !this.reserved.has(tab.id) &&
          !this.dismissed.has(tab.id) &&
          !tabs.has(tab.id)
        )
          tabs.set(tab.id, tab);
      })
    );
    this.hosts.forEach((host) =>
      host.tabs.forEach((tab) => tabs.set(tab.id, tab))
    );
    this.pending.forEach((tab) => tabs.set(tab.id, tab));
    return [...tabs.values()];
  }

  snapshot(window: BrowserWindow): BrowserWindowState {
    const host = this.hosts.get(window.id);
    if (!host) throw new Error('This browser window is no longer available.');
    return {
      id: window.id,
      kind: host.kind,
      ...(isPrivateSession(window.webContents.session) && { private: true }),
      groupIds: host.groups,
      tabs: host.tabs,
      reservedIds: [...this.reserved.keys(), ...this.dismissed],
      pendingTabs: [...this.pending.values()],
      parentGroups: Object.fromEntries(this.parents),
      selectedId: host.selectedId,
    };
  }

  setLayout(window: BrowserWindow, layout: BrowserLayout, prepared = false) {
    const host = this.hosts.get(window.id);
    if (!host || !isBrowserLayout(layout)) return;
    if (!layout.suspended && host.pendingOverlay) {
      host.overlayGeneration = (host.overlayGeneration || 0) + 1;
      host.pendingOverlay = undefined;
    }
    if (layout.suspended && !host.layout.suspended && !prepared) {
      if (host.pendingOverlay) {
        host.pendingOverlay = layout;
        return;
      }
      host.pendingOverlay = layout;
      const generation = (host.overlayGeneration || 0) + 1;
      host.overlayGeneration = generation;
      Promise.all(host.layout.visible.map(slot => {
        const view = this.runtime?.view(slot.id);
        if (!view) return Promise.resolve([]);
        return captureNativeViewSnapshots(slot.id, this.runtime?.snapshotViews?.(slot.id, window) ?? [{view}], {bounds:slot, useSlotBounds:this.host(slot.id) !== window});
      }))
        .then(async (frames) => {
          if (
            window.isDestroyed() ||
            host.overlayGeneration !== generation ||
            !host.pendingOverlay
          )
            return undefined;
          await presentSnapshots(
            window,
            frames.flat().filter(
              (frame): frame is NonNullable<typeof frame> =>
                !!frame && this.allows(window, frame.id)
            ),
            undefined,
            80,
          );
          if (
            window.isDestroyed() ||
            host.overlayGeneration !== generation ||
            !host.pendingOverlay
          )
            return undefined;
          const pending = host.pendingOverlay;
          host.pendingOverlay = undefined;
          this.setLayout(window, pending, true);
          return undefined;
        })
        .catch(() => {
          if (host.overlayGeneration === generation)
            host.pendingOverlay = undefined;
        });
      return;
    }
    host.layout = {
      ...layout,
      visible: layout.visible.map(({ id, x, y, width, height }) => ({
        id,
        x,
        y,
        width,
        height,
      })),
    };
    if (host.kind === 'groups')
      host.groups = [
        ...new Set([...host.groups, ...layout.apps.map(groupKey)]),
      ];
    if (window === this.root)
      this.dismissed.forEach((id) => {
        if (!layout.apps.some((tab) => tab.id === id))
          this.dismissed.delete(id);
      });
    if (window === this.root)
      layout.apps.forEach((tab) => {
        const pending = this.pending.get(tab.id);
        if (
          pending &&
          groupKey(pending) === groupKey(tab) &&
          loginProfileKey(pending) === loginProfileKey(tab)
        )
          this.pending.delete(tab.id);
      });
    this.changed();
    if (layout.suspended && layout.nativeOverlayToken !== undefined && !window.isDestroyed())
      window.webContents.send('browser-native-overlay-ready', {surface:'page', token:layout.nativeOverlayToken});
    if (layout.sidebarOverlay && layout.sidebarOverlayToken !== undefined && !window.isDestroyed())
      window.webContents.send('browser-sidebar-overlay-ready', layout.sidebarOverlayToken);
  }

  resize(window: BrowserWindow, slots: BrowserLayout['visible']) {
    const host = this.hosts.get(window.id);
    if (!host || host.layout.suspended || slots.length !== host.layout.visible.length) return undefined;
    const ids = new Set(host.layout.visible.map(slot => slot.id));
    if (new Set(slots.map(slot => slot.id)).size !== ids.size || slots.some(slot => !ids.has(slot.id) || !this.allows(window, slot.id))) return undefined;
    host.layout = { ...host.layout, visible: slots.map(slot => ({ ...slot })) };
    return host.layout.visible;
  }

  private eligible(host: Host, id: string) {
    return (
      !host.window.isDestroyed() &&
      host.window.isVisible() &&
      !host.layout.suspended &&
      host.layout.visible.some((slot) => slot.id === id) &&
      this.allows(host.window, id)
    );
  }

  mergedLayout(): BrowserLayout {
    const apps = this.allTabs().filter((tab) => {
      const parent = this.parents.get(groupKey(tab));
      return !parent || !getGroupLocks().locked(parent);
    });
    const visible: BrowserLayout['visible'] = [];
    let focusedId: string | undefined;
    apps.forEach((tab) => {
      const choices = [...this.hosts.values()]
        .filter((host) => this.eligible(host, tab.id))
        .sort((a, b) => b.stamp - a.stamp);
      const owner = choices[0];
      if (!owner) {
        this.owners.delete(tab.id);
        return;
      }
      this.owners.set(tab.id, owner.window.id);
      const slot = owner.layout.visible.find((item) => item.id === tab.id)!;
      visible.push(slot);
      if (owner.layout.focusedId === tab.id && owner.window.isFocused())
        focusedId = tab.id;
    });
    if (!focusedId) {
      const recent = [...this.hosts.values()]
        .sort((a, b) => b.stamp - a.stamp)
        .find(
          (host) =>
            host.layout.focusedId && this.eligible(host, host.layout.focusedId)
        );
      focusedId = recent?.layout.focusedId;
    }
    return { apps, visible, focusedId, suspended: false };
  }

  isSidebarHidden(window: BrowserWindow) {
    const host = this.hosts.get(window.id);
    return !!host?.layout.sidebarHidden && !host.layout.suspended;
  }

  host(id: string) {
    return this.hosts.get(this.owners.get(id) || -1)?.window || this.root!;
  }

  parent(view: WebContentsView) {
    return [...this.hosts.values()].find(
      (host) =>
        !host.window.isDestroyed() &&
        host.window.contentView.children.includes(view)
    )?.window;
  }

  place(id: string, view: WebContentsView) {
    const target = this.host(id);
    const old = this.parent(view);
    if (target && !target.isDestroyed() && old !== target) {
      old?.contentView.removeChildView(view);
      target.contentView.addChildView(view);
    }
  }

  remove(view: WebContentsView) {
    this.parent(view)?.contentView.removeChildView(view);
  }

  broadcast(channel: string, payload: unknown) {
    this.hosts.forEach(({ window }) => {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    });
  }

  sendToTab(id: string, request: BrowserTabRequest) {
    this.host(id).webContents.send('browser-tab-request', request);
  }

  updateState(state: BrowserState) {
    const signature = JSON.stringify(state);
    this.hosts.forEach((host) => {
      const tab = host.tabs.find((item) => item.id === state.id);
      if (tab)
        Object.assign(tab, {
          url: state.url || tab.url,
          name: state.title || tab.name,
          icon: state.icon || tab.icon,
        });
      // Cache per renderer: a newly opened window must receive its first state,
      // even when an existing window already has the same live tab state.
      if (!host.window.isDestroyed() && host.stateSignatures.get(state.id) !== signature) {
        host.stateSignatures.set(state.id, signature);
        host.window.webContents.send('browser-state', state);
      }
    });
  }

  forgetState(id: string) {
    this.hosts.forEach((host) => host.stateSignatures.delete(id));
  }

  locksChanged() {
    this.hosts.forEach((host) => {
      host.stateSignatures.clear();
      host.overlayGeneration = (host.overlayGeneration || 0) + 1;
      host.pendingOverlay = undefined;
    });
    this.broadcast('browser-snapshots', []);
    this.broadcast('browser-window-mirrors', []);
    this.changed();
  }

  attach(runtime: Runtime) {
    this.runtime = runtime;
    this.hosts.forEach((host) => {
      if (host.window !== this.root) runtime.chrome?.(host.window);
    });
    return () => {
      this.runtime = undefined;
    };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed() {
    if (this.reconciling) {
      this.queued = true;
      return;
    }
    this.reconciling = true;
    // Capture before reparenting. A mirror is never another independently loading page.
    const revision = this.tick();
    this.hosts.forEach((host) => {
      const state = this.snapshot(host.window);
      const signature = JSON.stringify(state);
      if (signature !== host.signature) {
        host.signature = signature;
        host.window.webContents.send('browser-window-state', state);
      }
      const slots =
        host.window.isVisible() && !host.layout.suspended
          ? host.layout.visible.filter((slot) =>
              [...this.hosts.values()].some(
                (other) =>
                  other !== host &&
                  other.stamp > host.stamp &&
                  this.eligible(other, slot.id)
              )
            )
          : [];
      Promise.all(
        slots.map(async (slot) => {
          const view = this.runtime?.view(slot.id);
          if (!view || view.webContents.isDestroyed()) return undefined;
          try {
            const image = await view.webContents.capturePage();
            return { ...slot, image: image.toDataURL(), shared: true };
          } catch {
            return undefined;
          }
        })
      )
        .then((frames) => {
          if (revision !== this.clock || host.window.isDestroyed())
            return undefined;
          const mirrors = frames.filter(
            (frame) => frame && this.host(frame.id) !== host.window
          );
          host.window.webContents.send('browser-window-mirrors', mirrors);
          return undefined;
        })
        .catch(() => {});
    });
    this.listeners.forEach((listener) => listener());
    this.reconciling = false;
    if (this.queued) {
      this.queued = false;
      queueMicrotask(() => this.changed());
    }
  }

  async open(source: BrowserWindow, kind: BrowserWindowKind, id?: string) {
    const sourceHost = this.hosts.get(source.id)!;
    const tab = id
      ? this.allTabs().find((item) => item.id === id && this.allows(source, id))
      : undefined;
    if (id && !tab)
      throw new Error('This tab is locked or is no longer in this window.');
    // Build the destination completely before removing anything from the source.
    const destination = await this.create();
    if (source.isDestroyed()) {
      destination.destroy();
      throw new Error('The source window closed.');
    }
    if (kind === 'temporary' && tab) {
      const newGroup = randomUUID();
      const detached = {
        ...tab,
        sessionId: newGroup,
        sessionProfileId: loginProfileKey(tab),
        protectionGroupId:
          tab.protectionGroupId ||
          (getGroupLocks().snapshot().protected.includes(groupKey(tab))
            ? groupKey(tab)
            : undefined),
        sessionName: tab.customName || tab.name,
        sessionSlug: undefined,
        sessionHomeURL: undefined,
        browserEmail: undefined,
        browserEmails: undefined,
        sessionIconEmoji: undefined,
        sessionIconImage: undefined,
        folderId: undefined,
        pinned: false,
        favorite: false,
        tabPinned: false,
        archived: false,
        openerTabId: undefined,
      };
      this.reserved.set(tab.id, destination.id);
      this.parents.set(
        newGroup,
        this.parents.get(groupKey(tab)) || groupKey(tab)
      );
      sourceHost.tabs = sourceHost.tabs.filter((item) => item.id !== tab.id);
      this.register(destination, kind, [newGroup], [detached], tab.id);
    } else if (kind === 'groups' && tab && sourceHost.kind === 'temporary') {
      const tabs = sourceHost.tabs.filter(
        (item) => groupKey(item) === groupKey(tab)
      );
      sourceHost.tabs = sourceHost.tabs.filter(
        (item) => groupKey(item) !== groupKey(tab)
      );
      tabs.forEach((item) => {
        if (this.reserved.has(item.id))
          this.reserved.set(item.id, destination.id);
      });
      this.register(destination, 'temporary', [groupKey(tab)], tabs, tab.id);
    } else {
      this.register(
        destination,
        kind,
        tab ? [groupKey(tab)] : [],
        [],
        tab?.id || sourceHost.layout.focusedId
      );
    }
    destination.show();
    destination.focus();
    if (kind === 'temporary' && tab) {
      const sibling = this.allTabs().find(
        (item) =>
          item.id !== tab.id &&
          groupKey(item) === groupKey(tab) &&
          this.allows(source, item.id)
      );
      if (sibling)
        source.webContents.send('browser-tab-request', {
          action: 'select',
          id: sibling.id,
        });
    }
    if (sourceHost.kind === 'temporary' && sourceHost.tabs.length === 0)
      source.close();
    return destination;
  }

  async request(window: BrowserWindow, request: BrowserWindowRequest) {
    if (!isBrowserWindowRequest(request))
      throw new Error('Invalid browser window request.');
    const host = this.hosts.get(window.id)!;
    if (request.action === 'commit-complete') {
      if (window !== this.root)
        throw new Error('Only the saved workspace can commit tab changes.');
      const state = this.snapshot(window);
      this.commits.delete(request.token);
      this.closeHiddenRoot();
      return state;
    }
    if (request.action === 'status') return this.snapshot(window);
    if (request.action === 'new-window')
      return this.snapshot(await this.open(window, 'workspace'));
    if (request.action === 'open-tab' || request.action === 'open-group')
      return this.snapshot(
        await this.open(
          window,
          request.action === 'open-tab' ? 'temporary' : 'groups',
          request.id
        )
      );
    if (request.action === 'begin-drag') {
      if (
        !this.allows(window, request.id) ||
        !/^[a-f0-9-]{36}$/i.test(request.token)
      )
        throw new Error('Invalid tab drag.');
      this.drags.forEach((drag, token) => {
        if (drag.expires < Date.now() || drag.source === window.id)
          this.drags.delete(token);
      });
      this.drags.set(request.token, {
        source: window.id,
        id: request.id,
        kind: request.kind,
        expires: Date.now() + 60000,
        point: screen.getCursorScreenPoint(),
      });
    }
    if (request.action === 'cancel-drag') {
      if (this.drags.get(request.token)?.source === window.id)
        this.drags.delete(request.token);
    }
    if (request.action === 'finish-drag') {
      const drag = this.drags.get(request.token);
      if (drag?.source === window.id) {
        this.drags.delete(request.token);
        const point = screen.getCursorScreenPoint();
        const inside = [...this.hosts.values()].some(
          ({ window: candidate }) => {
            if (candidate.isDestroyed() || !candidate.isVisible()) return false;
            const bounds = candidate.getBounds();
            return (
              point.x >= bounds.x &&
              point.y >= bounds.y &&
              point.x < bounds.x + bounds.width &&
              point.y < bounds.y + bounds.height
            );
          }
        );
        if (
          !request.cancelled &&
          !inside &&
          drag.expires >= Date.now() &&
          Math.hypot(point.x - drag.point.x, point.y - drag.point.y) > 20
        )
          await this.open(
            window,
            drag.kind === 'tab' ? 'temporary' : 'groups',
            drag.id
          );
      }
    }
    if (request.action === 'temporary-tabs') {
      if (
        host.kind !== 'temporary' ||
        !isBrowserLayout({ apps: request.tabs, visible: [] })
      )
        throw new Error('Invalid temporary workspace.');
      const original = new Map(host.tabs.map((tab) => [tab.id, tab]));
      host.tabs = request.tabs
        .filter((tab) => !tab.archived)
        .map((tab) => {
          const previous = original.get(tab.id);
          // Tab edits cannot silently switch a temporary tab into another login profile.
          if (previous && loginProfileKey(previous) !== loginProfileKey(tab))
            throw new Error('Keep the original tab session.');
          return { ...tab, pinned: false, favorite: false };
        });
      host.groups = [...new Set(host.tabs.map(groupKey))];
      const removed = [...original.keys()].filter(
        (id) =>
          !host.tabs.some((tab) => tab.id === id) &&
          this.reserved.get(id) === window.id
      );
      removed.forEach((id) => {
        this.reserved.delete(id);
        this.dismissed.add(id);
      });
      if (removed.length) this.commit([], removed);
      this.changed();
    }
    if (request.action === 'drop') {
      const drag = this.drags.get(request.token);
      if (!drag || drag.expires < Date.now() || drag.source === window.id)
        throw new Error('This tab drag has ended.');
      const source = this.hosts.get(drag.source);
      const tab =
        source &&
        this.allTabs().find(
          (item) => item.id === drag.id && this.allows(source.window, item.id)
        );
      if (!source || !tab)
        throw new Error('The source tab is no longer available.');
      const target = request.targetId
        ? this.allTabs().find(
            (item) =>
              item.id === request.targetId && this.allows(window, item.id)
          )
        : undefined;
      if (request.targetId && !target)
        throw new Error('The destination group is unavailable.');
      const items =
        drag.kind === 'group'
          ? this.allTabs().filter((item) => groupKey(item) === groupKey(tab))
          : [tab];
      let group: string = randomUUID();
      if (drag.kind === 'group') group = groupKey(tab);
      else if (target && loginProfileKey(target) === loginProfileKey(tab))
        group = groupKey(target);
      const moved = items.map((item) => ({
        ...item,
        sessionId: group,
        sessionProfileId: loginProfileKey(item),
        protectionGroupId:
          item.protectionGroupId ||
          (getGroupLocks()
            .snapshot()
            .protected.includes(this.parents.get(groupKey(item)) || '')
            ? this.parents.get(groupKey(item))
            : undefined),
        sessionName:
          target && groupKey(target) === group
            ? target.sessionName
            : item.sessionName,
        spaceId: target?.spaceId || item.spaceId,
        folderId: target?.folderId,
        favorite: drag.kind === 'group' ? item.favorite : false,
        pinned: drag.kind === 'group' ? item.pinned : false,
        openerTabId: undefined,
      }));
      this.drags.delete(request.token);
      source.tabs = source.tabs.filter(
        (item) => !moved.some((entry) => entry.id === item.id)
      );
      moved.forEach((item) => {
        this.reserved.delete(item.id);
        if (host.kind === 'temporary') {
          host.tabs.push(item);
          this.reserved.set(item.id, window.id);
        } else this.pending.set(item.id, item);
      });
      if (host.kind === 'groups') host.groups.push(group);
      host.selectedId = moved[0].id;
      if (host.kind !== 'temporary') this.commit(moved, []);
      this.changed();
      window.webContents.send('browser-tab-request', {
        action: 'select',
        id: moved[0].id,
      });
      if (
        (source.kind === 'temporary' && source.tabs.length === 0) ||
        (drag.kind === 'group' && source.kind === 'groups')
      )
        source.window.close();
    }
    return this.snapshot(window);
  }
}

let manager: BrowserWindows | undefined;
const privateManagers = new Map<import('electron').Session, BrowserWindows>();
export const getBrowserWindows = (window?: BrowserWindow) =>
  window?.isDestroyed() ? undefined : window && isPrivateSession(window.webContents.session)
    ? privateManagers.get(window.webContents.session)
    : manager;
export function registerPrivateBrowserWindow(
  window: BrowserWindow,
  create: () => Promise<BrowserWindow>
) {
  const target = window.webContents.session;
  let privateManager = privateManagers.get(target);
  if (!privateManager) {
    privateManager = new BrowserWindows(create);
    privateManagers.set(target, privateManager);
  }
  privateManager.register(window, 'temporary');
  onWindowClosed(window, () => {
    if (!privateManager!.hasOtherWindows(window))
      privateManagers.delete(target);
  });
  return privateManager;
}
export function registerBrowserWindows(create: () => Promise<BrowserWindow>) {
  manager = new BrowserWindows(create);
  ipcMain.handle('browser-window-request', async (event, value: unknown) => {
    const owner = [...privateManagers.values(), manager!].find((candidate) =>
      candidate.trusted(event)
    );
    const window = owner?.trusted(event);
    if (
      !window ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      JSON.stringify(value).length > 2097152
    )
      throw new Error('Untrusted browser window request.');
    const request = value as BrowserWindowRequest;
    if (!isBrowserWindowRequest(request))
      throw new Error('Unknown window action.');
    return owner!.request(window, request);
  });
  getGroupLocks().subscribe(() => manager?.locksChanged());
  return manager;
}

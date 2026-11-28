/** @jest-environment node */
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import { screen } from 'electron';
import { BrowserWindows } from '../main/browserWindows';
import { isBrowserWindowRequest } from '../browser/windows';
import type { IApp } from '../types';

jest.mock('electron', () => ({
  screen: { getCursorScreenPoint: jest.fn(() => ({ x: 100, y: 100 })) },
  ipcMain: { handle: jest.fn() },
}));
const locked = new Set<string>();
jest.mock('../main/groupLocks', () => ({
  isGroupLocked: (tab: IApp) =>
    locked.has(tab.sessionId || '') || locked.has(tab.protectionGroupId || ''),
  getGroupLocks: () => ({
    locked: (id: string) => locked.has(id),
    snapshot: () => ({ protected: [...locked] }),
    subscribe: () => () => {},
  }),
}));
let serial = 0;
function host() {
  let visible = true;
  let destroyed = false;
  serial += 1;
  const window = Object.assign(new EventEmitter(), {
    id: serial,
    webContents: Object.assign(new EventEmitter(), {
      mainFrame: {},
      send: jest.fn(),
      executeJavaScript: jest.fn(async () => {}),
    }),
    contentView: {
      children: [] as unknown[],
      addChildView: jest.fn(),
      removeChildView: jest.fn(),
    },
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isFocused: () => visible,
    getBounds: () => ({ x: 0, y: 0, width: 500, height: 400 }),
    show: () => {
      visible = true;
      window.emit('show');
    },
    hide: () => {
      visible = false;
      window.emit('hide');
    },
    focus: () => window.emit('focus'),
    close: () => {
      window.emit('close');
      destroyed = true;
      window.emit('closed');
    },
    destroy: () => {
      destroyed = true;
      window.emit('closed');
    },
  });
  return window as unknown as BrowserWindow;
}
const tab = (id: string, patch: Partial<IApp> = {}): IApp => ({
  id,
  sessionId: 'parent',
  sessionProfileId: 'shared-profile',
  name: id,
  url: 'https://example.com',
  icon: '',
  pinned: true,
  favorite: true,
  ...patch,
});
const layout = (apps: IApp[], selected = apps[0]?.id) => ({
  apps,
  focusedId: selected,
  visible: selected
    ? [{ id: selected, x: 220, y: 80, width: 700, height: 600 }]
    : [],
});
function fixture() {
  const root = host();
  const created: BrowserWindow[] = [];
  const create = jest.fn(async () => {
    const window = host();
    created.push(window);
    return window;
  });
  const windows = new BrowserWindows(create);
  windows.register(root);
  windows.setLayout(root, layout([tab('one'), tab('two')]));
  return { root, windows, created, create };
}
beforeEach(() => {
  locked.clear();
  jest.clearAllMocks();
  (screen.getCursorScreenPoint as jest.Mock).mockReturnValue({
    x: 100,
    y: 100,
  });
});
it('detaches a single tab into a temporary unpinned group with its original profile', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-tab', id: 'one' });
  const state = windows.snapshot(created[0]);
  expect(state.kind).toBe('temporary');
  expect(state.tabs).toHaveLength(1);
  expect(state.tabs[0]).toMatchObject({
    id: 'one',
    sessionProfileId: 'shared-profile',
    pinned: false,
    favorite: false,
  });
  expect(state.tabs[0].sessionId).not.toBe('parent');
  expect(windows.snapshot(root).reservedIds).toContain('one');
  expect(windows.allows(root, 'one')).toBe(false);
  expect(windows.allows(created[0], 'one')).toBe(true);
});
it('opens complete groups and Command+N workspaces without copying tab IDs', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-group', id: 'one' });
  expect(windows.snapshot(created[0])).toMatchObject({
    kind: 'groups',
    groupIds: ['parent'],
    tabs: [],
  });
  await windows.request(root, { action: 'new-window' });
  expect(windows.snapshot(created[1]).kind).toBe('workspace');
  expect(windows.mergedLayout().apps.map((item) => item.id)).toEqual([
    'one',
    'two',
  ]);
});
it('hands the same native view to the newly focused window', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-group', id: 'one' });
  const second = created[0];
  windows.setLayout(second, layout([tab('one'), tab('two')]));
  expect(windows.mergedLayout().visible).toHaveLength(1);
  expect(windows.host('one')).toBe(second);
  root.focus();
  windows.mergedLayout();
  expect(windows.host('one')).toBe(root);
});
it('captures palette backgrounds per window and discards frames after the overlay closes', async () => {
  const { root, windows } = fixture();
  const capturePage = jest.fn(async () => ({
    toDataURL: () => 'data:image/png;base64,frame',
  }));
  windows.attach({
    view: () =>
      ({ webContents: { isDestroyed: () => false, capturePage } } as any),
    state: () => undefined,
  });
  windows.setLayout(root, {
    ...layout([tab('one')]),
    suspended: true,
    visible: [],
  });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(root.webContents.send).toHaveBeenCalledWith('browser-snapshots', [
    expect.objectContaining({
      id: 'one',
      image: 'data:image/png;base64,frame',
    }),
  ]);
  windows.setLayout(root, layout([tab('one')]));
  (root.webContents.send as jest.Mock).mockClear();
  windows.setLayout(root, {
    ...layout([tab('one')]),
    suspended: true,
    visible: [],
  });
  windows.setLayout(root, layout([tab('one')]));
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(
    (root.webContents.send as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'browser-snapshots'
    )
  ).toEqual([]);
});
it('keeps a detached tab protected when its parent locks later', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-tab', id: 'one' });
  expect(windows.allows(created[0], 'one')).toBe(true);
  locked.add('parent');
  windows.locksChanged();
  expect(windows.allows(created[0], 'one')).toBe(false);
  await expect(
    windows.request(created[0], { action: 'open-tab', id: 'one' })
  ).rejects.toThrow('locked');
  locked.clear();
  windows.locksChanged();
  expect(windows.allows(created[0], 'one')).toBe(true);
});
it('drag-back into the parent restores group membership and retains cookies', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-tab', id: 'one' });
  const token = randomUUID();
  await windows.request(created[0], {
    action: 'begin-drag',
    token,
    kind: 'tab',
    id: 'one',
  });
  await windows.request(root, { action: 'drop', token, targetId: 'two' });
  expect(windows.snapshot(root).pendingTabs[0]).toMatchObject({
    id: 'one',
    sessionId: 'parent',
    sessionProfileId: 'shared-profile',
  });
  expect(windows.snapshot(root).reservedIds).not.toContain('one');
  expect(root.webContents.send).toHaveBeenCalledWith(
    'browser-window-commit',
    expect.objectContaining({
      tabs: expect.arrayContaining([
        expect.objectContaining({ id: 'one', sessionId: 'parent' }),
      ]),
    })
  );
  await expect(
    windows.request(root, { action: 'drop', token })
  ).rejects.toThrow('ended');
});
it('keeps a different login profile in its own group when dropping onto it', async () => {
  const { root, windows, created } = fixture();
  windows.setLayout(
    root,
    layout([
      tab('one'),
      tab('other', { sessionId: 'other', sessionProfileId: 'other-profile' }),
    ])
  );
  await windows.request(root, { action: 'open-tab', id: 'one' });
  const token = randomUUID();
  await windows.request(created[0], {
    action: 'begin-drag',
    token,
    kind: 'tab',
    id: 'one',
  });
  await windows.request(root, { action: 'drop', token, targetId: 'other' });
  const moved = windows.snapshot(root).pendingTabs[0];
  expect(moved.sessionProfileId).toBe('shared-profile');
  expect(moved.sessionId).not.toBe('other');
});
it('waits for persistence before closing the hidden root and never resurrects dismissed tabs', async () => {
  const { root, windows, created } = fixture();
  await windows.request(root, { action: 'open-tab', id: 'one' });
  root.hide();
  created[0].close();
  expect(root.isDestroyed()).toBe(false);
  expect(windows.mergedLayout().apps.map((item) => item.id)).not.toContain(
    'one'
  );
  const commit = (root.webContents.send as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'browser-window-commit'
  )[1];
  expect(commit.remove).toEqual(['one']);
  await windows.request(root, {
    action: 'commit-complete',
    token: commit.token,
  });
  expect(root.isDestroyed()).toBe(true);
});
it('does not create a window for Escape or an internal drag cancellation', async () => {
  const { root, windows, create } = fixture();
  const token = randomUUID();
  await windows.request(root, {
    action: 'begin-drag',
    token,
    kind: 'tab',
    id: 'one',
  });
  (screen.getCursorScreenPoint as jest.Mock).mockReturnValue({
    x: 900,
    y: 900,
  });
  await windows.request(root, {
    action: 'finish-drag',
    token,
    cancelled: true,
  });
  expect(create).not.toHaveBeenCalled();
});
it('rejects locked groups, foreign renderer frames and malformed requests', async () => {
  const { root, windows, create } = fixture();
  locked.add('parent');
  await expect(
    windows.request(root, { action: 'open-tab', id: 'one' })
  ).rejects.toThrow('locked');
  expect(create).not.toHaveBeenCalled();
  expect(
    windows.trusted({ sender: root.webContents, senderFrame: {} } as any)
  ).toBeUndefined();
  expect(
    windows.trusted({
      sender: root.webContents,
      senderFrame: root.webContents.mainFrame,
    } as any)
  ).toBe(root);
  [
    null,
    {},
    { action: 'begin-drag', id: 'one', token: randomUUID(), kind: 'script' },
    { action: 'finish-drag', token: randomUUID(), cancelled: 'yes' },
    { action: 'open-tab', id: {} },
  ].forEach((value) => expect(isBrowserWindowRequest(value)).toBe(false));
});

it('keeps the live page visible until its snapshot is painted and cancels stale handoffs', async () => {
  const { root, windows } = fixture();
  let painted!: () => void;
  (root.webContents.executeJavaScript as jest.Mock).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        painted = resolve;
      })
  );
  windows.attach({
    view: () =>
      ({
        webContents: {
          isDestroyed: () => false,
          capturePage: async () => ({
            toDataURL: () => 'data:image/png;base64,frame',
          }),
        },
      } as any),
    state: () => undefined,
  });
  windows.setLayout(root, {
    ...layout([tab('one')]),
    suspended: true,
    visible: [],
  });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(windows.mergedLayout().visible).toHaveLength(1);
  painted();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(windows.mergedLayout().visible).toHaveLength(0);
  windows.setLayout(root, layout([tab('one')]));
  windows.setLayout(root, {
    ...layout([tab('one')]),
    suspended: true,
    visible: [],
  });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  windows.setLayout(root, layout([tab('one')]));
  painted();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(windows.mergedLayout().visible).toHaveLength(1);
});

it('resizes only current visible tabs without reapplying workspace metadata', () => {
  const { root, windows } = fixture();
  const changed = jest.fn();
  windows.subscribe(changed);
  const before = windows.snapshot(root);
  const slots = [{ id: 'one', x: 220, y: 80, width: 450, height: 600 }];
  expect(windows.resize(root, slots)).toEqual(slots);
  expect(windows.mergedLayout().visible).toEqual(slots);
  expect(windows.snapshot(root).tabs).toEqual(before.tabs);
  expect(changed).not.toHaveBeenCalled();
  expect(windows.resize(root, [{ ...slots[0], id: 'two' }])).toBeUndefined();
  expect(windows.resize(root, [slots[0], slots[0]])).toBeUndefined();
  expect(windows.mergedLayout().visible).toEqual(slots);
});

it('rejects resize updates after the visible group locks', () => {
  const { root, windows } = fixture();
  locked.add('parent');
  expect(windows.resize(root, [{ id: 'one', x: 220, y: 80, width: 450, height: 600 }])).toBeUndefined();
});

it('suppresses repeated tab state per renderer while retaining new windows and reloads', () => {
  const { windows, root } = fixture();
  const state = { id: 'one', url: 'https://example.com', title: 'One' } as any;
  root.webContents.send = jest.fn();
  windows.updateState(state);
  for (let index = 0; index < 100; index += 1) windows.updateState({ ...state });
  expect(root.webContents.send).toHaveBeenCalledTimes(1);
  const second = host();
  windows.register(second);
  (second.webContents.send as jest.Mock).mockClear();
  windows.updateState({ ...state });
  expect(root.webContents.send).toHaveBeenCalledTimes(1);
  expect(second.webContents.send).toHaveBeenCalledWith('browser-state', state);
  (root.webContents as unknown as EventEmitter).emit('did-start-loading');
  windows.updateState({ ...state });
  expect(root.webContents.send).toHaveBeenCalledTimes(2);
  windows.updateState({ ...state, loading: true });
  expect(root.webContents.send).toHaveBeenCalledTimes(3);
  windows.forgetState('one');
  windows.updateState({ ...state, loading: true });
  expect(root.webContents.send).toHaveBeenCalledTimes(4);
  windows.locksChanged();
  (root.webContents.send as jest.Mock).mockClear();
  windows.updateState({ ...state, loading: true });
  expect(root.webContents.send).toHaveBeenCalledWith('browser-state', { ...state, loading: true });
});


it.each(['sidebar', 'popup', 'dialog'])('reveals a %s overlay after the capture deadline without applying a late frame', async kind => {
  jest.useFakeTimers();
  const { root, windows } = fixture();
  let resolveCapture!: (image: any) => void;
  windows.attach({ view: () => ({ webContents: { isDestroyed: () => false,
    capturePage: () => new Promise(resolve => { resolveCapture = resolve; }),
  } } as any), state: () => undefined });
  windows.setLayout(root, { ...layout([tab('one')]), ...(kind === 'sidebar' ? {sidebarOverlay:true,sidebarOverlayToken:7} : kind === 'popup' ? {nativeOverlayToken:7} : {}), suspended: true, visible: [] });
  try {
    await jest.advanceTimersByTimeAsync(80);
    expect(windows.mergedLayout().visible).toHaveLength(0);
    expect(root.webContents.send).toHaveBeenCalledWith('browser-snapshots', []);
    if (kind !== 'dialog') expect(root.webContents.send).toHaveBeenCalledWith(kind === 'sidebar' ? 'browser-sidebar-overlay-ready' : 'browser-native-overlay-ready', kind === 'sidebar' ? 7 : {surface:'page',token:7});
    (root.webContents.send as jest.Mock).mockClear();
    windows.setLayout(root, layout([tab('one')]));
    resolveCapture({ toDataURL: () => 'late frame' });
    await Promise.resolve(); await Promise.resolve();
    expect(root.webContents.send).not.toHaveBeenCalledWith('browser-snapshots', expect.anything());
    expect(windows.mergedLayout().visible).toHaveLength(1);
  } finally { jest.useRealTimers(); }
});


it.each(['sidebar', 'popup'])('does not acknowledge a %s overlay that closes during snapshot preparation', async kind => {
  const { root, windows } = fixture();
  let finish!: (value: any) => void;
  windows.attach({ view: () => ({ webContents: { isDestroyed: () => false,
    capturePage: () => new Promise(resolve => { finish = resolve; }),
  } } as any), state: () => undefined });
  windows.setLayout(root, { ...layout([tab('one')]), ...(kind === 'sidebar' ? {sidebarOverlay:true,sidebarOverlayToken:12} : {nativeOverlayToken:12}), suspended: true, visible: [] });
  windows.setLayout(root, layout([tab('one')]));
  finish({ toDataURL: () => 'cancelled frame' });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(root.webContents.send).not.toHaveBeenCalledWith(kind === 'sidebar' ? 'browser-sidebar-overlay-ready' : 'browser-native-overlay-ready', kind === 'sidebar' ? 12 : {surface:'page',token:12});
  expect(windows.mergedLayout().visible).toHaveLength(1);
});


it('includes docked surfaces in the same owning-tab snapshot and retains their actual bounds', async () => {
  const {root,windows}=fixture();
  const source=(bounds:any,image:string)=>({getBounds:()=>bounds,getVisible:()=>true,webContents:{isDestroyed:()=>false,capturePage:jest.fn().mockResolvedValue({toDataURL:()=>image})}} as any);
  const page=source({x:0,y:60,width:500,height:640},'page');
  const inspector=source({x:506,y:92,width:300,height:608},'tools');
  const snapshotViews=jest.fn(()=>[{view:page},{view:inspector,surface:'devtools' as const}]);
  windows.attach({view:()=>page,state:()=>undefined,snapshotViews});
  windows.setLayout(root,layout([tab('one')]));
  windows.setLayout(root,{...layout([tab('one')]),suspended:true,nativeOverlayToken:1,visible:[]});
  await new Promise<void>(resolve=>setImmediate(resolve));
  expect(snapshotViews).toHaveBeenCalledWith('one',root);
  expect(root.webContents.send).toHaveBeenCalledWith('browser-snapshots',[
    expect.objectContaining({id:'one',width:500,image:'page'}),
    expect.objectContaining({id:'one',surface:'devtools',x:506,width:300,image:'tools'}),
  ]);
  expect(root.webContents.send).toHaveBeenCalledWith('browser-native-overlay-ready',{surface:'page',token:1});
});

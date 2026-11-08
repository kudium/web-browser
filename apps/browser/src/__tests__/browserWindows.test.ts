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
    webContents: { mainFrame: {}, send: jest.fn() },
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

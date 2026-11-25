import {
  SidebarPanelRegistry,
  registerSidebarPanelWindow,
} from '../main/sidebarPanels';
import { EventEmitter } from 'events';
import type { BrowserWindow, WebContentsView } from 'electron';

const mockHandle = jest.fn();
const mockCaptureFallback = jest.fn().mockResolvedValue('fallback');
jest.mock('../main/aiScreenshot', () => ({ capturePagePNG: (...args: unknown[]) => mockCaptureFallback(...args) }));
jest.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
  BrowserWindow: jest.fn(),
}));

function fixture() {
  const frame = {};
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 1000, height: 700 }),
    contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
    webContents: Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      send: jest.fn(),
      executeJavaScript: jest.fn().mockResolvedValue(undefined),
    }),
  });
  const views: any[] = [];
  const createView = jest.fn(() => {
    const view = {
      setVisible: jest.fn(),
      setBounds: jest.fn(),
      setBorderRadius: jest.fn(),
      webContents: Object.assign(new EventEmitter(), {
        isDestroyed: () => false,
        close: jest.fn(),
        capturePage: jest.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,fixture' }),
      }),
    };
    views.push(view);
    return view as unknown as WebContentsView;
  });
  const host = new SidebarPanelRegistry(window as unknown as BrowserWindow);
  return { host, window, views, createView };
}

test('group targeting resolves through the trusted host and restores Auto when a group disappears', () => {
  const { host } = fixture();
  const target = jest.fn();
  host.setTargets(
    [{ id: 'work', title: 'Work', profileId: 'work-profile' }],
    target,
  );
  host.setTarget('work');
  expect(target).toHaveBeenLastCalledWith('work');
  expect(host.state().targetGroup).toBe('work');
  expect(() => host.setTarget('foreign')).toThrow('unavailable');
  host.setTargets([], target);
  expect(target).toHaveBeenLastCalledWith(undefined);
  expect(host.state().targetGroup).toBeUndefined();
});

test('reselecting a panel immediately reuses its last viewport without losing native content', () => {
  const { host, views, createView } = fixture();
  host.register({
    info: { id: 'extension', title: 'Extension', kind: 'extension' },
    contentKey: 'v1',
    createView,
  });
  host.activate('extension');
  host.layout('extension', { x: 600, y: 50, width: 400, height: 650 });
  host.layout('extension', null);
  host.activate('extension');
  expect(createView).toHaveBeenCalledTimes(1);
  expect(views[0].setBorderRadius).toHaveBeenLastCalledWith(8);
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  expect(host.state().openRequest).toBe(2);
});

test('revealing a hook returns to Auto and lets navigation leave its group', () => {
  const { host, createView } = fixture();
  const target = jest.fn(id => host.setSession(undefined, id || 'work'));
  host.setTargets([{ id: 'other', title: 'Other', profileId: 'other-profile' }], target);
  host.setTarget('other');
  host.register({
    info: { id: 'url-result', title: 'URL breakdown', kind: 'hook' },
    groupId: 'work', contentKey: 'v1', createView,
    available: () => (host.targetGroup || host.activeGroup) === 'work',
  });
  expect(() => host.activate('url-result')).toThrow(/unavailable/);
  host.activate('url-result', true, 'work');
  expect(host.state().targetGroup).toBeUndefined();
  expect(target).toHaveBeenLastCalledWith(undefined);
  expect(host.state().activeId).toBe('url-result');
  expect(host.state().openRequest).toBe(1);
  host.layout('url-result', { x: 600, y: 50, width: 400, height: 650 });
  expect(createView).toHaveBeenCalledTimes(1);
  host.setSession(undefined, 'other');
  expect(host.state().activeId).toBeUndefined();
  host.activate('url-result', true, 'work');
  expect(host.activeGroup).toBe('other');
  expect(host.state().openRequest).toBe(1);
  expect(host.state().targetGroup).toBeUndefined();
  expect(() => host.activate('unknown', true, 'work')).toThrow(/unavailable/);
});

test('restoring selection does not take over another sidebar page', () => {
  const { host, createView } = fixture();
  host.register({
    info: { id: 'extension', title: 'Extension', kind: 'extension' },
    contentKey: 'v1',
    createView,
  });
  host.activate('extension', false);
  expect(host.state().activeId).toBe('extension');
  expect(host.state().openRequest).toBe(0);
});

test('feature panels share a stable view, resize safely and hide behind workspace overlays', async () => {
  const { host, views, createView } = fixture();
  host.register({
    info: { id: 'hook-output', title: 'Hook output', kind: 'hook' },
    contentKey: 'v1',
    createView,
  });
  host.activate('hook-output');
  host.layout('hook-output', { x: 700, y: 100, width: 300, height: 600 });
  host.layout('hook-output', { x: 600, y: 100, width: 400, height: 600 });
  expect(createView).toHaveBeenCalledTimes(1);
  expect(views[0].setBounds).toHaveBeenLastCalledWith({
    x: 600,
    y: 100,
    width: 400,
    height: 600,
  });
  host.setSuspended(true);
  expect(views[0].webContents.capturePage).toHaveBeenLastCalledWith(undefined, { stayHidden: true, stayAwake: true });
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.state().snapshot?.image).toBe('data:image/png;base64,fixture');
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.setSuspended(false);
  expect(host.state().snapshot).toBeUndefined();
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  host.layout('hook-output', null);
  host.setSuspended(true);
  host.setSuspended(false);
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.close();
  host.layout('hook-output', { x: 700, y: 100, width: 300, height: 600 });
  expect(createView).toHaveBeenCalledTimes(1);
  expect(host.state().activeId).toBeUndefined();
});

test('invalid geometry and unavailable panels cannot create content', () => {
  const { host, createView } = fixture();
  let available = false;
  host.register({
    info: { id: 'extension', title: 'Extension', kind: 'extension' },
    contentKey: 'v1',
    available: () => available,
    createView,
  });
  expect(host.state().panels).toEqual([]);
  expect(() => host.activate('extension')).toThrow(/unavailable/);
  available = true;
  host.activate('extension');
  for (const bounds of [
    { x: -300, y: 0, width: 300, height: 500 },
    { x: 1000, y: 0, width: 500, height: 500 },
    { x: 700, y: 0, width: NaN, height: 500 },
  ])
    host.layout('extension', bounds);
  host.layout('not-registered', { x: 700, y: 0, width: 300, height: 500 });
  expect(createView).not.toHaveBeenCalled();
});

test('a selected panel still renders when its CSS slot extends three pixels below the window', () => {
  const { host, window, views, createView } = fixture();
  window.getContentBounds = () => ({ width: 1514, height: 684 });
  host.register({
    info: { id: 'muse', title: 'Muse', kind: 'extension' },
    contentKey: 'muse',
    createView,
  });
  host.activate('muse');
  host.layout('muse', { x: 855, y: 73, width: 650, height: 614 });
  expect(createView).toHaveBeenCalledTimes(1);
  expect(views[0].setBounds).toHaveBeenLastCalledWith({
    x: 855,
    y: 73,
    width: 650,
    height: 611,
  });
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  host.layout('muse', null);
  host.activate('muse');
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
});

test('tab-scoped panels follow availability without requesting another sidebar takeover', () => {
  const { host, createView, views } = fixture();
  let tab = 1;
  for (const n of [1, 2])
    host.register({
      info: { id: `tab-${n}`, title: 'Extension', kind: 'extension' },
      groupId: 'one-extension',
      contentKey: `${n}`,
      available: () => tab === n,
      createView,
    });
  host.activate('tab-1');
  host.layout('tab-1', { x: 700, y: 100, width: 300, height: 600 });
  tab = 2;
  host.refresh();
  expect(host.state().activeId).toBe('tab-2');
  expect(host.state().openRequest).toBe(1);
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.layout('tab-2', { x: 700, y: 100, width: 300, height: 600 });
  host.remove('tab-2');
  expect(views[1].webContents.close).toHaveBeenCalled();
  host.dispose();
  expect(views[0].webContents.close).toHaveBeenCalled();
});

test('sidebar IPC accepts only the registered window main frame', () => {
  const { window } = fixture();
  registerSidebarPanelWindow(window as unknown as BrowserWindow);
  const handler = mockHandle.mock.calls.find(
    ([channel]) => channel === 'browser-sidebar-panels',
  )[1];
  expect(() =>
    handler(
      { sender: window.webContents, senderFrame: {} },
      { action: 'list' },
    ),
  ).toThrow(/Untrusted/);
  expect(() =>
    handler(
      { sender: {}, senderFrame: window.webContents.mainFrame },
      { action: 'list' },
    ),
  ).toThrow(/Untrusted/);
  expect(
    handler(
      { sender: window.webContents, senderFrame: window.webContents.mainFrame },
      { action: 'list' },
    ),
  ).toEqual({
    panels: [],
    targets: [],
    targetGroup: undefined,
    openRequest: 0,
    activeId: undefined,
    floating: false,
  });
  window.emit('closed');
});


test('main-window overlays do not blank an undocked panel, including on resize', async () => {
  const { host, views, createView } = fixture();
  const child = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    setMenu: jest.fn(), focus: jest.fn(), show: jest.fn(), destroy: jest.fn(),
    loadURL: jest.fn().mockResolvedValue(undefined),
    getContentBounds: () => ({ width: 520, height: 720 }),
    contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
    webContents: Object.assign(new EventEmitter(), { setWindowOpenHandler: jest.fn() }),
  });
  (require('electron').BrowserWindow as jest.Mock).mockImplementation(() => child);
  host.register({ info: { id: 'extension', title: 'Extension', kind: 'extension' }, contentKey: 'v1', createView });
  host.activate('extension');
  host.layout('extension', { x: 700, y: 100, width: 300, height: 600 });
  host.setSuspended(true);
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.state().snapshot?.image).toBe('data:image/png;base64,fixture');
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.undock();
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  host.setSuspended(true);
  child.emit('resize');
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  expect(createView).toHaveBeenCalledTimes(1);
  host.dock();
  host.layout('extension', { x: 700, y: 100, width: 300, height: 600 });
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.setSuspended(false);
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
  host.dispose();
});


test('a pinned panel never overrides a foreground group change', () => {
  const { host } = fixture();
  const target = jest.fn();
  host.setTargets([
    { id: 'personal', title: 'Personal', profileId: 'shared' },
    { id: 'work', title: 'Work', profileId: 'shared' },
  ], target);
  host.followFocusedGroup('personal');
  host.setTarget('work');
  host.followFocusedGroup('personal');
  expect(host.targetGroup).toBe('work');
  host.followFocusedGroup('work');
  expect(host.targetGroup).toBe('work');
  host.followFocusedGroup('personal');
  expect(host.targetGroup).toBeUndefined();
  expect(target).toHaveBeenLastCalledWith(undefined);
  target.mockClear();
  host.followFocusedGroup('personal');
  expect(target).not.toHaveBeenCalled();
});

test('replaces a shown hook document at its current bounds without a duplicate renderer layout or resize flash', () => {
  const { host, views, createView } = fixture();
  const info = { id: 'hook-output', title: 'Output', kind: 'hook' as const };
  host.register({ info, contentKey: 'first-document', createView });
  host.activate(info.id);
  const bounds = { x: 700, y: 100, width: 300, height: 600 };
  host.layout(info.id, bounds);
  host.setSuspended(true);
  host.register({ info, contentKey: 'updated-document', createView });
  expect(createView).toHaveBeenCalledTimes(2);
  expect(views[0].webContents.close).toHaveBeenCalled();
  expect(views[1].setBounds).toHaveBeenLastCalledWith(bounds);
  expect(views[1].setVisible).toHaveBeenLastCalledWith(false);
  host.setSuspended(false);
  expect(views[1].setVisible).toHaveBeenLastCalledWith(true);
});


test.each(['dismiss', 'switch', 'dispose'])(
  'a pending panel capture cannot hide or reveal stale content after %s', async action => {
    const { host, views, createView } = fixture();
    for (const id of ['one', 'two']) host.register({ info: { id, title: id, kind: 'hook' }, contentKey: id, createView });
    host.activate('one');
    const bounds = { x: 600, y: 100, width: 400, height: 600 };
    host.layout('one', bounds);
    let finish!: (image: { toDataURL: () => string }) => void;
    views[0].webContents.capturePage.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    host.setSuspended(true);
    host.layout('one', bounds);
    expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
    if (action === 'dismiss') host.setSuspended(false);
    else if (action === 'switch') host.activate('two');
    else host.dispose();
    finish({ toDataURL: () => 'data:image/png;base64,stale' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.state().snapshot).toBeUndefined();
    if (action === 'dismiss') expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
    if (action === 'switch') expect(views[1].setVisible).toHaveBeenLastCalledWith(false);
  },
);


test('compositor capture failures use the shared fallback without losing panel state', async () => {
  const { host, views, createView } = fixture();
  host.register({ info: { id: 'one', title: 'One', kind: 'hook' }, contentKey: 'one', createView });
  host.activate('one');
  host.layout('one', { x: 600, y: 100, width: 400, height: 600 });
  views[0].webContents.capturePage.mockRejectedValueOnce(new Error('UnknownVizError'));
  host.setSuspended(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(mockCaptureFallback).toHaveBeenCalledWith(views[0].webContents, expect.any(AbortSignal));
  expect(host.state().snapshot?.image).toBe('data:image/png;base64,fallback');
  host.setSuspended(false);
  expect(host.state().snapshot).toBeUndefined();
  expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
});

test('manages only available registered providers without activating or recreating views', async () => {
  const { window, createView } = fixture();
  const registry = new SidebarPanelRegistry(window as unknown as BrowserWindow);
  const manage = jest.fn();
  registry.register({ info: { id: 'gallery', title: 'Gallery', kind: 'hook' }, contentKey: 'gallery', createView, manage });
  expect(registry.state().panels[0].canManage).toBe(true);
  await registry.manage('gallery');
  expect(manage).toHaveBeenCalledTimes(1);
  expect(createView).not.toHaveBeenCalled();
  await expect(registry.manage('foreign')).rejects.toThrow('unavailable');
  registry.register({ info: { id: 'gallery', title: 'Gallery', kind: 'hook' }, contentKey: 'gallery', createView, manage, available: () => false });
  await expect(registry.manage('gallery')).rejects.toThrow('unavailable');
  expect(manage).toHaveBeenCalledTimes(1);
});

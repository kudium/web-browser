import {
  SidebarPanelRegistry,
  registerSidebarPanelWindow,
  sidebarPanelsFor,
  suspendSidebarPanels,
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

function fixture(independent = false) {
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
    let bounds = { x: 0, y: 0, width: 0, height: 0 };
    let visible = false;
    const view = {
      getVisible: () => visible,
      getBounds: () => bounds,
      setVisible: jest.fn(value => { visible = value; }),
      setBounds: jest.fn(value => { bounds = value; }),
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
  const host = new SidebarPanelRegistry(window as unknown as BrowserWindow, independent);
  return { host, window, views, createView };
}

test.each(['dispose', 'replace', 'layout', 'suspend'])(
  'a destroyed native panel with cleared webContents is safe during %s', async action => {
    const { host, views, createView } = fixture();
    const provider = { info: { id: 'one', title: 'One', kind: 'hook' as const }, contentKey: 'v1', createView };
    const bounds = { x: 600, y: 50, width: 400, height: 650 };
    host.register(provider);
    host.activate('one');
    host.layout('one', bounds);
    const contents = views[0].webContents;
    Object.defineProperty(views[0], 'webContents', { value: undefined });
    if (action === 'dispose') expect(() => host.dispose()).not.toThrow();
    else if (action === 'replace') expect(() => host.register({ ...provider, contentKey: 'v2' })).not.toThrow();
    else if (action === 'layout') expect(() => host.layout('one', bounds)).not.toThrow();
    else await expect(host.setSuspended(true)).resolves.toBeUndefined();
    expect(contents.close).not.toHaveBeenCalled();
    if (action === 'replace' || action === 'layout') expect(createView).toHaveBeenCalledTimes(2);
    host.dispose();
  },
);

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
    openedPanels: [],
    targets: [],
    canGoBack: false,
    canGoForward: false,
    snapshot: undefined,
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

test('panel history returns to retained views and discards forward history after a new selection', () => {
  const { host, createView } = fixture();
  for (const id of ['a', 'b', 'c']) host.register({ info: { id, title: id, kind: 'hook' }, contentKey: id, createView });
  host.activate('a'); host.layout('a', { x: 600, y: 50, width: 400, height: 650 });
  expect(host.state().canGoBack).toBe(false);
  host.activate('b'); host.activate('b');
  expect(createView).toHaveBeenCalledTimes(2);
  host.navigate(-1);
  expect(host.state()).toMatchObject({ activeId: 'a', canGoBack: false, canGoForward: true });
  expect(createView).toHaveBeenCalledTimes(2);
  host.navigate(1);
  expect(host.state()).toMatchObject({ activeId: 'b', canGoBack: true, canGoForward: false });
  host.navigate(-1); host.activate('c');
  expect(host.state()).toMatchObject({ activeId: 'c', canGoBack: true, canGoForward: false });
  host.navigate(-1); expect(host.state().activeId).toBe('a');
  host.navigate(1); expect(host.state().activeId).toBe('c');
});
test('panel history skips removed and out-of-group providers and survives closing', () => {
  const { host, createView } = fixture(); let available = true;
  for (const id of ['a', 'b', 'c']) host.register({ info: { id, title: id, kind: 'hook' }, contentKey: id, createView, available: () => id !== 'b' || available });
  host.activate('a'); host.activate('b'); host.activate('c');
  available = false;
  host.navigate(-1); expect(host.state().activeId).toBe('a');
  host.navigate(1); expect(host.state().activeId).toBe('c');
  host.remove('a');
  expect(host.state().canGoBack).toBe(false);
  host.close(); expect(host.state().canGoBack).toBe(true);
  host.navigate(-1); expect(host.state().activeId).toBe('c');
});

test('does not repeat native bounds or visibility updates for an unchanged panel layout', () => {
  const { host, views, createView } = fixture();
  host.register({ info: { id:'stable', title:'Stable', kind:'hook' }, contentKey:'one', createView });
  host.activate('stable');
  const bounds = { x:700, y:100, width:300, height:600 };
  host.layout('stable', bounds);
  views[0].setBounds.mockClear(); views[0].setVisible.mockClear(); views[0].setBorderRadius.mockClear();
  host.layout('stable', bounds); host.layout('stable', bounds);
  expect(views[0].setBounds).not.toHaveBeenCalled();
  expect(views[0].setVisible).not.toHaveBeenCalled();
  expect(views[0].setBorderRadius).not.toHaveBeenCalled();
  host.layout('stable', { ...bounds, x:690 });
  expect(views[0].setBounds).toHaveBeenCalledTimes(1);
});


test('bounds a stalled popup capture, reuses pending preparation, and discards late panel pixels', async () => {
  jest.useFakeTimers();
  const {host,views,createView}=fixture();
  host.register({info:{id:'one',title:'One',kind:'hook'},contentKey:'one',createView});
  host.activate('one');
  host.layout('one',{x:600,y:100,width:400,height:600});
  let finish!: (image:any)=>void;
  views[0].webContents.capturePage.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  try {
    const pending=host.setSuspended(true,true);
    expect(host.setSuspended(true,true)).toBe(pending);
    expect(views[0].getVisible()).toBe(true);
    await jest.advanceTimersByTimeAsync(80);
    await pending;
    expect(views[0].getVisible()).toBe(false);
    expect(host.state().snapshot).toBeUndefined();
    await host.setSuspended(false);
    finish({toDataURL:()=> 'data:image/png;base64,late'});
    await jest.advanceTimersByTimeAsync(0);
    expect(views[0].getVisible()).toBe(true);
    expect(host.state().snapshot).toBeUndefined();
  } finally {host.dispose();jest.useRealTimers();}
});


test('acknowledges panel readiness after the native view hides and cancels stale popup requests', async () => {
  const {window,views,createView}=fixture();
  const owner=window as unknown as BrowserWindow;
  registerSidebarPanelWindow(owner);
  const host=sidebarPanelsFor(owner);
  host.register({info:{id:'one',title:'One',kind:'hook'},contentKey:'one',createView});
  host.activate('one');host.layout('one',{x:600,y:100,width:400,height:600});
  let finish!: (image:any)=>void;
  views[0].webContents.capturePage.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  suspendSidebarPanels(owner,true,7);
  expect(window.webContents.send).not.toHaveBeenCalledWith('browser-native-overlay-ready',{surface:'panel',token:7});
  suspendSidebarPanels(owner,false);
  finish({toDataURL:()=> 'data:image/png;base64,stale'});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(window.webContents.send).not.toHaveBeenCalledWith('browser-native-overlay-ready',{surface:'panel',token:7});
  expect(views[0].getVisible()).toBe(true);
  suspendSidebarPanels(owner,true,8);
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(views[0].getVisible()).toBe(false);
  expect(window.webContents.send).toHaveBeenCalledWith('browser-native-overlay-ready',{surface:'panel',token:8});
  window.emit('closed');
});

test('independent native panels keep separate views, geometry and close/reopen state', () => {
  const { host, views, createView } = fixture(true);
  for (const id of ['extension-a', 'hook-b']) host.register({ info: { id, title: id, kind: 'feature' }, contentKey: 'v1', createView });
  host.activate('extension-a');
  host.layout('extension-a', { x: 300, y: 50, width: 300, height: 600 });
  host.activate('hook-b');
  host.layout('hook-b', { x: 610, y: 50, width: 300, height: 600 });
  expect(host.state().openedPanels?.map(panel => panel.id)).toEqual(['extension-a', 'hook-b']);
  expect(views.every(view => view.getVisible())).toBe(true);
  const secondBounds = views[1].getBounds();
  host.layout('extension-a', { x: 200, y: 50, width: 400, height: 600 });
  expect(views[1].getBounds()).toBe(secondBounds);
  host.close('extension-a');
  expect(host.state().openedPanels?.map(panel => panel.id)).toEqual(['hook-b']);
  expect(views[0].getVisible()).toBe(false);
  expect(views[1].getVisible()).toBe(true);
  expect(views[0].webContents.close).not.toHaveBeenCalled();
  host.activate('extension-a');
  expect(views[0].getVisible()).toBe(false);
  host.layout('extension-a', { x: 200, y: 50, width: 400, height: 600 });
  expect(createView).toHaveBeenCalledTimes(2);
  expect(views.every(view => view.getVisible())).toBe(true);
  host.layout('foreign', { x: 0, y: 0, width: 100, height: 100 });
  expect(createView).toHaveBeenCalledTimes(2);
});

test('independent native content replacement and availability changes affect only their owner', () => {
  const { host, views, createView } = fixture(true);
  let available = true;
  const provider = { info: { id: 'first', title: 'First', kind: 'extension' as const }, contentKey: 'v1', createView, available: () => available };
  host.register(provider);
  host.register({ info: { id: 'second', title: 'Second', kind: 'hook' }, contentKey: 'v1', createView });
  for (const id of ['first', 'second']) { host.activate(id); host.layout(id, { x: 300, y: 50, width: 300, height: 600 }); }
  host.register({ ...provider, contentKey: 'v2' });
  expect(views[0].webContents.close).toHaveBeenCalledTimes(1);
  expect(views[1].webContents.close).not.toHaveBeenCalled();
  expect(views[1].getVisible()).toBe(true);
  expect(createView).toHaveBeenCalledTimes(3);
  available = false;
  host.refresh();
  expect(host.state().openedPanels?.map(panel => panel.id)).toEqual(['second']);
  expect(views[2].getVisible()).toBe(false);
  expect(() => host.activate('first')).toThrow(/unavailable/);
  host.remove('first');
  expect(views[2].webContents.close).toHaveBeenCalledTimes(1);
  expect(views[1].getVisible()).toBe(true);
});

test('parallel panel suspension obeys the capture deadline and ignores late captures after cancellation', async () => {
  jest.useFakeTimers();
  const { host, views, createView } = fixture(true);
  for (const id of ['first', 'second']) {
    host.register({ info: { id, title: id, kind: 'feature' }, contentKey: 'v1', createView });
    host.activate(id); host.layout(id, { x: 300, y: 50, width: 300, height: 600 });
  }
  const resolve: Array<(value: unknown) => void> = [];
  views.forEach(view => view.webContents.capturePage.mockImplementation(() => new Promise(done => resolve.push(done))));
  const work = host.setSuspended(true, true);
  expect(resolve).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(81);
  await work;
  expect(views.every(view => !view.getVisible())).toBe(true);
  await host.setSuspended(false, true);
  resolve.forEach(done => done({ toDataURL: () => 'late snapshot' }));
  await jest.advanceTimersByTimeAsync(100);
  expect(views.every(view => view.getVisible())).toBe(true);
  expect(host.state().openedPanels?.every(panel => !panel.snapshot)).toBe(true);
  host.dispose();
  jest.useRealTimers();
});

test('tab-specific documents follow their logical extension panel while unrelated native panels remain open', () => {
  const { host, views, createView } = fixture(true);
  let tab = 'first';
  for (const id of ['first', 'second']) host.register({ info: { id, key: 'logical-extension', title: 'Extension', kind: 'extension' }, groupId: 'extension-owner', contentKey: id, createView, available: () => tab === id });
  host.register({ info: { id: 'unrelated', title: 'Other extension', kind: 'extension' }, contentKey: 'v1', createView });
  host.activate('first'); host.layout('first', { x: 300, y: 50, width: 300, height: 600 });
  host.activate('unrelated'); host.layout('unrelated', { x: 610, y: 50, width: 300, height: 600 });
  tab = 'second'; host.refresh();
  expect(host.state().openedPanels?.map(panel => panel.id)).toEqual(['second', 'unrelated']);
  expect(views[0].getVisible()).toBe(false);
  expect(views[1].getVisible()).toBe(true);
  host.layout('second', { x: 300, y: 50, width: 300, height: 600 });
  expect(createView).toHaveBeenCalledTimes(3);
  tab = 'first'; host.refresh();
  host.layout('first', { x: 300, y: 50, width: 300, height: 600 });
  expect(createView).toHaveBeenCalledTimes(3);
  expect(views[0].getVisible()).toBe(true);
  expect(views[1].getVisible()).toBe(true);
});

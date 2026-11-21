import {
  SidebarPanelRegistry,
  registerSidebarPanelWindow,
} from '../main/sidebarPanels';
import { EventEmitter } from 'events';
import type { BrowserWindow, WebContentsView } from 'electron';

const mockHandle = jest.fn();
jest.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
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
    }),
  });
  const views: any[] = [];
  const createView = jest.fn(() => {
    const view = {
      setVisible: jest.fn(),
      setBounds: jest.fn(),
      webContents: Object.assign(new EventEmitter(), {
        isDestroyed: () => false,
        close: jest.fn(),
      }),
    };
    views.push(view);
    return view as unknown as WebContentsView;
  });
  const host = new SidebarPanelRegistry(window as unknown as BrowserWindow);
  return { host, window, views, createView };
}

test('feature panels share a stable view, resize safely and hide behind workspace overlays', () => {
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
  expect(views[0].setVisible).toHaveBeenLastCalledWith(false);
  host.setSuspended(false);
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
    { x: -1, y: 0, width: 300, height: 500 },
    { x: 700, y: 0, width: 500, height: 500 },
    { x: 700, y: 0, width: NaN, height: 500 },
  ])
    host.layout('extension', bounds);
  host.layout('not-registered', { x: 700, y: 0, width: 300, height: 500 });
  expect(createView).not.toHaveBeenCalled();
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
    openRequest: 0,
    activeId: undefined,
    floating: false,
  });
  window.emit('closed');
});

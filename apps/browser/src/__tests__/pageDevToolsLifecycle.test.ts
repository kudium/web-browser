/** @jest-environment node */
import { EventEmitter } from 'events';
import type { WebContents } from 'electron';

const mockViews: any[] = [];
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  WebContentsView: jest.fn().mockImplementation(() => {
    let destroyed = false;
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: () => destroyed,
      close: jest.fn(() => { view.destroy(); }),
    });
    const view = {
      webContents: contents,
      setVisible: jest.fn(),
      getVisible: () => true,
      getBounds: () => ({}),
      setBounds: jest.fn(),
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        view.webContents = undefined as any;
        contents.emit('destroyed');
      },
    };
    mockViews.push(view);
    return view;
  }),
}));
const { PageDevTools } = require('../main/pageDevTools') as typeof import('../main/pageDevTools');

beforeEach(() => { mockViews.length = 0; });

it.each(['right', 'bottom', 'panel'] as const)(
  'releases the %s inspector when its native contents disappear before the page closes', async mode => {
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isDevToolsOpened: () => false,
      closeDevTools: jest.fn(),
      setDevToolsWebContents: jest.fn(),
      openDevTools: jest.fn(),
    }) as unknown as WebContents;
    const changed = jest.fn();
    const removePanel = jest.fn();
    const manager = new PageDevTools(changed, () => removePanel);
    await manager.open(contents, mode);
    const tools = mockViews[0].webContents;
    changed.mockClear();
    expect(() => mockViews[0].destroy()).not.toThrow();
    expect(manager.mode(contents)).toBeUndefined();
    expect(() => manager.snapshotView(contents, {} as any)).not.toThrow();
    expect(contents.listenerCount('destroyed')).toBe(0);
    expect(contents.listenerCount('devtools-closed')).toBe(0);
    expect(tools.listenerCount('destroyed')).toBe(0);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(removePanel).toHaveBeenCalledTimes(mode === 'panel' ? 1 : 0);
    expect(() => { manager.close(contents); manager.dispose(); }).not.toThrow();
    await manager.open(contents, mode);
    expect(mockViews).toHaveLength(2);
    manager.dispose();
    expect(mockViews[1].webContents).toBeUndefined();
  },
);

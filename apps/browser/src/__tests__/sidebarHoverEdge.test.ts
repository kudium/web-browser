/** @jest-environment node */
import { EventEmitter } from 'events';
import type { BrowserWindow, WebContentsView } from 'electron';
import { observeSidebarHoverEdge } from '../main/sidebarHoverEdge';

function fixture() {
  const contents = new EventEmitter();
  const send = jest.fn();
  const window = { isDestroyed: () => false, webContents: { send } };
  const enabled = jest.fn(() => true);
  const getBounds = jest.fn(() => ({ x: 8, y: 44, width: 800, height: 600 }));
  const getVisible = jest.fn(() => true);
  const view = { webContents: contents, getBounds, getVisible };
  const stop = observeSidebarHoverEdge(
    view as unknown as WebContentsView,
    () => window as unknown as BrowserWindow,
    enabled,
  );
  const preventDefault = jest.fn();
  const mouse = (input: object) =>
    contents.emit(
      'before-mouse-event',
      { preventDefault },
      { type: 'mouseMove', x: 4, y: 240, ...input },
    );
  return {
    contents,
    send,
    enabled,
    getBounds,
    getVisible,
    stop,
    preventDefault,
    mouse,
  };
}

it('extends the narrow frame to a 16px window edge and coalesces notifications', () => {
  const f = fixture();
  f.mouse({});
  f.mouse({ x: 7, y: 599 });
  expect(f.send.mock.calls).toEqual([['browser-sidebar-hover-edge', true]]);
  f.mouse({ x: 8 });
  expect(f.send.mock.calls[1]).toEqual(['browser-sidebar-hover-edge', false]);
  f.getBounds.mockClear();
  f.mouse({ x: 400 });
  expect(f.getBounds).not.toHaveBeenCalled();
  expect(f.preventDefault).not.toHaveBeenCalled();
});

it('ignores clicks, drags, hidden views, disabled overlays and non-edge views', () => {
  const f = fixture();
  f.mouse({ type: 'mouseDown' });
  f.mouse({ type: 'mouseUp' });
  f.mouse({ modifiers: ['leftbuttondown'] });
  f.enabled.mockReturnValue(false);
  f.mouse({});
  f.enabled.mockReturnValue(true);
  f.getVisible.mockReturnValue(false);
  f.mouse({});
  f.getVisible.mockReturnValue(true);
  f.getBounds.mockReturnValue({ x: 300, y: 44, width: 800, height: 600 });
  f.mouse({});
  expect(f.send).not.toHaveBeenCalled();
  expect(f.preventDefault).not.toHaveBeenCalled();
});

it('validates pointer bounds and removes listeners on destruction or unsubscribe', () => {
  const f = fixture();
  for (const input of [{ x: NaN }, { x: -1 }, { y: -1 }, { y: 600 }])
    f.mouse(input);
  expect(f.send).not.toHaveBeenCalled();
  f.mouse({});
  f.mouse({ type: 'mouseLeave' });
  expect(f.send.mock.calls[1]).toEqual(['browser-sidebar-hover-edge', false]);
  f.contents.emit('destroyed');
  expect(f.contents.listenerCount('before-mouse-event')).toBe(0);
  const other = fixture();
  other.stop();
  expect(other.contents.listenerCount('before-mouse-event')).toBe(0);
  expect(other.contents.listenerCount('destroyed')).toBe(0);
});

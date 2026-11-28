/** @jest-environment node */
import { EventEmitter } from 'events';
import type { BrowserWindow, WebContents } from 'electron';
import { onWindowClosed, windowOwnsContents } from '../main/windowLifecycle';

it('rejects a destroyed window before reading native contents during shutdown', () => {
  const contents = { isDestroyed: () => false } as WebContents;
  const window = { isDestroyed: () => true, get webContents(): never { throw new TypeError('Object has been destroyed'); } } as unknown as BrowserWindow;
  expect(windowOwnsContents(window, contents)).toBe(false);
  expect(windowOwnsContents(null, contents)).toBe(false);
  expect(windowOwnsContents(undefined, contents)).toBe(false);
});

it('accepts only the live contents of the original window', () => {
  const contents = { isDestroyed: jest.fn(() => false) } as unknown as WebContents;
  const window = { isDestroyed: () => false, webContents: contents } as BrowserWindow;
  expect(windowOwnsContents(window, contents)).toBe(true);
  expect(windowOwnsContents(window, { isDestroyed: () => false } as WebContents)).toBe(false);
  (contents.isDestroyed as jest.Mock).mockReturnValue(true);
  expect(windowOwnsContents(window, contents)).toBe(false);
});

it('shares and removes close subscriptions without reading destroyed native properties', () => {
  const window = new EventEmitter() as unknown as BrowserWindow;
  const first = jest.fn(); const second = jest.fn();
  const offFirst = onWindowClosed(window, first);
  const offSecond = onWindowClosed(window, second);
  expect(window.listenerCount('closed')).toBe(1);
  offFirst();
  Object.defineProperty(window, 'webContents', { get: () => { throw new TypeError('Object has been destroyed'); } });
  expect(() => window.emit('closed')).not.toThrow();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(() => { offFirst(); offSecond(); }).not.toThrow();
  expect(window.listenerCount('closed')).toBe(0);
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { rememberWindowSize, restoreWindowSize } from '../main/windowSize';

let directory: string;
let file: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-window-size-'));
  file = path.join(directory, 'size.json');
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  fs.rmSync(directory, { recursive: true, force: true });
});

function makeWindow() {
  return Object.assign(new EventEmitter(), {
    isDestroyed: (): boolean => false,
    isMinimized: (): boolean => false,
    isFullScreen: (): boolean => false,
    isMaximized: (): boolean => false,
    getNormalBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
  });
}

test('remembers a resize and restores it next launch', () => {
  const window = makeWindow();
  rememberWindowSize(window as any, file);
  window.emit('resize');
  jest.advanceTimersByTime(250);
  expect(restoreWindowSize(file, { width: 1800, height: 1200 })).toEqual({
    width: 1000,
    height: 800,
    maximized: false,
  });
});

test('closing flushes the latest size before the debounce finishes', () => {
  const window = makeWindow();
  rememberWindowSize(window as any, file);
  window.emit('resize');
  window.emit('close');
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).width).toBe(1000);
});

test('remembers maximization with the normal size, fitting a smaller display', () => {
  const window = makeWindow();
  window.isMaximized = () => true;
  rememberWindowSize(window as any, file);
  window.emit('maximize');
  jest.advanceTimersByTime(250);
  expect(restoreWindowSize(file, { width: 900, height: 700 })).toEqual({
    width: 900,
    height: 700,
    maximized: true,
  });
});

test.each(['isMinimized', 'isFullScreen'] as const)(
  '%s does not replace the last saved normal size',
  (state) => {
    const window = makeWindow();
    rememberWindowSize(window as any, file);
    window.emit('close');
    window[state] = () => true;
    window.getNormalBounds = () => ({ x: 0, y: 0, width: 1500, height: 1100 });
    window.emit('resize');
    jest.advanceTimersByTime(250);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).width).toBe(1000);
  }
);

test.each(['invalid json', '{"width":-1,"height":950,"maximized":false}'])(
  'invalid saved state falls back to a size that fits the display',
  (saved) => {
    fs.writeFileSync(file, saved);
    expect(restoreWindowSize(file, { width: 1024, height: 768 })).toEqual({
      width: 1024,
      height: 768,
      maximized: false,
    });
  }
);

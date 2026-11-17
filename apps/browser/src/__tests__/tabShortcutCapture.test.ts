import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { defaultShortcuts } from '../browser/shortcuts';
import { captureTabShortcuts } from '../main/tabShortcutCapture';

let bindings = { ...defaultShortcuts };
let changed: () => void;
const stop = jest.fn();
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({ shortcuts: bindings }),
  onBrowserPreferencesChanged: (callback: () => void) => {
    changed = callback;
    return stop;
  },
}));

function setup() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getURL: () => 'https://fixture.test',
    executeJavaScriptInIsolatedWorld: jest.fn(async (_world, scripts) => {
      window.eval(scripts[0].code);
    }),
  });
  return {
    contents,
    dispose: captureTabShortcuts(contents as unknown as WebContents),
  };
}
const key = (
  code: string,
  ctrlKey = true,
  shiftKey = false,
  type = 'keydown',
) => {
  const event = new KeyboardEvent(type, {
    code,
    ctrlKey,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
};
beforeEach(() => {
  bindings = { ...defaultShortcuts };
  stop.mockClear();
});

test('consumes navigation presses while preserving modifier releases and ordinary Tab', () => {
  const { dispose } = setup();
  expect(key('Tab').defaultPrevented).toBe(true);
  expect(key('Tab', true, true).defaultPrevented).toBe(true);
  expect(key('Tab', false).defaultPrevented).toBe(false);
  expect(key('ControlLeft', false, false, 'keyup').defaultPrevented).toBe(
    false,
  );
  dispose();
  expect(key('Tab').defaultPrevented).toBe(false);
  expect(stop).toHaveBeenCalled();
});

test('updates custom bindings and reinstalls once after document navigation', () => {
  const { contents, dispose } = setup();
  bindings = {
    ...defaultShortcuts,
    'next-tab': ['Control+PageDown'],
    'previous-tab': ['Control+PageUp'],
  };
  changed();
  expect(key('Tab').defaultPrevented).toBe(false);
  expect(key('PageDown').defaultPrevented).toBe(true);
  expect(key('PageUp').defaultPrevented).toBe(true);
  contents.emit('dom-ready');
  expect(contents.listenerCount('dom-ready')).toBe(1);
  expect(key('PageDown').defaultPrevented).toBe(true);
  dispose();
  expect(contents.listenerCount('dom-ready')).toBe(0);
});

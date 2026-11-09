import { act, renderHook } from '@testing-library/react';
import {
  useTabSwitcher,
  TAB_SWITCHER_DELAY,
} from '../utils/hooks/useTabSwitcher';
import type { IApp } from '../types';

const tabs = ['one', 'two', 'three'].map((id) => ({
  id,
  name: id,
  url: 'https://example.com',
  icon: '',
  sessionId: id,
})) as IApp[];
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
function setup() {
  const select = jest.fn();
  const hook = renderHook(
    ({ id, items, scope }) => useTabSwitcher(items, id, select, scope),
    {
      initialProps: { id: 'three', items: tabs, scope: 'default' },
    }
  );
  hook.rerender({ id: 'two', items: tabs, scope: 'default' });
  hook.rerender({ id: 'one', items: tabs, scope: 'default' });
  return { ...hook, select };
}
test('quick presses toggle the two most recently active tabs without a dialog', () => {
  const { result, rerender, select } = setup();
  act(() => {
    result.current.handle('tab-switcher-next');
    result.current.handle('tab-switcher-commit');
  });
  expect(select).toHaveBeenLastCalledWith(tabs[1]);
  rerender({ id: 'two', items: tabs, scope: 'default' });
  act(() => {
    result.current.handle('tab-switcher-next');
    result.current.handle('tab-switcher-commit');
  });
  expect(select).toHaveBeenLastCalledWith(tabs[0]);
  act(() => jest.advanceTimersByTime(TAB_SWITCHER_DELAY));
  expect(result.current.shown).toBeUndefined();
});
test('chooser appears after 1.5 seconds and supports reverse navigation', () => {
  const { result, select } = setup();
  act(() => result.current.handle('tab-switcher-next'));
  act(() => jest.advanceTimersByTime(1499));
  expect(result.current.shown).toBeUndefined();
  act(() => jest.advanceTimersByTime(1));
  expect(result.current.shown?.tabs.map((tab) => tab.id)).toEqual([
    'one',
    'two',
    'three',
  ]);
  expect(result.current.shown?.index).toBe(1);
  act(() => result.current.handle('tab-switcher-previous'));
  act(() => result.current.handle('tab-switcher-commit'));
  expect(select).toHaveBeenCalledWith(tabs[0]);
});
test('unloading removes entries and returns to the previous active tab', () => {
  const { result, rerender, select } = setup();
  act(() => result.current.remove(['one']));
  expect(select).toHaveBeenLastCalledWith(tabs[1]);
  rerender({ id: 'two', items: tabs.slice(1), scope: 'default' });
  act(() => result.current.handle('tab-switcher-next'));
  act(() => jest.advanceTimersByTime(TAB_SWITCHER_DELAY));
  expect(result.current.shown?.tabs.map((tab) => tab.id)).toEqual([
    'two',
    'three',
  ]);
});
test('removed or locked tabs cannot be committed', () => {
  const { result, rerender, select } = setup();
  act(() => result.current.handle('tab-switcher-next'));
  rerender({ id: 'one', items: [tabs[0], tabs[2]], scope: 'default' });
  act(() => result.current.handle('tab-switcher-commit'));
  expect(select).not.toHaveBeenCalled();
});
test('Escape and space changes cancel pending navigation', () => {
  const { result, rerender, select } = setup();
  act(() => result.current.handle('tab-switcher-next'));
  act(() => result.current.handle('tab-switcher-cancel'));
  expect(select).not.toHaveBeenCalled();
  act(() => result.current.handle('tab-switcher-next'));
  rerender({ id: 'one', items: tabs, scope: 'other' });
  act(() => jest.advanceTimersByTime(TAB_SWITCHER_DELAY));
  expect(result.current.shown).toBeUndefined();
  expect(select).not.toHaveBeenCalled();
});

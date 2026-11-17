import { act, renderHook } from '@testing-library/react';
import { useChatAutoScroll } from '../utils/hooks/useChatAutoScroll';

let resize: () => void;
const disconnect = jest.fn();
beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(global, {
    ResizeObserver: jest.fn((callback) => {
      resize = callback;
      return { observe: jest.fn(), disconnect };
    }),
  });
  disconnect.mockClear();
});
afterEach(() => jest.useRealTimers());

function setup(active = true) {
  const node = document.createElement('div');
  Object.defineProperties(node, {
    clientHeight: { value: 200 },
    scrollHeight: { value: 1200 },
  });
  node.scrollTo = jest.fn();
  const log = { current: node };
  const follow = { current: false };
  const hook = renderHook(
    ({ visible, id, changing }) =>
      useChatAutoScroll(log, follow, visible, id, changing),
    {
      initialProps: { visible: active, id: 'one', changing: false },
    },
  );
  const frame = () => act(() => jest.advanceTimersByTime(32));
  return { ...hook, node, follow, frame };
}

test('opens at the newest message and resets following when a chat is reopened', () => {
  const test = setup();
  test.frame();
  expect(test.node.scrollTo).toHaveBeenLastCalledWith({
    top: 1200,
    behavior: 'instant',
  });
  test.follow.current = false;
  test.rerender({ visible: false, id: 'one', changing: false });
  test.rerender({ visible: true, id: 'one', changing: false });
  test.frame();
  expect(test.follow.current).toBe(true);
  expect(test.node.scrollTo).toHaveBeenCalledTimes(2);
});

test('resizing and image loading follow only while the user stays at the bottom', () => {
  const test = setup();
  test.frame();
  test.follow.current = false;
  act(() => resize());
  test.node.dispatchEvent(new Event('load'));
  test.frame();
  expect(test.node.scrollTo).toHaveBeenCalledTimes(1);
  test.follow.current = true;
  act(() => resize());
  test.frame();
  expect(test.node.scrollTo).toHaveBeenCalledTimes(2);
});

test('switching conversations resets position once the selected history is ready', () => {
  const test = setup();
  test.frame();
  test.follow.current = false;
  test.rerender({ visible: true, id: 'two', changing: true });
  test.frame();
  expect(test.node.scrollTo).toHaveBeenCalledTimes(1);
  test.rerender({ visible: true, id: 'two', changing: false });
  test.frame();
  expect(test.node.scrollTo).toHaveBeenCalledTimes(2);
});

test('hidden and unmounted panels cancel pending scrolling', () => {
  const test = setup(false);
  test.frame();
  expect(test.node.scrollTo).not.toHaveBeenCalled();
  test.rerender({ visible: true, id: 'one', changing: false });
  test.unmount();
  test.frame();
  expect(test.node.scrollTo).not.toHaveBeenCalled();
});

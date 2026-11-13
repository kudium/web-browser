import { fireEvent, render, screen, act } from '@testing-library/react';
import { browser } from '../browser/client';
import { SidebarPager } from '../components/UI/SidebarPager';

jest.mock('../browser/client', () => ({
  browser: { command: jest.fn(), onSpaceWheel: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  HTMLElement.prototype.getAnimations = jest.fn(() => []);
  HTMLElement.prototype.animate = jest.fn(() => ({
    finished: Promise.resolve(),
    cancel: jest.fn(),
  })) as any;
});
afterEach(() => {
  jest.useRealTimers();
});

function setup() {
  const onSwipe = jest.fn();
  render(
    <SidebarPager page="home" direction={1} onSwipe={onSwipe}>
      <div>Home</div>
    </SidebarPager>
  );
  return { onSwipe, pager: screen.getByLabelText('Sidebar spaces') };
}
it('responds to a deliberate swipe immediately and ignores its momentum', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 25, deltaY: 2 });
  expect(onSwipe).not.toHaveBeenCalled();
  fireEvent.wheel(pager, { deltaX: 30, deltaY: 1 });
  expect(onSwipe).toHaveBeenCalledWith(1);
  fireEvent.wheel(pager, { deltaX: 100, deltaY: 0 });
  act(() => {
    jest.advanceTimersByTime(150);
  });
  expect(onSwipe).toHaveBeenCalledTimes(1);
});
it('keeps a vertical gesture vertical even if it drifts sideways', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 2, deltaY: 40 });
  fireEvent.wheel(pager, { deltaX: 80, deltaY: 5 });
  act(() => {
    jest.advanceTimersByTime(150);
  });
  expect(onSwipe).not.toHaveBeenCalled();
});
it('cancels short swipes and accepts a new deliberate gesture', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 20, deltaY: 0 });
  act(() => {
    jest.advanceTimersByTime(300);
  });
  expect(onSwipe).not.toHaveBeenCalled();
  fireEvent.wheel(pager, { deltaX: -70, deltaY: 0 });
  act(() => {
    jest.advanceTimersByTime(120);
  });
  expect(onSwipe).toHaveBeenCalledWith(-1);
});

it('completes a full-width swipe without waiting for momentum to end', () => {
  const { pager, onSwipe } = setup();
  Object.defineProperty(pager, 'clientWidth', { value: 300 });
  fireEvent.wheel(pager, { deltaX: 300, deltaY: 0 });
  expect(onSwipe).toHaveBeenCalledWith(1);
  fireEvent.wheel(pager, { deltaX: 100, deltaY: 0 });
  act(() => {
    jest.advanceTimersByTime(150);
  });
  expect(onSwipe).toHaveBeenCalledTimes(1);
});
it('does not cancel a horizontal swipe because of later vertical drift', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 0 });
  fireEvent.wheel(pager, { deltaX: 0, deltaY: 100 });
  act(() => {
    jest.advanceTimersByTime(120);
  });
  expect(onSwipe).toHaveBeenCalledWith(1);
});
it('animates a clicked space across the full sidebar width', () => {
  const { rerender } = render(
    <SidebarPager page="home" direction={1} onSwipe={jest.fn()}>
      Home
    </SidebarPager>
  );
  const pager = screen.getByLabelText('Sidebar spaces');
  Object.defineProperty(pager, 'clientWidth', { value: 300 });
  rerender(
    <SidebarPager page="work" direction={1} onSwipe={jest.fn()}>
      Work
    </SidebarPager>
  );
  expect(HTMLElement.prototype.animate).toHaveBeenCalledWith(
    [
      { transform: 'translate3d(300px,0,0)' },
      { transform: 'translate3d(0,0,0)' },
    ],
    expect.objectContaining({ duration: 280 })
  );
});

it('ignores tiny initial vertical noise before a horizontal swipe', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 0, deltaY: 1 });
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 1 });
  expect(onSwipe).toHaveBeenCalledWith(1);
});

it('does not focus on hover, but retains gesture focus through consecutive switches', () => {
  const onSwipe = jest.fn();
  const { rerender } = render(
    <SidebarPager page="home" direction={1} onSwipe={onSwipe}>
      Home
    </SidebarPager>
  );
  const pager = screen.getByLabelText('Sidebar spaces');
  fireEvent.pointerEnter(pager);
  expect(browser.command).not.toHaveBeenCalled();
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 0 });
  expect(browser.command).toHaveBeenCalledWith({
    id: '',
    action: 'focus-chrome',
  });
  expect(onSwipe).toHaveBeenCalledTimes(1);
  rerender(
    <SidebarPager page="work" direction={1} onSwipe={onSwipe}>
      Work
    </SidebarPager>
  );
  expect(browser.command).toHaveBeenCalledTimes(2);
  act(() => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 0 });
  expect(onSwipe).toHaveBeenCalledTimes(2);
  rerender(
    <SidebarPager page="personal" direction={1} onSwipe={onSwipe}>
      Personal
    </SidebarPager>
  );
  expect(browser.command).toHaveBeenCalledTimes(3);
  fireEvent.pointerLeave(pager);
  rerender(
    <SidebarPager page="home" direction={-1} onSwipe={onSwipe}>
      Home
    </SidebarPager>
  );
  expect(browser.command).toHaveBeenCalledTimes(3);
});

it('fallback consumes one wheel burst and accepts a fresh burst without clicks', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 0 });
  for (let index = 0; index < 8; index += 1) {
    act(() => {
      jest.advanceTimersByTime(90);
    });
    fireEvent.wheel(pager, { deltaX: 100, deltaY: 0 });
  }
  expect(onSwipe).toHaveBeenCalledTimes(1);
  act(() => {
    jest.advanceTimersByTime(150);
  });
  fireEvent.wheel(pager, { deltaX: -60, deltaY: 0 });
  expect(onSwipe).toHaveBeenCalledTimes(2);
});
it('does not treat weak residual momentum as another deliberate swipe', () => {
  const { pager, onSwipe } = setup();
  fireEvent.wheel(pager, { deltaX: 60, deltaY: 0 });
  for (let index = 0; index < 10; index += 1) {
    act(() => {
      jest.advanceTimersByTime(50);
    });
    fireEvent.wheel(pager, { deltaX: 1, deltaY: 0 });
  }
  expect(onSwipe).toHaveBeenCalledTimes(1);
});

function nativeSetup() {
  const result = setup();
  const receive = (browser.onSpaceWheel as jest.Mock).mock.calls[0][0];
  jest
    .spyOn(result.pager, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, right: 300, top: 0, bottom: 500 } as DOMRect);
  act(() => {
    receive({ available: true });
  });
  const send = (phase: number, momentum: number, deltaX: number) =>
    act(() => {
      receive({ x: 40, y: 80, phase, momentum, deltaX, deltaY: 0 });
    });
  return { ...result, send };
}
it('native phases consume one swipe and all its momentum, then rearm on the next begin immediately', () => {
  const { send, onSwipe } = nativeSetup();
  send(1, 0, 60);
  expect(onSwipe).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 10; index += 1) {
    send(4, 0, 100);
    act(() => {
      jest.advanceTimersByTime(90);
    });
  }
  send(8, 0, 0);
  send(0, 1, 100);
  for (let index = 0; index < 10; index += 1) {
    send(0, 4, 100);
    act(() => {
      jest.advanceTimersByTime(90);
    });
  }
  send(0, 8, 0);
  expect(onSwipe).toHaveBeenCalledTimes(1);
  send(1, 0, 60);
  send(4, 0, 100);
  send(8, 0, 0);
  expect(onSwipe).toHaveBeenCalledTimes(2);
  send(1, 0, -60);
  send(4, 0, -100);
  send(8, 0, 0);
  expect(onSwipe).toHaveBeenCalledTimes(3);
  expect(onSwipe).toHaveBeenLastCalledWith(-1);
});
it('does not process the DOM copy of a native wheel event twice', () => {
  const { send, pager, onSwipe } = nativeSetup();
  send(1, 0, 60);
  fireEvent.wheel(pager, { deltaX: 100, deltaY: 0 });
  act(() => {
    jest.advanceTimersByTime(400);
  });
  fireEvent.wheel(pager, { deltaX: 100, deltaY: 0 });
  expect(onSwipe).toHaveBeenCalledTimes(1);
});

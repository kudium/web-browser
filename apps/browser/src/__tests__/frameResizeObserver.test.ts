import { frameResizeObserver } from '../utils/frameResizeObserver';

it('defers layout work, coalesces notifications, and cancels on disconnect', () => {
  let notify = () => {};
  const original = global.ResizeObserver;
  global.ResizeObserver = jest.fn(callback => {
    notify = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  }) as any;
  jest.useFakeTimers();
  const request = jest.spyOn(window, 'requestAnimationFrame');
  const cancel = jest.spyOn(window, 'cancelAnimationFrame');
  try {
    const update = jest.fn();
    const observer = frameResizeObserver(update);
    notify();
    notify();
    expect(update).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20);
    expect(update).toHaveBeenCalledTimes(1);
    notify();
    observer.disconnect();
    jest.advanceTimersByTime(20);
    expect(cancel).toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    cancel.mockRestore();
    jest.useRealTimers();
    global.ResizeObserver = original;
  }
});

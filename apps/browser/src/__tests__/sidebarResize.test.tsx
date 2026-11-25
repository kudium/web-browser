import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { SidebarResizeHandle } from '../components/UI/SidebarResizeHandle';

beforeEach(() => {
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: MouseEvent,
  });
  HTMLElement.prototype.setPointerCapture = jest.fn();
});
it.each(['left', 'right'] as const)(
  'continues %s resizing after native view capture loss',
  (side) => {
    const change = jest.fn();
    const resizing = jest.fn();
    const view = render(
      <SidebarResizeHandle
        side={side}
        width={300}
        onChange={change}
        onResizingChange={resizing}
      />
    );
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, { button: 0, clientX: 300 });
    fireEvent.lostPointerCapture(handle);
    fireEvent.pointerMove(window, { clientX: 420 });
    fireEvent.pointerUp(window, { clientX: 420 });
    expect(change).toHaveBeenLastCalledWith(side === 'left' ? 420 : 240);
    expect(resizing).toHaveBeenLastCalledWith(false);
    change.mockClear();
    view.unmount();
    fireEvent.pointerMove(window, { clientX: 440 });
    expect(change).not.toHaveBeenCalled();
  }
);

it('coalesces drag bursts to one update per frame and flushes the final pointer position', () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  const request = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++next, callback); return next; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const change = jest.fn();
  const view = render(<SidebarResizeHandle width={300} onChange={change} onResizingChange={jest.fn()} />);
  const handle = screen.getByRole('separator');
  fireEvent.pointerDown(handle, { button: 0, clientX: 300 });
  for (const clientX of [310, 320, 330]) fireEvent.pointerMove(handle, { clientX });
  expect(change).not.toHaveBeenCalled();
  expect(callbacks.size).toBe(1);
  const callback = [...callbacks.values()][0]; callbacks.clear(); callback(16);
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenLastCalledWith(330);
  fireEvent.pointerMove(window, { clientX: 340 });
  fireEvent.pointerUp(window, { clientX: 350 });
  expect(change).toHaveBeenCalledTimes(2);
  expect(change).toHaveBeenLastCalledWith(350);
  expect(callbacks.size).toBe(0);
  view.unmount(); request.mockRestore(); cancel.mockRestore();
});

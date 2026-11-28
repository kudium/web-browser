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

it('resizes bottom-docked tools with the vertical keyboard splitter', () => {
  const change=jest.fn();
  render(<SidebarResizeHandle width={240} side="right" axis="vertical" label="Resize Developer Tools" minWidth={120} maxWidth={450} onChange={change} onResizingChange={jest.fn()}/>);
  const handle=screen.getByRole('separator',{name:'Resize Developer Tools'});
  expect(handle).toHaveAttribute('aria-orientation','horizontal');
  fireEvent.keyDown(handle,{key:'ArrowUp'});
  expect(change).toHaveBeenLastCalledWith(250);
  fireEvent.keyDown(handle,{key:'ArrowDown'});
  expect(change).toHaveBeenLastCalledWith(230);
});

it('updates the live layout per frame and commits React state only on release', () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  const request = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++next, callback); return next; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const target = document.createElement('div');
  const change = jest.fn();
  const liveChange = jest.fn();
  const view = render(<SidebarResizeHandle width={300} side="right" minWidth={240} maxWidth={800}
    liveResize={{ target: { current: target }, property: '--ai-sidebar-width' }} onLiveChange={liveChange}
    onChange={change} onResizingChange={jest.fn()} />);
  const handle = screen.getByRole('separator');
  fireEvent.pointerDown(handle, { button: 0, clientX: 800 });
  fireEvent.pointerMove(window, { clientX: 700 });
  const callback = [...callbacks.values()][0]; callbacks.clear(); callback(16);
  expect(target.style.getPropertyValue('--ai-sidebar-width')).toBe('400px');
  expect(change).not.toHaveBeenCalled();
  expect(liveChange).toHaveBeenLastCalledWith(400);
  fireEvent.pointerUp(window, { clientX: 650 });
  expect(target.style.getPropertyValue('--ai-sidebar-width')).toBe('450px');
  expect(change).toHaveBeenCalledTimes(1);
  expect(liveChange).toHaveBeenLastCalledWith(450);
  expect(liveChange).toHaveBeenCalledTimes(2);
  expect(change).toHaveBeenLastCalledWith(450);
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(change).toHaveBeenLastCalledWith(310);
  view.unmount(); request.mockRestore(); cancel.mockRestore();
});

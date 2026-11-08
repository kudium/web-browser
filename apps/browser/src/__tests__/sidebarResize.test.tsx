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

import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { SidebarPageColumns } from '../components/UI/SidebarPageColumns';
import {
  useSidebarPageWidths,
  bottomSidebarPageWidths,
} from '../utils/hooks/useSidebarPageWidths';

beforeEach(() => {
  localStorage.clear();
  Object.assign(global, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: MouseEvent,
  });
  HTMLElement.prototype.setPointerCapture = jest.fn();
});

it('persists widths independently and ignores invalid or unknown saved values', () => {
  localStorage.setItem(
    'kudium-sidebar-page-widths',
    JSON.stringify({
      developer: 480,
      email: -1,
      assistant: '500',
      foreign: 600,
    }),
  );
  const first = renderHook(useSidebarPageWidths);
  expect(first.result.current.widths).toEqual({ developer: 480 });
  act(() => first.result.current.changeWidths({ email: 320, assistant: 2000 }));
  expect(first.result.current.widths).toEqual({
    developer: 480,
    email: 320,
    assistant: 1200,
  });
  first.unmount();
  const restored = renderHook(useSidebarPageWidths);
  expect(restored.result.current.widths).toEqual({
    developer: 480,
    email: 320,
    assistant: 1200,
  });
});

it('provides accessible dividers for every neighboring pair, keeping the total width and other pages intact', () => {
  function Host({ panel }: { panel: 'developer' | 'email' | 'assistant' }) {
    return <input aria-label={panel} defaultValue="Draft" />;
  }
  function Fixture() {
    const state = useSidebarPageWidths();
    return (
      <SidebarPageColumns
        pages={['developer', 'email', 'assistant']}
        widths={state.widths}
        onWidthsChange={state.changeWidths}
      >
        <Host panel="developer" />
        <Host panel="email" />
        <Host panel="assistant" />
      </SidebarPageColumns>
    );
  }
  const view = render(<Fixture />);
  const input = screen.getByLabelText('developer');
  const first = screen.getByRole('separator', {
    name: 'Resize Developer and Email',
  });
  const second = screen.getByRole('separator', {
    name: 'Resize Email and Chat',
  });
  fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true });
  expect(
    JSON.parse(localStorage.getItem('kudium-sidebar-page-widths')!),
  ).toEqual({ developer: 398, email: 338 });
  fireEvent.keyDown(second, { key: 'ArrowRight' });
  expect(
    JSON.parse(localStorage.getItem('kudium-sidebar-page-widths')!),
  ).toEqual({ developer: 398, email: 348, assistant: 358 });
  expect(screen.getByLabelText('developer')).toBe(input);
  fireEvent.keyDown(first, { key: 'End' });
  const widths = JSON.parse(
    localStorage.getItem('kudium-sidebar-page-widths')!,
  );
  expect(widths.email).toBe(240);
  expect(widths.developer + widths.email).toBe(746);
  view.unmount();
});

it('coalesces drag updates into live CSS and saves both widths only on release', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const request = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.set(++id, callback);
      return id;
    });
  const cancel = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((key) => {
      frames.delete(key);
    });
  const change = jest.fn(),
    resizing = jest.fn();
  function Host({ panel }: { panel: 'developer' | 'email' }) {
    return <span>{panel}</span>;
  }
  const view = render(
    <SidebarPageColumns
      pages={['developer', 'email']}
      widths={{ developer: 400, email: 400 }}
      onWidthsChange={change}
      onResizingChange={resizing}
    >
      <Host panel="developer" />
      <Host panel="email" />
    </SidebarPageColumns>,
  );
  const handle = screen.getByRole('separator');
  jest
    .spyOn(handle.parentElement!, 'getBoundingClientRect')
    .mockReturnValue({ width: 400 } as DOMRect);
  fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
  for (const clientX of [410, 430, 450])
    fireEvent.pointerMove(window, { clientX });
  expect(change).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  act(() => {
    const frame = [...frames.values()][0];
    frames.clear();
    frame(16);
  });
  const root = view.container.querySelector<HTMLElement>(
    '.sidebar-page-columns',
  )!;
  expect(root.style.getPropertyValue('--sidebar-page-developer-width')).toBe(
    '450px',
  );
  expect(root.style.getPropertyValue('--sidebar-page-email-width')).toBe(
    '350px',
  );
  fireEvent.pointerUp(window, { clientX: 480 });
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenLastCalledWith({ developer: 480, email: 320 });
  expect(resizing).toHaveBeenLastCalledWith(false);
  view.unmount();
  request.mockRestore();
  cancel.mockRestore();
});

it('fills the bottom row with the last page and fits all pages on smaller windows', () => {
  const pages = ['developer', 'assistant', 'email'] as const;
  const preferred = { developer: 428, assistant: 368, email: 308 };
  const wide = bottomSidebarPageWidths(pages, preferred, 368, 1484);
  expect(wide).toEqual({ developer: 428, assistant: 368, email: 672 });
  const narrow = bottomSidebarPageWidths(pages, preferred, 368, 884);
  expect(Object.values(narrow).every((width) => width! >= 240)).toBe(true);
  expect(
    Object.values(narrow).reduce<number>((sum, width) => sum + width!, 0) + 16,
  ).toBe(884);
  expect(bottomSidebarPageWidths(['email'], preferred, 368, 1484)).toEqual({
    email: 1484,
  });
  expect(preferred).toEqual({ developer: 428, assistant: 368, email: 308 });
});

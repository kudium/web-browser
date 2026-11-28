import '@testing-library/jest-dom';
import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SidebarPageAreaResizeHandle } from '../components/UI/SidebarPageAreaResizeHandle';
import { SidebarPageColumns } from '../components/UI/SidebarPageColumns';
import {
  useSidebarPageWidths,
  fittedSidebarPageWidth,
} from '../utils/hooks/useSidebarPageWidths';

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
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
afterEach(() => jest.useRealTimers());

it('clears outer drag overrides so later divider resizing and preference resets take effect', () => {
  function Host({ panel }: { panel: 'developer' | 'email' }) {
    return <input aria-label={panel} />;
  }
  function Fixture() {
    const target = useRef<HTMLDivElement>(null),
      state = useSidebarPageWidths();
    const width = state.widths.developer ?? 368,
      total = width + (state.widths.email ?? 368) + 8;
    return (
      <div
        ref={target}
        data-testid="workspace"
        style={{ '--right-panels-width': `${total}px` } as React.CSSProperties}
      >
        <button onClick={state.resetWidths}>Reset</button>
        <SidebarPageAreaResizeHandle
          page="developer"
          width={width}
          totalWidth={total}
          maxAreaWidth={1000}
          target={target}
          onChange={(next) => state.changeWidths({ developer: next })}
          onResizingChange={() => {}}
        />
        <SidebarPageColumns
          pages={['developer', 'email']}
          widths={state.widths}
          onWidthsChange={state.changeWidths}
        >
          <Host panel="developer" />
          <Host panel="email" />
        </SidebarPageColumns>
      </div>
    );
  }
  const view = render(<Fixture />),
    workspace = screen.getByTestId('workspace');
  const edge = screen.getByRole('separator', { name: 'Resize panel' });
  fireEvent.pointerDown(edge, { button: 0, clientX: 600 });
  fireEvent.pointerMove(window, { clientX: 500 });
  act(() => jest.advanceTimersByTime(20));
  expect(
    workspace.style.getPropertyValue('--sidebar-page-developer-width'),
  ).toBe('468px');
  fireEvent.pointerUp(window, { clientX: 500 });
  expect(
    workspace.style.getPropertyValue('--sidebar-page-developer-width'),
  ).toBe('');
  fireEvent.keyDown(
    screen.getByRole('separator', { name: 'Resize Developer and Email' }),
    { key: 'ArrowRight' },
  );
  expect(
    view.container.querySelector('.sidebar-page-column-shell'),
  ).toHaveStyle({ width: 'var(--sidebar-page-developer-width, 478px)' });
  expect(
    JSON.parse(localStorage.getItem('kudium-sidebar-page-widths')!),
  ).toEqual({ developer: 478, email: 358 });
  fireEvent.click(screen.getByText('Reset'));
  expect(
    view.container.querySelector('.sidebar-page-column-shell'),
  ).toHaveStyle({ width: 'var(--sidebar-page-developer-width, 368px)' });
  expect(workspace.style.getPropertyValue('--right-panels-width')).toBe(
    '744px',
  );
});

it('fits saved widths to the available dock while preserving their preference for a wider window', () => {
  const widths = { developer: 1100 };
  expect(fittedSidebarPageWidth('developer', widths, 368, 636)).toBe(636);
  expect(fittedSidebarPageWidth('developer', widths, 368, 1200)).toBe(1100);
  expect(widths.developer).toBe(1100);
});

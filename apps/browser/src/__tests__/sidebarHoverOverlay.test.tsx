import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { useSidebarHoverOverlay } from '../utils/hooks/useSidebarHoverOverlay';

function Fixture({
  hidden = true,
  hold = false,
  onReady,
  onEdge,
}: {
  onEdge?: (callback: (inside: boolean) => void) => () => void;
  hidden?: boolean;
  hold?: boolean;
  onReady?: (callback: (token: number) => void) => () => void;
}) {
  const [sidebar, setSidebar] = useState<HTMLElement | null>(null);
  const hover = useSidebarHoverOverlay(hidden, sidebar, hold, onReady, onEdge);
  return (
    <div
      data-testid="workspace"
      data-open={hover.open}
      data-visible={hover.visible}
      data-token={hover.token}
    >
      <div
        data-testid="edge"
        className="sidebar-hover-edge"
        onPointerEnter={hover.enterEdge}
        onPointerLeave={hover.leave}
      />
      <aside
        ref={setSidebar}
        hidden={hidden && !hover.visible}
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        onBlur={hover.leave}
      >
        <input aria-label="Search space" defaultValue="Retained draft" />
        <button>Switch group</button>
      </aside>
      <button>Outside</button>
    </div>
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  delete document.documentElement.dataset.inputModality;
});
const tick = (milliseconds: number) =>
  act(() => jest.advanceTimersByTime(milliseconds));
const open = () => {
  fireEvent.pointerEnter(screen.getByTestId('edge'));
};

it('reveals only the hidden sidebar and retains its content without changing the saved layout', () => {
  localStorage.setItem('kudiumbrowser-sidebar-hidden', 'true');
  const view = render(<Fixture />);
  const input = screen.getByLabelText('Search space');
  fireEvent.pointerEnter(screen.getByTestId('edge'));
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  fireEvent.pointerEnter(input.closest('aside')!);
  fireEvent.change(input, { target: { value: 'Updated draft' } });
  fireEvent.pointerLeave(input.closest('aside')!);
  tick(180);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  open();
  expect(screen.getByLabelText('Search space')).toBe(input);
  expect(input).toHaveValue('Updated draft');
  expect(localStorage.getItem('kudiumbrowser-sidebar-hidden')).toBe('true');
  view.rerender(<Fixture hidden={false} />);
  open();
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  expect(input.closest('aside')).not.toHaveAttribute('hidden');
});

it('responds immediately to brief edge hovers and stays open while moving into it', () => {
  render(<Fixture />);
  const edge = screen.getByTestId('edge');
  fireEvent.pointerEnter(edge);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  tick(40);
  fireEvent.pointerLeave(edge);
  tick(200);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  open();
  fireEvent.pointerLeave(edge);
  tick(100);
  fireEvent.pointerEnter(
    screen.getByLabelText('Search space').closest('aside')!,
  );
  tick(200);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
});

it('holds menus and editing focus, then closes on an outside click or Escape', () => {
  const view = render(<Fixture />);
  open();
  const input = screen.getByLabelText('Search space');
  act(() => input.focus());
  fireEvent.pointerLeave(input.closest('aside')!);
  tick(300);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  view.rerender(<Fixture hold />);
  act(() => screen.getByText('Outside').focus());
  fireEvent.pointerMove(screen.getByText('Outside'));
  tick(300);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  view.rerender(<Fixture />);
  tick(180);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  open();
  fireEvent.pointerDown(screen.getByText('Outside'));
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  open();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
});

it('closes after pointer-selected buttons and cleans up pending work on unmount', () => {
  const view = render(<Fixture />);
  open();
  act(() => screen.getByText('Switch group').focus());
  fireEvent.pointerMove(screen.getByText('Outside'));
  tick(100);
  fireEvent.pointerMove(screen.getByText('Outside'));
  tick(80);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  fireEvent.pointerEnter(screen.getByTestId('edge'));
  fireEvent.pointerLeave(screen.getByTestId('edge'));
  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it('does not dismiss while the pointer moves along the trigger edge', () => {
  render(<Fixture />);
  open();
  const edge = screen.getByTestId('edge');
  for (let index = 0; index < 5; index++) {
    fireEvent.pointerMove(edge);
    tick(200);
    expect(screen.getByTestId('workspace')).toHaveAttribute(
      'data-open',
      'true',
    );
  }
});

it('reveals atomically after native readiness and ignores an acknowledgement from an older hover', () => {
  let ready!: (token: number) => void;
  const stop = jest.fn();
  const subscribe = (callback: (token: number) => void) => {
    ready = callback;
    return stop;
  };
  const view = render(<Fixture onReady={subscribe} />);
  const input = screen.getByLabelText('Search space');
  open();
  const first = Number(screen.getByTestId('workspace').dataset.token);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  expect(screen.getByTestId('workspace')).toHaveAttribute(
    'data-visible',
    'false',
  );
  expect(input.closest('aside')).toHaveAttribute('hidden');
  act(() => ready(first));
  expect(input.closest('aside')).not.toHaveAttribute('hidden');
  fireEvent.pointerDown(screen.getByText('Outside'));
  open();
  const next = Number(screen.getByTestId('workspace').dataset.token);
  expect(next).not.toBe(first);
  act(() => ready(first));
  expect(input.closest('aside')).toHaveAttribute('hidden');
  act(() => ready(next));
  expect(input.closest('aside')).not.toHaveAttribute('hidden');
  expect(screen.getByLabelText('Search space')).toBe(input);
  view.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('handles native edge events and cancels a departed hover before readiness', () => {
  let edge!: (inside: boolean) => void;
  const stop = jest.fn();
  const subscribe = (callback: (inside: boolean) => void) => { edge = callback; return stop; };
  const view = render(<Fixture onEdge={subscribe} onReady={() => () => {}} />);
  act(() => edge(true));
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'true');
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-visible', 'false');
  act(() => edge(false));
  tick(180);
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  view.rerender(<Fixture hidden={false} onEdge={subscribe} />);
  act(() => edge(true));
  expect(screen.getByTestId('workspace')).toHaveAttribute('data-open', 'false');
  view.unmount();
  expect(stop).toHaveBeenCalled();
});

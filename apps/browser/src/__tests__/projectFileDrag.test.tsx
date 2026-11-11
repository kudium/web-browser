import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  PROJECT_FILE_DRAG_EVENT,
  useProjectFileDrag,
} from '../utils/hooks/useProjectFileDrag';

function Harness() {
  const dragging = useProjectFileDrag();
  return <div>{dragging ? 'Drop target' : 'Web view'}</div>;
}
function start() {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(PROJECT_FILE_DRAG_EVENT, { detail: true })
    );
  });
  expect(screen.getByText('Drop target')).toBeInTheDocument();
}
afterEach(() => jest.useRealTimers());
it.each([
  'dragend',
  'drop',
  'mouseup',
  'pointerup',
  'pointercancel',
  'mousedown',
  'blur',
])(
  'restores the web view after global %s even without a mounted source row',
  (event) => {
    render(<Harness />);
    start();
    act(() => {
      window.dispatchEvent(new Event(event));
    });
    expect(screen.getByText('Web view')).toBeInTheDocument();
  }
);
it('cancels on Escape and a released mouse button', () => {
  render(<Harness />);
  start();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByText('Web view')).toBeInTheDocument();
  start();
  fireEvent.mouseMove(window, { buttons: 0 });
  expect(screen.getByText('Web view')).toBeInTheDocument();
});
it('expires stale drags but renews while drag events continue', () => {
  jest.useFakeTimers();
  render(<Harness />);
  start();
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.dragOver(window);
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByText('Drop target')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Web view')).toBeInTheDocument();
});

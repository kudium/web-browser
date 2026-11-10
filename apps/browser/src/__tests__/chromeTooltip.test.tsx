import { act, fireEvent, render, screen } from '@testing-library/react';
import { MessageCircle } from 'lucide-react';
import { ChromeIconButton } from '../components/UI/ChromeIconButton';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: { tooltip: jest.fn(async () => {}) },
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});
it('delays hover hints and cancels brief hovers without showing a native window', () => {
  render(<ChromeIconButton icon={MessageCircle} label="Chat" />);
  const button = screen.getByRole('button', { name: 'Chat' });
  fireEvent.pointerEnter(button);
  act(() => {
    jest.advanceTimersByTime(250);
  });
  expect(browser.tooltip).not.toHaveBeenCalled();
  fireEvent.pointerLeave(button);
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(browser.tooltip).not.toHaveBeenCalledWith(
    expect.objectContaining({ label: 'Chat' })
  );
});
it('shows on keyboard focus, forwards input handlers, and dismisses on Escape and unmount', () => {
  const onKeyDown = jest.fn();
  const { unmount } = render(
    <ChromeIconButton icon={MessageCircle} label="Chat" onKeyDown={onKeyDown} />
  );
  const button = screen.getByRole('button', { name: 'Chat' });
  fireEvent.focus(button);
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(browser.tooltip).toHaveBeenCalledWith(
    expect.objectContaining({ label: 'Chat', anchor: expect.any(Object) })
  );
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(onKeyDown).toHaveBeenCalled();
  expect(browser.tooltip).toHaveBeenLastCalledWith({ id: expect.any(String) });
  unmount();
  expect(browser.tooltip).toHaveBeenLastCalledWith({ id: expect.any(String) });
});

import { act, renderHook } from '@testing-library/react';
import { useAIPagePreference } from '../utils/useAIPagePreference';

beforeEach(() => localStorage.clear());
it('restores panel visibility, pinning, history visibility, and the chosen page after remount', () => {
  const render = () =>
    renderHook(() => ({
      open: useAIPagePreference('open', false),
      pinned: useAIPagePreference('historyPinned', false),
      history: useAIPagePreference('historyOpen', false),
      pane: useAIPagePreference('pane', 'assistant'),
    }));
  const first = render();
  act(() => {
    first.result.current.open[1](true);
    first.result.current.pinned[1](true);
    first.result.current.history[1](true);
    first.result.current.pane[1]('tasks');
  });
  first.unmount();
  const next = render();
  expect(next.result.current.open[0]).toBe(true);
  expect(next.result.current.pinned[0]).toBe(true);
  expect(next.result.current.history[0]).toBe(true);
  expect(next.result.current.pane[0]).toBe('tasks');
  act(() => next.result.current.history[1](false));
  next.unmount();
  const closed = render();
  expect(closed.result.current.history[0]).toBe(false);
  expect(closed.result.current.pinned[0]).toBe(true);
});
it('uses safe defaults for malformed or outdated layout settings', () => {
  localStorage.setItem('touchbox-ai-page-open', 'broken JSON');
  localStorage.setItem('touchbox-ai-page-pane', '"unknown-page"');
  const view = renderHook(() => ({
    open: useAIPagePreference('open', false),
    pane: useAIPagePreference('pane', 'assistant'),
  }));
  expect(view.result.current.open[0]).toBe(false);
  expect(view.result.current.pane[0]).toBe('assistant');
});

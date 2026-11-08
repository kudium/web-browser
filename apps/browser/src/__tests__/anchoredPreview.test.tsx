import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AnchoredTabPreview } from '../components/UI/AnchoredTabPreview';
import { useAnchoredPreview } from '../utils/useAnchoredPreview';

beforeEach(() => {
  Object.assign(global, {
    ResizeObserver: jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    })),
  });
});

it('delays hover, cancels short visits, bridges the popup gap, and cleans timers', () => {
  jest.useFakeTimers();
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const { result, unmount } = renderHook(() => useAnchoredPreview());
  const target = {
    kind: 'session' as const,
    id: 'session',
    anchor,
    interaction: 'hover' as const,
  };
  act(() => result.current.open(target));
  act(() => jest.advanceTimersByTime(100));
  expect(result.current.target).toBeNull();
  act(() => result.current.leave());
  act(() => jest.advanceTimersByTime(500));
  expect(result.current.target).toBeNull();
  act(() => result.current.open(target));
  act(() => jest.advanceTimersByTime(180));
  expect(result.current.target?.id).toBe('session');
  act(() => result.current.leave());
  act(() => jest.advanceTimersByTime(100));
  act(() => result.current.cancel());
  act(() => jest.advanceTimersByTime(500));
  expect(result.current.target?.id).toBe('session');
  act(() => result.current.open({ ...target, interaction: 'click' }));
  act(() => result.current.leave());
  act(() => jest.advanceTimersByTime(500));
  expect(result.current.target?.interaction).toBe('click');
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  anchor.remove();
  jest.useRealTimers();
});

it('renders a bounded window of 10,000 tabs and reaches the end and search results', () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const choose = jest.fn();
  const entries = Array.from({ length: 10000 }, (_, index) => ({
    id: `tab-${index}`,
    title: `Page ${index}`,
    detail: `https://example.com/${index}`,
    icon: '',
  }));
  render(
    <Theme>
      <AnchoredTabPreview
        target={{
          kind: 'session',
          id: 'session',
          anchor,
          interaction: 'hover',
        }}
        title="Group tabs"
        entries={entries}
        selectedId="tab-0"
        onSelect={choose}
        onRemove={jest.fn()}
        onNewTab={jest.fn()}
        onBack={jest.fn()}
        onClose={jest.fn()}
        onEnter={jest.fn()}
        onLeave={jest.fn()}
      />
    </Theme>
  );
  expect(
    document.querySelectorAll('.tab-preview-row').length
  ).toBeLessThanOrEqual(13);
  const search = screen.getByLabelText('Search preview');
  fireEvent.keyDown(search, { key: 'End' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(choose).toHaveBeenLastCalledWith('tab-9999');
  expect(screen.getByRole('button', { name: 'Page 9999' })).toBeInTheDocument();
  expect(
    document.querySelectorAll('.tab-preview-row').length
  ).toBeLessThanOrEqual(13);
  fireEvent.change(search, { target: { value: 'Page 8123' } });
  expect(document.querySelectorAll('.tab-preview-row')).toHaveLength(1);
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(choose).toHaveBeenLastCalledWith('tab-8123');
  anchor.remove();
});

/* Shared fixture props keep rerenders identical except the preference under test. */
/* eslint-disable react/jsx-props-no-spreading */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AIChatSwitcher } from '../components/UI/AIChatSwitcher';

const state = {
  selectedId: 'first',
  conversations: [
    { id: 'first', title: 'First task', updatedAt: 0, paused: false },
    { id: 'second', title: 'Second task', updatedAt: 0, paused: false },
  ],
  history: [],
  draft: '',
};
function fixture(
  onChange = jest.fn().mockResolvedValue(undefined),
  pinned = false
) {
  const onClose = jest.fn();
  const props = {
    state,
    busy: false,
    changing: false,
    onChange,
    pinned,
    onPin: jest.fn(),
    onClose,
  };
  const view = render(
    <Theme>
      <AIChatSwitcher {...props} />
    </Theme>
  );
  return { ...view, props, onChange, onClose };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('mouse click starts selection immediately, before double-click window', async () => {
  const mock = fixture();
  fireEvent.click(screen.getByTitle('Second task'), { detail: 1 });
  expect(mock.onChange).toHaveBeenCalledWith({
    action: 'select',
    id: 'second',
  });
  await act(async () => {});
  expect(mock.onClose).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(500));
  expect(mock.onClose).toHaveBeenCalledTimes(1);
});
test('double-click renames without repeating selection or dismissing history', async () => {
  const mock = fixture();
  const row = screen.getByTitle('Second task');
  fireEvent.click(row, { detail: 1 });
  await act(async () => {});
  fireEvent.click(row, { detail: 2 });
  fireEvent.doubleClick(row);
  expect(mock.onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', { name: 'Chat name' })).toHaveValue(
    'Second task'
  );
  act(() => jest.advanceTimersByTime(1000));
  expect(mock.onClose).not.toHaveBeenCalled();
});
test('rename cancels dismissal even while selection response is pending', async () => {
  let finish!: () => void;
  const mock = fixture(
    jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    )
  );
  const row = screen.getByTitle('Second task');
  fireEvent.click(row, { detail: 1 });
  fireEvent.doubleClick(row);
  await act(async () => finish());
  act(() => jest.advanceTimersByTime(1000));
  expect(mock.onClose).not.toHaveBeenCalled();
});
test('keyboard selection dismisses without a mouse gesture delay', async () => {
  const mock = fixture();
  fireEvent.click(screen.getByTitle('Second task'), { detail: 0 });
  await act(async () => {});
  expect(mock.onClose).toHaveBeenCalledTimes(1);
});
test('pinning during the rename window cancels pending dismissal', async () => {
  const mock = fixture();
  fireEvent.click(screen.getByTitle('Second task'), { detail: 1 });
  await act(async () => {});
  mock.rerender(
    <Theme>
      <AIChatSwitcher {...mock.props} pinned />
    </Theme>
  );
  act(() => jest.advanceTimersByTime(1000));
  expect(mock.onClose).not.toHaveBeenCalled();
});

test('hides dates without leaving empty metadata rows', () => {
  fixture();
  expect(
    screen.queryByText(new Date(0).toLocaleDateString())
  ).not.toBeInTheDocument();
  expect(document.querySelector('.ai-chat-history-row small')).toBeNull();
});
test.each([false, true])(
  'outside pointer dismisses only unpinned history (pinned=%s)',
  (pinned) => {
    const mock = fixture(undefined, pinned);
    fireEvent.pointerDown(
      screen.getByRole('textbox', { name: 'Search chats' })
    );
    expect(mock.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(mock.onClose).toHaveBeenCalledTimes(pinned ? 0 : 1);
  }
);
test('history toggle stays responsible for toggling rather than dismissing on pointerdown', () => {
  const mock = fixture();
  const toggle = document.createElement('button');
  toggle.setAttribute('aria-controls', 'ai-chat-history-panel');
  document.body.append(toggle);
  fireEvent.pointerDown(toggle);
  expect(mock.onClose).not.toHaveBeenCalled();
  toggle.remove();
});

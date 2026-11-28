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

it('resizes the bounded window of 10,000 tabs and reaches the end and search results', () => {
  jest.useFakeTimers();
  let listHeight = 224;
  let resizeList = () => {};
  (ResizeObserver as jest.Mock).mockImplementation((callback) => ({
    observe: jest.fn((element: HTMLElement) => {
      if (element.classList.contains('tab-preview-list')) {
        Object.defineProperty(element, 'clientHeight', {
          get: () => listHeight,
        });
        resizeList = () => callback([{ target: element }]);
      }
    }),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
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
    </Theme>,
  );
  expect(
    document.querySelectorAll('.tab-preview-row').length,
  ).toBeLessThanOrEqual(13);
  act(() => {
    listHeight = 640;
    resizeList();
    jest.advanceTimersByTime(20);
  });
  expect(screen.getByRole('button', { name: 'Page 19' })).toBeInTheDocument();
  expect(
    document.querySelectorAll('.tab-preview-row').length,
  ).toBeLessThanOrEqual(26);
  act(() => {
    listHeight = 160;
    resizeList();
    jest.advanceTimersByTime(20);
  });
  expect(
    document.querySelectorAll('.tab-preview-row').length,
  ).toBeLessThanOrEqual(11);
  act(() => {
    listHeight = 224;
    resizeList();
    jest.advanceTimersByTime(20);
  });
  const search = screen.getByLabelText('Search preview');
  fireEvent.keyDown(search, { key: 'End' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(choose).toHaveBeenLastCalledWith('tab-9999');
  expect(screen.getByRole('button', { name: 'Page 9999' })).toBeInTheDocument();
  expect(
    document.querySelectorAll('.tab-preview-row').length,
  ).toBeLessThanOrEqual(13);
  fireEvent.change(search, { target: { value: 'Page 8123' } });
  expect(document.querySelectorAll('.tab-preview-row')).toHaveLength(1);
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(choose).toHaveBeenLastCalledWith('tab-8123');
  anchor.remove();
});

it('shows group identity above a compact hover list, including single-tab groups', () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const choose = jest.fn();
  const selectGroup = jest.fn();
  const toggleFavorite = jest.fn();
  const notes = jest.fn();
  const developer = jest.fn();
  const manageGroup = jest.fn();
  const tabMenu = jest.fn();
  const groupMenu = jest.fn();
  render(
    <Theme>
      <AnchoredTabPreview
        target={{ kind: 'session', id: 'team', anchor, interaction: 'hover' }}
        title="Office & Team"
        subtitle="office-team"
        entries={[
          {
            id: 'standup',
            title: 'Standup',
            detail: 'https://docs.google.com',
            icon: '',
          },
        ]}
        selectedId="standup"
        onSelect={choose}
        onSelectGroup={selectGroup}
        onToggleFavorite={toggleFavorite}
        onNotes={notes}
        onDeveloper={developer}
        onManageGroup={manageGroup}
        onEntryContextMenu={tabMenu}
        onGroupContextMenu={groupMenu}
        onRemove={jest.fn()}
        onNewTab={jest.fn()}
        onBack={jest.fn()}
        onClose={jest.fn()}
        onEnter={jest.fn()}
        onLeave={jest.fn()}
      />
    </Theme>,
  );
  expect(screen.getByText('Office & Team')).toBeInTheDocument();
  expect(screen.getByText('@office-team')).toHaveAttribute(
    'title',
    'Select @office-team in the AI sidebar',
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Select @office-team in the AI sidebar',
    }),
  );
  expect(selectGroup).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'AI Chat' }));
  expect(selectGroup).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Developer' }));
  expect(notes).toHaveBeenCalledTimes(1);
  expect(developer).toHaveBeenCalledTimes(1);
  const manage = screen.getByRole('button', { name: 'Manage group' });
  expect(manage).toHaveAttribute('title', 'Manage group');
  expect(manage.textContent).toBe('');
  fireEvent.click(manage);
  expect(manageGroup).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Pin to favorites' }));
  expect(toggleFavorite).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('1 tab')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search preview')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Standup' }));
  expect(choose).toHaveBeenCalledWith('standup');
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Standup' }));
  expect(tabMenu).toHaveBeenCalledWith('standup');
  expect(groupMenu).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByText('Office & Team'));
  expect(groupMenu).toHaveBeenCalledTimes(1);
  anchor.remove();
});

afterEach(() => jest.useRealTimers());

it('makes empty collections useful without showing a redundant search box or duplicate creation action', () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const create = jest.fn(),
    manage = jest.fn();
  const noop = () => {};
  const view = render(
    <Theme>
      <AnchoredTabPreview
        target={{ kind: 'folder', id: 'empty', anchor, interaction: 'click' }}
        title="Empty workspace"
        entries={[]}
        selectedId=""
        onSelect={noop}
        onRemove={noop}
        onNewTab={noop}
        onBack={noop}
        onClose={noop}
        onEnter={noop}
        onLeave={noop}
        onNewGroup={create}
        onManageCollection={manage}
      />
    </Theme>,
  );
  expect(screen.getByText('Empty collection')).toBeInTheDocument();
  expect(screen.queryByLabelText('Search preview')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'New group' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'New group' }));
  expect(create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Manage collection' }));
  expect(manage).toHaveBeenCalledTimes(1);
  view.unmount();
  anchor.remove();
});

import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  renderHook,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { browser } from '../browser/client';
import { SidebarPageColumns } from '../components/UI/SidebarPageColumns';
import { AssistantPageHeader } from '../components/UI/AssistantPageHeader';
import { PANEL_DRAG_MIME } from '../components/UI/SidebarPageLayoutContext';
import {
  nativeSidebarPage,
  useSidebarPages,
  type SidebarPage,
} from '../utils/hooks/useSidebarPages';
import { useSidebarPageDocks } from '../utils/hooks/useSidebarPageDocks';
import { useSidebarPageWidths } from '../utils/hooks/useSidebarPageWidths';
jest.mock('../browser/client', () => ({ browser: { nativeMenu: jest.fn() } }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  Object.assign(global, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
});
it('reorders from the header by keyboard or drag without losing drafts and builds layout menus only on click', async () => {
  const balance = jest.fn(),
    reset = jest.fn();
  function Host({ panel }: { panel: SidebarPage }) {
    return (
      <>
        <AssistantPageHeader />
        <input aria-label={panel} />
      </>
    );
  }
  function Fixture() {
    const sidebar = useSidebarPages(false, 'assistant');
    return (
      <Theme>
        <button
          onClick={() => {
            sidebar.openPage('developer');
            sidebar.openPage('email');
          }}
        >
          Open
        </button>
        <SidebarPageColumns
          pages={sidebar.pages}
          onReorder={sidebar.reorder}
          onBalance={balance}
          onReset={reset}
        >
          <Host panel="developer" />
          <Host panel="email" />
        </SidebarPageColumns>
      </Theme>
    );
  }
  const view = render(<Fixture />);
  fireEvent.click(screen.getByText('Open'));
  const draft = screen.getByLabelText('developer');
  fireEvent.change(draft, { target: { value: 'Keep this' } });
  const order = () =>
    [
      ...view.container.querySelectorAll<HTMLElement>(
        '.sidebar-page-column:not([hidden])',
      ),
    ].map((node) => node.dataset.sidebarPage);
  expect(browser.nativeMenu).not.toHaveBeenCalled();
  fireEvent.keyDown(
    screen.getAllByRole('button', { name: 'Arrange panel' })[1],
    { altKey: true, key: 'ArrowLeft' },
  );
  expect(order()).toEqual(['email', 'developer']);
  const target = view.container.querySelector(
    '[data-sidebar-page="email"] .sidebar-page-retained-content',
  )!;
  fireEvent.drop(target, {
    dataTransfer: {
      getData: (mime: string) => (mime === PANEL_DRAG_MIME ? 'developer' : ''),
    },
  });
  expect(order()).toEqual(['developer', 'email']);
  expect(screen.getByLabelText('developer')).toBe(draft);
  expect(draft).toHaveValue('Keep this');
  (browser.nativeMenu as jest.Mock)
    .mockResolvedValueOnce('balance')
    .mockResolvedValueOnce('reset');
  await act(async () =>
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Arrange panel' })[0],
    ),
  );
  expect(balance).toHaveBeenCalledWith('right');
  await act(async () =>
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Arrange panel' })[0],
    ),
  );
  expect(reset).toHaveBeenCalledTimes(1);
});
it('restores native page IDs, independent widths and docks in a new session and resets their preferences', () => {
  const page = nativeSidebarPage({
    id: 'extension:temporary',
    key: 'extension:profile-a:temporary',
  });
  const first = renderHook(() => ({
    pages: useSidebarPages(false, 'assistant'),
    widths: useSidebarPageWidths(),
    docks: useSidebarPageDocks('right'),
  }));
  act(() => {
    first.result.current.pages.openPage(page);
    first.result.current.widths.changeWidths({ [page]: 540 });
    first.result.current.docks.changeDock(page, 'bottom');
  });
  first.unmount();
  sessionStorage.clear();
  const restored = renderHook(() => ({
    pages: useSidebarPages(false, 'assistant'),
    widths: useSidebarPageWidths(),
    docks: useSidebarPageDocks('right'),
  }));
  expect(restored.result.current.pages.pages).toEqual([page]);
  expect(restored.result.current.widths.widths[page]).toBe(540);
  expect(restored.result.current.docks.position(page)).toBe('bottom');
  act(() => {
    restored.result.current.widths.resetWidths();
    restored.result.current.docks.resetDocks();
  });
  expect(restored.result.current.widths.widths).toEqual({});
  expect(restored.result.current.docks.position(page)).toBe('right');
});

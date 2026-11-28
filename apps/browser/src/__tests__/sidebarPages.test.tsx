import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { useEffect } from 'react';
import { useSidebarPages } from '../utils/hooks/useSidebarPages';
import { SidebarPageColumns } from '../components/UI/SidebarPageColumns';
import { AssistantPanelHost } from '../components/UI/AssistantPanelHost';
import { AssistantPageHeader } from '../components/UI/AssistantPageHeader';
import { useAssistantPanelVisible } from '../components/UI/AssistantPanelContext';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.assign(global, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
});

it('opens pages in order, deduplicates repeated requests and closes only the requested page', () => {
  const { result } = renderHook(() => useSidebarPages(false, 'assistant'));
  act(() => {
    result.current.openPage('developer');
    result.current.openPage('email');
    result.current.openPage('assistant');
    result.current.openPage('developer');
  });
  expect(result.current.pages).toEqual(['developer', 'email', 'assistant']);
  act(() => result.current.closePage('email'));
  expect(result.current.pages).toEqual(['developer', 'assistant']);
  act(() => result.current.togglePage('email'));
  expect(result.current.pages).toEqual(['developer', 'assistant', 'email']);
  act(() => result.current.togglePage('developer'));
  expect(result.current.pages).toEqual(['assistant', 'email']);
});

it('restores window-local ordering and migrates the previous single-page layout', () => {
  const first = renderHook(() => useSidebarPages(true, 'developer'));
  expect(first.result.current.pages).toEqual(['developer']);
  act(() => first.result.current.openPage('email'));
  first.unmount();
  const second = renderHook(() => useSidebarPages(true, 'assistant'));
  expect(second.result.current.pages).toEqual(['developer', 'email']);
  act(() => second.result.current.setOpen(false));
  expect(second.result.current.pages).toEqual([]);
  act(() => second.result.current.setOpen(true));
  expect(second.result.current.pages).toEqual(['developer', 'email']);
  second.unmount();
  sessionStorage.setItem('kudium-open-sidebar-pages', '["foreign","email"]');
  const invalid = renderHook(() => useSidebarPages(false, 'assistant'));
  expect(invalid.result.current.pages).toEqual([]);
});

it('keeps drafts mounted, orders the DOM and gives every page an independent shared close action', () => {
  const mounts = jest.fn();
  function Content({ name }: { name: string }) {
    const visible = useAssistantPanelVisible();
    useEffect(() => {
      mounts(name);
    }, []);
    return (
      <>
        <AssistantPageHeader />
        <input aria-label={`${name} draft`} defaultValue={`${name} content`} />
        <span data-testid={`${name}-visible`}>{String(visible)}</span>
      </>
    );
  }
  function Fixture() {
    const sidebar = useSidebarPages(false, 'assistant');
    return (
      <Theme>
        <button onClick={() => sidebar.openPage('developer')}>
          Open Developer
        </button>
        <button onClick={() => sidebar.openPage('email')}>Open Email</button>
        <button onClick={() => sidebar.openPage('assistant')}>Open Chat</button>
        <SidebarPageColumns pages={sidebar.pages}>
          {(['assistant', 'email', 'developer'] as const).map((panel) => (
            <AssistantPanelHost
              key={panel}
              panel={panel}
              active={sidebar.pages.includes(panel)}
              onClose={() => sidebar.closePage(panel)}
              onOpen={() => sidebar.openPage(panel)}
            >
              <Content name={panel} />
            </AssistantPanelHost>
          ))}
        </SidebarPageColumns>
      </Theme>
    );
  }
  const view = render(<Fixture />);
  fireEvent.click(screen.getByText('Open Developer'));
  const draft = screen.getByLabelText('developer draft');
  fireEvent.change(draft, { target: { value: 'Unsaved terminal notes' } });
  fireEvent.click(screen.getByText('Open Email'));
  fireEvent.click(screen.getByText('Open Chat'));
  const order = () =>
    [
      ...view.container.querySelectorAll<HTMLElement>(
        '.sidebar-page-column:not([hidden])',
      ),
    ].map((column) => column.dataset.sidebarPage);
  expect(order()).toEqual(['developer', 'email', 'assistant']);
  for (const page of ['developer', 'email', 'assistant'])
    expect(screen.getByTestId(`${page}-visible`)).toHaveTextContent('true');
  fireEvent.click(screen.getByRole('button', { name: 'Close Email' }));
  expect(order()).toEqual(['developer', 'assistant']);
  expect(screen.getByTestId('email-visible')).toHaveTextContent('false');
  expect(screen.getByLabelText('developer draft')).toBe(draft);
  expect(draft).toHaveValue('Unsaved terminal notes');
  fireEvent.click(screen.getByText('Open Email'));
  expect(order()).toEqual(['developer', 'assistant', 'email']);
  expect(mounts).toHaveBeenCalledTimes(3);
});

it('docks a retained floating page back without replacing another open page', () => {
  const events = new EventTarget();
  const child = {
    document: document.implementation.createHTMLDocument(),
    closed: false,
    outerWidth: 520,
    outerHeight: 740,
    screenX: 20,
    screenY: 20,
    focus: jest.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    close() {
      this.closed = true;
      events.dispatchEvent(new Event('beforeunload'));
    },
  };
  const open = jest
    .spyOn(window, 'open')
    .mockReturnValue(child as unknown as Window);
  function Fixture() {
    const sidebar = useSidebarPages(true, 'developer');
    return (
      <Theme>
        <button onClick={() => sidebar.openPage('email')}>Open Email</button>
        <SidebarPageColumns pages={sidebar.pages}>
          {(['developer', 'email'] as const).map((panel) => (
            <AssistantPanelHost
              key={panel}
              panel={panel}
              active={sidebar.pages.includes(panel)}
              onOpen={() => sidebar.openPage(panel)}
              onClose={() => sidebar.closePage(panel)}
            >
              <AssistantPageHeader />
              <input aria-label={`${panel} draft`} defaultValue="Retained" />
            </AssistantPanelHost>
          ))}
        </SidebarPageColumns>
      </Theme>
    );
  }
  const view = render(<Fixture />);
  const draft = screen.getByLabelText('developer draft');
  fireEvent.click(screen.getByText('Open Email'));
  fireEvent.click(screen.getByRole('button', { name: 'Undock Developer' }));
  expect(child.document.contains(draft)).toBe(true);
  fireEvent.click(screen.getByText('Dock back'));
  expect(screen.getByLabelText('developer draft')).toBe(draft);
  expect(
    screen.getByRole('button', { name: 'Close Email' }),
  ).toBeInTheDocument();
  expect(
    [
      ...view.container.querySelectorAll<HTMLElement>(
        '.sidebar-page-column:not([hidden])',
      ),
    ].map((column) => column.dataset.sidebarPage),
  ).toEqual(['developer', 'email']);
  view.unmount();
  open.mockRestore();
});

it('restores the full layout and selected page after a new app session, including an intentionally empty layout', () => {
  const first = renderHook(() => useSidebarPages(false, 'assistant'));
  act(() => {
    first.result.current.openPage('developer');
    first.result.current.openPage('email');
    first.result.current.openPage('assistant');
    first.result.current.openPage('developer');
    first.result.current.reorder('assistant', 'developer');
  });
  first.unmount();
  sessionStorage.clear();
  const restored = renderHook(() => useSidebarPages(true, 'notes'));
  expect(restored.result.current.pages).toEqual([
    'assistant',
    'developer',
    'email',
  ]);
  expect(restored.result.current.activePage).toBe('developer');
  act(() => restored.result.current.setOpen(false));
  restored.unmount();
  sessionStorage.clear();
  const hidden = renderHook(() => useSidebarPages(true, 'notes'));
  expect(hidden.result.current.pages).toEqual([]);
});

it('signals every repeated reveal without changing order and ignores stale reorder targets', () => {
  const { result } = renderHook(() => useSidebarPages(true, 'developer'));
  act(() => result.current.openPage('email'));
  act(() => result.current.openPage('developer'));
  const pages = result.current.pages,
    activation = result.current.activation;
  act(() => result.current.openPage('developer'));
  expect(result.current.pages).toBe(pages);
  expect(result.current.activation).toBe(activation + 1);
  act(() => result.current.reorder('email', 'notes'));
  expect(result.current.pages).toBe(pages);
  act(() => result.current.reorder('email', 'developer'));
  expect(result.current.pages).toEqual(['email', 'developer']);
  act(() => result.current.resetOrder());
  expect(result.current.pages).toEqual(['developer', 'email']);
});

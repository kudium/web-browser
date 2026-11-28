import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { useEffect, useState } from 'react';
import { Theme } from '@radix-ui/themes';
import { useSidebarPageDocks } from '../utils/hooks/useSidebarPageDocks';
import { SidebarPageColumns } from '../components/UI/SidebarPageColumns';
import { AssistantPanelHost } from '../components/UI/AssistantPanelHost';
import { AssistantPageHeader } from '../components/UI/AssistantPageHeader';

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

it('remembers each page placement without changing the default or another page', () => {
  localStorage.setItem(
    'kudium-sidebar-page-docks',
    JSON.stringify({ email: 'bottom', developer: 'invalid', foreign: 'right' }),
  );
  const first = renderHook(() => useSidebarPageDocks('right'));
  expect(first.result.current.docks).toEqual({ email: 'bottom' });
  act(() => first.result.current.changeDock('developer', 'bottom'));
  expect(first.result.current.position('assistant')).toBe('right');
  first.unmount();
  const next = renderHook(() => useSidebarPageDocks('right'));
  expect(next.result.current.docks).toEqual({
    email: 'bottom',
    developer: 'bottom',
  });
});

it('moves the same live column between independent dock areas without remounting or replacing its neighbors', () => {
  const mounts = jest.fn();
  function Content({ name }: { name: string }) {
    useEffect(() => {
      mounts(name);
    }, []);
    return (
      <>
        <AssistantPageHeader />
        <input aria-label={`${name} draft`} defaultValue="Retained" />
      </>
    );
  }
  function Fixture() {
    const state = useSidebarPageDocks('right');
    const [bottom, setBottom] = useState<HTMLDivElement | null>(null);
    return (
      <Theme>
        <aside data-testid="right" className="ai-sidebar ai-sidebar-multi">
          <SidebarPageColumns
            pages={['developer', 'email', 'assistant']}
            pageDocks={state.docks}
            onPageDockChange={state.changeDock}
            bottomTarget={bottom}
          >
            {(['developer', 'email', 'assistant'] as const).map((panel) => (
              <AssistantPanelHost key={panel} panel={panel} active>
                <Content name={panel} />
              </AssistantPanelHost>
            ))}
          </SidebarPageColumns>
        </aside>
        <aside className="ai-sidebar ai-sidebar-multi">
          <div
            data-testid="bottom"
            className="sidebar-page-columns"
            ref={setBottom}
          />
        </aside>
      </Theme>
    );
  }
  render(<Fixture />);
  const developer = screen.getByLabelText('developer draft');
  const email = screen.getByLabelText('email draft');
  const chat = screen.getByLabelText('assistant draft');
  fireEvent.change(developer, { target: { value: 'Keep this work' } });
  const dock = (input: HTMLElement, position: string) =>
    fireEvent.change(
      within(input.closest('.sidebar-page-column')!).getByRole('combobox', {
        name: 'Panel dock position',
      }),
      { target: { value: position } },
    );
  dock(developer, 'bottom');
  expect(screen.getByTestId('bottom')).toContainElement(developer);
  expect(screen.getByTestId('right')).toContainElement(email);
  expect(screen.getByTestId('right')).toContainElement(chat);
  dock(email, 'bottom');
  expect(
    [
      ...screen
        .getByTestId('bottom')
        .querySelectorAll<HTMLElement>('[data-sidebar-page]'),
    ].map((page) => page.dataset.sidebarPage),
  ).toEqual(['developer', 'email']);
  dock(developer, 'right');
  expect(screen.getByTestId('right')).toContainElement(developer);
  expect(screen.getByTestId('bottom')).toContainElement(email);
  expect(developer).toHaveValue('Keep this work');
  expect(screen.getByLabelText('developer draft')).toBe(developer);
  expect(mounts).toHaveBeenCalledTimes(3);
});

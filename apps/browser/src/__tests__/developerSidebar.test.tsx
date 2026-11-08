import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperSidebar } from '../components/UI/DeveloperSidebar';
import { browser } from '../browser/client';
import type { IApp } from '../types';

const mockTabs: IApp[] = [
  {
    id: 'home',
    name: 'Home',
    url: 'https://example.com/home',
    sessionId: 'work',
    sessionName: 'Work',
    sessionSlug: 'work',
    icon: '',
  } as IApp,
];
const mockAccess = {
  ready: true,
  protected: [],
  unlocked: [],
  available: true,
};
jest.mock('../utils/hooks/useAppList', () => ({
  useAppList: () => ({ appList: mockTabs }),
}));
jest.mock('../utils/AppManager', () => ({
  AppManager: { getAll: () => mockTabs },
  ScreenManager: { getLastAppId: () => 'home' },
}));
jest.mock('../utils/groupAccess', () => ({
  useGroupAccess: () => mockAccess,
  lockedGroup: () => false,
}));
jest.mock('../browser/client', () => ({
  browser: { onState: () => () => {}, command: jest.fn() },
}));
let change: () => void;
const pages = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(global, {
    ResizeObserver: class {
      observe = jest.fn();

      disconnect = jest.fn();

      unobserve = jest.fn();
    },
  });
  HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.assign(window, {
    electron: {
      siteDeveloper: {
        terminal: jest.fn().mockResolvedValue({
          tabs: [],
          selected: '',
          open: false,
          height: 220,
        }),
        onTerminal: () => () => {},
        project: jest.fn().mockResolvedValue(null),
        pages,
        onPagesChanged: (listener: typeof change) => {
          change = listener;
          return () => {};
        },
      },
    },
  });
});
const content = (active: boolean) => (
  <Theme>
    <DeveloperSidebar active={active} />
  </Theme>
);
it('reuses the group picker, reports saved hooks, searches pages and opens the existing editor', async () => {
  pages.mockResolvedValue([
    {
      id: 'home',
      name: 'Home',
      url: 'https://example.com/home',
      origin: 'https://example.com',
      hasHooks: true,
      enabled: true,
      status: 'success',
    },
    {
      id: 'other',
      name: 'Other page',
      url: 'https://other.com',
      origin: 'https://other.com',
      hasHooks: false,
      enabled: false,
      status: 'waiting',
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `extra-${index}`,
      name: `Extra page ${index}`,
      url: `https://extra${index}.com`,
      origin: `https://extra${index}.com`,
      hasHooks: false,
      enabled: false,
      status: 'waiting',
    })),
  ]);
  const view = render(content(true));
  await waitFor(() => expect(screen.getByText('Hooks active')).toBeTruthy());
  expect(pages).toHaveBeenCalledWith('home');
  expect(screen.getByRole('button', { name: 'Developer group' })).toBeTruthy();
  expect(screen.getAllByText('No hooks')).toHaveLength(5);
  fireEvent.change(screen.getByLabelText('Search developer pages'), {
    target: { value: 'other' },
  });
  expect(
    screen.queryByRole('button', { name: 'Manage hooks for Home' })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Manage hooks for Other page' })
  );
  expect(browser.command).toHaveBeenCalledWith({
    id: 'other',
    action: 'open-site-developer',
    url: 'https://other.com',
  });
  pages.mockResolvedValue([
    {
      id: 'other',
      name: 'Other page',
      url: 'https://other.com',
      origin: 'https://other.com',
      hasHooks: true,
      enabled: false,
      status: 'waiting',
    },
  ]);
  act(() => change());
  await waitFor(() => expect(screen.getByText('Hooks disabled')).toBeTruthy());
  expect(screen.queryByLabelText('Search developer pages')).toBeNull();
  view.rerender(content(false));
  const calls = pages.mock.calls.length;
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  });
  expect(pages).toHaveBeenCalledTimes(calls);
});
it('shows loading and a readable request failure', async () => {
  pages.mockRejectedValue(new Error('Unlock this group to manage its hooks.'));
  render(content(true));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Unlock')
  );
  expect(screen.queryByRole('button', { name: /Manage hooks for/ })).toBeNull();
});

it('routes page and group context menus without opening the page editor', async () => {
  pages.mockResolvedValue([
    {
      id: 'home',
      name: 'Home',
      url: 'https://example.com/home',
      origin: 'https://example.com',
      hasHooks: true,
      enabled: true,
      status: 'success',
    },
  ]);
  const tabMenu = jest.fn();
  const groupMenu = jest.fn();
  render(
    <Theme>
      <DeveloperSidebar
        active
        onTabContextMenu={tabMenu}
        onGroupContextMenu={groupMenu}
      />
    </Theme>
  );
  const page = await screen.findByRole('button', {
    name: 'Manage hooks for Home',
  });
  fireEvent.contextMenu(page);
  expect(tabMenu).toHaveBeenCalledWith('home');
  expect(browser.command).not.toHaveBeenCalled();
  fireEvent.keyDown(page, { key: 'F10', shiftKey: true });
  expect(tabMenu).toHaveBeenCalledTimes(2);
  fireEvent.contextMenu(
    screen.getByRole('button', { name: 'Developer group' })
  );
  expect(groupMenu).toHaveBeenCalledTimes(1);
});

it('follows browser focus and fetches saved hooks again when reopening Developer', async () => {
  const second = {
    ...mockTabs[0],
    id: 'focused-other',
    sessionId: 'other',
    sessionName: 'Other',
    name: 'Other page',
  } as IApp;
  mockTabs.push(second);
  try {
    pages.mockImplementation(async (id) => [
      {
        id,
        name: id === 'home' ? 'Home' : 'Other page',
        url: 'https://example.com',
        origin: 'https://example.com',
        hasHooks: false,
        enabled: false,
        status: 'waiting',
      },
    ]);
    const view = render(
      <Theme>
        <DeveloperSidebar active focusedTabId="home" />
      </Theme>
    );
    await screen.findByText('No hooks');
    view.rerender(
      <Theme>
        <DeveloperSidebar active={false} focusedTabId="home" />
      </Theme>
    );
    pages.mockImplementation(async (id) => [
      {
        id,
        name: 'Other page',
        url: 'https://example.com',
        origin: 'https://example.com',
        hasHooks: true,
        enabled: true,
        status: 'waiting',
      },
    ]);
    view.rerender(
      <Theme>
        <DeveloperSidebar active focusedTabId="focused-other" />
      </Theme>
    );
    await screen.findByText('Hooks active');
    expect(pages).toHaveBeenLastCalledWith('focused-other');
    view.rerender(
      <Theme>
        <DeveloperSidebar active focusedTabId="home" />
      </Theme>
    );
    await waitFor(() => expect(pages).toHaveBeenLastCalledWith('home'));
  } finally {
    mockTabs.pop();
  }
});

it('manages the current group and restores exclusive views independently across groups and remounts', async () => {
  localStorage.clear();
  pages.mockResolvedValue([
    {
      id: 'home',
      name: 'Home',
      url: 'https://example.com',
      origin: 'https://example.com',
      hasHooks: false,
    },
  ]);
  window.electron.siteDeveloper.project = jest
    .fn()
    .mockResolvedValue({ name: 'Project', path: '/project', available: true });
  window.electron.siteDeveloper.files = jest.fn().mockResolvedValue({
    name: 'Project',
    path: '',
    entries: [],
    breadcrumbs: [],
    truncated: false,
  });
  const second = {
    ...mockTabs[0],
    id: 'second',
    sessionId: 'other',
    sessionName: 'Other',
  } as IApp;
  mockTabs.push(second);
  const manage = jest.fn();
  const panel = (id: string) => (
    <Theme>
      <DeveloperSidebar active focusedTabId={id} onManageGroup={manage} />
    </Theme>
  );
  const view = render(panel('home'));
  try {
    await screen.findByRole('button', { name: 'Files' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage developer group' })
    );
    expect(manage).toHaveBeenCalledWith('home');
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(
      screen.queryByRole('button', { name: 'Manage hooks for Home' })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Files' }).getAttribute('aria-pressed')
    ).toBe('true');
    view.rerender(panel('second'));
    await screen.findByRole('button', { name: 'Files' });
    expect(
      screen.getByRole('button', { name: 'Pages' }).getAttribute('aria-pressed')
    ).toBe('true');
    view.rerender(panel('home'));
    await screen.findByRole('button', { name: 'Files' });
    expect(
      screen.getByRole('button', { name: 'Files' }).getAttribute('aria-pressed')
    ).toBe('true');
    view.unmount();
    render(panel('home'));
    await screen.findByRole('button', { name: 'Files' });
    expect(
      screen.getByRole('button', { name: 'Files' }).getAttribute('aria-pressed')
    ).toBe('true');
    const filesTab = screen.getByRole('button', { name: 'Files' });
    fireEvent.click(filesTab);
    expect(filesTab.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(filesTab, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Pages' })
    );
    await screen.findByRole('button', { name: 'Manage hooks for Home' });
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Files' })
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Pages' })
    );
  } finally {
    mockTabs.pop();
    localStorage.clear();
  }
});

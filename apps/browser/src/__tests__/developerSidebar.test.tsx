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
  browser: {
    onState: () => () => {},
    command: jest.fn(),
    preferences: jest.fn(async () => undefined),
  },
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
  await screen.findByRole('button', { name: 'Manage hooks for Home' });
  expect(pages).toHaveBeenCalledWith('home');
  expect(screen.getByRole('button', { name: 'Developer group' })).toBeTruthy();
  expect(screen.queryByText('No hooks')).toBeNull();
  expect(screen.getByText('example.com').getAttribute('title')).toBe(
    'https://example.com/home'
  );
  fireEvent.change(screen.getByLabelText('Search developer pages'), {
    target: { value: 'other' },
  });
  expect(
    screen.queryByRole('button', { name: 'Manage hooks for Home' })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Manage hooks for Other page' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Add hook for Other page' })
  );
  expect(browser.command).toHaveBeenCalledWith({
    id: 'other',
    action: 'open-site-developer',
    url: 'https://other.com',
    hookId: '__new__',
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
  await screen.findByRole('button', { name: 'Manage hooks for Other page' });
  await waitFor(() =>
    expect(screen.queryByLabelText('Search developer pages')).toBeNull()
  );
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
    await screen.findByRole('button', { name: 'Manage hooks for Home' });
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
    await screen.findByRole('button', { name: 'Manage hooks for Other page' });
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

it('opens Global hooks preferences from the Developer Pages tab', async () => {
  render(
    <Theme>
      <DeveloperSidebar active />
    </Theme>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Global hooks' }));
  expect(browser.preferences).toHaveBeenCalledWith('open', {
    section: 'hooks',
  });
});

it('indexes saved hooks and opens the selected hook directly', async () => {
  pages.mockResolvedValue([
    {
      id: 'home',
      name: 'Home',
      url: 'https://example.com/home',
      origin: 'https://example.com',
      hasHooks: true,
      enabled: true,
      status: 'success',
      hooks: [
        { id: 'clean', name: 'Clean page', path: '/home*', enabled: false },
      ],
    },
  ]);
  render(content(true));
  const hook = await screen.findByRole('button', {
    name: 'Edit Clean page for Home',
  });
  expect(hook.getAttribute('title')).toContain('/home*');
  const toggle = screen.getByRole('switch', {
    name: 'Enable Clean page for Home',
  });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  expect(browser.command).toHaveBeenCalledWith({
    id: 'home',
    action: 'toggle-site-hook',
    url: 'https://example.com',
    hookId: 'clean',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add hook for Home' }));
  expect(browser.command).toHaveBeenCalledWith({
    id: 'home',
    action: 'open-site-developer',
    url: 'https://example.com',
    hookId: '__new__',
  });
  fireEvent.click(hook);
  expect(browser.command).toHaveBeenCalledWith({
    id: 'home',
    action: 'open-site-developer',
    url: 'https://example.com',
    hookId: 'clean',
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Manage hooks for Home' })
  );
  expect(
    screen.queryByRole('button', { name: 'Edit Clean page for Home' })
  ).toBeNull();
});

it('puts add-hook on the site row without an empty expandable list', async () => {
  pages.mockResolvedValue([
    {
      id: 'empty',
      name: 'Empty site',
      url: 'https://empty.com',
      origin: 'https://empty.com',
      hooks: [],
      hasHooks: false,
      enabled: false,
      status: 'waiting',
    },
  ]);
  render(content(true));
  const row = await screen.findByRole('button', {
    name: 'Manage hooks for Empty site',
  });
  expect(row.hasAttribute('aria-expanded')).toBe(false);
  expect(
    row.querySelector('.lucide-chevron-right, .lucide-chevron-down')
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Add hook for Empty site' })
  ).toBeTruthy();
  expect(
    screen.queryByRole('list', { name: 'Hooks for Empty site' })
  ).toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'Add hook for Empty site' })
      .closest('.developer-page-heading')
  ).toBeTruthy();
  fireEvent.click(row);
  expect(
    screen.getByRole('button', { name: 'Add hook for Empty site' })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open hook developer for Empty site' })
  );
  expect(browser.command).toHaveBeenCalledWith({
    id: 'empty',
    action: 'open-site-developer',
    url: 'https://empty.com',
  });
});

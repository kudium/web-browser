import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { CommandPalette } from '../components/UI/CommandPalette';
import { AppManager } from '../utils/AppManager';
import { browser } from '../browser/client';
import { IApp } from '../types';

jest.mock('../utils/EventBus', () => ({
  eventBus: { on: jest.fn(() => () => {}), dispatch: jest.fn() },
}));
jest.mock('../browser/client', () => ({
  browser: {
    onShortcut: jest.fn(() => () => {}),
    preferences: jest.fn(() => Promise.resolve()),
    preferenceAction: jest.fn(() => Promise.resolve()),
  },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});
HTMLElement.prototype.scrollIntoView = jest.fn();
const source: IApp = {
  id: 'account',
  name: 'Work account',
  sessionName: 'Work account',
  sessionId: 'work',
  url: 'https://example.com/',
  icon: '',
};
beforeEach(() => {
  localStorage.clear();
  AppManager.set([source]);
  jest.clearAllMocks();
});
const mount = () => {
  const select = jest.fn();
  render(
    <Theme>
      <CommandPalette
        open
        onOpenChange={jest.fn()}
        apps={[source]}
        select={select}
        groupSource={source}
        newSpace={jest.fn()}
      />
    </Theme>
  );
  return {
    select,
    input: screen.getByRole('combobox', {
      name: 'Search tabs or enter a website',
    }),
  };
};
it('uses arrow keys and Enter to switch to a matching tab without duplicating it', () => {
  const { input, select } = mount();
  fireEvent.change(input, { target: { value: 'Work account' } });
  const tabIndex = screen
    .getAllByRole('option')
    .findIndex((option) => option.textContent?.includes('Switch to tab'));
  expect(tabIndex).toBeGreaterThanOrEqual(0);
  for (let index = 0; index < tabIndex; index += 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.submit(input.closest('form')!);
  expect(select).toHaveBeenCalledWith(expect.objectContaining(source));
  expect(AppManager.getAll()).toHaveLength(1);
});
it('creates a same-origin tab and allows an explicit fresh group for an existing URL', () => {
  const { input } = mount();
  fireEvent.change(input, { target: { value: 'example.com/messages' } });
  fireEvent.submit(input.closest('form')!);
  expect(AppManager.getAll().at(-1)?.sessionId).toBe('work');
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.click(
    screen.getByRole('option', { name: /New group · Separate cookies/ })
  );
  expect(AppManager.getAll().at(-1)?.sessionId).not.toBe('work');
});
it('runs a settings command instead of searching the web for it', async () => {
  const { input } = mount();
  fireEvent.change(input, { target: { value: 'settings' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(browser.preferences).toHaveBeenCalledWith('open'));
  expect(AppManager.getAll()).toHaveLength(1);
});

it('accepts a site-search name with Tab, encodes the query and uses the selected current group', () => {
  const jira: IApp = {
    ...source,
    id: 'jira',
    name: 'Jira',
    sessionId: 'jira-account',
    sessionName: 'Jira Work',
    url: 'https://jira.example.com/dashboard',
    spaceId: 'default',
  };
  const search = 'https://jira.example.com/issues?text=release%20%26%2042';
  const other: IApp = {
    ...jira,
    id: 'other-jira',
    sessionId: 'other-account',
    url: search,
  };
  localStorage.setItem(
    'touchbox-search-engines',
    JSON.stringify([
      {
        id: 'jira-search',
        name: 'Jira Search',
        keyword: 'jira',
        url: 'https://jira.example.com/issues?text=%s',
      },
    ])
  );
  AppManager.set([source, jira, other]);
  const { input, select } = mount();
  fireEvent.change(input, { target: { value: 'JiRa' } });
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input).toHaveValue('');
  expect(input).toHaveAttribute('placeholder', 'Search Jira Search…');
  expect(
    screen.getByRole('button', { name: 'Clear search scope' })
  ).toBeVisible();
  fireEvent.submit(input.closest('form')!);
  expect(AppManager.getAll()).toHaveLength(3);
  fireEvent.change(input, { target: { value: 'release & 42' } });
  fireEvent.submit(input.closest('form')!);
  const created = AppManager.getAll().at(-1)!;
  expect(created.url).toBe(search);
  expect(created.sessionId).toBe(source.sessionId);
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({
      id: created.id,
      url: search,
      sessionId: source.sessionId,
    })
  );
  expect(select).not.toHaveBeenCalledWith(other);
});
it('accepts a partial engine name and lets Backspace or the clear button leave scoped search', () => {
  const { input } = mount();
  fireEvent.change(input, { target: { value: 'Goog' } });
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input).toHaveAttribute('placeholder', 'Search Google…');
  fireEvent.keyDown(input, { key: 'Backspace' });
  expect(input).toHaveValue('google');
  expect(
    screen.queryByRole('button', { name: 'Clear search scope' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: /Search Google/ }));
  expect(input).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search scope' }));
  expect(
    screen.queryByRole('button', { name: 'Clear search scope' })
  ).not.toBeInTheDocument();
});
it('preserves fresh-group choice when performing a named site search', () => {
  const { input } = mount();
  localStorage.setItem('touchbox-search-engine', 'google');
  fireEvent.change(input, { target: { value: 'google' } });
  fireEvent.keyDown(input, { key: 'Tab' });
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.click(
    screen.getByRole('option', { name: /New group · Separate cookies/ })
  );
  expect(AppManager.getAll().at(-1)?.url).toBe(
    'https://www.google.com/search?q=example.com'
  );
  expect(AppManager.getAll().at(-1)?.sessionId).not.toBe(source.sessionId);
});

it('enables isolation when opened by the New group action', () => {
  const { input } = mount();
  act(() => {
    (browser.onShortcut as jest.Mock).mock.calls.at(-1)[0]('new-session');
  });
  fireEvent.change(input, { target: { value: source.url } });
  fireEvent.submit(input.closest('form')!);
  expect(AppManager.getAll().at(-1)?.sessionId).not.toBe(source.sessionId);
});

it('shows current and new group as separate suggestions without a destination toggle', () => {
  const { input } = mount();
  fireEvent.change(input, { target: { value: 'other.com' } });
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: /New group · Separate cookies/ })
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('option', { name: /Current group · Work account/ })
  );
  expect(AppManager.getAll().at(-1)).toMatchObject({
    sessionId: source.sessionId,
    url: 'https://other.com/',
  });
});

it('opens a matching suggestion from another group in the selected current group', () => {
  const elsewhere = {
    ...source,
    id: 'elsewhere',
    sessionId: 'elsewhere',
    name: 'Other page',
    url: 'https://other.com/',
  };
  AppManager.set([source, elsewhere]);
  render(
    <Theme>
      <CommandPalette
        open
        onOpenChange={jest.fn()}
        apps={[source, elsewhere]}
        select={jest.fn()}
        groupSource={source}
        newSpace={jest.fn()}
      />
    </Theme>
  );
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'other.com' },
  });
  fireEvent.click(screen.getByRole('option', { name: /Other page/ }));
  expect(AppManager.getAll().at(-1)).toMatchObject({
    sessionId: source.sessionId,
    url: elsewhere.url,
  });
});

it('opens the configured home in its own group and reuses an existing home tab', () => {
  const homeSource = {
    ...source,
    sessionHomeURL: 'https://other.example/home',
  };
  const select = jest.fn();
  AppManager.set([homeSource]);
  const { rerender } = render(
    <Theme>
      <CommandPalette
        open
        onOpenChange={jest.fn()}
        apps={[homeSource]}
        select={select}
        groupSource={homeSource}
        newSpace={jest.fn()}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('option', { name: /Group home/ }));
  const home = AppManager.getAll().find(
    (tab) => tab.url === homeSource.sessionHomeURL
  )!;
  expect(home.sessionId).toBe(source.sessionId);
  expect(select).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: home.id })
  );
  rerender(
    <Theme>
      <CommandPalette
        open
        onOpenChange={jest.fn()}
        apps={AppManager.getAll()}
        select={select}
        groupSource={homeSource}
        newSpace={jest.fn()}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('option', { name: /Group home/ }));
  expect(AppManager.getAll()).toHaveLength(2);
  expect(select).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: home.id })
  );
});

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Settings } from '../components/View/Settings/Settings';
import { browser } from '../browser/client';
import { defaultPreferences } from '../browser/preferences';

jest.mock('../browser/client', () => ({
  browser: {
    preferences: jest.fn(),
    preferenceAction: jest.fn(),
    onPreferences: jest.fn(() => () => {}),
  },
}));
jest.mock('../components/View/Settings/tabs/ManageApp', () => ({
  ManageApp: () => null,
}));
jest.mock('../components/View/Settings/tabs/Spaces', () => ({
  Spaces: () => null,
}));
jest.mock('../components/View/Settings/tabs/Archive', () => ({
  Archive: () => null,
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});
it('searches controls, saves a live setting and surfaces save failures', async () => {
  (browser.preferences as jest.Mock).mockImplementation((action, patch) =>
    Promise.resolve({ ...defaultPreferences, ...patch })
  );
  (browser.preferenceAction as jest.Mock).mockResolvedValue({
    profiles: [],
    languages: ['en-US'],
    versions: { kudiumbrowser: '1', engine: '45', chromium: '1' },
  });
  render(
    <Theme>
      <Settings />
    </Theme>
  );
  await screen.findByText('Saved automatically');
  fireEvent.change(screen.getByLabelText('Search settings'), {
    target: { value: 'sites to open tabs' },
  });
  expect(screen.getByText('Allow sites to open tabs')).toBeVisible();
  fireEvent.click(
    screen.getByRole('switch', { name: 'Allow sites to open tabs' })
  );
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenCalledWith('update', {
      allowPopups: false,
    })
  );
  await screen.findByText('Saved automatically');
  (browser.preferences as jest.Mock).mockRejectedValueOnce(
    new Error('Disk unavailable')
  );
  fireEvent.click(
    screen.getByRole('switch', { name: 'Allow sites to open tabs' })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Disk unavailable'
  );
  fireEvent.change(screen.getByLabelText('Search settings'), {
    target: { value: 'nothing-matches-this' },
  });
  expect(screen.getByText(/No settings match/)).toBeVisible();
});

it('defaults extension access to all apps and carries it into store and management actions', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue(defaultPreferences);
  (browser.preferenceAction as jest.Mock).mockImplementation((action) =>
    Promise.resolve(
      action === 'info'
        ? {
            profiles: [{ id: 'personal', name: 'Personal', extensions: 0 }],
            languages: ['en-US'],
            versions: { kudiumbrowser: '1', engine: '45', chromium: '1' },
          }
        : null
    )
  );
  render(
    <Theme>
      <Settings />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Search settings'), {
    target: { value: 'Extensions' },
  });
  expect(
    await screen.findByRole('button', { name: 'Extension access' })
  ).toHaveTextContent('All groups');
  const store = await screen.findByRole('button', {
    name: 'Open Chrome Web Store',
  });
  await waitFor(() => expect(store).toBeEnabled());
  fireEvent.click(store);
  await waitFor(() =>
    expect(browser.preferenceAction).toHaveBeenCalledWith('store', 'all')
  );
  const manage = screen.getByRole('button', { name: 'Manage extensions…' });
  await waitFor(() => expect(manage).toBeEnabled());
  fireEvent.click(manage);
  await waitFor(() =>
    expect(browser.preferenceAction).toHaveBeenCalledWith('extensions', 'all')
  );
});

it('lets users customize sleeping timeout, pinned tabs and website exclusions', async () => {
  (browser.preferences as jest.Mock).mockImplementation((action, patch) =>
    Promise.resolve({ ...defaultPreferences, ...patch })
  );
  (browser.preferenceAction as jest.Mock).mockResolvedValue({
    profiles: [],
    languages: ['en-US'],
    versions: {},
  });
  render(
    <Theme>
      <Settings />
    </Theme>
  );
  await screen.findByText('Saved automatically');
  fireEvent.change(screen.getByLabelText('Search settings'), {
    target: { value: 'performance' },
  });
  const timeout = screen.getByRole('spinbutton', {
    name: 'Put inactive tabs to sleep after',
  });
  fireEvent.change(timeout, { target: { value: '47' } });
  fireEvent.blur(timeout);
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenCalledWith('update', {
      discardAfterMinutes: 47,
    })
  );
  await screen.findByText('Saved automatically');
  fireEvent.click(
    screen.getByRole('switch', { name: 'Keep pinned tabs awake' })
  );
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenCalledWith('update', {
      keepPinnedTabsAwake: true,
    })
  );
  await screen.findByText('Saved automatically');
  fireEvent.change(screen.getByLabelText('Websites excluded from sleeping'), {
    target: { value: 'example.com\nmail.example.org' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save website exclusions' })
  );
  await waitFor(() =>
    expect(browser.preferences).toHaveBeenCalledWith('update', {
      discardExcludedSites: ['example.com', 'mail.example.org'],
    })
  );
});

it('shows the default-browser banner, preserves pending feedback and refreshes after OS confirmation', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue(defaultPreferences);
  let isDefault = false;
  (browser.preferenceAction as jest.Mock).mockImplementation((action) =>
    Promise.resolve(
      action === 'info'
        ? {
            defaultBrowser: isDefault,
            profiles: [],
            languages: [],
            versions: { kudiumbrowser: '1', engine: '1', chromium: '1' },
          }
        : {
            kind: 'diagnostic',
            text: 'Confirm Kudium Browser in system settings.',
          }
    )
  );
  render(
    <Theme>
      <Settings />
    </Theme>
  );
  expect(
    await screen.findByRole('region', { name: 'Default browser' })
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Make default' }));
  await screen.findByText('Confirm Kudium Browser in system settings.');
  expect(browser.preferenceAction).toHaveBeenCalledWith('set-default-browser');
  expect(screen.getByRole('region', { name: 'Default browser' })).toBeVisible();
  isDefault = true;
  fireEvent(window, new Event('focus'));
  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'Default browser' })
    ).not.toBeInTheDocument()
  );
});

it.each(['apps', 'spaces', 'archive'])(
  'opens the requested workspace section on first launch: #%s',
  async (destination) => {
    window.history.replaceState(null, '', `/#${destination}`);
    (browser.preferences as jest.Mock).mockResolvedValue(defaultPreferences);
    (browser.preferenceAction as jest.Mock).mockResolvedValue({
      profiles: [],
      languages: [],
      versions: { kudiumbrowser: '1', engine: '45', chromium: '1' },
    });
    try {
      render(
        <Theme>
          <Settings />
        </Theme>
      );
      await screen.findByText('Saved automatically');
      expect(screen.getByRole('heading', { name: 'Workspace' })).toBeVisible();
      const label = { apps: 'Groups', spaces: 'Spaces', archive: 'Archive' }[
        destination
      ]!;
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    } finally {
      window.history.replaceState(null, '', '/');
    }
  }
);

it('falls back to Search for an unknown initial section', async () => {
  window.history.replaceState(null, '', '/#unknown');
  (browser.preferences as jest.Mock).mockResolvedValue(defaultPreferences);
  (browser.preferenceAction as jest.Mock).mockResolvedValue({
    profiles: [],
    languages: [],
    versions: { kudiumbrowser: '1', engine: '45', chromium: '1' },
  });
  try {
    render(
      <Theme>
        <Settings />
      </Theme>
    );
    await screen.findByText('Saved automatically');
    expect(
      screen.getByRole('heading', { name: 'Search engine' })
    ).toBeVisible();
  } finally {
    window.history.replaceState(null, '', '/');
  }
});


it('shows default update preferences and lets users turn both off', async () => {
  window.location.hash = '#updates';
  (browser.preferences as jest.Mock).mockImplementation((action, patch) => Promise.resolve({ ...defaultPreferences, ...patch }));
  (browser.preferenceAction as jest.Mock).mockResolvedValue({ profiles: [], languages: ['en-US'], versions: { kudiumbrowser: '1', engine: '45', chromium: '1' } });
  render(<Theme><Settings /></Theme>);
  await screen.findByText('Saved automatically');
  const download = screen.getByRole('switch', { name: 'Automatically download updates' });
  const install = screen.getByRole('switch', { name: 'Install downloaded updates when I quit' });
  expect(download).toBeChecked();
  expect(install).toBeChecked();
  fireEvent.click(download);
  await waitFor(() => expect(browser.preferences).toHaveBeenCalledWith('update', { automaticallyDownloadUpdates: false }));
  await screen.findByText('Saved automatically');
  fireEvent.click(install);
  await waitFor(() => expect(browser.preferences).toHaveBeenCalledWith('update', { automaticallyInstallUpdates: false }));
  window.location.hash = '';
});

it('shows fourteen-day system-space retention in searchable privacy settings', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue(defaultPreferences);
  (browser.preferenceAction as jest.Mock).mockResolvedValue({ profiles: [], languages: ['en-US'], versions: {} });
  render(<Theme><Settings /></Theme>);
  fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'Keep system space records' } });
  const control = await screen.findByRole('combobox', { name: 'Keep system space records' });
  await waitFor(() => expect(control).toBeEnabled());
  expect(control).toHaveTextContent('14 days');
});

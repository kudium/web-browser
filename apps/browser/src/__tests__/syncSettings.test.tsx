import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SyncSettings } from '../components/View/Settings/SyncSettings';
import { defaultSyncSettings, cloudSyncStatus } from '../browser/cloudSync';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: {
    preferenceAction: jest.fn(),
    accountSync: jest.fn().mockResolvedValue({
      phase: 'off',
      connected: false,
      message: 'Connect your account',
      remote: [],
    }),
  },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe() {},
    unobserve() {},
    disconnect() {},
  })),
});
it('shows saved choices, category controls and honest setup-required status', async () => {
  const settings = {
    ...defaultSyncSettings(),
    provider: 'kudiumbrowser' as const,
    enabled: true,
  };
  (browser.preferenceAction as jest.Mock).mockResolvedValue(
    cloudSyncStatus(settings, 'darwin')
  );
  const save = jest.fn().mockResolvedValue(true);
  render(
    <Theme>
      <SyncSettings settings={settings} busy={false} save={save} />
    </Theme>
  );
  expect(
    screen.getByRole('heading', { name: 'Syncing options' })
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Included in sync' })
  ).toBeVisible();
  expect(screen.getByText(/Not available in this build/)).toBeVisible();
  expect(
    screen.getByLabelText('Sync with Kudium Browser Account')
  ).toBeChecked();
  expect(screen.getByLabelText('Sync with iCloud')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Sync with iCloud'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...settings, icloud: true })
  );
  fireEvent.click(screen.getByLabelText('Sync with Kudium Browser Account'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...settings, enabled: false })
  );
  expect(screen.queryByLabelText('Enable sync')).toBeNull();
  expect(screen.getByLabelText('Sync saved passwords')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Sync open tabs'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ...settings,
      categories: { ...settings.categories, openTabs: false },
    })
  );
  expect(browser.accountSync).toHaveBeenCalledWith('status');
});

it('starts sign-in and account creation directly from Sync', async () => {
  const { AccountSyncSettings } = await import(
    '../components/View/Settings/AccountSyncSettings'
  );
  render(
    <Theme>
      <AccountSyncSettings
        enabled={false}
        onEnabled={jest.fn()}
        passwordsEnabled={false}
      />
    </Theme>
  );
  const signIn = screen.getByRole('button', { name: 'Sign in to Kudium' });
  await waitFor(() => expect(signIn).toBeEnabled());
  fireEvent.click(signIn);
  await waitFor(() =>
    expect(browser.accountSync).toHaveBeenCalledWith('connect', {
      authMode: 'sign-in',
    })
  );
  const signup = screen.getByRole('button', { name: 'Create account' });
  await waitFor(() => expect(signup).toBeEnabled());
  fireEvent.click(signup);
  await waitFor(() =>
    expect(browser.accountSync).toHaveBeenCalledWith('connect', {
      authMode: 'sign-up',
    })
  );
});

it('includes saved passwords in new sync setups and exposes the unlock action', async () => {
  expect(defaultSyncSettings().categories.passwords).toBe(true);
  (browser.accountSync as jest.Mock).mockResolvedValue({
    phase: 'ready',
    connected: true,
    email: 'test@example.com',
    message: '',
    remote: [],
  });
  const { AccountSyncSettings } = await import(
    '../components/View/Settings/AccountSyncSettings'
  );
  render(
    <Theme>
      <AccountSyncSettings enabled onEnabled={jest.fn()} passwordsEnabled />
    </Theme>
  );
  const syncNow = await screen.findByRole('button', { name: 'Sync now' });
  fireEvent.click(screen.getByText('Backup, restore and account options'));
  expect(
    screen.getByRole('button', { name: 'Unlock & sync passwords' })
  ).toBeEnabled();
  fireEvent.click(syncNow);
  await waitFor(() =>
    expect(browser.accountSync).toHaveBeenCalledWith('sync', undefined)
  );
});

it('offers a confirmed reset path when a signed-in user has lost the recovery key', async () => {
  const { AccountSyncSettings } = await import('../components/View/Settings/AccountSyncSettings');
  const status = { phase: 'recovery-required', connected: true, email: 'fixture@example.com', message: 'Recovery required', remote: [] };
  (browser.accountSync as jest.Mock).mockClear().mockResolvedValue(status);
  render(<Theme><AccountSyncSettings enabled={false} onEnabled={jest.fn()} passwordsEnabled={false} /></Theme>);
  await screen.findByText('I don’t have my recovery key');
  fireEvent.click(screen.getByText('I don’t have my recovery key'));
  expect(screen.getByText(/old encrypted backups cannot be recovered/)).toBeVisible();
  const reset = screen.getByRole('button', { name: 'Reset cloud sync…' });
  expect(reset).toBeEnabled();
  expect(browser.accountSync).not.toHaveBeenCalledWith('reset-sync', undefined);
  fireEvent.click(reset);
  await waitFor(() => expect(browser.accountSync).toHaveBeenCalledWith('reset-sync', undefined));
});

it('does not show the recovery prompt for an automatically unlocked account', async () => {
  const { AccountSyncSettings } = await import('../components/View/Settings/AccountSyncSettings');
  (browser.accountSync as jest.Mock).mockResolvedValue({ phase: 'ready', connected: true, email: 'fixture@example.com', message: 'Unlocked', remote: [] });
  render(<Theme><AccountSyncSettings enabled={false} onEnabled={jest.fn()} passwordsEnabled={false} /></Theme>);
  await screen.findByText('fixture@example.com');
  expect(screen.queryByLabelText('Sync recovery key')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset cloud sync…' })).not.toBeInTheDocument();
});

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
  expect(await screen.findByText('Requires Apple approval')).toBeVisible();
  const hint = screen.getByRole('button', { name: 'About iCloud Passwords' });
  fireEvent.click(hint);
  expect(
    await screen.findByText(/Apple’s browser approval is required/)
  ).toBeVisible();
  fireEvent.click(hint);
  expect(screen.getByLabelText('Enable sync')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Enable sync'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...settings, enabled: false })
  );
  expect(screen.queryByLabelText('Sync to')).not.toBeInTheDocument();
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
  expect(
    screen.getByRole('button', { name: 'Unlock & sync passwords' })
  ).toBeEnabled();
  fireEvent.click(syncNow);
  await waitFor(() =>
    expect(browser.accountSync).toHaveBeenCalledWith('sync', undefined)
  );
});

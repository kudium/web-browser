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
  fireEvent.click(screen.getByText('Requires Apple approval'));
  expect(screen.getByText('Apple approval required for Kudium')).toBeVisible();
  expect(screen.getByLabelText('Enable sync')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Enable sync'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...settings, enabled: false })
  );
  fireEvent.change(screen.getByLabelText('Sync to'), {
    target: { value: 'kudiumbrowser' },
  });
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ...settings,
      enabled: false,
      provider: 'kudiumbrowser',
    })
  );
  expect(screen.getByRole('option', { name: /Apple iCloud/ })).toBeDisabled();
  expect(screen.getByLabelText('Sync saved passwords')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Sync open tabs'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ...settings,
      categories: { ...settings.categories, openTabs: false },
    })
  );
  expect(browser.accountSync).toHaveBeenCalledWith('status');
});

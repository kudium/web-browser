import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SyncSettings } from '../components/View/Settings/SyncSettings';
import { defaultSyncSettings, cloudSyncStatus } from '../browser/cloudSync';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: { preferenceAction: jest.fn() },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe() {},
    unobserve() {},
    disconnect() {},
  })),
});
it('shows saved choices, category controls and honest setup-required status', async () => {
  const settings = { ...defaultSyncSettings(), enabled: true };
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
    await screen.findByText(/iCloud connection is not available/)
  ).toBeVisible();
  expect(screen.getByLabelText('Enable sync')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Sync open tabs'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ...settings,
      categories: { ...settings.categories, openTabs: false },
    })
  );
  expect(screen.getByText(/Cookies and login tokens stay/)).toBeVisible();
  expect(browser.preferenceAction).toHaveBeenCalledWith('sync-status');
});

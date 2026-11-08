import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { browser } from '../browser/client';
import { AppUpdateBanner } from '../components/UI/AppUpdateBanner';
import { AppUpdateSettings } from '../components/View/Settings/AppUpdateSettings';
import { AppUpdateState } from '../browser/appUpdates';

jest.mock('../browser/client', () => ({
  browser: { appUpdates: jest.fn(), onAppUpdates: jest.fn() },
}));
let update: (state: AppUpdateState) => void;
const unsubscribe = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (browser.onAppUpdates as jest.Mock).mockImplementation((listener) => {
    update = listener;
    return unsubscribe;
  });
  (browser.appUpdates as jest.Mock).mockResolvedValue({
    status: 'available',
    currentVersion: '1.0.1',
    version: '1.0.2',
  });
});
it('offers download then restart, keeps progress disabled and unsubscribes', async () => {
  const { unmount } = render(<AppUpdateBanner />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Update available. Download update',
    })
  );
  await waitFor(() =>
    expect(browser.appUpdates).toHaveBeenCalledWith('download')
  );
  act(() =>
    update({ status: 'downloading', currentVersion: '1.0.1', progress: 42 })
  );
  expect(
    screen.getByRole('button', { name: /Downloading 42%/ })
  ).toBeDisabled();
  act(() =>
    update({ status: 'ready', currentVersion: '1.0.1', version: '1.0.2' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Update ready. Restart to update' })
  );
  await waitFor(() =>
    expect(browser.appUpdates).toHaveBeenCalledWith('install')
  );
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
it('has an accessible action in compact mode', async () => {
  render(<AppUpdateBanner compact />);
  expect(
    await screen.findByRole('button', { name: /Download update/ })
  ).toHaveAttribute('title', expect.stringContaining('1.0.2'));
  expect(screen.queryByText('Download update')).toBeNull();
});
it('ignores stale initial status after a pushed update and surfaces action errors', async () => {
  let resolve: (state: AppUpdateState) => void = () => {};
  (browser.appUpdates as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<AppUpdateState>((done) => {
        resolve = done;
      })
  );
  render(<AppUpdateBanner />);
  act(() =>
    update({ status: 'ready', currentVersion: '1.0.1', version: '1.0.2' })
  );
  await act(async () => resolve({ status: 'idle', currentVersion: '1.0.1' }));
  (browser.appUpdates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: /Restart to update/ }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Unable to complete'
  );
});
it('provides a manual check in Preferences', async () => {
  (browser.appUpdates as jest.Mock).mockResolvedValue({
    status: 'idle',
    currentVersion: '1.0.1',
  });
  render(
    <Theme>
      <AppUpdateSettings />
    </Theme>
  );
  await screen.findByText('Kudium Browser 1.0.1');
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  await waitFor(() => expect(browser.appUpdates).toHaveBeenCalledWith('check'));
});

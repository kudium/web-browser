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
    }),
  );
  await waitFor(() =>
    expect(browser.appUpdates).toHaveBeenCalledWith('download'),
  );
  act(() =>
    update({ status: 'downloading', currentVersion: '1.0.1', progress: 42 }),
  );
  expect(
    screen.getByRole('button', { name: /Downloading 42%/ }),
  ).toBeDisabled();
  act(() =>
    update({ status: 'ready', currentVersion: '1.0.1', version: '1.0.2' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Update ready. Restart to update' }),
  );
  await waitFor(() =>
    expect(browser.appUpdates).toHaveBeenCalledWith('install'),
  );
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
it('has an accessible action in compact mode', async () => {
  render(<AppUpdateBanner compact />);
  expect(
    await screen.findByRole('button', { name: /Download update/ }),
  ).toHaveAttribute('title', expect.stringContaining('1.0.2'));
  expect(screen.queryByText('Download update')).toBeNull();
});
it('ignores stale initial status after a pushed update and surfaces action errors', async () => {
  let resolve: (state: AppUpdateState) => void = () => {};
  (browser.appUpdates as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<AppUpdateState>((done) => {
        resolve = done;
      }),
  );
  render(<AppUpdateBanner />);
  act(() =>
    update({ status: 'ready', currentVersion: '1.0.1', version: '1.0.2' }),
  );
  await act(async () => resolve({ status: 'idle', currentVersion: '1.0.1' }));
  (browser.appUpdates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: /Restart to update/ }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unable to complete'));
});
it('provides a manual check in Preferences', async () => {
  (browser.appUpdates as jest.Mock).mockResolvedValue({
    status: 'idle',
    currentVersion: '1.0.1',
  });
  render(
    <Theme>
      <AppUpdateSettings />
    </Theme>,
  );
  await screen.findByText('Kudium Browser 1.0.1');
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  await waitFor(() => expect(browser.appUpdates).toHaveBeenCalledWith('check'));
});

it.each(['unavailable', 'error'] as const)(
  'keeps manual download and release notes accessible when updates are %s',
  async (status) => {
    (browser.appUpdates as jest.Mock).mockResolvedValue({
      status,
      currentVersion: '1.0.18',
    });
    render(
      <Theme>
        <AppUpdateSettings />
      </Theme>,
    );
    await screen.findByText('Kudium Browser 1.0.18');
    const download = screen.getByRole('link', { name: 'Download manually' });
    expect(download).toHaveAttribute(
      'href',
      'https://browser.kudium.com/download',
    );
    expect(download).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'What’s new' })).toHaveAttribute(
      'href',
      'https://browser.kudium.com/whats-new',
    );
    if (status === 'unavailable') {
      expect(
        screen.getByRole('button', { name: 'Check for updates' }),
      ).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Download the latest version manually.',
      );
    }
  },
);

it('shows restart feedback immediately while installation is pending and keeps it after the response', async () => {
  (browser.appUpdates as jest.Mock).mockResolvedValueOnce({status:'ready',currentVersion:'1.0.1',version:'1.0.2'});
  let finish!: (state: AppUpdateState) => void;
  (browser.appUpdates as jest.Mock).mockImplementationOnce(()=>new Promise<AppUpdateState>(resolve=>{finish=resolve;}));
  render(<AppUpdateBanner />);
  fireEvent.click(await screen.findByRole('button',{name:'Update ready. Restart to update'}));
  expect(screen.getByRole('button',{name:/Restarting browser/})).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Restarting browser…');
  await act(async()=>finish({status:'restarting',currentVersion:'1.0.1',version:'1.0.2'}));
  expect(screen.getByRole('button',{name:/Restarting browser/})).toBeDisabled();
});
it('shows restart progress in Preferences and restores the restart action on failure', async () => {
  (browser.appUpdates as jest.Mock).mockResolvedValueOnce({status:'ready',currentVersion:'1.0.1',version:'1.0.2'});
  let fail!: (error: Error) => void;
  (browser.appUpdates as jest.Mock).mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;}));
  render(<Theme><AppUpdateSettings /></Theme>);
  fireEvent.click(await screen.findByRole('button',{name:'Restart to update'}));
  expect(screen.getByRole('button',{name:'Restarting…'})).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Applying the update and restarting Kudium…');
  await act(async()=>fail(new Error('installation failed')));
  expect(screen.getByRole('button',{name:'Restart to update'})).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to complete');
});

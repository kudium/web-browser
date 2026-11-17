import { act, fireEvent, render, screen } from '@testing-library/react';
import { AccountSyncSuggestion } from '../components/UI/AccountSyncSuggestion';
import { BrowserPreferences } from '../browser/preferences';

const preferences = jest.fn();
const accountSync = jest.fn();
const unsubscribe = jest.fn();
let onPreferences: (value: BrowserPreferences) => void;
jest.mock('../browser/client', () => ({
  browser: {
    preferences: (...args: unknown[]) => preferences(...args),
    accountSync: (...args: unknown[]) => accountSync(...args),
    onPreferences: (callback: typeof onPreferences) => {
      onPreferences = callback;
      return unsubscribe;
    },
  },
}));
const sync = (enabled: boolean) =>
  ({ cloudSync: { enabled } }) as BrowserPreferences;
beforeEach(() => {
  localStorage.clear();
  unsubscribe.mockReset();
  preferences.mockReset().mockResolvedValue(sync(false));
  accountSync.mockReset().mockResolvedValue({ phase: 'off', connected: false });
});

test('offers sync on startup without requiring any groups', async () => {
  render(<AccountSyncSuggestion />);
  expect(screen.queryByText('Set up sync')).toBeNull();
  fireEvent.click(await screen.findByText('Set up sync'));
  expect(preferences).toHaveBeenCalledWith('open', { section: 'sync' });
  expect(screen.queryByText('Set up sync')).toBeNull();
});

test('merely showing the suggestion does not dismiss it on the next startup', async () => {
  localStorage.setItem('kudium-first-group-sync-suggestion', 'shown');
  const view = render(<AccountSyncSuggestion />);
  await screen.findByText('Set up sync');
  view.unmount();
  render(<AccountSyncSuggestion />);
  await screen.findByText('Set up sync');
});

test('dismissal is remembered after reopening the browser', async () => {
  const view = render(<AccountSyncSuggestion />);
  fireEvent.click(await screen.findByRole('button', { name: 'Dismiss sync suggestion' }));
  view.unmount();
  render(<AccountSyncSuggestion />);
  await act(async () => {});
  expect(screen.queryByText('Set up sync')).toBeNull();
});

test('does not suggest setup when sync is already enabled', async () => {
  preferences.mockResolvedValue(sync(true));
  accountSync.mockResolvedValue({ phase: 'ready', connected: true });
  render(<AccountSyncSuggestion />);
  await act(async () => {});
  expect(screen.queryByText('Set up sync')).toBeNull();
});

test('hides immediately when sync is enabled in another window', async () => {
  const view = render(<AccountSyncSuggestion />);
  await screen.findByText('Set up sync');
  accountSync.mockResolvedValue({ phase: 'ready', connected: true });
  await act(async () => onPreferences(sync(true)));
  expect(screen.queryByText('Set up sync')).toBeNull();
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('a late startup response does not overwrite newer sync preferences', async () => {
  let resolve: (value: BrowserPreferences) => void = () => {};
  preferences.mockReturnValue(new Promise<BrowserPreferences>((done) => { resolve = done; }));
  accountSync.mockResolvedValue({ phase: 'ready', connected: true });
  render(<AccountSyncSuggestion />);
  act(() => onPreferences(sync(true)));
  await act(async () => resolve(sync(false)));
  expect(screen.queryByText('Set up sync')).toBeNull();
});

test('offers account setup when sync defaults to enabled but no account is connected', async () => {
  preferences.mockResolvedValue(sync(true));
  render(<AccountSyncSuggestion />);
  await screen.findByText('Set up sync');
  expect(accountSync).toHaveBeenCalledWith('status');
});

test('does not show a misleading prompt when preferences cannot load', async () => {
  preferences.mockRejectedValue(new Error('Unavailable'));
  render(<AccountSyncSuggestion />);
  await act(async () => {});
  expect(screen.queryByText('Set up sync')).toBeNull();
});

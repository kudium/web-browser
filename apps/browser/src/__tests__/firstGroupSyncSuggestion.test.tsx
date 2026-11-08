import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FirstGroupSyncSuggestion } from '../components/UI/FirstGroupSyncSuggestion';
import { IApp } from '../types';
const preferences = jest.fn();
jest.mock('../browser/client', () => ({
  browser: { preferences: (...args: unknown[]) => preferences(...args) },
}));
const tabs = [{ id: 'one', sessionId: 'group' }] as IApp[];
beforeEach(() => {
  localStorage.clear();
  preferences.mockReset().mockResolvedValue({ cloudSync: { enabled: false } });
});
test('first group offers settings, then stays dismissed after remount', async () => {
  const view = render(<FirstGroupSyncSuggestion tabs={[]} />);
  view.rerender(<FirstGroupSyncSuggestion tabs={tabs} />);
  fireEvent.click(await screen.findByText('Set up sync'));
  expect(preferences).toHaveBeenCalledWith('open', { section: 'sync' });
  expect(screen.queryByText('Set up sync')).toBeNull();
  view.unmount();
  const second = render(<FirstGroupSyncSuggestion tabs={[]} />);
  second.rerender(<FirstGroupSyncSuggestion tabs={tabs} />);
  await waitFor(() => expect(preferences).toHaveBeenCalledWith('get'));
  expect(screen.queryByText('Set up sync')).toBeNull();
});
test('existing groups do not trigger a startup suggestion', async () => {
  render(<FirstGroupSyncSuggestion tabs={tabs} />);
  await waitFor(() => expect(preferences).toHaveBeenCalledWith('get'));
  expect(screen.queryByText('Set up sync')).toBeNull();
});

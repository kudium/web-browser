import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRecommendations } from '../components/UI/BrowserRecommendations';
const preferences = jest.fn();
jest.mock('../browser/client', () => ({ browser: { preferences: (...args: unknown[]) => preferences(...args) } }));
jest.mock('../components/UI/AccountSyncSuggestion', () => ({ useSyncSuggestionEligibility: () => true }));
beforeEach(() => { localStorage.clear(); preferences.mockReset().mockResolvedValue(undefined); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-25T12:00:00Z')); });
afterEach(() => jest.useRealTimers());
it('shows three initial recommendations and invokes the marketplace opener', async () => {
  const onMarketplace = jest.fn(() => true);
  render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.queryByText('Explore shortcuts')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Explore hooks'));
  expect(onMarketplace).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Explore hooks')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Import browsing data'));
  await waitFor(() => expect(preferences).toHaveBeenCalledWith('open', { section: 'import' }));
});
it('Later hides the whole stack for three days, including across restarts', () => {
  const onMarketplace = () => true;
  const view = render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  view.unmount();
  render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(3 * 86400000));
  expect(screen.getAllByRole('article')).toHaveLength(3);
});
it('introduces more features gradually and preserves legacy dismissals', () => {
  localStorage.setItem('kudium-browser-import-suggestion', 'dismissed');
  localStorage.setItem('kudium-first-group-sync-suggestion', 'dismissed');
  render(<BrowserRecommendations onMarketplace={() => true} />);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  act(() => jest.advanceTimersByTime(86400000));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByText('Explore shortcuts')).toBeInTheDocument();
  expect(screen.queryByText('Explore performance')).not.toBeInTheDocument();
});
it('keeps a recommendation visible if the marketplace cannot open', () => {
  render(<BrowserRecommendations onMarketplace={() => false} />);
  fireEvent.click(screen.getByText('Explore hooks'));
  expect(screen.getByRole('alert')).toHaveTextContent('Select an unlocked tab');
  expect(screen.getByText('Explore hooks')).toBeInTheDocument();
});

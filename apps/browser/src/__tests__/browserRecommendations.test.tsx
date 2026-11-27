import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRecommendations } from '../components/UI/BrowserRecommendations';
const preferences = jest.fn();
jest.mock('../browser/client', () => ({ browser: { preferences: (...args: unknown[]) => preferences(...args) } }));
jest.mock('../components/UI/AccountSyncSuggestion', () => ({ useSyncSuggestionEligibility: () => true }));
beforeEach(() => { localStorage.clear(); preferences.mockReset().mockResolvedValue(undefined); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-25T12:00:00Z')); });
afterEach(() => jest.useRealTimers());
it('shows one recommendation and advances after a successful action', async () => {
  const onMarketplace = jest.fn(() => true);
  render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByText('Explore shortcuts')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Explore hooks'));
  expect(onMarketplace).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Explore hooks')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Import browsing data'));
  await waitFor(() => expect(preferences).toHaveBeenCalledWith('open', { section: 'import' }));
});
it('Later hides recommendations for three days, including across restarts', () => {
  const onMarketplace = () => true;
  const view = render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  view.unmount();
  render(<BrowserRecommendations onMarketplace={onMarketplace} />);
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(3 * 86400000));
  expect(screen.getAllByRole('article')).toHaveLength(1);
});
it('introduces more features gradually and preserves legacy dismissals', async () => {
  localStorage.setItem('kudium-browser-import-suggestion', 'dismissed');
  localStorage.setItem('kudium-first-group-sync-suggestion', 'dismissed');
  render(<BrowserRecommendations onMarketplace={() => true} />);
  fireEvent.click(screen.getByText('Explore hooks'));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(86400000));
  expect(screen.getByText('Customize appearance')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Customize appearance'));
  await waitFor(() => expect(screen.getByText('Explore shortcuts')).toBeInTheDocument());
  expect(screen.queryByText('Explore performance')).not.toBeInTheDocument();
});
it('keeps a recommendation visible if the marketplace cannot open', () => {
  render(<BrowserRecommendations onMarketplace={() => false} />);
  fireEvent.click(screen.getByText('Explore hooks'));
  expect(screen.getByRole('alert')).toHaveTextContent('Select an unlocked tab');
  expect(screen.getByText('Explore hooks')).toBeInTheDocument();
});

it('keeps the secondary action inside the single card without a visible heading', () => {
  render(<BrowserRecommendations onMarketplace={() => true} />);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByText('Discover Kudium')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' }).closest('article')).toBe(screen.getByRole('article'));
  expect(screen.queryByText('Import browsing data')).not.toBeInTheDocument();
});

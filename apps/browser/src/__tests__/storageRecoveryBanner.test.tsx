import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StorageRecoveryBanner } from '../components/UI/StorageRecoveryBanner';

const storageStatus = jest.fn();
const recoverStorage = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { browser: { storageStatus }, ai: { recoverStorage } },
  });
  recoverStorage.mockResolvedValue(undefined);
});

it('keeps healthy storage quiet', async () => {
  storageStatus.mockResolvedValue({ available: true, needsRecovery: false });
  const { container } = render(<StorageRecoveryBanner />);
  await waitFor(() => expect(storageStatus).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

it('offers restart for a complete failure and preserves an actionable rejection', async () => {
  storageStatus.mockResolvedValue({ available: false, needsRecovery: false });
  recoverStorage.mockRejectedValue(
    new Error('Stop the current AI run before restarting Kudium.')
  );
  render(<StorageRecoveryBanner />);
  expect(await screen.findByText('Saved data is locked')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Restore access' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.getByText(/If recovery fails/)).toBeVisible();
  expect(recoverStorage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry access' }));
  await waitFor(() => expect(recoverStorage).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Stop the current AI run'
  );
  expect(screen.getByRole('button', { name: 'Retry access' })).toBeEnabled();
});

it('distinguishes partial recovery from complete storage failure', async () => {
  storageStatus.mockResolvedValue({ available: true, needsRecovery: true });
  render(<StorageRecoveryBanner />);
  expect(await screen.findByText('Some saved data is locked')).toBeVisible();
  expect(screen.queryByText('Saved data is locked')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restore access' })).toBeEnabled();
});
